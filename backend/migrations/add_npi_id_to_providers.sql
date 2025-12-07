-- Migration to add npi_id column to providers table
-- Run this SQL in your Supabase SQL editor

-- Add npi_id column to providers table
ALTER TABLE providers 
ADD COLUMN IF NOT EXISTS npi_id TEXT;

-- Add index on npi_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_providers_npi_id 
ON providers(npi_id);

-- Add comment to document the column
COMMENT ON COLUMN providers.npi_id IS 'National Provider Identifier - enriched by dataValidationAgent when not provided in CSV';
