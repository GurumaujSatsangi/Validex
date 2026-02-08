import express from "express";
import { supabase } from "../supabaseClient.js";
import { runValidationForProvider } from "../services/validationService.js";
import { sendAdminValidationSummaryEmail, sendRunCompletionEmail } from "../services/agents/emailGenerationAgent.js";

const router = express.Router();

async function updateRunProgressWithRetry(runId, payload, attempt = 1) {
  const maxAttempts = 2;
  const { error } = await supabase
    .from("validation_runs")
    .update(payload)
    .eq("id", runId);

  if (error) {
    console.warn(`[ValidationRuns] Progress update attempt ${attempt} failed`, { runId, error: error.message || error });
    if (attempt < maxAttempts) {
      // Fallback: update only UI-known columns
      const uiPayload = {
        processed: payload.processed,
        success_count: payload.success_count,
        needs_review_count: payload.needs_review_count,
      };
      return updateRunProgressWithRetry(runId, uiPayload, attempt + 1);
    }
    return { error };
  }
  return { error: null };
}

router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("validation_runs")
      .select("*")
      .order("started_at", { ascending: false });

    if (error) {
      console.error("[ValidationRuns] GET / failed:", error);
      return res.status(500).json({ error: "Failed to load runs" });
    }
    
    res.json({ runs: data || [] });
  } catch (err) {
    console.error("[ValidationRuns] GET / unexpected error:", err);
    res.status(500).json({ error: "Failed to load runs", message: err.message });
  }
});

router.post("/", async (req, res) => {
  console.log(`[ValidationRuns] POST /api/validation-runs hit at ${new Date().toISOString()}`);
  try {
    const { data: providers, error: loadErr } = await supabase
      .from("providers")
      .select("*");

    if (loadErr) return res.status(500).json({ error: "Failed to load providers" });

    const total = providers.length;
    console.log(`[ValidationRuns] Starting validation run for ${total} providers`);

    const { data: run, error: runErr } = await supabase
      .from("validation_runs")
      .insert({ total_providers: total, started_at: new Date().toISOString() })
      .select()
      .single();

    if (runErr) return res.status(500).json({ error: "Could not start run" });

    const runId = run.id;
    console.log(`[ValidationRuns] Created run with ID: ${runId}`);

    let processed = 0;
    let successCount = 0;
    let needsReviewCount = 0;
    let failedCount = 0;

    for (const p of providers) {
      try {
        const result = await runValidationForProvider(p, runId);

        processed++;
        if (result.needsReview) needsReviewCount++;
        else successCount++;
      } catch (providerErr) {
        processed++;
        needsReviewCount++;
        failedCount++;
        console.error(`[ValidationRuns] Provider ${p.id} failed validation:`, providerErr?.message || providerErr);
      }

      const progressPayload = {
        processed,
        success_count: successCount,
        needs_review_count: needsReviewCount,
      };
      await updateRunProgressWithRetry(runId, progressPayload);

      console.log(`[ValidationRuns] Updated run progress: ${processed}/${total}, Success: ${successCount}, NeedsReview: ${needsReviewCount}`);
    }

    console.log(`[ValidationRuns] All validation complete. Setting completed_at for run ${runId}`);
    
    const completedAt = new Date().toISOString();
    const completionPayload = {
      completed_at: completedAt,
      status: 'COMPLETED',
    };
    const completeRes = await supabase
      .from("validation_runs")
      .update(completionPayload)
      .eq("id", runId);

    if (completeRes.error) {
      console.error(`[ValidationRuns] Failed to set completed_at:`, completeRes.error);
    } else {
      console.log(`[ValidationRuns] Successfully set completed_at for run ${runId}`);
    }

    // Best-effort optional secondary status update (compat with legacy schemas)
    const statusRes = await supabase
      .from("validation_runs")
      .update({ status: 'COMPLETED' })
      .eq("id", runId);
    if (statusRes.error) {
      console.warn(`[ValidationRuns] status update skipped/failed:`, statusRes.error?.message || statusRes.error);
    }

    // Send completion email SYNCHRONOUSLY before responding
    console.log(`[ValidationRuns] Sending completion email for run ${runId}...`);
    const allProviderIds = providers.map(p => p.id);
    try {
      await sendRunCompletionEmail(runId, allProviderIds);
      console.log(`[ValidationRuns] Email sent successfully for run ${runId}`);
    } catch (emailErr) {
      console.error(`[ValidationRuns] Email send error for run ${runId}:`, emailErr.message);
    }

    console.log(`[ValidationRuns] Validation run ${runId} fully complete. Responding to client.`);
    res.json({ runId, status: 'COMPLETED' });
  } catch (error) {
    console.error(`[ValidationRuns] Unexpected error:`, error);
    res.status(500).json({ error: error.message || "Validation failed" });
  }
});

// DELETE /api/validation-runs/:id - remove a run and its issues
router.delete('/:id', async (req, res) => {
  const runId = req.params.id;

  try {
    const { error: issuesErr } = await supabase
      .from('validation_issues')
      .delete()
      .eq('run_id', runId);

    if (issuesErr) {
      console.error('Failed to delete validation issues for run', runId, issuesErr.message || issuesErr);
      return res.status(500).json({ error: 'Could not delete run issues' });
    }

    const { error: runErr } = await supabase
      .from('validation_runs')
      .delete()
      .eq('id', runId);

    if (runErr) {
      console.error('Failed to delete validation run', runId, runErr.message || runErr);
      return res.status(500).json({ error: 'Could not delete run' });
    }

    res.status(204).send();
  } catch (err) {
    console.error('Unexpected error deleting validation run', runId, err);
    res.status(500).json({ error: 'Unexpected error deleting run' });
  }
});

// POST /api/validation-runs/:id/toggle-star - toggle star status for a run
router.post('/:id/toggle-star', async (req, res) => {
  const runId = req.params.id;

  try {
    // First, get the current star status
    const { data: run, error: selectErr } = await supabase
      .from('validation_runs')
      .select('is_starred')
      .eq('id', runId)
      .single();

    if (selectErr) {
      console.error('Failed to fetch run', runId, selectErr.message || selectErr);
      return res.status(500).json({ error: 'Could not fetch run' });
    }

    // Toggle the is_starred value
    const newStarStatus = !run.is_starred;

    const { error: updateErr } = await supabase
      .from('validation_runs')
      .update({ is_starred: newStarStatus })
      .eq('id', runId);

    if (updateErr) {
      console.error('Failed to update run star status', runId, updateErr.message || updateErr);
      return res.status(500).json({ error: 'Could not update star status' });
    }

    res.json({ is_starred: newStarStatus });
  } catch (err) {
    console.error('Unexpected error toggling star status', runId, err);
    res.status(500).json({ error: 'Unexpected error toggling star' });
  }
});

// GET /api/validation-runs/:id/issues - return issues associated with a run
router.get('/:id/issues', async (req, res) => {
  const runId = req.params.id;
  const { data, error } = await supabase
    .from('validation_issues')
    .select('*, providers(name, phone, email, npi_id)')
    .eq('run_id', runId)
    .order('id', { ascending: true });

  if (error) return res.status(500).json({ error: 'Could not load issues for run' });
  res.json({ issues: data });
});

// GET /api/validation-runs/:id/export - export providers for a run once all issues are closed
router.get('/:id/export', async (req, res) => {
  const runId = req.params.id;

  // Get the run to get total providers count
  const { data: run, error: runErr } = await supabase
    .from('validation_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (runErr || !run) {
    return res.status(404).json({ error: 'Validation run not found' });
  }

  // Ensure no open issues remain
  const { count: openCount, error: openErr } = await supabase
    .from('validation_issues')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', runId)
    .eq('status', 'OPEN');

  if (openErr) return res.status(500).json({ error: 'Failed to check issue status' });
  if ((openCount ?? 0) > 0) {
    return res.status(400).json({ error: 'Issues still open. Resolve all issues before exporting.' });
  }

  // Get all providers involved in this run (from issues - any outcome)
  const { data: issueProviders, error: providerErr } = await supabase
    .from('validation_issues')
    .select('provider_id')
    .eq('run_id', runId);

  if (providerErr) return res.status(500).json({ error: 'Failed to gather providers for export' });

  const providerIds = [...new Set((issueProviders || []).map(p => p.provider_id))];

  if (providerIds.length === 0) {
    return res.status(400).json({ error: 'No providers associated with this run' });
  }

  // Get provider details only for providers in this run
  const { data: providers, error: loadErr } = await supabase
    .from('providers')
    .select('*')
    .in('id', providerIds)
    .order('name', { ascending: true });

  if (loadErr) return res.status(500).json({ error: 'Export failed' });

  const { data: issueRows, error: issueErr } = await supabase
    .from('validation_issues')
    .select('provider_id, field_name, suggested_value, status, id')
    .eq('run_id', runId)
    .in('field_name', ['certification', 'appointment_availability', 'availability_status'])
    .order('id', { ascending: false });

  if (issueErr) return res.status(500).json({ error: 'Failed to gather issue data for export' });

  const issueMap = new Map();
  (issueRows || []).forEach(row => {
    const key = `${row.provider_id}:${row.field_name}`;
    if (!issueMap.has(key)) {
      issueMap.set(key, row.suggested_value);
    }
  });

  const getIssueValue = (providerId, fieldName) => {
    const key = `${providerId}:${fieldName}`;
    return issueMap.get(key) ?? null;
  };

  // Build CSV with run-specific data
  let csv = 'name,phone,email,address_line1,city,state,zip,speciality,license_number,certification,appointment_availability,availability_status\n';

  providers.forEach(p => {
    // Escape quotes in CSV fields
    const escape = (val) => {
      if (!val) return '""';
      return `"${String(val).replace(/"/g, '""')}"`;
    };
    const certification = p.primary_certification || getIssueValue(p.id, 'certification');
    const appointmentAvailability = getIssueValue(p.id, 'appointment_availability');
    const availabilityStatus = getIssueValue(p.id, 'availability_status');
    csv += `${escape(p.name)},${escape(p.phone)},${escape(p.email)},${escape(p.address_line1)},${escape(p.city)},${escape(p.state)},${escape(p.zip)},${escape(p.speciality)},${escape(p.license_number)},${escape(certification)},${escape(appointmentAvailability)},${escape(availabilityStatus)}\n`;
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="validated_providers_run_${runId.substring(0, 8)}.csv"`);
  res.setHeader('Content-Length', Buffer.byteLength(csv));
  res.send(csv);
});

export default router;
