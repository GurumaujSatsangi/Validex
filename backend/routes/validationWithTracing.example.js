/**
 * Example API Route Integration with LangSmith Tracing
 * Shows how to integrate the tracing into your Express routes
 * 
 * This file demonstrates the best practices for using LangSmith tracing
 * in production API endpoints
 */

import express from "express";
import {
  executeValidationWorkflow,
  streamValidationWorkflow,
  exportExecutionTrace,
} from "../services/graph/workflow.js";

const router = express.Router();

/**
 * Example 1: Simple endpoint that returns execution trace
 * GET /api/validation/run
 */
router.post("/api/validation/run", async (req, res) => {
  try {
    const { providerId, providerData } = req.body;

    if (!providerData) {
      return res.status(400).json({ error: "providerData is required" });
    }

    // Execute workflow with tracing
    const result = await executeValidationWorkflow(providerData, {
      providerId: providerId || `provider_${Date.now()}`,
      verbose: process.env.NODE_ENV === "development",
    });

    if (result.success) {
      // Return execution trace along with state
      return res.status(200).json({
        success: true,
        workflowId: result.state.workflowId,
        providerId: result.state.providerId,
        executionTrace: result.executionTrace,
        summary: result.executionTrace
          ? result.executionTrace.executionSummary
          : null,
        executionTime: result.executionTime,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("[API Error]", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Example 2: Streaming endpoint for real-time monitoring
 * POST /api/validation/stream
 */
router.post("/api/validation/stream", async (req, res) => {
  try {
    const { providerId, providerData } = req.body;

    if (!providerData) {
      return res.status(400).json({ error: "providerData is required" });
    }

    // Set up SSE headers for streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let stepCount = 0;

    // Stream workflow execution
    await streamValidationWorkflow(
      providerData,
      (step) => {
        stepCount++;

        // Send SSE message
        res.write(
          `data: ${JSON.stringify({
            step: stepCount,
            nodeName: step.nodeName,
            timestamp: step.timestamp,
            nodeExecutionOrder: step.nodeExecutionOrder,
          })}\n\n`
        );
      },
      {
        providerId: providerId || `provider_${Date.now()}`,
      }
    );

    // Send completion message
    res.write(
      `data: ${JSON.stringify({
        complete: true,
        totalSteps: stepCount,
      })}\n\n`
    );

    res.end();
  } catch (error) {
    console.error("[Streaming Error]", error.message);
    res.write(
      `data: ${JSON.stringify({
        error: error.message,
      })}\n\n`
    );
    res.end();
  }
});

/**
 * Example 3: Endpoint that retrieves execution trace
 * GET /api/validation/trace/:workflowId
 *
 * Note: This example assumes you're storing traces in a database
 */
router.get("/api/validation/trace/:workflowId", async (req, res) => {
  try {
    const { workflowId } = req.params;

    // In production, retrieve from database
    // const trace = await db.validationTraces.findOne({ workflowId });

    // For this example, return a message
    return res.status(200).json({
      workflowId,
      message: "To implement trace retrieval, store traces in your database",
      example: {
        workflowId: "wf_1707027045123_a1b2c3d4e5",
        providerId: "provider_123",
        executionSummary: {
          totalNodes: 4,
          totalDuration: 5680,
          nodeSequence:
            "data_validation → information_enrichment → quality_assurance → directory_management",
        },
        detailedExecution: [
          {
            order: 1,
            nodeName: "data_validation",
            duration: 1250,
            durationFormatted: "1.25s",
            error: null,
          },
          // ... more nodes
        ],
      },
    });
  } catch (error) {
    console.error("[Trace Retrieval Error]", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Example 4: Batch processing with trace collection
 * POST /api/validation/batch
 */
router.post("/api/validation/batch", async (req, res) => {
  try {
    const { providers } = req.body;

    if (!Array.isArray(providers)) {
      return res
        .status(400)
        .json({ error: "providers must be an array" });
    }

    const results = [];
    const traces = [];

    // Process each provider
    for (const provider of providers) {
      try {
        const result = await executeValidationWorkflow(provider, {
          providerId: provider.id || `provider_${Date.now()}_${Math.random()}`,
          verbose: false,
        });

        if (result.success) {
          results.push({
            providerId: provider.id,
            success: true,
            workflowId: result.state.workflowId,
            executionTime: result.executionTime,
          });

          if (result.executionTrace) {
            traces.push(result.executionTrace);
          }
        } else {
          results.push({
            providerId: provider.id,
            success: false,
            error: result.error,
          });
        }
      } catch (error) {
        results.push({
          providerId: provider.id,
          success: false,
          error: error.message,
        });
      }
    }

    // Calculate statistics
    const stats = {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      averageExecutionTime:
        results.reduce((sum, r) => sum + (r.executionTime || 0), 0) /
        results.length,
      traces: traces,
    };

    return res.status(200).json({
      results,
      statistics: stats,
    });
  } catch (error) {
    console.error("[Batch Processing Error]", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Example 5: Endpoint with detailed trace analysis
 * POST /api/validation/analyze
 */
router.post("/api/validation/analyze", async (req, res) => {
  try {
    const { providerData } = req.body;

    const result = await executeValidationWorkflow(providerData, {
      verbose: false,
    });

    if (result.success && result.executionTrace) {
      const trace = result.executionTrace;
      const executions = trace.detailedExecution;

      // Analyze execution
      const analysis = {
        nodeCount: executions.length,
        totalDuration: trace.executionSummary.totalDuration,
        nodeSequence: trace.executionSummary.nodeSequence,
        nodeTimings: executions.map((exec) => ({
          node: exec.nodeName,
          duration: exec.duration,
          percentage: (
            (exec.duration / trace.executionSummary.totalDuration) *
            100
          ).toFixed(2) + "%",
        })),
        slowestNode: executions.reduce((prev, current) =>
          prev.duration > current.duration ? prev : current
        ),
        fastestNode: executions.reduce((prev, current) =>
          prev.duration < current.duration ? prev : current
        ),
        errors: executions.filter((e) => e.error),
        executionOrder: executions.map((e) => e.nodeName),
      };

      return res.status(200).json({
        success: true,
        workflowId: result.state.workflowId,
        analysis,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("[Analysis Error]", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Example 6: Middleware to track API-level performance
 */
const traceMiddleware = (req, res, next) => {
  const startTime = Date.now();

  // Capture original send function
  const originalSend = res.send;

  // Override send to track response
  res.send = function (data) {
    const duration = Date.now() - startTime;

    // Log trace info
    console.log(`[API Trace] ${req.method} ${req.path}`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Status: ${res.statusCode}`);

    // Call original send
    originalSend.call(this, data);
  };

  next();
};

/**
 * Example 7: Error handling with trace information
 */
const errorHandler = (err, req, res, next) => {
  console.error("[API Error Handler]", {
    message: err.message,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    stack: err.stack,
  });

  res.status(500).json({
    error: "Internal Server Error",
    message: err.message,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Usage example for client
 *
 * // Basic execution
 * const response = await fetch('/api/validation/run', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     providerId: 'provider_123',
 *     providerData: {
 *       name: 'Dr. John Smith',
 *       npi: '1234567890',
 *       address: '123 Medical Plaza',
 *       state: 'CA'
 *     }
 *   })
 * });
 *
 * const result = await response.json();
 * console.log('Execution trace:', result.executionTrace);
 *
 * // Streaming execution
 * const eventSource = new EventSource('/api/validation/stream?providerId=123');
 * eventSource.onmessage = (event) => {
 *   const data = JSON.parse(event.data);
 *   console.log('Node executed:', data.nodeName);
 * };
 *
 * // Analysis
 * const analysisResponse = await fetch('/api/validation/analyze', {
 *   method: 'POST',
 *   body: JSON.stringify({ providerData: {...} })
 * });
 *
 * const analysis = await analysisResponse.json();
 * console.log('Slowest node:', analysis.analysis.slowestNode);
 */

export default router;
