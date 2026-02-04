# LangGraph Provider Validation Workflow

A production-ready, agentic provider data validation system built with LangGraph and Node.js for healthcare provider directories.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      INPUT: Provider Data                        │
│    (Name, NPI, Address, Phone, Website, Specialty, State)       │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────────┐
        │ Data Validation Agent           │ (Verify existing data)
        │ - NPI Registry lookup           │
        │ - State licensing verification │
        │ - Website scraping              │
        │ - Phone verification            │
        │ - Address validation            │
        └─────────────┬───────────────────┘
                      │ (validatedFields, discrepancies, sources)
                      ▼
        ┌─────────────────────────────────┐
        │ Information Enrichment Agent    │ (Add new reliable info)
        │ - Azure Maps POI search         │
        │ - Website content extraction   │
        │ - Education/certifications     │
        │ - Geographic analysis          │
        └─────────────┬───────────────────┘
                      │ (enrichedProfile, geoCoordinates, educationDetails)
                      ▼
        ┌─────────────────────────────────┐
        │ Quality Assurance Agent         │ (Evaluate trustworthiness)
        │ - Confidence scoring            │
        │ - Cross-source comparison       │
        │ - Anomaly detection             │
        │ - Review decision               │
        └─────────────┬───────────────────┘
                      │ (confidenceScores, needsReview decision)
                      ▼
            ┌─────────────┴─────────────┐
            │                           │
       No Review                 Needs Review
            │                           │
            ▼                           ▼
     ┌────────────────┐        ┌────────────────┐
     │ Auto-Publish   │        │ Queue for      │
     │ to Directory   │        │ Human Review   │
     └────────────────┘        └────────────────┘
            │                           │
            └─────────────┬─────────────┘
                      │
                      ▼
        ┌─────────────────────────────────┐
        │ Directory Management Agent      │ (Execute actions)
        │ - Generate directory entries    │
        │ - Create mobile app feeds       │
        │ - Generate compliance reports   │
        │ - Create review tasks/alerts    │
        └─────────────┬───────────────────┘
                      │
                      ▼
        ┌─────────────────────────────────┐
        │ OUTPUT: Workflow State          │
        │ - directoryStatus               │
        │ - publishedEntries              │
        │ - reviewTasks                   │
        │ - validationReports             │
        │ - alerts                        │
        └─────────────────────────────────┘
```

## Key Design Principles

### 1. **Strict Agent Isolation**
- Each agent is a self-contained node
- Business logic lives entirely within agents
- No computation in LangGraph routing

### 2. **Shared State Management**
- All agents read from and mutate the same state
- State changes are deterministic and auditable
- No side effects outside state updates

### 3. **Conditional Routing (Single Branch Point)**
- Only one conditional edge: after Quality Assurance Agent
- Routing decision: `needsHumanReview` boolean
- Both paths converge at Directory Management Agent

### 4. **No Responsibility Duplication**
- Data Validation: verify existing data only
- Information Enrichment: add new data only
- Quality Assurance: evaluate, don't fetch
- Directory Management: execute, don't decide

## File Structure

```
services/graph/
├── state.js                        # Shared state definition
├── dataValidationNode.js           # Agent 1: Data Validation
├── informationEnrichmentNode.js    # Agent 2: Information Enrichment
├── qualityAssuranceNode.js         # Agent 3: Quality Assurance
├── directoryManagementNode.js      # Agent 4: Directory Management
├── workflow.js                     # LangGraph workflow orchestration
└── examples.js                     # Usage examples and tests
```

## Agent Responsibilities

### Data Validation Agent
**Purpose**: Verify correctness of provided provider data

**Tools Used**:
- NPI Registry API (`npiClient`)
- State Licensing Boards (placeholder)
- Provider Website Scraping (`webScraper`)
- Phone Verification Services (`phoneUtils`)
- Address Validation (`addressUtils`)

**Outputs**:
- `validatedFields[]` - List of verified fields with confidence scores
- `validationDiscrepancies[]` - Field-level mismatches
- `validationSources[]` - Source attribution per field
- `npiLookupResult` - Raw NPI registry data
- `licensingBoardResult` - License verification data
- `websiteScrapingResult` - Website contact details
- `phoneVerificationResult` - Normalized phone data

**Example Discrepancy**:
```json
{
  "field": "phone",
  "inputValue": "(212) 555-0100",
  "scrapedValue": "+1-212-555-0199",
  "severity": "MEDIUM"
}
```

---

### Information Enrichment Agent
**Purpose**: Add new reliable provider information (NO revalidation)

**Tools Used**:
- Azure Maps POI Search (`mapsClient`)
- Website Content Scraping (`webScraper`)
- Education/Certification Databases (placeholder)

**Outputs**:
- `enrichedProviderProfile` - Services, telemedicine, languages
- `geoCoordinates` - Latitude/longitude with confidence
- `poiMetadata` - Business details from POI
- `educationDetails` - Medical school, residency, certifications
- `geoSpecialtyAnalysis` - Coverage areas and practice type

**Example POI Result**:
```json
{
  "businessName": "Sarah Johnson MD",
  "formattedAddress": "456 Medical Plaza Drive, New York, NY 10001",
  "phone": "+1-212-555-0100",
  "ratingScore": 4.8,
  "reviewCount": 127,
  "geoCoordinates": {
    "latitude": 40.7128,
    "longitude": -74.0060
  }
}
```

---

### Quality Assurance Agent
**Purpose**: Decide trustworthiness and human review priority

**Logic**:
1. Compute field-level confidence scores (0-1)
2. Perform cross-source comparison
3. Detect anomalies and fraud patterns
4. Calculate overall confidence score
5. Apply decision rules to determine if review needed

**Decision Rules**:
- **Rule 1**: `overallScore < 0.7` → needs review
- **Rule 2**: Anomalies detected → needs review
- **Rule 3**: Multiple inconsistencies → needs review
- **Rule 4**: `0.7 ≤ overallScore < 0.85` → needs review
- **Auto-approve**: `overallScore ≥ 0.85 && !anomalies`

**Outputs**:
- `fieldConfidenceScores{}` - Per-field confidence (0-100%)
- `overallConfidenceScore` - Weighted average (0-100%)
- `needsHumanReview` - Boolean decision
- `reviewSeverity` - 'LOW' | 'MEDIUM' | 'HIGH'
- `priorityScore` - Numeric priority (0-100+)
- `anomalyDetection` - Detected patterns and fraud risk
- `crossSourceComparison` - Inconsistencies between sources

**Example Anomaly**:
```json
{
  "type": "EXPIRED_CERTIFICATION",
  "certifications": [
    {
      "specialty": "Cardiology",
      "expirationDate": "2020-12-01",
      "isActive": false
    }
  ],
  "severity": "HIGH"
}
```

---

### Directory Management Agent
**Purpose**: Execute system actions based strictly on QA decision

**Routing Decision**:
- **If `needsHumanReview = false`**: Auto-publish to directory
- **If `needsHumanReview = true`**: Queue for human review

**Auto-Publish Path**:
1. Generate web directory entry
2. Generate mobile app feed
3. Generate compliance report
4. Store in database

**Human Review Path**:
1. Create reviewer task with suggested actions
2. Generate alerts for urgent issues
3. Generate compliance report
4. Queue in review system

**Outputs**:
- `directoryStatus` - 'PUBLISHED' | 'NEEDS_REVIEW' | 'FAILED'
- `webDirectoryEntry` - Full directory profile
- `mobileAppFeed` - Mobile-optimized entry
- `validationReports[]` - Compliance reports
- `reviewerTasks[]` - Review queue items (if needed)
- `alerts[]` - Notifications (if needed)

## Usage

### Basic Execution

```javascript
import { executeValidationWorkflow } from "./services/graph/workflow.js";

const result = await executeValidationWorkflow({
  name: "Dr. Sarah Johnson",
  npi: "1234567890",
  address: "456 Medical Plaza Drive, New York, NY 10001",
  phone: "+1-212-555-0100",
  website: "https://www.drsarahjohnson.com",
  specialty: "Cardiology",
  state: "NY",
}, {
  providerId: "provider_001",
  verbose: true
});

if (result.success) {
  console.log("Status:", result.state.directoryStatus);
  console.log("Confidence:", result.state.overallConfidenceScore + "%");
  console.log("Needs Review:", result.state.needsHumanReview);
}
```

### Streaming Execution

```javascript
import { streamValidationWorkflow } from "./services/graph/workflow.js";

await streamValidationWorkflow(
  providerData,
  (stepInfo) => {
    console.log(`[${stepInfo.timestamp}] ${stepInfo.nodeName}`);
    // Process step data in real-time
  },
  { providerId: "provider_002" }
);
```

### Batch Processing

```javascript
const providers = [/* ... */];
const results = [];

for (const provider of providers) {
  const result = await executeValidationWorkflow(provider);
  results.push({
    providerId: provider.npi,
    status: result.state.directoryStatus,
    confidence: result.state.overallConfidenceScore
  });
}
```

## State Structure

```typescript
{
  // Input Data
  providerId: string,
  inputData: {
    name: string,
    npi: string,
    address: string,
    phone: string,
    website: string,
    specialty: string,
    state: string
  },

  // Data Validation Agent outputs
  validatedFields: Array<{
    field: string,
    value: any,
    verified: boolean,
    confidence: number,
    source: string
  }>,
  validationDiscrepancies: Array<{
    field: string,
    inputValue: any,
    scrapedValue: any,
    severity: string
  }>,
  validationSources: Array<{
    source: string,
    fieldsValidated: string[],
    timestamp: string
  }>,
  npiLookupResult: Object | null,
  licensingBoardResult: Object | null,
  websiteScrapingResult: Object | null,
  phoneVerificationResult: Object | null,

  // Information Enrichment Agent outputs
  enrichedProviderProfile: {
    services: string[],
    telemedicineAvailable: boolean,
    languagesSpoken: string[],
    additionalSpecialties: string[]
  },
  geoCoordinates: {
    latitude: number,
    longitude: number,
    confidence: number
  },
  poiMetadata: Object,
  educationDetails: {
    medicalSchool: string,
    residency: string,
    boardCertifications: Array
  },
  geoSpecialtyAnalysis: {
    coverageAreas: string[],
    practiceType: string
  },

  // Quality Assurance Agent outputs
  fieldConfidenceScores: Object,
  overallConfidenceScore: number,
  needsHumanReview: boolean,
  reviewSeverity: string,
  priorityScore: number,
  anomalyDetection: Object,
  crossSourceComparison: Object,

  // Directory Management Agent outputs
  directoryStatus: string,
  alerts: Array,
  reviewerTasks: Array,
  validationReports: Array,
  webDirectoryEntry: Object,
  mobileAppFeed: Object,
  complianceReportUri: string,

  // Workflow metadata
  workflowId: string,
  startTime: Date,
  endTime: Date,
  workflowStatus: string,
  errorLog: Array
}
```

## Configuration

### Environment Variables

```bash
# NPI Registry
NPI_API_KEY=your_npi_api_key
NPI_BASE_URL=https://api.npi.io/v1/providers

# Azure Maps
AZURE_MAPS_KEY=your_azure_maps_key
AZURE_MAPS_ENDPOINT=https://atlas.microsoft.com

# State Licensing Board APIs
STATE_BOARD_API_KEYS={}

# Workflow Configuration
WORKFLOW_TIMEOUT=60000  # milliseconds
WORKFLOW_MAX_RETRIES=3
WORKFLOW_VERBOSE=false
```

### Tuning Confidence Thresholds

In `qualityAssuranceNode.js`, adjust these thresholds:

```javascript
// Lines ~220-240 in qualityAssuranceNode.js
const needsReview = {
  decision: false,
  reasons: [],
  severity: "LOW",
  priorityScore: 0,
};

// Rule 1: Adjust confidence threshold
if (overallScore < 0.7) {  // Change 0.7 to desired threshold
  needsReview.decision = true;
}

// Rule 4: Adjust auto-approve threshold
if (overallScore >= 0.85 && !anomalies.isDetected) {  // Change 0.85
  needsReview.decision = false;
}
```

## Error Handling

Each agent implements try-catch with error logging:

```javascript
catch (error) {
  console.error("[AgentName] Error:", error.message);
  return {
    ...state,
    errorLog: [
      ...state.errorLog,
      {
        stage: "AgentName",
        error: error.message,
        timestamp: new Date().toISOString()
      }
    ]
  };
}
```

Workflow never throws; errors are captured in `state.errorLog`.

## Performance Considerations

1. **Parallel Execution**: Agents run sequentially by design, but internal operations use Promise.all()
2. **Caching**: Consider caching NPI lookups and certification data
3. **Timeouts**: Set workflow timeout in options
4. **Database**: Persist state snapshots for audit trail
5. **Monitoring**: Log all transitions for debugging

## Testing

Run examples:

```javascript
import { runAllExamples } from "./services/graph/examples.js";
await runAllExamples();
```

Individual example functions:
- `exampleBasicExecution()` - Basic workflow
- `exampleStreamingExecution()` - Real-time callbacks
- `exampleIntermediateResults()` - Per-agent outputs
- `exampleBatchProcessing()` - Multiple providers
- `exampleErrorHandling()` - Incomplete data

## Production Deployment

1. **Database Integration**: Replace placeholder logic with actual database operations
2. **External APIs**: Configure all API keys and endpoints
3. **Monitoring**: Add logging, tracing, and metrics
4. **Error Recovery**: Implement retry logic and dead letter queues
5. **Security**: Validate all inputs, sanitize outputs
6. **Compliance**: Ensure HIPAA/GDPR compliance for healthcare data

## Extending the Workflow

To add a new agent:

1. Create `newAgentNode.js` in `services/graph/`
2. Implement async function: `export async function newAgentNode(state)`
3. Add to state definition in `state.js`
4. Add node to graph: `graph.addNode("new_agent", newAgentNode)`
5. Add edges: `graph.addEdge("previous_agent", "new_agent")`
6. Update agent order if necessary (maintain strict order)

## Troubleshooting

**Issue**: Provider published with low confidence
- Check `fieldConfidenceScores` for individual field issues
- Review `anomalyDetection` patterns
- Adjust confidence thresholds if needed

**Issue**: All providers sent to human review
- Lower confidence thresholds
- Check external API connectivity
- Verify mock data for development

**Issue**: Workflow timeout
- Increase `timeout` option
- Check external API response times
- Implement caching

## License

TrueLens Platform - Healthcare Provider Validation

## Support

Contact: [support contact information]
