import express from "express";
import { supabase } from "../supabaseClient.js";
import { addCronJob, removeCronJob } from "../services/cronScheduler.js";

const router = express.Router();

// POST: Create a new cron job
router.post("/", async (req, res) => {
  try {
    const { frequency } = req.body;

    // Validate frequency
    const validExpressions = {
      "0 * * * *": true,      // Hourly
      "0 0 * * *": true,      // Daily
      "0 0 * * 0": true,      // Weekly
      "0 0 1 * *": true,      // Monthly
      "0 0 1 1 *": true       // Yearly
    };

    if (!frequency || !validExpressions[frequency]) {
      return res.status(400).json({ error: "Invalid frequency provided" });
    }

    // Insert into cron_jobs table
    const { data, error } = await supabase
      .from("cron_jobs")
      .insert([
        {
          expression: frequency,
          status: "ACTIVE",
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) {
      console.error("[Cron Jobs] Failed to create cron job", error.message || error);
      return res.status(500).json({ error: "Failed to schedule cron job" });
    }

    const newJob = data[0];
    console.log(`[Cron Jobs] Created cron job ${newJob.id}`);

    // Schedule the new job immediately
    addCronJob(newJob);

    res.status(201).json({ 
      success: true, 
      message: "Cron job scheduled successfully",
      data: newJob
    });
  } catch (err) {
    console.error("[Cron Jobs] Error creating cron job", err);
    res.status(500).json({ error: "Failed to schedule cron job" });
  }
});

// POST: Execute a cron job (triggers validation run)
router.post("/:id/execute", async (req, res) => {
  try {
    const { id: cronJobId } = req.params;

    if (!cronJobId) {
      return res.status(400).json({ error: "Cron job ID is required" });
    }

    // Verify the cron job exists and is active
    const { data: cronJob, error: cronError } = await supabase
      .from("cron_jobs")
      .select("*")
      .eq("id", cronJobId)
      .single();

    if (cronError || !cronJob) {
      console.error("[Cron Jobs] Cron job not found", cronJobId);
      return res.status(404).json({ error: "Cron job not found" });
    }

    if (cronJob.status !== "ACTIVE") {
      return res.status(400).json({ error: "Cron job is not active" });
    }

    console.log(`[Cron Jobs] Executing cron job ${cronJobId}`);

    // Trigger the validation run by calling the validation API with cronJobId
    const { data: providers, error: loadErr } = await supabase
      .from("providers")
      .select("*");

    if (loadErr) {
      console.error("[Cron Jobs] Failed to load providers", loadErr);
      return res.status(500).json({ error: "Failed to load providers" });
    }

    const total = providers.length;
    console.log(`[Cron Jobs] Starting validation run for ${total} providers from cron job ${cronJobId}`);

    // Create validation run with cron job ID
    const insertPayload = {
      total_providers: total,
      started_at: new Date().toISOString(),
      type: `Scheduled Cron Job ${cronJobId}`
    };

    const { data: run, error: runErr } = await supabase
      .from("validation_runs")
      .insert(insertPayload)
      .select()
      .single();

    if (runErr) {
      console.error("[Cron Jobs] Failed to create validation run", runErr);
      return res.status(500).json({ error: "Could not start validation run" });
    }

    const runId = run.id;
    console.log(`[Cron Jobs] Created validation run ${runId} for cron job ${cronJobId}`);

    // Import and execute validation logic
    const { runValidationForProvider } = await import("../services/validationService.js");
    
    let processed = 0;
    let successCount = 0;
    let needsReviewCount = 0;

    // Run validations in background (don't wait for all to complete before responding)
    (async () => {
      for (const p of providers) {
        try {
          const result = await runValidationForProvider(p, runId);
          processed++;
          if (result.needsReview) needsReviewCount++;
          else successCount++;
        } catch (providerErr) {
          processed++;
          needsReviewCount++;
          console.error(`[Cron Jobs] Provider ${p.id} failed validation:`, providerErr?.message || providerErr);
        }

        const progressPayload = {
          processed,
          success_count: successCount,
          needs_review_count: needsReviewCount,
        };
        await supabase
          .from("validation_runs")
          .update(progressPayload)
          .eq("id", runId);

        console.log(`[Cron Jobs] Updated run progress: ${processed}/${total}, Success: ${successCount}, NeedsReview: ${needsReviewCount}`);
      }

      // Recalculate needs_review_count based on actual OPEN issues
      const { count: openIssuesCount, error: countErr } = await supabase
        .from('validation_issues')
        .select('id', { count: 'exact', head: true })
        .eq('run_id', runId)
        .eq('status', 'OPEN');

      const actualOpenCount = countErr ? needsReviewCount : (openIssuesCount ?? 0);
      const actualSuccessCount = Math.max(0, total - actualOpenCount);

      const completedAt = new Date().toISOString();
      const completionPayload = {
        completed_at: completedAt,
        status: 'COMPLETED',
        processed: total,
        success_count: actualSuccessCount,
        needs_review_count: actualOpenCount,
      };

      await supabase
        .from("validation_runs")
        .update(completionPayload)
        .eq("id", runId);

      console.log(`[Cron Jobs] Completed validation run ${runId} for cron job ${cronJobId}`);
    })();

    res.status(202).json({
      success: true,
      message: "Cron job execution started",
      runId,
      cronJobId
    });
  } catch (err) {
    console.error("[Cron Jobs] Error executing cron job", err);
    res.status(500).json({ error: "Failed to execute cron job" });
  }
});

// DELETE: Delete a cron job
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Cron job ID is required" });
    }

    // Delete from cron_jobs table
    const { error } = await supabase
      .from("cron_jobs")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[Cron Jobs] Failed to delete cron job", error.message || error);
      return res.status(500).json({ error: "Failed to delete cron job" });
    }

    // Remove from scheduler
    removeCronJob(id);
    console.log(`[Cron Jobs] Deleted cron job ${id}`);

    res.status(200).json({ 
      success: true, 
      message: "Cron job deleted successfully" 
    });
  } catch (err) {
    console.error("[Cron Jobs] Error deleting cron job", err);
    res.status(500).json({ error: "Failed to delete cron job" });
  }
});

export default router;