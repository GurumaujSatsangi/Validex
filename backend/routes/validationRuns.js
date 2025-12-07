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

export default router;
