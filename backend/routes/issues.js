import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

/**
 * Normalize field name: lowercase, replace spaces with underscores
 */
function normalizeFieldName(fieldName) {
  if (!fieldName) return '';
  return fieldName.toLowerCase().trim().replace(/\s+/g, '_');
}

// Strict mapping from validation_issues.field_name to providers table columns
// Keys are normalized (lowercase, spaces → underscores)
const fieldNameToDbColumn = {
  // Basic info
  name: 'name',
  phone: 'phone',
  email: 'email',
  
  // Address fields
  address: 'address_line1',
  address_line1: 'address_line1',
  address_line_1: 'address_line1',
  address_line2: 'address_line2',
  address_line_2: 'address_line2',
  city: 'city',
  state: 'state',
  zip: 'zip',
  zip_code: 'zip',
  
  // Specialty
  speciality: 'speciality',
  specialty: 'speciality',
  
  // License fields
  license: 'license_number',
  license_number: 'license_number',
  license_status: 'license_status',
  license_state: 'license_state',
  
  // Certifications
  certification: 'primary_certification',
  primary_certification: 'primary_certification',
  certifications_json: 'certifications_json',
  certifications: 'certifications_json',
  
  // Affiliations
  affiliations_json: 'affiliations_json',
  affiliations: 'affiliations_json',
  
  // NPI
  npi: 'npi_id',
  npi_id: 'npi_id',
  npi_raw_data: 'npi_raw_data',
  
  // Other
  website: 'website',
  provider_code: 'provider_code',
  taxonomy_code: 'taxonomy_code',
  
  // Boolean flags
  accepting_new_patients: 'accepting_new_patients',
  telehealth_available: 'telehealth_available',
};

// Allowlist of valid provider table columns
const VALID_PROVIDER_COLUMNS = new Set([
  'name',
  'phone',
  'email',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'zip',
  'speciality',
  'license_status',
  'license_number',
  'primary_certification',
  'npi_id',
  'website',
  'provider_code',
  'taxonomy_code',
  'accepting_new_patients',
  'telehealth_available',
  'certifications_json',
  'affiliations_json',
  'npi_raw_data',
  'status',
  'updated_at'
]);

// Fields that should be boolean
const BOOLEAN_FIELDS = new Set(['accepting_new_patients', 'telehealth_available']);

// Fields that should be JSON
const JSON_FIELDS = new Set(['certifications_json', 'affiliations_json', 'npi_raw_data']);

/**
 * Transform the suggested value based on the field type
 */
function transformValueForColumn(dbColumn, value) {
  if (value === null || value === undefined) {
    return value;
  }

  // Handle boolean fields
  if (BOOLEAN_FIELDS.has(dbColumn)) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      return lower === 'true' || lower === 'yes' || lower === '1';
    }
    return Boolean(value);
  }

  // Handle JSON fields
  if (JSON_FIELDS.has(dbColumn)) {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (err) {
        console.warn(`[Transform] Failed to parse JSON for ${dbColumn}, using as-is:`, err.message);
        return value;
      }
    }
    return value;
  }

  // Return scalar values unchanged
  return value;
}

async function refreshRunNeedsReviewCount(runId) {
  try {
    // Get count of OPEN issues (still need review)
    const { data: openData, error: openErr } = await supabase
      .from("validation_issues")
      .select("id", { count: "exact" })
      .eq("run_id", runId)
      .eq("status", "OPEN");

    if (openErr) {
      console.error("Failed to refresh run counts - open issues query:", openErr.message || openErr);
      return;
    }

    const openCount = openData?.length ?? 0;

    // Get the run to know total_providers
    const { data: run, error: runErr } = await supabase
      .from("validation_runs")
      .select("total_providers")
      .eq("id", runId)
      .single();

    if (runErr || !run) {
      console.error("Failed to fetch run data:", runErr);
      return;
    }

    // Calculate success_count = total_providers - open_issues (those that are closed/processed)
    const successCount = Math.max(0, (run.total_providers ?? 0) - openCount);

    // Update both needs_review_count and success_count
    await supabase
      .from("validation_runs")
      .update({ 
        needs_review_count: openCount,
        success_count: successCount
      })
      .eq("id", runId);

    console.log(`[Issues] Updated run ${runId}: open=${openCount}, success=${successCount}, total=${run.total_providers}`);
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

    // Enforce idempotency: only accept OPEN issues
    if (issue.status !== "OPEN") {
      console.warn(`[Accept Issue] Issue ${issue.id} is not OPEN (status: ${issue.status}), cannot accept`);
      return res.status(400).json({ 
        error: `Issue already processed (status: ${issue.status})` 
      });
    }

    // Check if suggested_value is null/undefined - auto-reject in this case
    if (issue.suggested_value === null || issue.suggested_value === undefined) {
      console.warn(`[Accept Issue] Suggested value is null/undefined, auto-rejecting issue ${issue.id}`);
      
      const { error: rejectErr } = await supabase
        .from("validation_issues")
        .update({ status: "REJECTED" })
        .eq("id", issue.id);

      if (rejectErr) {
        console.error("[Accept Issue] Failed to auto-reject issue:", rejectErr);
        return res.status(500).json({ error: `Failed to auto-reject issue: ${rejectErr.message}` });
      }

      await refreshRunNeedsReviewCount(issue.run_id);

      console.log("===== [ACCEPT ISSUE] COMPLETE (AUTO-REJECTED) =====\n");
      return res.json({ 
        message: "Issue auto-rejected - no suggested value provided", 
        issue_id: issue.id,
        status: "REJECTED"
      });
    }

    // Normalize and map field name to actual database column
    const normalizedFieldName = normalizeFieldName(issue.field_name);
    const dbColumn = fieldNameToDbColumn[normalizedFieldName];
    
    console.log(`[Accept Issue] Field mapping: "${issue.field_name}" → normalized: "${normalizedFieldName}" → column: "${dbColumn || 'UNMAPPED'}"`);

    // Strict validation: no fallback, must have explicit mapping
    if (!dbColumn) {
      console.error(`[Accept Issue] No mapping exists for field: "${issue.field_name}" (normalized: "${normalizedFieldName}")`);
      return res.status(400).json({ 
        error: `Invalid field: "${issue.field_name}" has no mapping to providers table` 
      });
    }

    // Validate that the column exists in the allowlist
    if (!VALID_PROVIDER_COLUMNS.has(dbColumn)) {
      console.error(`[Accept Issue] Mapped column "${dbColumn}" is not in allowlist`);
      return res.status(400).json({ 
        error: `Invalid field: "${issue.field_name}" maps to unknown column "${dbColumn}"` 
      });
    }

    // Build update object - always update status and updated_at
    const updateObj = {
      status: "ACTIVE",
      updated_at: new Date().toISOString()
    };

    // Only update the field if suggested_value is not null
    if (issue.suggested_value !== null && issue.suggested_value !== undefined) {
      // Transform the value based on field type
      const transformedValue = transformValueForColumn(dbColumn, issue.suggested_value);
      updateObj[dbColumn] = transformedValue;
      
      console.log(`[Accept Issue] Suggested value: "${issue.suggested_value}" (type: ${typeof issue.suggested_value})`);
      console.log(`[Accept Issue] Transformed value: ${JSON.stringify(transformedValue)} (type: ${typeof transformedValue})`);
    } else {
      console.warn(`[Accept Issue] Suggested value is null/undefined for field "${dbColumn}", skipping field update`);
      console.warn(`[Accept Issue] Only status and updated_at will be modified`);
    }

    // Log the final update object after all transformations
    console.log(`[Accept Issue] Final update for provider ${issue.provider_id}, column "${dbColumn}":`, updateObj);

    // STEP 1: Fetch CURRENT provider state BEFORE updating for comparison
    const { data: beforeData, error: beforeErr } = await supabase
      .from("providers")
      .select(`id, ${dbColumn}, status, updated_at`)
      .eq("id", issue.provider_id)
      .single();

    if (beforeErr) {
      console.error("[Accept Issue] Failed to fetch provider before update:", beforeErr);
      return res.status(500).json({ error: `Cannot read provider: ${beforeErr.message}` });
    }

    if (!beforeData) {
      console.error(`[Accept Issue] Provider ${issue.provider_id} not found`);
      return res.status(404).json({ error: `Provider not found` });
    }

    console.log(`[Accept Issue] BEFORE update - ${dbColumn}: "${beforeData[dbColumn]}", status: "${beforeData.status}"`);

    // STEP 2: Perform the update WITHOUT .select() to avoid RLS issues on read-back
    console.log(`[Accept Issue] Executing update with:`, updateObj);
    const { error: updateErr, count } = await supabase
      .from("providers")
      .update(updateObj)
      .eq("id", issue.provider_id);

    if (updateErr) {
      console.error("[Accept Issue] Update error:", updateErr);
      return res.status(500).json({ error: `Failed to update provider: ${updateErr.message}` });
    }

    console.log(`[Accept Issue] Update command executed without error, count:`, count);

    // STEP 3: Verify the update persisted by fetching the provider again
    const { data: afterData, error: afterErr } = await supabase
      .from("providers")
      .select(`id, ${dbColumn}, status, updated_at`)
      .eq("id", issue.provider_id)
      .single();

    if (afterErr) {
      console.error("[Accept Issue] Failed to verify update:", afterErr);
      return res.status(500).json({ error: `Update unclear - verification failed: ${afterErr.message}` });
    }

    if (!afterData) {
      console.error(`[Accept Issue] CRITICAL: Provider disappeared after update`);
      return res.status(500).json({ error: `Provider not found after update - possible RLS issue` });
    }

    // STEP 4: Compare before and after to confirm the change
    const actualNewValue = afterData[dbColumn];
    const expectedNewValue = updateObj[dbColumn];
    const actualStatus = afterData.status;
    const expectedStatus = updateObj.status;
    
    console.log(`[Accept Issue] AFTER update - ${dbColumn}: "${actualNewValue}", status: "${actualStatus}"`);
    console.log(`[Accept Issue] Comparison:`, {
      column: dbColumn,
      before: beforeData[dbColumn],
      expected: expectedNewValue,
      actual: actualNewValue,
      fieldMatch: actualNewValue === expectedNewValue,
      statusBefore: beforeData.status,
      statusExpected: expectedStatus,
      statusActual: actualStatus,
      statusMatch: actualStatus === expectedStatus
    });

    // Verify the field value if we expected to update it
    if (expectedNewValue !== undefined && actualNewValue !== expectedNewValue) {
      console.error(`[Accept Issue] CRITICAL: Field value mismatch! Expected "${expectedNewValue}" but got "${actualNewValue}"`);
      return res.status(500).json({ 
        error: `Update failed - field value not persisted. Expected: ${expectedNewValue}, Got: ${actualNewValue}` 
      });
    }

    // CRITICAL: Verify the status was also updated
    if (actualStatus !== expectedStatus) {
      console.error(`[Accept Issue] CRITICAL: Status mismatch! Expected "${expectedStatus}" but got "${actualStatus}"`);
      console.error(`[Accept Issue] This may indicate an RLS policy or trigger is preventing status updates`);
      return res.status(500).json({ 
        error: `Status update failed - expected: ${expectedStatus}, got: ${actualStatus}. Check database policies.` 
      });
    }

    console.log(`[Accept Issue] ✓ Provider update VERIFIED and persisted successfully`);
    console.log(`[Accept Issue] Final state:`, {
      issue_id: issue.id,
      provider_id: afterData.id,
      column: dbColumn,
      old_value: beforeData[dbColumn],
      new_value: actualNewValue,
      status: afterData.status,
      updated_at: afterData.updated_at
    });

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
      message: "Update applied and verified", 
      provider_id: issue.provider_id, 
      field: dbColumn, 
      old_value: beforeData[dbColumn],
      new_value: actualNewValue,
      changed: beforeData[dbColumn] !== actualNewValue
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
    let autoRejectCount = 0;

    for (const issue of issues) {
      try {
        // Check if suggested_value is null/undefined - auto-reject in this case
        if (issue.suggested_value === null || issue.suggested_value === undefined) {
          console.log(`[Accept All] Issue ${issue.id} has no suggested value, auto-rejecting`);
          
          const { error: rejectErr } = await supabase
            .from("validation_issues")
            .update({ status: "REJECTED" })
            .eq("id", issue.id);

          if (rejectErr) {
            console.error(`[Accept All] Failed to auto-reject issue ${issue.id}:`, rejectErr);
            failCount++;
          } else {
            autoRejectCount++;
          }
          continue;
        }

        // Normalize and map field name to actual database column
        const normalizedFieldName = normalizeFieldName(issue.field_name);
        const dbColumn = fieldNameToDbColumn[normalizedFieldName];

        console.log(`[Accept All] Processing issue ${issue.id}: field="${issue.field_name}" → "${normalizedFieldName}" → "${dbColumn || 'UNMAPPED'}", provider_id="${issue.provider_id}"`);

        // Strict validation: no fallback
        if (!dbColumn) {
          console.error(`[Accept All] No mapping for field "${issue.field_name}", skipping issue ${issue.id}`);
          failCount++;
          continue;
        }

        // Validate that the column exists in the allowlist
        if (!VALID_PROVIDER_COLUMNS.has(dbColumn)) {
          console.error(`[Accept All] Column "${dbColumn}" not in allowlist for issue ${issue.id}, skipping`);
          failCount++;
          continue;
        }

        // Build update object
        const updateObj = {
          status: "ACTIVE",
          updated_at: new Date().toISOString()
        };

        if (issue.suggested_value !== null && issue.suggested_value !== undefined) {
          const transformedValue = transformValueForColumn(dbColumn, issue.suggested_value);
          updateObj[dbColumn] = transformedValue;
        }

        // Perform update without .select() to avoid RLS complications
        const { error: updateErr } = await supabase
          .from("providers")
          .update(updateObj)
          .eq("id", issue.provider_id);

        if (updateErr) {
          console.error(`[Accept All] Provider update failed for issue ${issue.id}:`, updateErr);
          failCount++;
        } else {
          // Verify the update by fetching the provider
          const { data: verifyData } = await supabase
            .from("providers")
            .select("id")
            .eq("id", issue.provider_id)
            .single();
          
          if (!verifyData) {
            console.error(`[Accept All] Update succeeded but provider ${issue.provider_id} not found on verification (possible RLS issue)`);
            failCount++;
          } else {
            console.log(`[Accept All] Successfully updated provider ${issue.provider_id}`);
            successCount++;
          }
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

    console.log(`[Accept All] Completed: ${successCount} succeeded, ${failCount} failed, ${autoRejectCount} auto-rejected\n`);
    res.json({ 
      message: "All issues processed", 
      count: issues.length,
      success: successCount,
      failed: failCount,
      autoRejected: autoRejectCount
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
