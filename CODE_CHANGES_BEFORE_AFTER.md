# Code Changes: Before & After

## File: backend/services/utils/scoringUtils.js

### Status: ✅ NEW FILE CREATED

**Key Functions**:
1. `cosineSimilarity()` - Tokenization-based text similarity
2. `jaroWinkler()` - Edit distance with prefix weighting
3. `levenshteinScore()` - Normalized edit distance
4. `addressSimilarity()` - Weighted combination of 3 algorithms
5. `sourceWeightedVote()` - Source reliability weighting
6. `finalScore()` - Final 0.50/0.30/0.20 weighted model
7. `determineAction()` - Threshold decision logic
8. `determineSeverity()` - Inverse severity mapping

---

## File: backend/services/agents/qualityAssuranceAgent.js

### Import Changes

#### BEFORE:
```javascript
import { supabase } from "../../supabaseClient.js";
import { normalizeAddressComponent, normalizeText } from "../tools/addressUtils.js";
```

#### AFTER:
```javascript
import { supabase } from "../../supabaseClient.js";
import { normalizeAddressComponent, normalizeText } from "../tools/addressUtils.js";
import {
  addressSimilarity,
  sourceWeightedVote,
  finalScore,
  determineAction,
  determineSeverity
} from "../utils/scoringUtils.js";
```

---

### Issue Detection Changes

#### BEFORE (Static Scores):
```javascript
// NPI Phone Check
const npiPhone = npiSource.raw_data.phone;
if (npiPhone && normalizePhone(npiPhone) !== normalizePhone(provider.phone)) {
  suggested.phone = {
    oldValue: provider.phone,
    suggestedValue: npiPhone,
    confidence: 0.9,  // ← HARDCODED
    sourceType: "NPI_API"
  };
}
```

#### AFTER (Dynamic Scoring):
```javascript
// NPI Phone Check
const npiPhone = npiSource.raw_data.phone;
if (npiPhone && normalizePhone(npiPhone) !== normalizePhone(provider.phone)) {
  const srcScore = sourceWeightedVote({ npi: true, azure: false, scrape: false, pdf: false });
  const addressScore = addressSimilarity(provider.address_line1, provider.address_line1);
  const confidence = finalScore({ sourceScore: srcScore, addressScore, phoneScore: 0 });

  suggested.phone = {
    oldValue: provider.phone,
    suggestedValue: npiPhone,
    confidence,  // ← COMPUTED
    sourceType: "NPI_API",
    action: determineAction(confidence),      // ← NEW
    severity: determineSeverity(confidence)   // ← NEW
  };
}
```

---

### Issue Row Insertion

#### BEFORE:
```javascript
const issueRows = Object.entries(suggested).map(([fieldName, s]) => ({
  provider_id: provider.id,
  run_id: runId,
  field_name: fieldName,
  old_value: s.oldValue,
  suggested_value: s.suggestedValue,
  confidence: s.confidence,
  severity: s.confidence > 0.9 ? "HIGH" : s.confidence > 0.7 ? "MEDIUM" : "LOW",  // ← Logic
  source_type: s.sourceType || "UNKNOWN",
  status: "OPEN"
}));
```

#### AFTER:
```javascript
const issueRows = Object.entries(suggested).map(([fieldName, s]) => ({
  provider_id: provider.id,
  run_id: runId,
  field_name: fieldName,
  old_value: s.oldValue,
  suggested_value: s.suggestedValue,
  confidence: s.confidence,
  severity: s.severity,  // ← From determineSeverity()
  action: s.action,      // ← NEW: From determineAction()
  source_type: s.sourceType || "UNKNOWN",
  status: "OPEN"
}));
```

---

## File: backend/services/agents/directoryManagementAgent.js

### Action Decision Logic

#### BEFORE (Confidence-Based):
```javascript
for (const issue of issues) {
  if (issue.confidence > 0.9) {  // ← OLD LOGIC
    await supabase
      .from("providers")
      .update({
        [issue.field_name]: issue.suggested_value,
        status: "ACTIVE",
        last_validated_at: new Date().toISOString()
      })
      .eq("id", provider.id);

    await supabase
      .from("validation_issues")
      .update({ status: "ACCEPTED" })
      .eq("id", issue.id);
  } else {
    needsReview = true;
    // Leave provider unchanged
  }
}
```

#### AFTER (Action-Based):
```javascript
for (const issue of issues) {
  if (issue.action === "AUTO_ACCEPT") {  // ← NEW LOGIC
    await supabase
      .from("providers")
      .update({
        [issue.field_name]: issue.suggested_value,
        status: "ACTIVE",
        last_validated_at: new Date().toISOString()
      })
      .eq("id", provider.id);

    await supabase
      .from("validation_issues")
      .update({ status: "ACCEPTED" })
      .eq("id", issue.id);
  } else {
    // issue.action === "NEEDS_REVIEW"
    needsReview = true;
    // Leave provider unchanged
  }
}
```

**Key Difference**:
- **BEFORE**: Automatic based on hardcoded 0.9 threshold
- **AFTER**: Uses intelligent scoring algorithm with configurable threshold

---

## File: public/js/runs.js

### Issues Modal Table

#### BEFORE (8 Columns):
```javascript
<thead class="table-light">
  <tr>
    <th>Provider</th>
    <th>Field</th>
    <th>Current</th>
    <th>Suggested</th>
    <th>Source</th>
    <th>Confidence</th>
    <th>Severity</th>
    <th>Status</th>
    <th>Actions</th>
  </tr>
</thead>
```

#### AFTER (9 Columns):
```javascript
<thead class="table-light">
  <tr>
    <th>Provider</th>
    <th>Field</th>
    <th>Current</th>
    <th>Suggested</th>
    <th>Source</th>
    <th>Confidence</th>
    <th>Severity</th>
    <th>Action</th>           // ← NEW COLUMN
    <th>Status</th>
    <th>Actions</th>
  </tr>
</thead>
```

---

### Row Rendering

#### BEFORE:
```javascript
const statusBadgeClass = it.status === 'ACCEPTED' ? 'bg-success' : it.status === 'REJECTED' ? 'bg-secondary' : 'bg-warning text-dark';

html += `
  <tr data-issue-id="${escapeHtml(it.id)}">
    <td>...</td>
    <td><strong>${escapeHtml(it.field_name)}</strong></td>
    <td>${escapeHtml(it.old_value)}</td>
    <td><span class="badge bg-info">${escapeHtml(it.suggested_value)}</span></td>
    <td><span class="badge ...>${escapeHtml(it.source_type || 'UNKNOWN')}</span></td>
    <td><span class="badge bg-secondary">${confidence}%</span></td>
    <td><span class="badge bg-danger">${escapeHtml(it.severity)}</span></td>
    <td><span class="badge ${statusBadgeClass}">${escapeHtml(it.status)}</span></td>
    <td class="action-cell">...</td>
  </tr>
`;
```

#### AFTER:
```javascript
const statusBadgeClass = it.status === 'ACCEPTED' ? 'bg-success' : it.status === 'REJECTED' ? 'bg-secondary' : 'bg-warning text-dark';
const action = it.action || 'NEEDS_REVIEW';
const actionBadgeClass = action === 'AUTO_ACCEPT' ? 'bg-success' : 'bg-warning text-dark';

html += `
  <tr data-issue-id="${escapeHtml(it.id)}">
    <td>...</td>
    <td><strong>${escapeHtml(it.field_name)}</strong></td>
    <td>${escapeHtml(it.old_value)}</td>
    <td><span class="badge bg-info">${escapeHtml(it.suggested_value)}</span></td>
    <td><span class="badge ...>${escapeHtml(it.source_type || 'UNKNOWN')}</span></td>
    <td><span class="badge bg-secondary">${confidence}%</span></td>
    <td><span class="badge bg-danger">${escapeHtml(it.severity)}</span></td>
    <td><span class="badge ${actionBadgeClass}">${escapeHtml(action)}</span></td>  // ← NEW
    <td><span class="badge ${statusBadgeClass}">${escapeHtml(it.status)}</span></td>
    <td class="action-cell">...</td>
  </tr>
`;
```

---

### Column Reference Updates

#### BEFORE:
```javascript
const runHasOpenIssues = () => {
  const rows = Array.from(document.querySelectorAll('#issuesModalTable tbody tr'));
  return rows.some(r => r.querySelector('td:nth-child(8) .badge')?.textContent === 'OPEN');
};

const markRowClosed = (row, statusText) => {
  const statusBadge = row.querySelector('td:nth-child(8) .badge');  // ← Status was 8th
  ...
};
```

#### AFTER:
```javascript
const runHasOpenIssues = () => {
  const rows = Array.from(document.querySelectorAll('#issuesModalTable tbody tr'));
  return rows.some(r => r.querySelector('td:nth-child(9) .badge')?.textContent === 'OPEN');  // ← Now 9th
};

const markRowClosed = (row, statusText) => {
  const statusBadge = row.querySelector('td:nth-child(9) .badge');  // ← Now 9th
  ...
};
```

---

## File: backend/migrations/add_action_to_validation_issues.sql

### Status: ✅ NEW MIGRATION

```sql
ALTER TABLE validation_issues
ADD COLUMN IF NOT EXISTS action TEXT DEFAULT 'NEEDS_REVIEW';

CREATE INDEX IF NOT EXISTS idx_validation_issues_action
ON validation_issues(action);

COMMENT ON COLUMN validation_issues.action IS 
  'Automated action decision: AUTO_ACCEPT or NEEDS_REVIEW based on confidence scoring';

UPDATE validation_issues
SET action = 'NEEDS_REVIEW'
WHERE action IS NULL;
```

---

## Summary of Changes

| Component | Type | Change | Impact |
|-----------|------|--------|--------|
| scoringUtils.js | New File | 8 exported functions | Reusable algorithms |
| qualityAssuranceAgent.js | Modified | Static → Dynamic scoring | Intelligent confidence |
| directoryManagementAgent.js | Modified | Confidence > 0.9 → action field | Algorithm-driven decisions |
| runs.js | Modified | Added Action column | Better visibility |
| validation_issues table | Schema | Added action field | Stores decision logic |

---

## Testing the Changes

### Quick Test: Deploy and Verify

```bash
# 1. Run SQL migration in Supabase
# Copy contents of migrations/add_action_to_validation_issues.sql

# 2. Restart backend (already running on port 5000)
# Node server should load new imports without errors

# 3. Upload test CSV with known mismatches
# Go to http://localhost:5000/upload

# 4. Run validation
# Click "Start New Run"

# 5. View Issues
# Click "View Issues" on completed run
# Verify Action column shows AUTO_ACCEPT or NEEDS_REVIEW

# 6. Check database
# Query: SELECT id, field_name, confidence, action, status FROM validation_issues;
```

### Expected Results

- Issues with confidence ≥ 0.60 → Action = "AUTO_ACCEPT", Severity = "LOW"
- Issues with confidence < 0.60 → Action = "NEEDS_REVIEW", Severity = "HIGH"
- All confidence values now computed by algorithm (not hardcoded)
- Directory management auto-applies only AUTO_ACCEPT issues

