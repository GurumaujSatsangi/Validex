# Quick Start: Deploying the New Validation Workflow

## Prerequisites
- Supabase project with providers, validation_runs, validation_issues tables
- Azure Maps subscription key
- Node.js backend already running

---

## Step 1: Run Database Migration ⚡

### Option A: Via Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Click **SQL Editor** in left sidebar
3. Click **New Query**
4. Copy and paste this SQL:

```sql
-- Add source_type column to validation_issues
ALTER TABLE validation_issues 
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'UNKNOWN';

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_validation_issues_source_type 
ON validation_issues(source_type);

-- Update existing rows
UPDATE validation_issues 
SET source_type = 'UNKNOWN' 
WHERE source_type IS NULL;

-- Add documentation
COMMENT ON COLUMN validation_issues.source_type IS 'Source that detected this validation issue: NPI_API, AZURE_MAPS, AZURE_POI, SCRAPING_FALLBACK, or UNKNOWN';
```

5. Click **Run** (or press Ctrl+Enter)
6. Verify: Should see "Success. No rows returned"

### Option B: Via SQL File
1. Open `backend/migrations/add_source_type_to_validation_issues.sql`
2. Copy all contents
3. Run in Supabase SQL Editor

---

## Step 2: Verify Environment Variables ✅

Check `backend/.env` file contains:

```bash
# Required
AZURE_MAPS_SUBSCRIPTION_KEY=your_actual_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key

# Optional (defaults to 5000)
PORT=5000
```

**Important:** Make sure AZURE_MAPS_SUBSCRIPTION_KEY is set to a valid Azure Maps key!

---

## Step 3: Restart Backend 🔄

```bash
# Navigate to backend directory
cd backend

# Stop existing server (if running)
# Press Ctrl+C in terminal

# Start server
npm run dev

# Or for production:
npm start
```

**Expected Output:**
```
TrueLens server running on http://localhost:5000
```

---

## Step 4: Test the Workflow 🧪

### Test 1: Upload Providers
1. Open http://localhost:5000
2. Click **Upload** in navigation
3. Upload a CSV file with providers
   - Include some with NPI IDs
   - Include some without NPI IDs
4. Verify import succeeds

### Test 2: Run Validation
1. Click **Runs** in navigation
2. Click **Start New Run** button
3. Wait for validation to complete (progress modal will show)
4. You should see console logs like:
   ```
   [NPI] Searching by name for provider <uuid>
   [NPI] Found NPI ID 1234567890 for provider <uuid> - updating record
   [Azure POI] Searching { providerId: <uuid>, query: "..." }
   ```

### Test 3: View Issues with Sources
1. After run completes, click **View Issues** button
2. Verify modal shows issues table with **Source** column
3. Each issue should have a colored badge:
   - 🔵 **NPI_API** (blue)
   - 🔷 **AZURE_MAPS** (cyan)
   - 🟦 **AZURE_POI** (info blue)
   - 🟨 **SCRAPING_FALLBACK** (yellow)
   - ⚫ **UNKNOWN** (gray - only for old data)

### Test 4: Verify NPI Enrichment
1. Go to **Providers** page
2. Click on a provider that didn't have NPI
3. Verify **NPI** field now shows a value
4. Check Supabase database:
   ```sql
   SELECT id, name, npi_id 
   FROM providers 
   WHERE npi_id IS NOT NULL;
   ```

---

## Step 5: Verify Data in Database 🔍

### Check provider_sources Table
```sql
-- Should see records from all sources
SELECT provider_id, source_type, created_at 
FROM provider_sources 
ORDER BY created_at DESC 
LIMIT 20;
```

**Expected source_type values:**
- `NPI_API`
- `AZURE_MAPS`
- `AZURE_POI`
- `SCRAPING_FALLBACK` (if Azure POI failed for some providers)

### Check validation_issues Table
```sql
-- Should see source_type populated
SELECT 
  field_name, 
  old_value, 
  suggested_value, 
  source_type, 
  confidence 
FROM validation_issues 
WHERE run_id = (SELECT id FROM validation_runs ORDER BY started_at DESC LIMIT 1)
LIMIT 10;
```

**Expected source_type values:**
- `NPI_API` (for specialty, phone from NPI)
- `AZURE_MAPS` (for address components)
- `AZURE_POI` (for phone, website, address from business lookup)
- `SCRAPING_FALLBACK` (for phone, website from scraping)

### Check NPI Enrichment
```sql
-- Providers that got NPI enriched
SELECT 
  p.id,
  p.name,
  p.npi_id,
  ps.raw_data->>'npi' as npi_from_api
FROM providers p
LEFT JOIN provider_sources ps ON p.id = ps.provider_id AND ps.source_type = 'NPI_API'
WHERE p.npi_id IS NOT NULL
ORDER BY p.created_at DESC
LIMIT 10;
```

---

## Troubleshooting 🔧

### Issue: "source_type column doesn't exist"
**Solution:** Run the migration SQL again in Supabase SQL Editor

### Issue: No source badges appear in UI
**Solutions:**
1. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
2. Clear browser cache
3. Verify `runs.js` file was updated correctly
4. Check browser console for JavaScript errors

### Issue: NPI IDs not being updated
**Solutions:**
1. Check console logs for "[NPI] Found NPI ID" messages
2. Verify Supabase RLS policies allow UPDATE on providers table
3. Check that provider names match NPI Registry format
4. Try with a known valid provider name

### Issue: "AZURE_MAPS_SUBSCRIPTION_KEY not set"
**Solutions:**
1. Verify `.env` file exists in `backend/` directory
2. Check key is on a single line without quotes: `AZURE_MAPS_SUBSCRIPTION_KEY=your_key`
3. Restart backend after changing `.env`
4. Verify key is valid at https://portal.azure.com

### Issue: Web scraping always returns "not found"
**Expected Behavior:** Web scraping is intentionally limited as most healthcare directories require authentication. It's a fallback mechanism that may not always find data. The system logs attempts and stores negative results for audit purposes.

---

## Success Criteria ✅

Your implementation is successful if:

- [x] Backend starts without errors
- [x] Database migration succeeds
- [x] Validation run completes
- [x] Issues modal shows "Source" column
- [x] Source badges display with colors
- [x] Console logs show NPI enrichment messages
- [x] provider_sources table has all source types
- [x] validation_issues table has source_type populated
- [x] Providers without NPI get enriched with NPI IDs

---

## Next Steps 🚀

After successful deployment:

1. **Monitor** console logs during validation runs
2. **Review** provider_sources data quality
3. **Analyze** which sources provide the most valuable data
4. **Adjust** confidence scores based on real-world accuracy
5. **Extend** web scraping to target specific healthcare directories
6. **Implement** caching to reduce API costs
7. **Add** bulk operations (accept all from NPI_API, etc.)

---

## Getting Help 📞

If you encounter issues:

1. **Check Console Logs**: Most errors are logged with context
2. **Review Database**: Query provider_sources and validation_issues directly
3. **Verify APIs**: Test Azure Maps and NPI Registry endpoints manually
4. **Read Documentation**: See `VALIDATION_WORKFLOW.md` for detailed info

---

## Documentation Files 📚

- `IMPLEMENTATION_SUMMARY.md` - Complete list of changes
- `VALIDATION_WORKFLOW.md` - Detailed architecture and workflow
- `README.md` - (Create if needed) General project documentation

---

**Congratulations! Your enhanced validation workflow is now live! 🎉**
