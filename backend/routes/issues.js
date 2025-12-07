import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

async function refreshRunNeedsReviewCount(runId) {
  try {
    const { data, error } = await supabase
      .from("validation_issues")
      .select("id", { count: "exact" })
      .eq("run_id", runId)
      .eq("status", "OPEN");

    if (error) {
      console.error("Failed to refresh run counts", error.message || error);
      return;
    }

    const openCount = data?.length ?? 0;

    await supabase
      .from("validation_runs")
      .update({ needs_review_count: openCount })
      .eq("id", runId);
  } catch (err) {
    console.error("Unexpected error refreshing run counts", err);
  }
}

router.post(":id/accept", async (req, res) => {
  const { data: issue } = await supabase
    .from("validation_issues")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (!issue) return res.status(404).json({ error: "Issue not found" });

  await supabase
    .from("providers")
    .update({
      [issue.field_name]: issue.suggested_value,
      status: "ACTIVE"
    })
    .eq("id", issue.provider_id);

  await supabase
    .from("validation_issues")
    .update({ status: "ACCEPTED" })
    .eq("id", issue.id);

  await refreshRunNeedsReviewCount(issue.run_id);

  res.json({ message: "Update applied" });
});

router.post(":id/reject", async (req, res) => {
  const { data: issue } = await supabase
    .from("validation_issues")
    .select("run_id")
    .eq("id", req.params.id)
    .single();

  await supabase
    .from("validation_issues")
    .update({ status: "REJECTED" })
    .eq("id", req.params.id);

  if (issue?.run_id) {
    await refreshRunNeedsReviewCount(issue.run_id);
  }

  res.json({ message: "Issue rejected" });
});

// Bulk accept all open issues for a run
router.post("/run/:runId/accept-all", async (req, res) => {
  const runId = req.params.runId;

  const { data: issues, error } = await supabase
    .from("validation_issues")
    .select("*")
    .eq("run_id", runId)
    .eq("status", "OPEN");

  if (error) return res.status(500).json({ error: "Failed to load issues" });

  for (const issue of issues) {
    await supabase
      .from("providers")
      .update({
        [issue.field_name]: issue.suggested_value,
        status: "ACTIVE"
      })
      .eq("id", issue.provider_id);

    await supabase
      .from("validation_issues")
      .update({ status: "ACCEPTED" })
      .eq("id", issue.id);
  }

  await refreshRunNeedsReviewCount(runId);

  res.json({ message: "All issues accepted" });
});

// Bulk reject all open issues for a run
router.post("/run/:runId/reject-all", async (req, res) => {
  const runId = req.params.runId;

  const { data: issues, error } = await supabase
    .from("validation_issues")
    .select("id")
    .eq("run_id", runId)
    .eq("status", "OPEN");

  if (error) return res.status(500).json({ error: "Failed to load issues" });

  for (const issue of issues) {
    await supabase
      .from("validation_issues")
      .update({ status: "REJECTED" })
      .eq("id", issue.id);
  }

  await refreshRunNeedsReviewCount(runId);

  res.json({ message: "All issues rejected" });
});

export default router;
