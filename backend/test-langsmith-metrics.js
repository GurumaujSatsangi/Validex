/**
 * Test script for LangSmith metrics fetching
 * 
 * Usage:
 *   node test-langsmith-metrics.js <runId>
 * 
 * Example:
 *   node test-langsmith-metrics.js a1b2c3d4-e5f6-7890-abcd-ef1234567890
 */

import { fetchRunMetrics } from './services/tools/langsmithClient.js';
import dotenv from 'dotenv';

dotenv.config();

async function testMetricsFetch() {
  // Get run ID from command line arguments
  const runId = process.argv[2];

  if (!runId) {
    console.error('Error: Please provide a run ID as argument');
    console.log('\nUsage: node test-langsmith-metrics.js <runId>');
    console.log('Example: node test-langsmith-metrics.js a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    process.exit(1);
  }

  if (!process.env.LANGSMITH_API_KEY) {
    console.error('Error: LANGSMITH_API_KEY not set in environment variables');
    process.exit(1);
  }

  // Fetch metrics with custom pricing (optional)
  const pricingConfig = {
    input_cost_per_1k: 0.0015,   // $0.0015 per 1K input tokens
    output_cost_per_1k: 0.002,   // $0.002 per 1K output tokens
  };

  const metrics = await fetchRunMetrics(runId, pricingConfig);

  if (!metrics) {
    console.log('✗ Failed to fetch metrics');
    process.exit(1);
  }
}

// Run the test
testMetricsFetch().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
