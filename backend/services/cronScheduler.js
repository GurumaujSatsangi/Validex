import cron from "node-cron";
import { supabase } from "../supabaseClient.js";
import { runValidationForProvider } from "./validationService.js";

const scheduledJobs = new Map(); // Store scheduled jobs: jobId -> cron task

/**
 * Initialize and start all cron jobs from database
 */
export async function initializeCronJobs() {
  console.log("[CronScheduler] Initializing cron jobs from database...");
  
  try {
    // Load all active cron jobs
    const { data: cronJobs, error } = await supabase
      .from("cron_jobs")
      .select("*")
      .eq("status", "ACTIVE");

    if (error) {
      console.error("[CronScheduler] Failed to load cron jobs:", error.message || error);
      return;
    }

    if (!cronJobs || cronJobs.length === 0) {
      console.log("[CronScheduler] No active cron jobs to schedule");
      return;
    }

    console.log(`[CronScheduler] Found ${cronJobs.length} active cron job(s)`);

    // Schedule each cron job
    for (const job of cronJobs) {
      scheduleCronJob(job);
    }

    console.log("[CronScheduler] All cron jobs initialized successfully");
  } catch (err) {
    console.error("[CronScheduler] Error initializing cron jobs:", err);
  }
}

/**
 * Schedule a single cron job
 */
function scheduleCronJob(jobData) {
  const { id: jobId, expression } = jobData;

  if (!expression) {
    console.warn(`[CronScheduler] Job ${jobId} has no expression, skipping`);
    return;
  }

  // Check if already scheduled
  if (scheduledJobs.has(jobId)) {
    console.warn(`[CronScheduler] Job ${jobId} is already scheduled, skipping`);
    return;
  }

  try {
    console.log(`[CronScheduler] Scheduling job ${jobId} with expression: ${expression}`);

    // Schedule with node-cron
    const task = cron.schedule(expression, async () => {
      console.log(`[CronScheduler] Executing cron job ${jobId} at ${new Date().toISOString()}`);
      await executeValidationRun(jobId);
    });

    // Store the task
    scheduledJobs.set(jobId, task);
    console.log(`[CronScheduler] Successfully scheduled job ${jobId}`);
  } catch (err) {
    console.error(`[CronScheduler] Failed to schedule job ${jobId}:`, err.message || err);
  }
}

/**
 * Execute a validation run for a cron job
 */
async function executeValidationRun(cronJobId) {
  try {
    console.log(`[CronScheduler] Starting validation run for cron job ${cronJobId}`);

    // Load all providers
    const { data: providers, error: loadErr } = await supabase
      .from("providers")
      .select("*");

    if (loadErr) {
      console.error(`[CronScheduler] Failed to load providers:`, loadErr);
      return;
    }

    const total = providers.length;
    if (total === 0) {
      console.warn(`[CronScheduler] No providers to validate`);
      return;
    }

    console.log(`[CronScheduler] Starting validation for ${total} providers from cron job ${cronJobId}`);

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
      console.error(`[CronScheduler] Failed to create validation run:`, runErr);
      return;
    }

    const runId = run.id;
    console.log(`[CronScheduler] Created validation run ${runId}`);

    let processed = 0;
    let successCount = 0;
    let needsReviewCount = 0;

    // Run validations (async, don't wait)
    (async () => {
      for (const provider of providers) {
        try {
          const result = await runValidationForProvider(provider, runId);
          processed++;
          if (result.needsReview) needsReviewCount++;
          else successCount++;
        } catch (providerErr) {
          processed++;
          needsReviewCount++;
          console.error(
            `[CronScheduler] Provider ${provider.id} failed validation:`,
            providerErr?.message || providerErr
          );
        }

        // Update progress
        const progressPayload = {
          processed,
          success_count: successCount,
          needs_review_count: needsReviewCount,
        };

        await supabase
          .from("validation_runs")
          .update(progressPayload)
          .eq("id", runId)
          .catch(err => console.warn(`[CronScheduler] Failed to update progress:`, err.message));

        console.log(
          `[CronScheduler] Progress: ${processed}/${total}, Success: ${successCount}, NeedsReview: ${needsReviewCount}`
        );
      }

      // Finalize run
      try {
        // Recalculate needs_review_count based on actual OPEN issues
        const { count: openIssuesCount, error: countErr } = await supabase
          .from("validation_issues")
          .select("id", { count: "exact", head: true })
          .eq("run_id", runId)
          .eq("status", "OPEN");

        const actualOpenCount = countErr ? needsReviewCount : (openIssuesCount ?? 0);
        const actualSuccessCount = Math.max(0, total - actualOpenCount);

        const completedAt = new Date().toISOString();
        const completionPayload = {
          completed_at: completedAt,
          status: "COMPLETED",
          processed: total,
          success_count: actualSuccessCount,
          needs_review_count: actualOpenCount,
        };

        await supabase
          .from("validation_runs")
          .update(completionPayload)
          .eq("id", runId);

        console.log(`[CronScheduler] Completed validation run ${runId} for cron job ${cronJobId}`);
      } catch (err) {
        console.error(`[CronScheduler] Error finalizing run:`, err.message || err);
      }
    })();
  } catch (err) {
    console.error(`[CronScheduler] Error executing validation run:`, err.message || err);
  }
}

/**
 * Add a new cron job to the scheduler (called after creating a new job)
 */
export function addCronJob(jobData) {
  const { id: jobId } = jobData;

  // Remove existing task if any
  if (scheduledJobs.has(jobId)) {
    const existingTask = scheduledJobs.get(jobId);
    existingTask.stop();
    scheduledJobs.delete(jobId);
    console.log(`[CronScheduler] Stopped existing task for job ${jobId}`);
  }

  // Schedule new job
  scheduleCronJob(jobData);
}

/**
 * Remove a cron job from the scheduler
 */
export function removeCronJob(jobId) {
  if (!scheduledJobs.has(jobId)) {
    console.warn(`[CronScheduler] Job ${jobId} is not scheduled`);
    return;
  }

  const task = scheduledJobs.get(jobId);
  task.stop();
  scheduledJobs.delete(jobId);
  console.log(`[CronScheduler] Stopped and removed job ${jobId}`);
}

/**
 * Get all scheduled jobs
 */
export function getScheduledJobs() {
  return Array.from(scheduledJobs.keys());
}

/**
 * Stop all cron jobs
 */
export function stopAllCronJobs() {
  console.log("[CronScheduler] Stopping all cron jobs...");
  for (const [jobId, task] of scheduledJobs.entries()) {
    task.stop();
    console.log(`[CronScheduler] Stopped job ${jobId}`);
  }
  scheduledJobs.clear();
  console.log("[CronScheduler] All cron jobs stopped");
}
