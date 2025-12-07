# Quick Reference: Scoring Algorithm Functions

## Import All Functions
```javascript
import {
  cosineSimilarity,
  jaroWinkler,
  levenshteinScore,
  addressSimilarity,
  sourceWeightedVote,
  finalScore,
  determineAction,
  determineSeverity
} from '../utils/scoringUtils.js';
```

---

## Function Signatures

### Text Similarity Algorithms

```javascript
// String tokenization + TF vectors
cosineSimilarity(textA: string, textB: string) → number [0-1]

// Edit distance with prefix bonus
jaroWinkler(a: string, b: string) → number [0-1]

// Normalized Levenshtein distance
levenshteinScore(a: string, b: string) → number [0-1]
```

### Address Matching

```javascript
// Weighted combination of three algorithms
addressSimilarity(addrA: string, addrB: string) → number [0-1]
// = 0.5 * cosineSimilarity(a,b)
//   + 0.3 * jaroWinkler(a,b)
//   + 0.2 * levenshteinScore(a,b)
```

### Source Credibility

```javascript
// Weighted vote of source reliability
sourceWeightedVote({
  npi: boolean,      // 0.95 weight
  azure: boolean,    // 0.85 weight
  scrape: boolean,   // 0.70 weight
  pdf: boolean       // 0.60 weight
}) → number [0-1]
```

### Final Scoring

```javascript
// Combined model
finalScore({
  sourceScore: number,      // [0-1]
  addressScore: number,     // [0-1]
  phoneScore: number        // [0-1]
}) → number [0-1]
// = 0.5 * sourceScore
//   + 0.3 * addressScore
//   + 0.2 * phoneScore
```

### Decision Making

```javascript
// Threshold-based action
determineAction(confidence: number, threshold = 0.60) → string
// Returns: "AUTO_ACCEPT" or "NEEDS_REVIEW"

// Inverse severity scoring
determineSeverity(confidence: number, threshold = 0.60) → string
// Returns: "LOW" or "HIGH"
```

---

## Example Usage

### Scenario: Phone Mismatch Between Provider & NPI

```javascript
const provider = { 
  phone: '301-555-0123',
  address_line1: '123 Main St, Anytown, NY 12345'
};

const npiData = { 
  phone: '301-555-0124',  // ← Different!
  address: '123 Main Street, Anytown, NY 12345'  // ← Minor diff
};

// Step 1: Calculate source credibility
const srcScore = sourceWeightedVote({
  npi: true,    // NPI found a match
  azure: false,
  scrape: false,
  pdf: false
});
// → 0.95 (NPI is 0.95 out of total weight)

// Step 2: Calculate address similarity
const addrScore = addressSimilarity(
  provider.address_line1,
  npiData.address
);
// → 0.98 (very similar, just "St" vs "Street")

// Step 3: Determine if phones match
const phoneScore = 0;  // Different phone numbers

// Step 4: Compute final confidence
const confidence = finalScore({
  sourceScore: srcScore,      // 0.95
  addressScore: addrScore,    // 0.98
  phoneScore: phoneScore      // 0.00
});
// finalScore = 0.5(0.95) + 0.3(0.98) + 0.2(0.00) = 0.769

// Step 5: Determine action
const action = determineAction(confidence);
// → "AUTO_ACCEPT" (0.769 >= 0.60)

const severity = determineSeverity(confidence);
// → "LOW" (0.769 >= 0.60)

// Insert into validation_issues
const issue = {
  provider_id: provider.id,
  field_name: 'phone',
  old_value: '301-555-0123',
  suggested_value: '301-555-0124',
  confidence: 0.769,        // ← From algorithm
  action: 'AUTO_ACCEPT',    // ← Threshold-based
  severity: 'LOW',
  source_type: 'NPI_API'
};
```

---

## Common Patterns

### Phone Match Detection
```javascript
function normalizePhone(phone) {
  return String(phone).replace(/\D/g, '');
}

const phoneMatch = normalizePhone(providerPhone) === 
                   normalizePhone(suggestedPhone);
const phoneScore = phoneMatch ? 1.0 : 0.0;
```

### Address Comparison
```javascript
const addrScore = addressSimilarity(
  provider.address_line1,
  suggestedAddress
);
```

### Multi-Source Voting
```javascript
const sources = {
  npi: npiFound && npiMatches,
  azure: azureFound && azureMatches,
  scrape: scrapedData && scrapedMatches,
  pdf: pdfExtracted && pdfMatches
};

const srcScore = sourceWeightedVote(sources);
```

### Conservative Threshold
```javascript
// For critical fields (license, NPI), use higher threshold
const action = determineAction(confidence, 0.80);
// Only AUTO_ACCEPT if confidence >= 0.80
```

---

## Database Schema

### validation_issues Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| provider_id | UUID | Foreign key to providers |
| run_id | UUID | Foreign key to validation_runs |
| field_name | TEXT | Field being validated |
| old_value | TEXT | Current provider value |
| suggested_value | TEXT | Suggested correction |
| confidence | FLOAT | 0–1 score from algorithm |
| severity | TEXT | 'HIGH' or 'LOW' |
| action | TEXT | 'AUTO_ACCEPT' or 'NEEDS_REVIEW' ← NEW |
| source_type | TEXT | NPI_API, AZURE_*, SCRAPING_*, PDF_OCR |
| status | TEXT | 'OPEN', 'ACCEPTED', 'REJECTED' |
| created_at | TIMESTAMP | When issue was created |

---

## Threshold Tuning Guide

### Default (0.60)
- Balanced automation / review ratio
- ~70-80% AUTO_ACCEPT for good data
- ~20-30% NEEDS_REVIEW for edge cases

### Aggressive (0.50)
- More automation, higher error rate risk
- Suitable for internal-only data
- Use for data with known quality issues

### Conservative (0.75)
- More manual review, lower risk
- Suitable for public-facing directories
- Use for regulated/compliance-sensitive fields

### Per-Field Examples

```javascript
// License number: must be precise
const licenseAction = determineAction(confidence, 0.90);

// Phone: can be fuzzy matched
const phoneAction = determineAction(confidence, 0.60);

// Address: needs similarity algorithms
const addressAction = determineAction(confidence, 0.70);

// Website: low priority
const websiteAction = determineAction(confidence, 0.40);
```

---

## Error Handling

All functions handle edge cases safely:

```javascript
// Null/undefined inputs
cosineSimilarity(null, "text")      // → 0
addressSimilarity(undefined, "")    // → 0
sourceWeightedVote(null)            // → 0
finalScore({})                      // → 0

// Type coercion
jaroWinkler(123, 456)              // Converts to strings
levenshteinScore({}, [])           // Converts to strings

// Out-of-range clamping
finalScore({
  sourceScore: 1.5,     // > 1
  addressScore: -0.3,   // < 0
  phoneScore: 0.5
})
// → Clamps to [0, 1] → 0.5(1.0) + 0.3(0.0) + 0.2(0.5) = 0.6
```

---

## Performance Tips

✅ **Do**
- Cache provider_sources data (reuse in loop)
- Batch issue inserts
- Index on (action, status) for filtering
- Use weighted voting for multiple sources

❌ **Don't**
- Call addressSimilarity for every character
- Compute sourceScore without checking if source exists
- Skip null checks on user-provided data
- Hardcode thresholds (make configurable)

---

## Debugging

### Log Confidence Breakdown
```javascript
const scores = { sourceScore: 0.95, addressScore: 0.98, phoneScore: 0 };
const final = finalScore(scores);

console.log('Source: 0.95 × 0.5 = 0.475');
console.log('Address: 0.98 × 0.3 = 0.294');
console.log('Phone: 0.00 × 0.2 = 0.000');
console.log('Total: 0.769');
```

### Test Similarity Functions
```javascript
// Test cosine similarity
console.log(cosineSimilarity('hello world', 'hello world'));  // → 1.0
console.log(cosineSimilarity('hello', 'goodbye'));           // → 0.0
console.log(cosineSimilarity('hello', 'helo'));             // → ~0.5

// Test Jaro-Winkler
console.log(jaroWinkler('WILLIAMSON', 'WILKINSON'));        // → 0.89
console.log(jaroWinkler('hello', 'hello'));                 // → 1.0
```

---

## Migration Steps

When deploying to production:

1. **Run SQL migration** (add `action` column)
   ```
   backend/migrations/add_action_to_validation_issues.sql
   ```

2. **Deploy updated agents**
   - qualityAssuranceAgent.js
   - directoryManagementAgent.js

3. **Redeploy frontend** (show action column)
   - public/js/runs.js

4. **Run test validation**
   - Small batch of providers
   - Verify AUTO_ACCEPT vs NEEDS_REVIEW split
   - Spot-check a few issues

5. **Monitor thresholds**
   - Track acceptance rate
   - Watch for false positives
   - Adjust threshold if needed

---

## Support & Questions

**Q: Why 0.60 as default threshold?**  
A: Balances automation (~75%) and safety. Adjust for your risk tolerance.

**Q: Can I use different thresholds per field?**  
A: Yes! Call `determineAction(confidence, customThreshold)` per field.

**Q: How do I improve address matching?**  
A: Add more data normalization (remove punctuation, handle abbreviations).

**Q: What if a source is always wrong?**  
A: Reduce its weight in `sourceWeightedVote()` or skip it entirely.

