# TrueLens Validation Workflow Documentation

## Overview
This document describes the end-to-end validation workflow implemented in TrueLens for healthcare provider data validation.

## Workflow Architecture

The validation system uses a multi-agent architecture with external API integrations and fallback mechanisms:

```
┌─────────────────────────────────────────────────────────────┐
│                    Validation Run Initiated                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Data Validation Agent                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1a. NPI Validation & Enrichment                       │  │
│  │     • If provider has NPI ID → Lookup by NPI ID      │  │
│  │     • If no NPI → Search by name/location            │  │
│  │     • If found → Update provider.npi_id in database  │  │
│  │     • Store result in provider_sources (NPI_API)     │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1b. Azure Maps Address Validation                     │  │
│  │     • Validate address using Azure Maps Search API   │  │
│  │     • Store result in provider_sources (AZURE_MAPS)  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Info Enrichment Agent                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 2a. Azure Maps Business (POI) Lookup                  │  │
│  │     • Search for provider as business entity         │  │
│  │     • Query: "Provider Name, City, State"            │  │
│  │     • Extract: phone, address, website, categories   │  │
│  │     • Store result in provider_sources (AZURE_POI)   │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 2b. Web Scraping Fallback (if Azure POI not found)   │  │
│  │     • Scrape NPI Registry HTML profile               │  │
│  │     • Scrape healthcare directories                  │  │
│  │     • Extract: phone, address, website               │  │
│  │     • Store in provider_sources (SCRAPING_FALLBACK)  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Quality Assurance Agent                             │
│  • Compare data from all sources                             │
│  • Generate validation issues for discrepancies              │
│  • Track source_type for each issue:                         │
│    - NPI_API: specialty, phone from NPI                      │
│    - AZURE_MAPS: address components from validation          │
│    - AZURE_POI: phone, address, website from business lookup │
│    - SCRAPING_FALLBACK: phone, website from web scraping     │
│  • Insert issues into validation_issues table                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: Display Results                                     │
│  • Validation Runs page shows all issues                     │
│  • Each issue displays source_type badge                     │
│  • Color-coded sources for easy identification              │
└─────────────────────────────────────────────────────────────┘
```

## Data Sources

### 1. NPI Registry API
- **Purpose**: Official healthcare provider verification
- **Lookup Methods**:
  - By NPI ID: `GET https://npiregistry.cms.hhs.gov/api/?version=2.1&number={npi_id}`
  - By Name: `GET https://npiregistry.cms.hhs.gov/api/?version=2.1&first_name={fname}&last_name={lname}&city={city}&state={state}`
- **Data Retrieved**:
  - NPI number
  - Provider name (official)
  - Specialty/Taxonomy
  - Phone number
  - Practice address
  - License information
- **Storage**: `provider_sources` table with `source_type = 'NPI_API'`

### 2. Azure Maps Search Address API
- **Purpose**: Address validation and normalization
- **Endpoint**: `https://atlas.microsoft.com/search/address/json`
- **Data Retrieved**:
  - Validated formatted address
  - Postal code
  - City (municipality)
  - State (countrySubdivision)
  - Geo-coordinates
  - Confidence score
- **Storage**: `provider_sources` table with `source_type = 'AZURE_MAPS'`

### 3. Azure Maps Search Fuzzy/POI API
- **Purpose**: Business lookup and enrichment
- **Endpoint**: `https://atlas.microsoft.com/search/fuzzy/json`
- **Query**: Provider name + city + state
- **Data Retrieved**:
  - Business name
  - Full address
  - Phone number
  - Website URL
  - Categories/Classifications
  - Geo-coordinates
- **Storage**: `provider_sources` table with `source_type = 'AZURE_POI'`

### 4. Web Scraping Fallback
- **Purpose**: Last-resort data enrichment when APIs fail
- **Targets**:
  - NPI Registry HTML profiles
  - Healthcare directories (Healthgrades, Vitals, etc.)
  - Practice/hospital websites
- **Technology**: Axios + Cheerio
- **Data Retrieved**:
  - Phone number
  - Address
  - Website
  - Practice descriptions
- **Storage**: `provider_sources` table with `source_type = 'SCRAPING_FALLBACK'`

## Database Schema

### providers Table
```sql
- id: UUID (primary key)
- npi_id: TEXT (enriched by dataValidationAgent)
- name: TEXT
- phone: TEXT
- email: TEXT
- address_line1: TEXT
- city: TEXT
- state: TEXT
- zip: TEXT
- speciality: TEXT
- license_number: TEXT
- website: TEXT (optional)
```

### provider_sources Table
```sql
- id: UUID (primary key)
- provider_id: UUID (foreign key to providers)
- source_type: TEXT (NPI_API, AZURE_MAPS, AZURE_POI, SCRAPING_FALLBACK)
- raw_data: JSONB (complete API/scraping response)
- created_at: TIMESTAMP
```

### validation_issues Table
```sql
- id: UUID (primary key)
- provider_id: UUID (foreign key to providers)
- run_id: UUID (foreign key to validation_runs)
- field_name: TEXT (e.g., 'phone', 'city', 'speciality')
- old_value: TEXT (current value in provider record)
- suggested_value: TEXT (recommended value from source)
- confidence: DECIMAL (0.0 to 1.0)
- severity: TEXT (HIGH, MEDIUM, LOW)
- source_type: TEXT (which source detected this issue) ← NEW
- status: TEXT (OPEN, ACCEPTED, REJECTED)
- created_at: TIMESTAMP
```

## File Structure

```
backend/
├── services/
│   ├── agents/
│   │   ├── dataValidationAgent.js       # Step 1: NPI + Address validation
│   │   ├── infoEnrichmentAgent.js       # Step 2: POI lookup + scraping fallback
│   │   ├── qualityAssuranceAgent.js     # Step 3: Issue generation with sources
│   │   └── directoryManagementAgent.js
│   ├── tools/
│   │   ├── npiClient.js                 # NPI Registry API client
│   │   ├── mapsClient.js                # Azure Maps API client
│   │   ├── webScraper.js                # Web scraping fallback ← NEW
│   │   ├── addressUtils.js
│   │   └── phoneUtils.js
│   └── validationService.js             # Orchestrates validation workflow
├── routes/
│   ├── validationRuns.js                # API endpoints for runs
│   └── ...
└── migrations/
    └── add_source_type_to_validation_issues.sql  ← NEW

public/js/
└── runs.js                               # Frontend: displays source badges

views/
└── runs.ejs                              # Validation runs UI
```

## Environment Variables

Required in `.env`:

```bash
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key

# Azure Maps
AZURE_MAPS_SUBSCRIPTION_KEY=your_azure_maps_key
```

## API Flow Example

### Example Provider Record
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "JOHN P LYDON DPM",
  "npi_id": null,  // Will be enriched
  "phone": "555-100-0005",
  "address_line1": "5620 SHIELDS DR",
  "city": "BETHESDA",
  "state": "VA",
  "zip": "20817",
  "speciality": "Ambulatory Surgical Center"
}
```

### Step 1a: NPI Search by Name
**Request:**
```
GET https://npiregistry.cms.hhs.gov/api/
?version=2.1
&first_name=JOHN
&last_name=P LYDON DPM
&city=BETHESDA
&state=VA
```

**Response** → Stored as `provider_sources`:
```json
{
  "provider_id": "123e4567-e89b-12d3-a456-426614174000",
  "source_type": "NPI_API",
  "raw_data": {
    "isFound": true,
    "npi": "1234567890",
    "name": "JOHN P LYDON",
    "phone": "3015551234",
    "speciality": "Podiatrist",
    "address": {...}
  }
}
```

**Side Effect**: `providers.npi_id` updated to `"1234567890"`

### Step 2a: Azure POI Lookup
**Request:**
```
GET https://atlas.microsoft.com/search/fuzzy/json
?query=JOHN P LYDON DPM, BETHESDA, VA
&subscription-key={key}
```

**Response** → Stored as `provider_sources`:
```json
{
  "provider_id": "123e4567-e89b-12d3-a456-426614174000",
  "source_type": "AZURE_POI",
  "raw_data": {
    "isFound": true,
    "name": "John P. Lydon, D.P.M.",
    "phone": "+1 301-555-1234",
    "website": "http://www.lydonpodiatry.com",
    "formattedAddress": "5620 Shields Dr, Bethesda, MD 20817",
    ...
  }
}
```

### Step 3: QA Agent Generates Issues

If phone from NPI differs from provider record:
```json
{
  "provider_id": "123e4567-e89b-12d3-a456-426614174000",
  "run_id": "run-uuid",
  "field_name": "phone",
  "old_value": "555-100-0005",
  "suggested_value": "301-555-1234",
  "confidence": 0.9,
  "severity": "HIGH",
  "source_type": "NPI_API",  ← Tracks which source found this
  "status": "OPEN"
}
```

## Frontend Display

In the Validation Runs modal, issues now show:

| Provider | Field | Current | Suggested | **Source** | Confidence | Severity | Status | Actions |
|----------|-------|---------|-----------|------------|------------|----------|--------|---------|
| JOHN P LYDON DPM | phone | 555-100-0005 | 301-555-1234 | **🔵 NPI_API** | 90% | HIGH | OPEN | Accept / Reject |
| JOHN P LYDON DPM | state | VA | MD | **🔷 AZURE_MAPS** | 90% | HIGH | OPEN | Accept / Reject |
| JOHN P LYDON DPM | website | | http://www.lydonpodiatry.com | **🟦 AZURE_POI** | 80% | MEDIUM | OPEN | Accept / Reject |

### Source Badge Colors
- 🔵 **NPI_API**: Primary blue (most trusted)
- 🔷 **AZURE_MAPS**: Cyan (address validation)
- 🟦 **AZURE_POI**: Info blue (business lookup)
- 🟨 **SCRAPING_FALLBACK**: Warning yellow (less confident)
- ⚫ **UNKNOWN**: Secondary gray (legacy data)

## Error Handling

The system is designed to continue validation even if individual steps fail:

1. **NPI API Failure**: Stores `{isFound: false}` and continues
2. **Azure Maps Failure**: Stores error reason and continues
3. **Azure POI Not Found**: Triggers web scraping fallback
4. **Web Scraping Failure**: Stores `{isFound: false}` and completes validation

All failures are logged but don't block the validation pipeline.

## Installation & Migration

### 1. Install Dependencies
```bash
cd backend
npm install
# cheerio is already in package.json
```

### 2. Run Database Migration
```sql
-- In Supabase SQL Editor, run:
-- backend/migrations/add_source_type_to_validation_issues.sql
```

### 3. Verify Environment Variables
```bash
# Check .env file has:
AZURE_MAPS_SUBSCRIPTION_KEY=your_key_here
```

### 4. Restart Backend
```bash
npm run dev
```

## Testing the Workflow

1. Upload a CSV with providers (some with NPI, some without)
2. Go to Validation Runs page
3. Click "Start New Run"
4. Wait for completion
5. Click "View Issues" on the completed run
6. Verify each issue shows a **Source** badge
7. Check console logs for NPI enrichment messages

## Future Enhancements

- [ ] Add more web scraping targets (Healthgrades, Vitals, ZocDoc)
- [ ] Implement caching for API responses to reduce costs
- [ ] Add confidence scoring based on source type
- [ ] Implement automatic acceptance for high-confidence issues
- [ ] Add bulk accept/reject by source type
- [ ] Create source reliability metrics dashboard

## Troubleshooting

### NPI ID Not Being Updated
- Check console for "[NPI] Found NPI ID" messages
- Verify Supabase permissions allow UPDATE on providers table
- Check if provider.npi_id field exists in database schema

### Source Type Shows UNKNOWN
- Verify database migration was run successfully
- Check qualityAssuranceAgent.js includes `sourceType` in suggestions
- Ensure all issue generation includes `source_type` field

### Web Scraping Not Working
- Web scraping is intentionally limited - most sites require authentication
- Check console for "[Web Scraper]" messages
- Consider implementing specific scraper logic for known directories

## Support

For issues or questions:
1. Check backend console logs for detailed error messages
2. Verify all environment variables are set correctly
3. Ensure database migrations are applied
4. Review provider_sources table to see what data was fetched
