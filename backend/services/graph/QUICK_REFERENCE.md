# LangGraph Workflow - Quick Reference Guide

## File Locations

```
services/graph/
├── state.js                      # State definition & initialization
├── dataValidationNode.js         # Agent 1: Data Validation
├── informationEnrichmentNode.js  # Agent 2: Information Enrichment
├── qualityAssuranceNode.js       # Agent 3: Quality Assurance
├── directoryManagementNode.js    # Agent 4: Directory Management
├── workflow.js                   # LangGraph orchestration
├── examples.js                   # Usage examples (5 scenarios)
├── integration.js                # Backend integration (5 points)
├── package.json                  # Dependencies
├── README.md                     # Complete documentation
├── IMPLEMENTATION_SUMMARY.md     # Summary of generated code
├── ARCHITECTURE_DIAGRAMS.md      # Visual diagrams
└── QUICK_REFERENCE.md            # This file
```

## Core Imports

```javascript
// Execute workflow (blocking)
import { executeValidationWorkflow } from "./workflow.js";

// Stream workflow (real-time callbacks)
import { streamValidationWorkflow } from "./workflow.js";

// Create workflow graph (advanced)
import { createValidationWorkflow } from "./workflow.js";

// Individual agents (direct execution)
import { dataValidationNode } from "./dataValidationNode.js";
import { informationEnrichmentNode } from "./informationEnrichmentNode.js";
import { qualityAssuranceNode } from "./qualityAssuranceNode.js";
import { directoryManagementNode } from "./directoryManagementNode.js";

// State helpers
import { initializeState } from "./state.js";
```

## Function Signatures

### executeValidationWorkflow()

```javascript
await executeValidationWorkflow(providerData, options)
```

**Parameters:**
- `providerData` (object):
  - `name` (string): Provider name
  - `npi` (string): National Provider Identifier
  - `address` (string): Full address
  - `phone` (string): Phone number
  - `website` (string): Website URL
  - `specialty` (string): Medical specialty
  - `state` (string): State abbreviation (e.g., 'NY')

- `options` (object, optional):
  - `providerId` (string): Custom provider ID (default: auto-generated)
  - `verbose` (boolean): Enable detailed logging (default: false)
  - `timeout` (number): Execution timeout in ms (default: 60000)

**Returns:**
```javascript
{
  success: boolean,
  state: {...},        // Final workflow state
  executionTime: number,
  stepsExecuted: number,
  error?: string,      // If success=false
  stack?: string       // If success=false
}
```

### streamValidationWorkflow()

```javascript
await streamValidationWorkflow(providerData, onStep, options)
```

**Parameters:**
- `providerData` (object): Same as above
- `onStep` (function): Callback for each step:
  ```javascript
  (stepInfo) => {
    stepInfo.nodeName,   // 'data_validation', etc.
    stepInfo.state,      // Updated state at that step
    stepInfo.timestamp   // ISO timestamp
  }
  ```
- `options` (object, optional): Same as above

**Usage Example:**
```javascript
await streamValidationWorkflow(providerData, (step) => {
  console.log(`[${step.timestamp}] ${step.nodeName}`);
});
```

## Decision Tree

```
                   Provider Data
                        ↓
                Data Validation
                        ↓
                 Find Discrepancies?
                    ↙          ↘
                 Yes            No
                  ↓              ↓
             Continue       Continue
                  ↓              ↓
           Information Enrichment
                        ↓
                Quality Assurance
                        ↓
              Confidence ≥ 0.85
              + No Anomalies
                ↙          ↘
              YES           NO
                ↓            ↓
            PUBLISH     QUEUE REVIEW
                ↓            ↓
         [Auto-publish]  [Human Review]
                ↓            ↓
            Directory Management
                ↓
            WORKFLOW END
```

## State Access Patterns

### Read Provider Input
```javascript
state.inputData.name
state.inputData.npi
state.inputData.address
```

### Read Validation Results
```javascript
state.validatedFields      // Array of verified fields
state.validationDiscrepancies  // Array of mismatches
state.validationSources    // Array of sources used
state.npiLookupResult      // Raw NPI data
```

### Read Enrichment Results
```javascript
state.enrichedProviderProfile.services
state.enrichedProviderProfile.telemedicineAvailable
state.geoCoordinates       // { latitude, longitude, confidence }
state.poiMetadata          // POI details from Azure Maps
state.educationDetails     // { medicalSchool, boardCertifications }
```

### Read QA Results
```javascript
state.fieldConfidenceScores    // { npi: 0.95, phone: 0.85, ... }
state.overallConfidenceScore   // 87.5
state.needsHumanReview         // true/false
state.reviewSeverity           // 'LOW', 'MEDIUM', 'HIGH'
state.anomalyDetection         // { isDetected, patterns, fraudRisk }
```

### Read Directory Results
```javascript
state.directoryStatus          // 'PUBLISHED' or 'NEEDS_REVIEW'
state.webDirectoryEntry        // Full directory profile (if published)
state.mobileAppFeed            // Mobile-optimized entry (if published)
state.reviewerTasks            // Array of tasks (if needs review)
state.alerts                   // Array of alerts (if urgent)
state.validationReports        // Array of reports (always)
```

## Common Patterns

### Pattern 1: Basic Validation
```javascript
const result = await executeValidationWorkflow({
  name: "Dr. Jane Smith",
  npi: "1234567890",
  address: "123 Main St, Boston, MA 02101",
  phone: "+1-617-555-0100",
  website: "https://example.com",
  specialty: "Cardiology",
  state: "MA"
});

if (result.success) {
  console.log(`Status: ${result.state.directoryStatus}`);
  console.log(`Confidence: ${result.state.overallConfidenceScore}%`);
}
```

### Pattern 2: Real-Time Monitoring
```javascript
await streamValidationWorkflow(providerData, (step) => {
  // Update UI with real-time progress
  updateProgressBar(step.nodeName);
  logStep(step.timestamp, step.nodeName);
});
```

### Pattern 3: Batch Processing with Summary
```javascript
const results = [];
for (const provider of providers) {
  const result = await executeValidationWorkflow(provider);
  results.push({
    name: provider.name,
    status: result.state.directoryStatus,
    confidence: result.state.overallConfidenceScore
  });
}

const published = results.filter(r => r.status === 'PUBLISHED').length;
const review = results.filter(r => r.status === 'NEEDS_REVIEW').length;
console.log(`Published: ${published}, Review: ${review}`);
```

### Pattern 4: Error Handling
```javascript
const result = await executeValidationWorkflow(providerData);

if (!result.success) {
  console.error("Workflow failed:", result.error);
  console.error("Stack:", result.stack);
} else if (result.state.errorLog.length > 0) {
  console.warn("Workflow completed with errors:");
  result.state.errorLog.forEach(err => {
    console.warn(`  [${err.stage}] ${err.error}`);
  });
}
```

### Pattern 5: Conditional Logic
```javascript
const result = await executeValidationWorkflow(providerData);
const state = result.state;

if (state.directoryStatus === 'PUBLISHED') {
  // Provider auto-published
  console.log(state.webDirectoryEntry);
} else if (state.reviewSeverity === 'HIGH') {
  // Urgent review needed
  escalateToManager(state.reviewerTasks[0]);
} else {
  // Standard review
  assignToQueue(state.reviewerTasks[0]);
}
```

## Confidence Score Interpretation

| Score | Status | Action |
|-------|--------|--------|
| 90-100% | Excellent | Auto-publish, no review |
| 75-89% | Good | Publish, optional review |
| 60-74% | Fair | Queue for review, LOW priority |
| 40-59% | Poor | Queue for review, MEDIUM priority |
| 0-39% | Critical | Queue for review, HIGH priority |

## Severity Levels

| Level | Meaning | Response Time |
|-------|---------|----------------|
| LOW | Data refinement needed | 7 days |
| MEDIUM | Potential inconsistencies | 3 days |
| HIGH | Fraud/critical issues | 24 hours |

## Testing Each Agent

### Test Data Validation Only
```javascript
import { dataValidationNode } from "./dataValidationNode.js";
import { initializeState } from "./state.js";

const state = initializeState("test_123", {
  name: "Dr. Test", 
  npi: "1111111111",
  // ... other fields
});

const result = await dataValidationNode(state);
console.log("Validated fields:", result.validatedFields);
console.log("Discrepancies:", result.validationDiscrepancies);
```

### Test Full Workflow
```javascript
const result = await executeValidationWorkflow({
  name: "Dr. Test",
  npi: "1111111111",
  // ... other fields
}, { verbose: true });
```

### Debug Intermediate State
```javascript
let currentState = null;
await streamValidationWorkflow(providerData, (step) => {
  currentState = step.state;
  if (step.nodeName === 'quality_assurance') {
    console.log("QA Results:", {
      confidence: currentState.overallConfidenceScore,
      needsReview: currentState.needsHumanReview,
      severity: currentState.reviewSeverity
    });
  }
});
```

## Performance Tips

1. **Batch Processing**: Process multiple providers sequentially (not parallel)
   ```javascript
   // Good: Sequential with await
   for (const provider of providers) {
     const result = await executeValidationWorkflow(provider);
   }
   
   // Bad: Parallel requests overload APIs
   // await Promise.all(providers.map(...))
   ```

2. **Timeout Configuration**: Set longer timeouts for slow networks
   ```javascript
   await executeValidationWorkflow(data, {
     timeout: 120000  // 2 minutes instead of 1
   });
   ```

3. **Caching**: Cache NPI lookups
   ```javascript
   // Consider implementing in npiClient.js
   const npiCache = new Map();
   if (npiCache.has(npi)) {
     return npiCache.get(npi);
   }
   ```

## Common Issues & Solutions

### Issue: "High timeout" but provider validates quickly
**Solution**: Adjust confidence thresholds in qualityAssuranceNode.js (line 220+)

### Issue: All providers marked "Needs Review"
**Solution**: 
- Lower confidence thresholds
- Check external API connectivity
- Verify test data quality

### Issue: Empty enriched data
**Solution**:
- Verify Azure Maps API key
- Check website scraping configuration
- Review mock data setup

### Issue: Anomalies always detected
**Solution**:
- Review anomaly patterns in qualityAssuranceNode.js (line 178+)
- Adjust detection thresholds
- Check edge cases in test data

## Extending the Workflow

### Add a New Field to State

1. Edit `state.js`:
   ```javascript
   export const StateAnnotation = {
     // ... existing fields
     newFieldName: {
       value: (x, y) => y ?? x,
       default: () => null  // or []
     }
   };
   ```

2. Update in agents where needed:
   ```javascript
   return {
     ...state,
     newFieldName: computedValue
   };
   ```

### Add a New Agent

1. Create `newAgentNode.js`
2. Add to graph in `workflow.js`:
   ```javascript
   graph.addNode("new_agent", newAgentNode);
   graph.addEdge("previous_agent", "new_agent");
   ```

### Change Decision Rules

Edit `qualityAssuranceNode.js`, `determineReviewNeed()` function (line 220+)

## Monitoring & Logging

Each agent logs:
```javascript
console.log(`[AgentName] Processing...`);
console.log(`[AgentName] Completed successfully`);
console.error(`[AgentName] Error: ...`);
```

Track execution:
```javascript
const result = await executeValidationWorkflow(data);
console.log(`Workflow ID: ${result.state.workflowId}`);
console.log(`Duration: ${result.executionTime}ms`);
console.log(`Steps: ${result.stepsExecuted}`);
```

## API Integration Points

### NPI Registry
- File: `services/tools/npiClient.js`
- Method: `lookupNPI(npi)`
- Returns: Provider details from NPI registry

### Azure Maps
- File: `services/tools/mapsClient.js`
- Method: `searchPOI(query, options)`
- Returns: POI results with coordinates

### Web Scraping
- File: `services/tools/webScraper.js`
- Method: `scrapeProviderWebsite(url)`
- Returns: Website content (services, contact, etc.)

### Phone Verification
- File: `services/tools/phoneUtils.js`
- Methods: `normalizePhone()`, `validatePhoneFormat()`

### Address Validation
- File: `services/tools/addressUtils.js`
- Methods: `validateAddressFormat()`, `validateState()`

## Database Integration

Entities to persist:
- `validation_runs` - Workflow executions
- `directory_entries` - Published providers
- `review_tasks` - Human review queue
- `validation_reports` - Audit trail
- `upload_validations` - File upload tracking

See `integration.js` for SQL schema.

## Version Compatibility

- **Node.js**: ≥18.0.0 (ES modules)
- **LangChain**: ^0.2.0
- **Express**: ^4.18.0
- **Supabase**: ^2.38.0

---

Last Updated: 2026-02-04
