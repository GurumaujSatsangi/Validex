# LangGraph Workflow Architecture Diagrams

## 1. High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TrueLens Backend Routes                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  /api/validation-runs/workflow    POST provider data               │
│  /api/validation-runs/batch       POST array of providers          │
│  /upload                          POST PDF/CSV files               │
│                                                                      │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             │ Provider Data
                             ▼
         ┌───────────────────────────────────────┐
         │   LangGraph Validation Workflow       │
         │   (services/graph/workflow.js)        │
         │                                       │
         │  ┌─────────────────────────────────┐  │
         │  │ Data Validation Agent           │  │
         │  │ (Verify existing data)          │  │
         │  └──────────────┬────────────────┘  │
         │                 │                   │
         │  ┌──────────────▼────────────────┐  │
         │  │ Information Enrichment Agent  │  │
         │  │ (Add new information)         │  │
         │  └──────────────┬────────────────┘  │
         │                 │                   │
         │  ┌──────────────▼────────────────┐  │
         │  │ Quality Assurance Agent       │  │
         │  │ (Evaluate trustworthiness)    │  │
         │  └──────────────┬────────────────┘  │
         │                 │                   │
         │  ┌──────────────▼────────────────┐  │
         │  │ Directory Management Agent    │  │
         │  │ (Execute actions)             │  │
         │  └──────────────┬────────────────┘  │
         │                 │                   │
         └─────────────────┼───────────────────┘
                           │
                           │ Workflow Result
                           ▼
         ┌───────────────────────────────────────┐
         │    Supabase Database                 │
         │  - validation_runs                   │
         │  - directory_entries                 │
         │  - review_tasks                      │
         │  - validation_reports                │
         └───────────────────────────────────────┘
```

## 2. Detailed Agent Flow with Data Transformations

```
┌─────────────────────────────────┐
│  INPUT STATE                    │
│  providerId, inputData          │
│  (all other fields: null/empty) │
└────────────────┬────────────────┘
                 │
                 ▼
    ╔═════════════════════════════════════════════╗
    ║ DATA VALIDATION AGENT                       ║
    ║                                             ║
    ║  Parallel Execution:                        ║
    ║  1. validateNPI()                           ║
    ║  2. validateLicense()                       ║
    ║  3. validateWebsiteData()                   ║
    ║  4. validatePhone()                         ║
    ║  5. validateAddress()                       ║
    ║                                             ║
    ║  Result: 5 results → aggregate              ║
    ╚═════════════════════════════════════════════╝
                 │
                 ▼ STATE UPDATE
    ┌─────────────────────────────────────────────────┐
    │ + validatedFields: [ { field, verified,        │
    │                       confidence, source } ]    │
    │ + validationDiscrepancies: [ { field,          │
    │                       input, source, severity } │
    │ + validationSources: [ { source,               │
    │                    fieldsValidated, timestamp } │
    │ + npiLookupResult, licensingBoardResult,       │
    │   websiteScrapingResult, phoneVerificationResult│
    └────────────────┬─────────────────────────────────┘
                     │
                     ▼
    ╔═════════════════════════════════════════════╗
    ║ INFORMATION ENRICHMENT AGENT                ║
    ║                                             ║
    ║  Parallel Execution:                        ║
    ║  1. enrichFromAzureMapsPOI()                ║
    ║  2. enrichFromWebsiteScraping()             ║
    ║  3. enrichEducationAndCertifications()      ║
    ║  4. analyzeGeographicAndSpecialtyCoverage() ║
    ║                                             ║
    ║  Result: 4 results → aggregate              ║
    ╚═════════════════════════════════════════════╝
                 │
                 ▼ STATE UPDATE
    ┌─────────────────────────────────────────────────┐
    │ + enrichedProviderProfile: { services,          │
    │                    telemedicine, languages, ... │
    │ + geoCoordinates: { latitude, longitude }       │
    │ + poiMetadata: { businessName, phone, rating }  │
    │ + educationDetails: { school, residency, certs}│
    │ + geoSpecialtyAnalysis: { coverage, type }      │
    └────────────────┬─────────────────────────────────┘
                     │
                     ▼
    ╔═════════════════════════════════════════════╗
    ║ QUALITY ASSURANCE AGENT                     ║
    ║                                             ║
    ║  Sequential Computation:                    ║
    ║  1. computeFieldConfidenceScores()          ║
    ║  2. performCrossSourceComparison()          ║
    ║  3. detectAnomalies()                       ║
    ║  4. calculateOverallConfidenceScore()       ║
    ║  5. determineReviewNeed()                   ║
    ║                                             ║
    ║  Result: Review decision (T/F)              ║
    ╚═════════════════════════════════════════════╝
                 │
                 ▼ STATE UPDATE
    ┌─────────────────────────────────────────────────┐
    │ + fieldConfidenceScores: { npi: 0.95,           │
    │                     phone: 0.85, ... }          │
    │ + overallConfidenceScore: 87.5                  │
    │ + needsHumanReview: true/false                  │
    │ + reviewSeverity: 'LOW'|'MEDIUM'|'HIGH'         │
    │ + priorityScore: 0-100+                         │
    │ + anomalyDetection: { patterns, fraudRisk }     │
    │ + crossSourceComparison: { inconsistencies }    │
    └────────────────┬─────────────────────────────────┘
                     │
             ┌───────┴────────┐
             │                │
       NO REVIEW          NEEDS REVIEW
             │                │
             ▼                ▼
    ╔═══════════════════════════════════════════════════════╗
    ║ DIRECTORY MANAGEMENT AGENT                           ║
    ║                                                       ║
    ║ Branch 1: Auto-Publish (needsHumanReview=false)      ║
    ║   • generateWebDirectoryEntry()                       ║
    ║   • generateMobileAppFeed()                           ║
    ║   • generateValidationReport()                        ║
    ║                                                       ║
    ║ Branch 2: Queue for Review (needsHumanReview=true)   ║
    ║   • createHumanReviewTask()                           ║
    ║   • createAlert() (for HIGH severity)                 ║
    ║   • generateValidationReport()                        ║
    ╚═══════════════════════════════════════════════════════╝
                 │
                 ▼ FINAL STATE UPDATE
    ┌─────────────────────────────────────────────────┐
    │ + directoryStatus: 'PUBLISHED'|'NEEDS_REVIEW'   │
    │ + webDirectoryEntry: { full provider entry }    │
    │ + mobileAppFeed: { mobile-optimized entry }     │
    │ + validationReports: [ { compliance report } ]  │
    │ + reviewerTasks: [ { task details } ]           │
    │ + alerts: [ { alert details } ]                 │
    │ + workflowStatus: 'COMPLETED'                   │
    │ + endTime: timestamp                            │
    └─────────────────────────────────────────────────┘
                 │
                 ▼
         WORKFLOW COMPLETE
         Return final state
```

## 3. Confidence Score Calculation Flow

```
┌──────────────────────────────────────────────────────────────┐
│ FIELD-LEVEL CONFIDENCE SCORES (0.0 - 1.0)                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  NPI Field:                                                  │
│    Input: validatedFields with npi && verified               │
│    Logic: if verified → 0.95, else → 0.0                    │
│    Output: npi_confidence = 0.95                             │
│                                                              │
│  License Field:                                              │
│    Input: validatedFields with license && verified           │
│    Logic: if verified → 0.90, else → 0.0                    │
│    Output: license_confidence = 0.90                         │
│                                                              │
│  Phone Field:                                                │
│    Input: validatedFields with phone (may have multiple)     │
│    Logic: 0.80 + (source_count * 0.05), max 0.95            │
│    Output: phone_confidence = 0.85-0.95                      │
│                                                              │
│  Address Field:                                              │
│    Input: validatedFields with address (may have multiple)   │
│    Logic: 0.80 + (source_count * 0.05), max 0.95            │
│    Output: address_confidence = 0.85-0.95                    │
│                                                              │
│  Contact Details:                                            │
│    Input: poiMetadata completeness                           │
│    Logic: if (address && phone) → 0.85, else → 0.6          │
│    Output: contact_confidence = 0.6-0.85                     │
│                                                              │
│  Education:                                                  │
│    Input: boardCertifications array length                   │
│    Logic: if (count > 0) → 0.90, else → 0.50                │
│    Output: education_confidence = 0.50-0.90                  │
│                                                              │
│  Services:                                                   │
│    Input: enrichedProviderProfile.services array             │
│    Logic: if (count > 0) → 0.80, else → 0.40                │
│    Output: services_confidence = 0.40-0.80                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ WEIGHTED AVERAGE CALCULATION                                 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  overall = (                                                 │
│      npi * 0.25                                              │
│    + license * 0.20                                          │
│    + phone * 0.15                                            │
│    + address * 0.15                                          │
│    + contact * 0.10                                          │
│    + education * 0.08                                        │
│    + services * 0.07                                         │
│  ) / 1.00                                                    │
│                                                              │
│  Example: (0.95*0.25 + 0.90*0.20 + 0.85*0.15 + ... )        │
│  Result: 0.875 → 87.5%                                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ DECISION RULES APPLIED                                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Rule 1: If overall_confidence < 0.70                        │
│          → needsReview = true, priority += 50                │
│                                                              │
│  Rule 2: If anomalies.isDetected = true                      │
│          → needsReview = true, priority += 40                │
│          → if fraudRisk='HIGH' → priority += 50              │
│                                                              │
│  Rule 3: If inconsistencies.count > 2                        │
│          → needsReview = true, priority += 30                │
│                                                              │
│  Rule 4: If 0.70 ≤ overall_confidence < 0.85                │
│          → needsReview = true, priority += 20                │
│                                                              │
│  Auto-Approve: If overall_confidence ≥ 0.85                 │
│                AND anomalies.isDetected = false              │
│                → needsReview = false, priority = 0           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                          ▼
              needsHumanReview decision
```

## 4. Anomaly Detection Patterns

```
┌─────────────────────────────────────────────────────────────┐
│ ANOMALY DETECTION MATRIX                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Pattern 1: EXPIRED_CERTIFICATION                            │
│   Check: boardCertifications.expirationDate < today         │
│   Severity: HIGH                                             │
│   Fraud Risk: MEDIUM                                         │
│   Action: Contact provider                                   │
│                                                             │
│ Pattern 2: MULTIPLE_ADDRESS_DISCREPANCIES                   │
│   Check: validationDiscrepancies.count > 3                  │
│   Severity: MEDIUM                                           │
│   Fraud Risk: MEDIUM                                         │
│   Action: Verify manually                                    │
│                                                             │
│ Pattern 3: MISSING_CRITICAL_FIELDS                          │
│   Check: [npi, license, phone, address] verified < 2        │
│   Severity: HIGH                                             │
│   Fraud Risk: HIGH                                           │
│   Action: Request additional info                            │
│                                                             │
│ Pattern 4: LOCATION_STATE_MISMATCH                          │
│   Check: geoCoordinates not in inputData.state              │
│   Severity: HIGH                                             │
│   Fraud Risk: MEDIUM                                         │
│   Action: Verify location with provider                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 5. State Mutation Timeline

```
Start:     Empty state (null/undefined/empty arrays)
           ↓
Agent 1:   validatedFields[], validationDiscrepancies[]
           validationSources[], npiLookupResult, ...
           ↓
Agent 2:   enrichedProviderProfile, geoCoordinates
           poiMetadata, educationDetails, ...
           ↓
Agent 3:   fieldConfidenceScores, overallConfidenceScore
           needsHumanReview, reviewSeverity, ...
           ↓
Agent 4:   directoryStatus, webDirectoryEntry
           mobileAppFeed, validationReports, ...
           ↓
End:       Complete state with all fields populated

Total Mutations: ~50+ fields added
Total Size Growth: ~2KB → ~20KB
Immutability: Each agent returns {...state, updates...}
```

## 6. Error Handling Flow

```
Agent Execution
    ↓
Try Block
    │
    ├─ Success → Update state → Return state
    │
    └─ Error → Catch
              │
              └─ Log to errorLog[]
                 ├─ stage: agent name
                 ├─ error: error message
                 └─ timestamp: ISO string
              
              For QA Agent specifically:
              └─ Set needsHumanReview = true
                 Set reviewSeverity = 'HIGH'
                 Continue to Directory Management

Workflow never throws
All errors captured in state.errorLog
Directory Management executes regardless of upstream errors
```

## 7. Routes Integration

```
Express Backend
    │
    ├─ POST /api/validation-runs/workflow
    │      └─ createValidationRunWorkflow()
    │         ├─ Validate input
    │         ├─ executeValidationWorkflow()
    │         ├─ Store in validation_runs table
    │         ├─ If published: store in directory_entries
    │         ├─ If review: create review_tasks + alerts
    │         └─ Return JSON response
    │
    ├─ POST /api/validation-runs/batch
    │      └─ batchValidateProviders()
    │         ├─ Loop through providers array
    │         ├─ executeValidationWorkflow() × N
    │         ├─ Aggregate results
    │         └─ Return summary + individual results
    │
    └─ WebSocket /validate-stream
           └─ setupValidationWebSocket()
              ├─ On 'validate-provider'
              ├─ streamValidationWorkflow()
              ├─ Emit 'validation-step' per node
              └─ Emit 'validation-complete'
```

---

Generated: 2026-02-04
