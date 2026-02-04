import { runDataValidation } from "./agents/dataValidationAgent.js";
import { runQualityAssurance } from "./agents/qualityAssuranceAgent.js";
import { runDirectoryManagement } from "./agents/directoryManagementAgent.js";
import { runInfoEnrichment } from "./agents/infoEnrichmentAgent.js";
import { sendAdminValidationSummaryEmail, sendProviderDiscrepancyEmail } from "./agents/emailGenerationAgent.js";
import { supabase } from "../supabaseClient.js";

export async function runValidationForProvider(provider, runId) {
  await runDataValidation(provider);
  await runInfoEnrichment(provider);
  const qa = await runQualityAssurance(provider, runId);
  const dm = await runDirectoryManagement(provider, runId);
  return { needsReview: qa.needsReview || dm.needsReview };
}

/**
 * Run validation for multiple imported providers (e.g., from PDF or CSV import)
 * Creates a validation run and processes all providers through the complete workflow
 * @param {Array<String>} providerIds - Array of provider UUIDs to validate
 * @returns {Promise<String>} The validation run ID
 */
export async function runValidationForImportedProviders(providerIds) {
  try {
    console.info('[Validation Service] Starting validation for', providerIds.length, 'imported providers');

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

    const runId = run.id;
    console.info('[Validation Service] Created validation run:');
    console.info('[Validation Service]   Run ID: ' + runId);
    console.info('[Validation Service] ' + `=`.repeat(60));

    let processed = 0;
    let successCount = 0;
    let needsReviewCount = 0;

    // Process each provider
    for (const providerId of providerIds) {
      try {
        // Fetch the provider data
        const { data: provider, error: fetchErr } = await supabase
          .from('providers')
          .select('*')
          .eq('id', providerId)
          .single();

        if (fetchErr || !provider) {
          console.error('[Validation Service] Failed to fetch provider', providerId, fetchErr?.message || 'Not found');
          processed++;
          continue;
        }

        // Run validation workflow
        const result = await runValidationForProvider(provider, runId);

        if (result.needsReview) {
          needsReviewCount++;
        } else {
          successCount++;
        }

        processed++;

        // Update run progress
        await supabase
          .from('validation_runs')
          .update({
            processed,
            success_count: successCount,
            needs_review_count: needsReviewCount
          })
          .eq('id', runId);

        console.info('[Validation Service] Processed provider', providerId, '- Progress:', processed, '/', providerIds.length);
      } catch (err) {
        console.error('[Validation Service] Error validating provider', providerId, err.message || err);
        processed++;
      }
    }

    // Mark run as complete
    const { error: completeErr } = await supabase
      .from('validation_runs')
      .update({
        completed_at: new Date().toISOString()
      })
      .eq('id', runId);

    if (completeErr) {
      console.error('[Validation Service] Failed to mark run as complete:', completeErr.message || completeErr);
    }

    console.info('[Validation Service] Validation run complete:', runId, '- Success:', successCount, '- Needs Review:', needsReviewCount);

    // Send admin email notification
    try {
      console.info('[Validation Service] Sending admin notification email for run:', runId);
      await sendAdminValidationSummaryEmail(runId, providerIds[0]);
      console.info('[Validation Service] Admin email sent successfully');
    } catch (emailErr) {
      console.error('[Validation Service] Failed to send admin email:', emailErr.message || emailErr);
    }

    // Send provider emails for issues
    for (const providerId of providerIds) {
      try {
        await sendProviderDiscrepancyEmail(providerId, runId);
      } catch (emailErr) {
        console.error('[Validation Service] Failed to send provider email for', providerId, ':', emailErr.message || emailErr);
      }
    }

    return runId;
  } catch (error) {
    console.error('[Validation Service] Fatal error in runValidationForImportedProviders:', error.message || error);
    throw error;
  }
}

/**
 * Run validation for a single provider (e.g., manually added by NPI)
 * Creates a validation run, processes the provider, and sends email notifications
 * @param {String} providerId - Provider UUID
 * @returns {Promise<String>} The validation run ID
 */
export async function runValidationForSingleProvider(providerId) {
  try {
    console.info('[Validation Service] Starting validation for single provider:', providerId);

    // Create a new validation run
    const { data: run, error: runErr } = await supabase
      .from('validation_runs')
      .insert({
        total_providers: 1,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (runErr) {
      throw new Error(`Failed to create validation run: ${runErr.message || runErr}`);
    }

    const runId = run.id;
    console.info('[Validation Service] Created validation run:', runId);

    // Fetch the provider data
    const { data: provider, error: fetchErr } = await supabase
      .from('providers')
      .select('*')
      .eq('id', providerId)
      .single();

    if (fetchErr || !provider) {
      throw new Error(`Failed to fetch provider: ${fetchErr?.message || 'Not found'}`);
    }

    // Run validation workflow
    let needsReview = false;
    try {
      const result = await runValidationForProvider(provider, runId);
      needsReview = result.needsReview;
    } catch (err) {
      console.error('[Validation Service] Error validating provider', providerId, err.message || err);
    }

    // Update run progress
    await supabase
      .from('validation_runs')
      .update({
        processed: 1,
        success_count: needsReview ? 0 : 1,
        needs_review_count: needsReview ? 1 : 0,
        completed_at: new Date().toISOString()
      })
      .eq('id', runId);

    console.info('[Validation Service] Validation complete for provider', providerId);

    // Send email notifications
    try {
      console.info('[Validation Service] Sending admin summary email');
      await sendAdminValidationSummaryEmail(runId, providerId);
    } catch (emailErr) {
      console.error('[Validation Service] Failed to send admin email:', emailErr.message);
      // Don't throw - email failure shouldn't break validation
    }

    try {
      console.info('[Validation Service] Sending provider discrepancy email');
      await sendProviderDiscrepancyEmail(providerId, runId);
    } catch (emailErr) {
      console.error('[Validation Service] Failed to send provider email:', emailErr.message);
      // Don't throw - email failure shouldn't break validation
    }

    console.info('[Validation Service] Validation and notifications complete for provider', providerId);

    return runId;
  } catch (error) {
    console.error('[Validation Service] Fatal error in runValidationForSingleProvider:', error.message || error);
    throw error;
  }
}

