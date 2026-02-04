# LangSmith Tracing Integration

This document explains how LangSmith tracing is integrated into the TrueLens validation workflow.

## Overview

LangSmith tracing has been implemented to track which nodes are visited in the workflow and the order in which they execute. This provides complete visibility into:

1. **Node Execution Order** - The exact sequence of nodes executed
2. **Execution Duration** - How long each node takes to execute
3. **Error Tracking** - Any errors that occur during node execution
4. **Workflow Metrics** - Total duration, node count, and execution summaries

## Features

### 1. Automatic Node Tracing

Each node in the workflow is automatically wrapped with tracing logic:

```javascript
graph.addNode("data_validation", createTracedNode("data_validation", dataValidationNode));
graph.addNode("information_enrichment", createTracedNode("information_enrichment", informationEnrichmentNode));
graph.addNode("quality_assurance", createTracedNode("quality_assurance", qualityAssuranceNode));
graph.addNode("directory_management", createTracedNode("directory_management", directoryManagementNode));
```

### 2. Node Execution Tracking

During workflow execution, each node records:
- Node name
- Execution timestamp
- Duration in milliseconds
- Execution order (sequential position)
- Any errors encountered

### 3. Execution Order State

A new `nodeExecutionOrder` field in the state tracks all executed nodes:

```javascript
nodeExecutionOrder: [
  {
    nodeName: "data_validation",
    timestamp: "2026-02-04T10:30:45.123Z",
    duration_ms: 1250,
    order: 1
  },
  {
    nodeName: "information_enrichment",
    timestamp: "2026-02-04T10:30:46.500Z",
    duration_ms: 2100,
    order: 2
  },
  // ... more nodes
]
```

## Configuration

### Environment Variables

To enable LangSmith integration, set these environment variables in your `.env` file:

```bash
# Required: LangSmith API Key
LANGSMITH_API_KEY=your_api_key_here

# Optional: LangSmith Project Name (default: "truelens-validation")
LANGSMITH_PROJECT=truelens-validation
```

To get your LangSmith API key:
1. Go to https://smith.langchain.com/
2. Sign up or log in
3. Navigate to your API keys
4. Copy your API key and add it to `.env`

### Without LangSmith

If you don't have a LangSmith API key, the workflow will still work normally:
- Node execution will still be tracked locally
- Console logs will show execution order
- The `nodeExecutionOrder` state field will be populated
- No remote tracing to LangSmith will occur

## Usage

### Basic Workflow Execution

```javascript
import { executeValidationWorkflow } from "./services/graph/workflow.js";

const result = await executeValidationWorkflow({
  name: "John Doe",
  npi: "1234567890",
  address: "123 Main St",
  phone: "555-0123",
  website: "https://example.com",
  specialty: "Internal Medicine",
  state: "CA"
}, {
  providerId: "provider_123",
  verbose: true
});

// Access execution trace
console.log(result.executionTrace);
```

### Execution Trace Output

The `executionTrace` returned includes:

```javascript
{
  workflowId: "wf_1707027045123_a1b2c3d4e5",
  providerId: "provider_123",
  exportedAt: "2026-02-04T10:30:50.000Z",
  executionSummary: {
    totalNodes: 4,
    totalDuration: 5680,
    nodeSequence: "data_validation -> information_enrichment -> quality_assurance -> directory_management"
  },
  detailedExecution: [
    {
      order: 1,
      nodeName: "data_validation",
      startTime: "2026-02-04T10:30:45.123Z",
      duration: 1250,
      durationFormatted: "1.25s",
      error: null
    },
    // ... more nodes
  ]
}
```

### Streaming Workflow

For real-time monitoring of workflow progress:

```javascript
import { streamValidationWorkflow } from "./services/graph/workflow.js";

await streamValidationWorkflow(
  inputData,
  (step) => {
    console.log(`Node: ${step.nodeName}`);
    console.log(`Execution Order: ${step.nodeExecutionOrder}`);
    console.log(`Timestamp: ${step.timestamp}`);
  },
  { providerId: "provider_123" }
);
```

## LangSmith Dashboard

When connected to LangSmith with a valid API key:

1. **View Traces**: See all workflow executions in the LangSmith dashboard
2. **Monitor Performance**: Track node execution times and identify bottlenecks
3. **Error Analysis**: Review any errors that occurred during execution
4. **Comparative Analysis**: Compare different runs to optimize performance

Visit: https://smith.langchain.com/

## Logs and Console Output

The workflow provides detailed console output during execution:

```
[LangSmith] Executing node: data_validation
[LangSmith] Node 'data_validation' completed in 1250ms

[LangSmith] Executing node: information_enrichment
[LangSmith] Node 'information_enrichment' completed in 2100ms

[LangSmith] Workflow Execution Order Summary:
============================================================
1. data_validation (1250ms) - 2026-02-04T10:30:45.123Z
2. information_enrichment (2100ms) - 2026-02-04T10:30:46.500Z
3. quality_assurance (1800ms) - 2026-02-04T10:30:48.700Z
4. directory_management (530ms) - 2026-02-04T10:30:49.230Z
============================================================

[LangSmith] Workflow Completion Summary: {
  workflow_id: 'wf_1707027045123_a1b2c3d4e5',
  provider_id: 'provider_123',
  success: true,
  error: null,
  total_duration_ms: 5680,
  node_count: 4,
  node_sequence: 'data_validation -> information_enrichment -> quality_assurance -> directory_management',
  timestamp: '2026-02-04T10:30:50.000Z'
}
```

## Error Handling

If a node encounters an error:

1. The error is logged to the console
2. The error is recorded in the `nodeExecutionOrder` with an error field
3. The error is also added to the workflow's `errorLog` state field
4. The workflow continues (if error handling allows) or terminates gracefully

Example error entry:

```javascript
{
  nodeName: "data_validation",
  timestamp: "2026-02-04T10:30:45.123Z",
  duration_ms: 250,
  order: 1,
  error: "NPI validation failed: Invalid NPI format"
}
```

## Integration Points

### 1. Core Utilities

Located in `services/tools/langsmithClient.js`:

- `initLangSmith()` - Initialize LangSmith client
- `getLangSmithClient()` - Get current LangSmith client instance
- `logNodeExecution()` - Log individual node execution
- `logWorkflowCompletion()` - Log workflow completion summary
- `exportExecutionTrace()` - Export formatted execution trace

### 2. Workflow Functions

In `services/graph/workflow.js`:

- `createValidationWorkflow()` - Creates graph with tracing
- `executeValidationWorkflow()` - Execute with full trace export
- `streamValidationWorkflow()` - Stream with execution order updates

## Performance Considerations

1. **Minimal Overhead**: Tracing adds minimal performance overhead
2. **Async Logging**: LangSmith logging is async and doesn't block execution
3. **Local Tracking**: Node execution order is always tracked locally, even without LangSmith

## Troubleshooting

### Tracing Not Working

Check if `LANGSMITH_API_KEY` is set:
```bash
echo $LANGSMITH_API_KEY
```

### Missing Execution Trace

If `executionTrace` is null in the result:
- Verify workflow completed successfully
- Check console logs for errors
- Ensure `nodeExecutionOrder` is properly initialized

### API Key Issues

If you see "LANGSMITH_API_KEY not set" message:
1. Create a `.env` file in the backend directory
2. Add your API key: `LANGSMITH_API_KEY=your_key_here`
3. Restart the application

## Best Practices

1. **Always Check Success Flag**: Check `result.success` before relying on trace data
2. **Use Verbose Mode**: Set `verbose: true` in development for detailed logs
3. **Monitor Dashboard**: Regularly check LangSmith dashboard for performance insights
4. **Store Traces**: Save `executionTrace` for audit and analysis purposes
5. **Set Meaningful Project Names**: Use descriptive project names for organization

## Future Enhancements

Planned improvements:

1. **Custom Metrics**: Add custom metrics logging for specific node operations
2. **Feedback Integration**: Log user feedback linked to specific workflows
3. **A/B Testing**: Compare different workflow variations
4. **Alerts**: Set up alerts for slow nodes or failures
5. **Analytics Dashboard**: Build custom analytics from trace data
