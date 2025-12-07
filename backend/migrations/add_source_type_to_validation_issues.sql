-- Migration to add source_type column to validation_issues table
-- Run this SQL in your Supabase SQL editor

-- Add source_type column to validation_issues
ALTER TABLE validation_issues 
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'UNKNOWN';

-- Add index on source_type for faster filtering
CREATE INDEX IF NOT EXISTS idx_validation_issues_source_type 
ON validation_issues(source_type);

-- Add comment to document the column
COMMENT ON COLUMN validation_issues.source_type IS 'Source that detected this validation issue: NPI_API, AZURE_MAPS, AZURE_POI, SCRAPING_FALLBACK, or UNKNOWN';

-- Optional: Update existing rows to have UNKNOWN source_type if NULL
UPDATE validation_issues 
SET source_type = 'UNKNOWN' 
WHERE source_type IS NULL;
