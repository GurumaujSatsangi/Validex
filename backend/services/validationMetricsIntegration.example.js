/**
 * Example: Integrating LangSmith Metrics Fetching into Validation Service
 * 
 * This file demonstrates how to fetch metrics after validation runs
 */

import { executeValidationWorkflow } from "./graph/workflow.js";
import { fetchRunMetrics } from "./tools/langsmithClient.js";
import { supabase } from "../supabaseClient.js";

/**
 * Run validation for a provider with automatic metrics collection
 */
export async function runValidationWithMetrics(provider, runId) {
  console.log(`[ValidationService] Starting LangGraph validation for provider: ${provider.id}`);
  
  const inputData = {
    name: provider.name,
    npi: provider.npi_id,
    address: provider.address_line1,
    phone: provider.phone,
    website: provider.website,
    specialty: provider.speciality,
    state: provider.state,
  };
  
  // Execute LangGraph workflow
  const result = await executeValidationWorkflow(inputData, {
    providerId: provider.id,
    runId,
  });
  
  // Fetch metrics after workflow completes
  let metrics = null;
  if (result.success && result.state?.workflowId) {
    try {
      console.log(`[ValidationService] Fetching metrics for workflow: ${result.state.workflowId}`);
      
      // Fetch metrics with custom pricing
      metrics = await fetchRunMetrics(result.state.workflowId, {
        input_cost_per_1k: 0.0015,  // Adjust based on your LLM
        output_cost_per_1k: 0.002,
      });
      
      if (metrics) {
        console.log(`[ValidationService] Metrics collected:`);
        console.log(`  - Workflow latency: ${metrics.latency.workflow_ms}ms`);
        console.log(`  - Total tokens: ${metrics.tokens.total_tokens}`);
        console.log(`  - Estimated cost: $${metrics.cost.estimated_cost_usd}`);
        
        // Optional: Store metrics in database
        await storeValidationMetrics(provider.id, runId, metrics);
      }
    } catch (error) {
      console.error(`[ValidationService] Error fetching metrics:`, error.message);
      // Continue even if metrics fetch fails
    }
  }
  
  return {
    ...result,
    metrics,  // Include metrics in result
  };
}

/**
 * Store validation metrics in database
 */
async function storeValidationMetrics(providerId, runId, metrics) {
  try {
    const { error } = await supabase
      .from('validation_run_metrics')
      .insert({
        provider_id: providerId,
        run_id: runId,
        workflow_latency_ms: metrics.latency.workflow_ms,
        total_tokens: metrics.tokens.total_tokens,
        prompt_tokens: metrics.tokens.prompt_tokens,
        completion_tokens: metrics.tokens.completion_tokens,
        estimated_cost_usd: metrics.cost.estimated_cost_usd,
        per_node_latency: metrics.latency.per_node,
        created_at: new Date().toISOString(),
      });
    
    if (error) {
      console.error('[ValidationService] Error storing metrics:', error.message);
    } else {
      console.log('[ValidationService] Metrics stored in database');
    }
  } catch (error) {
    console.error('[ValidationService] Exception storing metrics:', error);
  }
}

/**
 * Fetch metrics for a batch of validation runs
 */
export async function fetchBatchMetrics(runIds) {
  console.log(`[ValidationService] Fetching metrics for ${runIds.length} runs`);
  
  const results = [];
  
  for (const runId of runIds) {
    try {
      const metrics = await fetchRunMetrics(runId);
      if (metrics) {
        results.push({
          runId,
          success: true,
          metrics,
        });
      } else {
        results.push({
          runId,
          success: false,
          error: 'Failed to fetch metrics',
        });
      }
    } catch (error) {
      results.push({
        runId,
        success: false,
        error: error.message,
      });
    }
  }
  
  // Summary
  const successful = results.filter(r => r.success).length;
  const totalLatency = results
    .filter(r => r.success)
    .reduce((sum, r) => sum + r.metrics.latency.workflow_ms, 0);
  const totalTokens = results
    .filter(r => r.success)
    .reduce((sum, r) => sum + r.metrics.tokens.total_tokens, 0);
  const totalCost = results
    .filter(r => r.success)
    .reduce((sum, r) => sum + r.metrics.cost.estimated_cost_usd, 0);
  
  console.log(`\n[Batch Metrics Summary]`);
  console.log(`  Runs fetched: ${successful}/${runIds.length}`);
  console.log(`  Total latency: ${totalLatency}ms (avg: ${(totalLatency / successful).toFixed(0)}ms)`);
  console.log(`  Total tokens: ${totalTokens} (avg: ${(totalTokens / successful).toFixed(0)})`);
  console.log(`  Total cost: $${totalCost.toFixed(6)} USD`);
  
  return results;
}

/**
 * Example: Generate daily metrics report
 */
export async function generateDailyMetricsReport() {
  // Fetch validation runs from last 24 hours
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const { data: runs, error } = await supabase
    .from('validation_runs')
    .select('id, started_at, completed_at')
    .gte('started_at', yesterday.toISOString())
    .order('started_at', { ascending: false });
  
  if (error || !runs) {
    console.error('[Metrics Report] Error fetching runs:', error?.message);
    return null;
  }
  
  console.log(`[Metrics Report] Generating report for ${runs.length} runs`);
  
  // Fetch metrics for all runs
  const runIds = runs.map(r => r.id);
  const metrics = await fetchBatchMetrics(runIds);
  
  // Generate report
  const report = {
    period: {
      start: yesterday.toISOString(),
      end: new Date().toISOString(),
    },
    summary: {
      total_runs: runs.length,
      successful_fetches: metrics.filter(m => m.success).length,
      total_providers_validated: runs.length,
      average_latency_ms: metrics
        .filter(m => m.success)
        .reduce((sum, m) => sum + m.metrics.latency.workflow_ms, 0) / metrics.filter(m => m.success).length,
      total_tokens: metrics
        .filter(m => m.success)
        .reduce((sum, m) => sum + m.metrics.tokens.total_tokens, 0),
      total_cost_usd: metrics
        .filter(m => m.success)
        .reduce((sum, m) => sum + m.metrics.cost.estimated_cost_usd, 0),
    },
    details: metrics,
  };
  
  console.log('\n[Daily Metrics Report]');
  console.log(JSON.stringify(report, null, 2));
  
  return report;
}
