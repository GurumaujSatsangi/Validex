-- Add last_run_at column to cron_jobs table to track when each job last executed
ALTER TABLE cron_jobs ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ DEFAULT NULL;
