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
    
    return {
      needsReview: finalState.needsHumanReview,
      confidence: finalState.confidence?.finalScore ?? 0,
      status: finalState.directoryStatus,
      alerts: finalState.alerts,
    };
  } else {
    console.error(`[ValidationService] Workflow failed:`, result.error);
    
    // On failure, mark as needs review
    return {
      needsReview: true,
      confidence: 0,
      status: "FAILED",
      error: result.error,
    };
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
      }
    }

    // Update validation run with results
    await supabase
      .from('validation_runs')
      .update({
        completed_at: new Date().toISOString(),
        providers_success: successCount,
        providers_needs_review: needsReviewCount
      })
      .eq('id', run.id);

    console.info(`[ValidationService] Validation run complete: ${run.id} - Success: ${successCount} - Needs Review: ${needsReviewCount}`);

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

  // Update run with results
  await supabase
    .from('validation_runs')
    .update({
      completed_at: new Date().toISOString(),
      providers_success: result.needsReview ? 0 : 1,
      providers_needs_review: result.needsReview ? 1 : 0
    })
    .eq('id', run.id);

  console.info(`[ValidationService] Single provider validation complete - Needs Review: ${result.needsReview}`);

  return run.id;
}
