import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const { status, search, limit } = req.query;

  let query = supabase
    .from("providers")
    .select("*, validation_issues(count)")
    .order("name");

  if (status) query = query.eq("status", status);
  if (limit) query = query.limit(Number(limit));
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const providers = data.map(p => ({
    ...p,
    issues_count: p.validation_issues[0]?.count || 0
  }));

  res.json({ providers });
});

router.get("/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("providers")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) return res.status(500).json({ error: "Provider not found" });
  res.json(data);
});

router.get("/:id/issues", async (req, res) => {
  const { data, error } = await supabase
    .from("validation_issues")
    .select("*")
    .eq("provider_id", req.params.id);

  if (error) return res.status(500).json({ error: "Issues not found" });
  res.json({ issues: data });
});

// DELETE /api/providers/:id - remove provider and related data
router.delete('/:id', async (req, res) => {
  const providerId = req.params.id;

  try {
    const { error: issuesErr } = await supabase
      .from('validation_issues')
      .delete()
      .eq('provider_id', providerId);

    if (issuesErr) {
      console.error('Failed to delete validation issues for provider', providerId, issuesErr.message || issuesErr);
      return res.status(500).json({ error: 'Could not delete provider issues' });
    }

    const { error: sourcesErr } = await supabase
      .from('provider_sources')
      .delete()
      .eq('provider_id', providerId);

    if (sourcesErr) {
      console.error('Failed to delete provider sources', providerId, sourcesErr.message || sourcesErr);
      return res.status(500).json({ error: 'Could not delete provider sources' });
    }

    const { error: providerErr } = await supabase
      .from('providers')
      .delete()
      .eq('id', providerId);

    if (providerErr) {
      console.error('Failed to delete provider', providerId, providerErr.message || providerErr);
      return res.status(500).json({ error: 'Could not delete provider' });
    }

    res.status(204).send();
  } catch (err) {
    console.error('Unexpected error deleting provider', providerId, err);
    res.status(500).json({ error: 'Unexpected error deleting provider' });
  }
});

export default router;
