import { supabase } from "../../supabaseClient.js";

/**
 * Normalize field name: lowercase, replace spaces with underscores
 */
function normalizeFieldName(fieldName) {
  if (!fieldName) return "";
  return fieldName.toLowerCase().trim().replace(/\s+/g, "_");
}

/**
 * Explicit mapping from validation_issues.field_name → providers column
 */
const FIELD_NAME_TO_DB_COLUMN = {
  name: "name",
  phone: "phone",
  email: "email",
  address: "address_line1",
  address_line1: "address_line1",
  address_line_1: "address_line1",
  address_line2: "address_line2",
  address_line_2: "address_line2",
  city: "city",
  state: "state",
  zip: "zip",
  zip_code: "zip",
  speciality: "speciality",
  specialty: "speciality",
  license: "license_number",
  license_number: "license_number",
  license_status: "license_status",
  license_state: "license_state",
  certification: "primary_certification",
  primary_certification: "primary_certification",
  certifications: "certifications_json",
  certifications_json: "certifications_json",
  affiliations: "affiliations_json",
  affiliations_json: "affiliations_json",
  npi: "npi_id",
  npi_id: "npi_id",
  npi_raw_data: "npi_raw_data",
  website: "website",
  provider_code: "provider_code",
  taxonomy_code: "taxonomy_code",
  accepting_new_patients: "accepting_new_patients",
  telehealth_available: "telehealth_available"
};

/**
 * Provider allowlist (must match DB schema)
 */
const VALID_PROVIDER_COLUMNS = new Set([
  "name",
  "phone",
  "email",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "zip",
  "speciality",
  "license_status",
  "license_number",
  "license_state",
  "primary_certification",
  "certifications_json",
  "affiliations_json",
  "npi_id",
  "npi_raw_data",
  "website",
  "provider_code",
  "taxonomy_code",
  "accepting_new_patients",
  "telehealth_available",
  "status",
  "updated_at"
]);

const BOOLEAN_FIELDS = new Set([
  "accepting_new_patients",
  "telehealth_available"
]);

const JSON_FIELDS = new Set([
  "certifications_json",
  "affiliations_json",
  "npi_raw_data"
]);

/**
 * Transform suggested_value → correct DB type
 */
function transformValue(dbColumn, value) {
  if (value === null || value === undefined) return value;

  if (BOOLEAN_FIELDS.has(dbColumn)) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      return ["true", "yes", "1"].includes(value.toLowerCase());
    }
    return Boolean(value);
  }

  if (JSON_FIELDS.has(dbColumn)) {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        console.warn(`[Transform] Invalid JSON for ${dbColumn}, using raw value`);
        return value;
      }
    }
    return value;
  }

  return value;
}

/**
 * Auto-accept directory validation issues
 */
export async function runDirectoryManagement(provider, runId) {
  const { data: issues, error: issuesErr } = await supabase
    .from("validation_issues")
    .select("*")
    .eq("provider_id", provider.id)
    .eq("status", "OPEN");

  if (issuesErr) {
    console.error(`[Auto-Accept] Failed to fetch issues`, issuesErr);
    return { needsReview: true };
  }

  if (!issues || issues.length === 0) {
    console.log(`[Auto-Accept] No open issues for provider ${provider.id}`);
    return { needsReview: false };
  }

  let needsReview = false;
  let acceptedCount = 0;

  for (const issue of issues) {
    if (issue.action !== "AUTO_ACCEPT") {
      needsReview = true;
      continue;
    }

    console.log(`\n[Auto-Accept] Processing issue ${issue.id}`);
    console.log(`Field: ${issue.field_name}`);
    console.log(`Suggested: ${issue.suggested_value}`);

    const normalized = normalizeFieldName(issue.field_name);
    const dbColumn = FIELD_NAME_TO_DB_COLUMN[normalized];

    if (!dbColumn) {
      console.error(`[Auto-Accept] No mapping for "${issue.field_name}"`);
      needsReview = true;
      continue;
    }

    if (!VALID_PROVIDER_COLUMNS.has(dbColumn)) {
      console.error(`[Auto-Accept] Column "${dbColumn}" not allowed`);
      needsReview = true;
      continue;
    }

    if (issue.suggested_value === null || issue.suggested_value === undefined) {
      console.warn(`[Auto-Accept] Null suggested value — skipping`);
      continue;
    }

    const transformedValue = transformValue(dbColumn, issue.suggested_value);

    const updateObj = {
      [dbColumn]: transformedValue,
      status: "ACTIVE",
      updated_at: new Date().toISOString()
    };

    console.log(`[Auto-Accept] Update object`, updateObj);

    /**
     * 🔥 CRITICAL FIX:
     * Use .select() to confirm update
     */
    const { data: updatedRows, error: updateErr } = await supabase
      .from("providers")
      .update(updateObj)
      .eq("id", provider.id)
      .select(`id, ${dbColumn}, status`);

    if (updateErr) {
      console.error(`[Auto-Accept] Update failed`, updateErr);
      needsReview = true;
      continue;
    }

    if (!updatedRows || updatedRows.length === 0) {
      console.error(`[Auto-Accept] Update returned 0 rows (RLS / ID mismatch)`);
      needsReview = true;
      continue;
    }

    const updated = updatedRows[0];

    if (JSON.stringify(updated[dbColumn]) !== JSON.stringify(transformedValue)) {
      console.error(`[Auto-Accept] Value verification failed`, {
        expected: transformedValue,
        actual: updated[dbColumn]
      });
      needsReview = true;
      continue;
    }

    if (updated.status !== "ACTIVE") {
      console.error(`[Auto-Accept] Status verification failed`);
      needsReview = true;
      continue;
    }

    console.log(`[Auto-Accept] ✓ Provider updated successfully`);

    /**
     * Mark issue ACCEPTED ONLY after provider update succeeds
     */
    const { error: issueErr } = await supabase
      .from("validation_issues")
      .update({ status: "ACCEPTED" })
      .eq("id", issue.id);

    if (issueErr) {
      console.error(`[Auto-Accept] Failed to mark issue ACCEPTED`, issueErr);
      needsReview = true;
      continue;
    }

    acceptedCount++;
  }

  if (acceptedCount > 0) {
    console.log(`\n[Auto-Accept] ✓ Auto-accepted ${acceptedCount} issue(s)\n`);
  }

  return { needsReview };
}
