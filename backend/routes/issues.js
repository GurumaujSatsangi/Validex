import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

// Map field names from validation_issues to actual database column names
const fieldNameToDbColumn = {
  name: 'name',
  phone: 'phone',
  email: 'email',
  address: 'address_line1',
  address_line1: 'address_line1',
  city: 'city',
  state: 'state',
  zip: 'zip',
  speciality: 'speciality',
  specialty: 'speciality', // handles both spellings
  license_status: 'license_status',
  license: 'license_number',
  license_number: 'license_number',
  certification: 'primary_certification', // Map certification to primary_certification
  npi: 'npi_id',
  npi_id: 'npi_id',
  website: 'website',
  provider_code: 'provider_code',
  taxonomy_code: 'taxonomy_code',
};

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

router.post("/:id/accept", async (req, res) => {
  try {
    const { data: issue, error: issueErr } = await supabase
      .from("validation_issues")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (issueErr || !issue) {
      console.error("[Accept Issue] Issue not found:", issueErr);
      return res.status(404).json({ error: "Issue not found" });
    }

    console.log("\n===== [ACCEPT ISSUE] START =====");
    console.log("[Accept Issue] Issue loaded:", {
      id: issue.id,
      provider_id: issue.provider_id,
      field_name: issue.field_name,
      old_value: issue.old_value,
      suggested_value: issue.suggested_value,
      status: issue.status
    });

    // Map field name to actual database column
    const dbColumn = fieldNameToDbColumn[issue.field_name] || issue.field_name;
    
    console.log(`[Accept Issue] Field mapping: "${issue.field_name}" → "${dbColumn}"`);
    console.log(`[Accept Issue] Suggested value to apply: "${issue.suggested_value}"`);

    // Build update object - only update if suggested_value is not null
    const updateObj = {
      status: "ACTIVE",
      last_updated: new Date().toISOString()
    };

    if (issue.suggested_value !== null && issue.suggested_value !== undefined) {
      updateObj[dbColumn] = issue.suggested_value;
    } else {
      console.warn(`[Accept Issue] Suggested value is null/undefined for field ${dbColumn}, skipping field update`);
    }

    console.log(`[Accept Issue] Update object:`, updateObj);

    const { data: updateData, error: updateErr } = await supabase
      .from("providers")
      .update(updateObj)
      .eq("id", issue.provider_id)
      .select();

    if (updateErr) {
      console.error("[Accept Issue] Update error:", updateErr);
      return res.status(500).json({ error: `Failed to update provider: ${updateErr.message}` });
    }

    console.log(`[Accept Issue] Update returned ${updateData ? updateData.length : 0} rows`);
    if (updateData && updateData.length > 0) {
      console.log(`[Accept Issue] Updated provider data:`, {
        id: updateData[0].id,
        [dbColumn]: updateData[0][dbColumn],
        status: updateData[0].status
      });
    }

    const { error: issueUpdateErr } = await supabase
      .from("validation_issues")
      .update({ status: "ACCEPTED" })
      .eq("id", issue.id);

    if (issueUpdateErr) {
      console.error("[Accept Issue] Failed to update issue status:", issueUpdateErr);
    }

    await refreshRunNeedsReviewCount(issue.run_id);

    console.log("===== [ACCEPT ISSUE] COMPLETE =====\n");

    res.json({ 
      message: "Update applied", 
      provider_id: issue.provider_id, 
      field: dbColumn, 
      value: issue.suggested_value 
    });
  } catch (err) {
    console.error("[Accept Issue] Unexpected error:", err);
    res.status(500).json({ error: `Internal server error: ${err.message}` });
  }
});

router.post("/:id/reject", async (req, res) => {
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
  
  try {
    console.log(`\n[Accept All] Starting bulk accept for run: ${runId}`);

    const { data: issues, error } = await supabase
      .from("validation_issues")
      .select("*")
      .eq("run_id", runId)
      .eq("status", "OPEN");

    if (error) {
      console.error("[Accept All] Failed to load issues:", error);
      return res.status(500).json({ error: "Failed to load issues" });
    }

    console.log(`[Accept All] Found ${issues.length} open issues`);

    let successCount = 0;
    let failCount = 0;

    for (const issue of issues) {
      try {
        // Map field name to actual database column
        const dbColumn = fieldNameToDbColumn[issue.field_name] || issue.field_name;

        console.log(`[Accept All] Processing issue ${issue.id}: field="${issue.field_name}" → "${dbColumn}", provider_id="${issue.provider_id}", value="${issue.suggested_value}"`);

        // Build update object
        const updateObj = {
          status: "ACTIVE",
          last_updated: new Date().toISOString()
        };

        if (issue.suggested_value !== null && issue.suggested_value !== undefined) {
          updateObj[dbColumn] = issue.suggested_value;
        }

        const { data: updateData, error: updateErr } = await supabase
          .from("providers")
          .update(updateObj)
          .eq("id", issue.provider_id)
          .select();

        if (updateErr) {
          console.error(`[Accept All] Provider update failed for issue ${issue.id}:`, updateErr);
          failCount++;
        } else {
          console.log(`[Accept All] Successfully updated provider ${issue.provider_id}, rows affected: ${updateData?.length || 0}`);
          successCount++;
        }

        const { error: issueErr } = await supabase
          .from("validation_issues")
          .update({ status: "ACCEPTED" })
          .eq("id", issue.id);

        if (issueErr) {
          console.error(`[Accept All] Failed to update issue status for ${issue.id}:`, issueErr);
        }
      } catch (issueError) {
        console.error(`[Accept All] Error processing issue ${issue.id}:`, issueError);
        failCount++;
      }
    }

    await refreshRunNeedsReviewCount(runId);

    console.log(`[Accept All] Completed: ${successCount} succeeded, ${failCount} failed\n`);
    res.json({ 
      message: "All issues processed", 
      count: issues.length,
      success: successCount,
      failed: failCount
    });
  } catch (err) {
    console.error("[Accept All] Unexpected error:", err);
    res.status(500).json({ error: `Internal server error: ${err.message}` });
  }
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
