/**
 * Validation Service - LangGraph Integration
 * 
 * This service is now a thin wrapper around LangGraph execution.
 * All validation logic runs inside the LangGraph workflow, not as sequential function calls.
 * 
 * OLD APPROACH (removed):
 * - Sequential function calls (runDataValidation → runInfoEnrichment → runQA → runDM)
 * - State scattered across database and local variables
 * - No structured decision flow
 * 
 * NEW APPROACH (implemented):
 * - LangGraph orchestrates all nodes
 * - Shared state object flows through graph
 * - Conditional routing based on confidence scores
 * - Proper separation of concerns (validation / enrichment / scoring / decision)
 */

import { executeValidationWorkflow } from "./graph/workflow.js";
import { supabase } from "../supabaseClient.js";
import { sendRunCompletionEmail, sendAdminValidationSummaryEmail } from "./agents/emailGenerationAgent.js";

/**
 * Run validation for a single provider using LangGraph
 * @param {Object} provider - Provider record from database
 * @param {String} runId - Validation run ID
 * @returns {Promise<Object>} - Result with needsReview flag
 */
export async function runValidationForProvider(provider, runId) {
  console.log(`[ValidationService] Starting LangGraph validation for provider: ${provider.id}`);
  
  // Prepare input data for workflow
  const inputData = {
    name: provider.name,
    npi: provider.npi_id,
    address: provider.address_line1,
    phone: provider.phone,
    website: provider.website,
    specialty: provider.speciality,
    state: provider.state,
  };
  
  // Execute LangGraph workflow
  const result = await executeValidationWorkflow(inputData, {
    providerId: provider.id,
    runId,
  });
  
  if (result.success) {
    const finalState = result.state;

    await upsertValidationIssuesFromDiscrepancies(provider, runId, finalState);

    return {
      needsReview: finalState.needsHumanReview,
      confidence: finalState.confidence?.finalScore ?? 0,
      status: finalState.directoryStatus,
      alerts: finalState.alerts,
    };
  } else {
    console.error(`[ValidationService] Workflow failed:`, result.error);
    // Ensure at least one issue row exists so UI doesn't show empty
    const fallbackState = {
      validationDiscrepancies: [
        {
          field: "workflow",
          issue: "WORKFLOW_ERROR",
          severity: "HIGH",
          sourceType: "SYSTEM",
          suggestedValue: null,
          confidence: 0,
        },
      ],
      validationResults: { missingFields: [] },
      confidence: { finalScore: 0 },
    };
    await upsertValidationIssuesFromDiscrepancies(provider, runId, fallbackState);

    return {
      needsReview: true,
      confidence: 0,
      status: "FAILED",
      error: result.error,
    };
  }
}

async function upsertValidationIssuesFromDiscrepancies(provider, runId, finalState) {
  let discrepancies = finalState?.validationDiscrepancies || [];
  const missingFields = finalState?.validationResults?.missingFields || [];

  // If no discrepancies, synthesize issues from missing/invalid fields to ensure UI has actionable rows
  if ((!Array.isArray(discrepancies) || discrepancies.length === 0) && Array.isArray(missingFields) && missingFields.length > 0) {
    discrepancies = missingFields.map((f) => ({
      field: f,
      issue: "MISSING_REQUIRED_FIELD",
      severity: "HIGH",
      sourceType: "INPUT_VALIDATION",
      suggestedValue: null,
      confidence: 0.8,
    }));
  }

  if (!Array.isArray(discrepancies) || discrepancies.length === 0) return;

  const fieldMap = {
    name: provider.name,
    phone: provider.phone,
    address: provider.address_line1,
    address_line1: provider.address_line1,
    city: provider.city,
    state: provider.state,
    zip: provider.zip,
    speciality: provider.speciality,
    license_status: provider.license_status,
    npi: provider.npi_id,
  };

  // Remove existing issues for this provider/run to avoid duplicates on re-run
  const { error: deleteErr } = await supabase
    .from("validation_issues")
    .delete()
    .eq("provider_id", provider.id)
    .eq("run_id", runId);

  if (deleteErr) {
    console.warn("[ValidationService] Failed to clear existing issues:", deleteErr.message || deleteErr);
  }

  const issueRows = discrepancies.map((d) => {
    const fieldName = d.field || d.field_name || "unknown";
    const severity = d.severity || "MEDIUM";
    const issueCode = d.issue || "VALIDATION_DISCREPANCY";
    const confidence = typeof d.confidence === 'number' ? d.confidence : (finalState?.confidence?.finalScore ?? 0);
    const source = d.sourceType || d.source_type || issueCode;
    const autoAccept = (source === 'NPI_API' || source === 'NPI_CERTIFICATIONS' || confidence >= 0.75);
    return {
      provider_id: provider.id,
      run_id: runId,
      field_name: fieldName,
      old_value: fieldMap[fieldName] ?? null,
      suggested_value: d.suggestedValue ?? d.suggested_value ?? null,
      confidence,
      severity,
      action: autoAccept ? "AUTO_ACCEPT" : "NEEDS_REVIEW",
      source_type: source,
      status: autoAccept ? "ACCEPTED" : "OPEN",
    };
  });

  // Attempt insert with created_at; fallback without if schema lacks the column
  const nowIso = new Date().toISOString();
  const withCreated = issueRows.map(r => ({ ...r, created_at: nowIso }));
  let { error: insertErr } = await supabase
    .from("validation_issues")
    .insert(withCreated);

  if (insertErr) {
    console.warn("[ValidationService] Insert with created_at failed, retrying without:", insertErr.message || insertErr);
    const retry = await supabase
      .from("validation_issues")
      .insert(issueRows);
    insertErr = retry.error || null;
    if (insertErr) {
      console.error("[ValidationService] Failed to insert validation issues:", insertErr.message || insertErr);
    }
  }
}

/**
 * Run validation for multiple imported providers (e.g., from PDF or CSV import)
 * Creates a validation run and processes all providers through LangGraph workflow
 * @param {Array<String>} providerIds - Array of provider UUIDs to validate
 * @returns {Promise<String>} The validation run ID
 */
export async function runValidationForImportedProviders(providerIds) {
  try {
    console.info('[ValidationService] Starting validation for', providerIds.length, 'imported providers');

    // Create a new validation run
    const { data: run, error: runErr } = await supabase
      .from('validation_runs')
      .insert({
        total_providers: providerIds.length,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (runErr) {
      throw new Error(`Failed to create validation run: ${runErr.message || runErr}`);
    }

    console.info('[ValidationService] Created validation run:', run.id);

    let successCount = 0;
    let needsReviewCount = 0;
    let failedCount = 0;

    // Process each provider through LangGraph workflow
    for (const [index, providerId] of providerIds.entries()) {
      try {
        // Fetch provider data
        const { data: provider, error: provErr } = await supabase
          .from('providers')
          .select('*')
          .eq('id', providerId)
          .single();

        if (provErr || !provider) {
          console.error(`[ValidationService] Provider ${providerId} not found:`, provErr);
          continue;
        }

        // Run LangGraph validation
        const result = await runValidationForProvider(provider, run.id);

        if (result.needsReview) {
          needsReviewCount++;
        } else {
          successCount++;
        }

        console.info(`[ValidationService] Processed provider ${providerId} - Progress: ${index + 1} / ${providerIds.length}`);
      } catch (providerError) {
        console.error(`[ValidationService] Error processing provider ${providerId}:`, providerError.message);
        needsReviewCount++;
        failedCount++;
      }
    }

    // Update validation run with results (schema-aligned columns)
    const completionPayload = {
      completed_at: new Date().toISOString(),
      processed: providerIds.length,
      success_count: successCount,
      needs_review_count: needsReviewCount,
      status: 'COMPLETED',
    };
    let { error: updateErr } = await supabase
      .from('validation_runs')
      .update(completionPayload)
      .eq('id', run.id);
    if (updateErr) {
      console.warn('[ValidationService] completion update failed, retrying with UI columns only', updateErr.message || updateErr);
      const uiPayload = {
        completed_at: completionPayload.completed_at,
        processed: completionPayload.processed,
        success_count: completionPayload.success_count,
        needs_review_count: completionPayload.needs_review_count,
        status: completionPayload.status,
      };
      const retry = await supabase
        .from('validation_runs')
        .update(uiPayload)
        .eq('id', run.id);
      updateErr = retry.error || null;
    }

    if (updateErr) {
      console.error('[ValidationService] Failed to update validation run:', updateErr.message || updateErr);
    }

    console.info(`[ValidationService] Validation run complete: ${run.id} - Success: ${successCount} - Needs Review: ${needsReviewCount}`);

    // Send completion email
    console.info(`[ValidationService] Sending completion email for run ${run.id}...`);
    try {
      await sendRunCompletionEmail(run.id, providerIds);
      console.info(`[ValidationService] Completion email sent successfully for run ${run.id}`);
    } catch (emailErr) {
      console.error(`[ValidationService] Failed to send completion email for run ${run.id}:`, emailErr.message);
      // Don't fail the entire validation run if email fails
    }

    return run.id;
  } catch (error) {
    console.error('[ValidationService] Fatal error in validation run:', error.message);
    throw error;
  }
}

/**
 * Run validation for a single provider (manual trigger)
 * @param {String} providerId - Provider UUID
 * @returns {Promise<String>} Validation run ID
 */
export async function runValidationForSingleProvider(providerId) {
  console.info('[ValidationService] Starting single provider validation:', providerId);

  // Create a validation run for single provider
  const { data: run, error: runErr } = await supabase
    .from('validation_runs')
    .insert({
      total_providers: 1,
      started_at: new Date().toISOString()
    })
    .select()
    .single();

  if (runErr) {
    throw new Error(`Failed to create validation run: ${runErr.message}`);
  }

  // Fetch provider
  const { data: provider, error: provErr } = await supabase
    .from('providers')
    .select('*')
    .eq('id', providerId)
    .single();

  if (provErr || !provider) {
    throw new Error(`Provider ${providerId} not found`);
  }

  // Run LangGraph validation
  const result = await runValidationForProvider(provider, run.id);

  // Update run with results (schema-aligned columns)
  const singlePayload = {
    completed_at: new Date().toISOString(),
    processed: 1,
    success_count: result.needsReview ? 0 : 1,
    needs_review_count: result.needsReview ? 1 : 0,
    status: 'COMPLETED',
  };
  let { error: updateErr } = await supabase
    .from('validation_runs')
    .update(singlePayload)
    .eq('id', run.id);
  if (updateErr) {
    console.warn('[ValidationService] single-provider completion update failed, retrying with UI columns only', updateErr.message || updateErr);
    const uiPayload = {
      completed_at: singlePayload.completed_at,
      processed: singlePayload.processed,
      success_count: singlePayload.success_count,
      needs_review_count: singlePayload.needs_review_count,
      status: singlePayload.status,
    };
    const retry = await supabase
      .from('validation_runs')
      .update(uiPayload)
      .eq('id', run.id);
    updateErr = retry.error || null;
  }

  if (updateErr) {
    console.error('[ValidationService] Failed to update single-provider run:', updateErr.message || updateErr);
  }

  console.info(`[ValidationService] Single provider validation complete - Needs Review: ${result.needsReview}`);

  // Send admin summary email for single provider validation
  console.info(`[ValidationService] Sending admin summary email for provider ${providerId}, run ${run.id}...`);
  try {
    await sendAdminValidationSummaryEmail(run.id, providerId);
    console.info(`[ValidationService] Admin summary email sent successfully for provider ${providerId}`);
  } catch (emailErr) {
    console.error(`[ValidationService] Failed to send admin summary email:`, emailErr.message);
    // Don't fail the validation if email fails
  }

  return run.id;
}
