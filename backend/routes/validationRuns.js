import express from "express";
import { supabase } from "../supabaseClient.js";
import { runValidationForProvider } from "../services/validationService.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("validation_runs")
    .select("*")
    .order("started_at", { ascending: false });

  if (error) return res.status(500).json({ error: "Failed to load runs" });
  res.json({ runs: data });
});

router.post("/", async (req, res) => {
  const { data: providers, error: loadErr } = await supabase
    .from("providers")
    .select("*");

  if (loadErr) return res.status(500).json({ error: "Failed to load providers" });

  const total = providers.length;

  const { data: run, error: runErr } = await supabase
    .from("validation_runs")
    .insert({ total_providers: total, started_at: new Date().toISOString() })
    .select()
    .single();

  if (runErr) return res.status(500).json({ error: "Could not start run" });

  const runId = run.id;

  let processed = 0;
  let successCount = 0;
  let needsReviewCount = 0;

  for (const p of providers) {
    const result = await runValidationForProvider(p, runId);

    processed++;
    if (result.needsReview) needsReviewCount++;
    else successCount++;

    await supabase
      .from("validation_runs")
      .update({
        processed,
        success_count: successCount,
        needs_review_count: needsReviewCount
      })
      .eq("id", runId);
  }

  await supabase
    .from("validation_runs")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", runId);

  res.json({ runId });
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

// GET /api/validation-runs/:id/issues - return issues associated with a run
router.get('/:id/issues', async (req, res) => {
  const runId = req.params.id;
  const { data, error } = await supabase
    .from('validation_issues')
    .select('*, providers(name, phone, email)')
    .eq('run_id', runId)
    .order('id', { ascending: true });

  if (error) return res.status(500).json({ error: 'Could not load issues for run' });
  res.json({ issues: data });
});

// GET /api/validation-runs/:id/export - export providers for a run once all issues are closed
router.get('/:id/export', async (req, res) => {
  const runId = req.params.id;

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

  // Get providers involved in this run (from issues)
  const { data: issueProviders, error: providerErr } = await supabase
    .from('validation_issues')
    .select('provider_id')
    .eq('run_id', runId);

  if (providerErr) return res.status(500).json({ error: 'Failed to gather providers for export' });

  const providerIds = [...new Set((issueProviders || []).map(p => p.provider_id))];

  if (providerIds.length === 0) {
    return res.status(400).json({ error: 'No providers associated with this run' });
  }

  const { data: providers, error: loadErr } = await supabase
    .from('providers')
    .select('*')
    .in('id', providerIds);

  if (loadErr) return res.status(500).json({ error: 'Export failed' });

  let csv = 'name,phone,email,address_line1,city,state,zip,speciality,license_number\n';

  providers.forEach(p => {
    csv += `"${p.name || ''}","${p.phone || ''}","${p.email || ''}","${p.address_line1 || ''}","${p.city || ''}","${p.state || ''}","${p.zip || ''}","${p.speciality || ''}","${p.license_number || ''}"\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=validated_run_${runId}.csv`);
  res.send(csv);
});

export default router;
