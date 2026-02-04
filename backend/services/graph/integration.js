/**
 * Integration Guide: Connecting LangGraph Workflow to TrueLens Backend
 * 
 * This file demonstrates how to integrate the LangGraph validation workflow
 * into the existing TrueLens backend routes and services.
 */

import express from "express";
import { executeValidationWorkflow } from "./workflow.js";

/**
 * Integration Point 1: Add to existing validation routes
 * 
 * Location: routes/validationRuns.js
 * 
 * Usage:
 * POST /api/validation-runs/workflow
 * Content-Type: application/json
 * 
 * Body:
 * {
 *   "providerId": "provider_123",
 *   "providerData": {
 *     "name": "Dr. Name",
 *     "npi": "1234567890",
 *     "address": "123 Main St",
 *     "phone": "+1-555-0100",
 *     "website": "https://example.com",
 *     "specialty": "Cardiology",
 *     "state": "NY"
 *   }
 * }
 */
export async function createValidationRunWorkflow(req, res) {
  try {
    const { providerId, providerData } = req.body;

    // Validate input
    if (!providerData || !providerData.name) {
      return res.status(400).json({
        error: "Missing required provider data",
      });
    }

    // Execute workflow
    const result = await executeValidationWorkflow(providerData, {
      providerId: providerId || `provider_${Date.now()}`,
      verbose: false,
    });

    if (!result.success) {
      return res.status(500).json({
        error: "Workflow execution failed",
        details: result.error,
      });
    }

    const state = result.state;

    // Create validation run record in Supabase
    const { data: validationRun, error: runError } = await supabase
      .from("validation_runs")
      .insert({
        provider_id: state.providerId,
        workflow_id: state.workflowId,
        status: state.workflowStatus,
        directory_status: state.directoryStatus,
        confidence_score: state.overallConfidenceScore,
        needs_review: state.needsHumanReview,
        review_severity: state.reviewSeverity,
        started_at: state.startTime,
        completed_at: state.endTime,
        execution_time_ms: result.executionTime,
      })
      .select();

    if (runError) {
      console.error("Failed to store validation run:", runError);
      return res.status(500).json({
        error: "Failed to store validation run",
      });
    }

    // Create directory entry if auto-published
    if (state.directoryStatus === "PUBLISHED" && state.webDirectoryEntry) {
      const { error: entryError } = await supabase
        .from("directory_entries")
        .insert({
          provider_id: state.providerId,
          validation_run_id: validationRun[0].id,
          name: state.webDirectoryEntry.name,
          npi: state.webDirectoryEntry.npi,
          specialty: state.webDirectoryEntry.specialties[0],
          address: state.webDirectoryEntry.address,
          phone: state.webDirectoryEntry.phone,
          website: state.webDirectoryEntry.website,
          confidence: state.webDirectoryEntry.confidence,
          verified_level: state.webDirectoryEntry.verificationLevel,
          latitude: state.geoCoordinates?.latitude,
          longitude: state.geoCoordinates?.longitude,
          published_at: new Date().toISOString(),
        });

      if (entryError) {
        console.error("Failed to store directory entry:", entryError);
      }
    }

    // Create review tasks if needed
    if (state.needsHumanReview && state.reviewerTasks.length > 0) {
      const reviewTasksData = state.reviewerTasks.map((task) => ({
        validation_run_id: validationRun[0].id,
        provider_id: state.providerId,
        task_type: task.reviewType,
        priority: task.priority,
        priority_score: task.priorityScore,
        due_date: task.dueDate,
        review_reasons: task.reviewReasons,
        conflicting_data: task.conflictingData,
        suggested_actions: task.suggestedActions,
        status: task.status,
        created_at: new Date().toISOString(),
      }));

      const { error: taskError } = await supabase
        .from("review_tasks")
        .insert(reviewTasksData);

      if (taskError) {
        console.error("Failed to create review tasks:", taskError);
      }
    }

    // Create validation report
    if (state.validationReports.length > 0) {
      const report = state.validationReports[0];
      const { error: reportError } = await supabase
        .from("validation_reports")
        .insert({
          validation_run_id: validationRun[0].id,
          provider_id: state.providerId,
          report_data: report, // Store full report as JSON
          confidence_scores: state.fieldConfidenceScores,
          anomalies: state.anomalyDetection,
          created_at: new Date().toISOString(),
        });

      if (reportError) {
        console.error("Failed to store validation report:", reportError);
      }
    }

    // Return response
    res.json({
      success: true,
      validationRun: validationRun[0],
      workflowState: {
        workflowId: state.workflowId,
        status: state.workflowStatus,
        directoryStatus: state.directoryStatus,
        confidenceScore: state.overallConfidenceScore,
        needsReview: state.needsHumanReview,
        reviewSeverity: state.reviewSeverity,
        executionTime: result.executionTime,
      },
      summary: {
        validatedFields: state.validatedFields.length,
        discrepancies: state.validationDiscrepancies.length,
        servicesEnriched: state.enrichedProviderProfile.services.length,
        anomaliesDetected: state.anomalyDetection.isDetected,
      },
    });
  } catch (error) {
    console.error("Validation workflow error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
}

/**
 * Integration Point 2: Add to provider validation service
 * 
 * Location: services/validationService.js
 * 
 * Usage:
 * const validationService = new ValidationService();
 * const result = await validationService.validateProviderWorkflow(providerData);
 */
export class ValidatorServiceWorkflowIntegration {
  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * Validate provider using LangGraph workflow
   */
  async validateProviderWorkflow(providerData) {
    try {
      const result = await executeValidationWorkflow(providerData, {
        providerId: `provider_${providerData.npi || Date.now()}`,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return {
        success: true,
        state: result.state,
        summary: this.extractSummary(result.state),
      };
    } catch (error) {
      console.error("Provider validation workflow failed:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Extract summary from workflow state
   */
  extractSummary(state) {
    return {
      providerId: state.providerId,
      workflowId: state.workflowId,
      confidenceScore: state.overallConfidenceScore,
      directoryStatus: state.directoryStatus,
      needsReview: state.needsHumanReview,
      reviewSeverity: state.reviewSeverity,
      validationSources: state.validationSources.map((s) => s.source),
      discrepancies: state.validationDiscrepancies.length,
      services: state.enrichedProviderProfile.services,
      education: {
        school: state.educationDetails?.medicalSchool,
        certifications:
          state.educationDetails?.boardCertifications.length || 0,
      },
      location: {
        latitude: state.geoCoordinates?.latitude,
        longitude: state.geoCoordinates?.longitude,
      },
    };
  }

  /**
   * Publish validated provider
   */
  async publishValidatedProvider(workflowState) {
    if (!workflowState.webDirectoryEntry) {
      throw new Error("No directory entry to publish");
    }

    const { error } = await this.supabase.from("directory_entries").insert({
      provider_id: workflowState.providerId,
      name: workflowState.webDirectoryEntry.name,
      npi: workflowState.webDirectoryEntry.npi,
      specialty: workflowState.webDirectoryEntry.specialties[0],
      address: workflowState.webDirectoryEntry.address,
      phone: workflowState.webDirectoryEntry.phone,
      website: workflowState.webDirectoryEntry.website,
      confidence: workflowState.webDirectoryEntry.confidence,
      published_at: new Date().toISOString(),
    });

    if (error) {
      throw error;
    }

    return { success: true };
  }
}

/**
 * Integration Point 3: Add to upload processing pipeline
 * 
 * Location: routes/uploadPdf.js
 * 
 * Usage: After PDF/CSV parsing and OCR extraction,
 * pass the extracted provider data to the workflow
 */
export async function processUploadedProviderWithWorkflow(
  extractedData,
  fileMetadata
) {
  try {
    // extractedData is the result of PDF/OCR parsing
    const providerData = {
      name: extractedData.provider_name,
      npi: extractedData.npi,
      address: extractedData.address,
      phone: extractedData.phone,
      website: extractedData.website,
      specialty: extractedData.specialty,
      state: extractedData.state,
    };

    // Execute validation workflow
    const result = await executeValidationWorkflow(providerData, {
      providerId: fileMetadata.providerId,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    const state = result.state;

    // Store validation result with file metadata
    const { data, error } = await supabase.from("upload_validations").insert({
      file_id: fileMetadata.fileId,
      file_name: fileMetadata.fileName,
      provider_id: state.providerId,
      workflow_id: state.workflowId,
      source_type: "PDF_UPLOAD",
      validation_status: state.directoryStatus,
      confidence_score: state.overallConfidenceScore,
      extracted_data: extractedData,
      workflow_state_summary: {
        discrepancies: state.validationDiscrepancies,
        anomalies: state.anomalyDetection,
        needs_review: state.needsHumanReview,
      },
      processed_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Failed to store upload validation:", error);
    }

    return {
      success: true,
      validationResult: data?.[0] || {},
      workflowState: {
        status: state.directoryStatus,
        confidence: state.overallConfidenceScore,
      },
    };
  } catch (error) {
    console.error("Upload processing error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Integration Point 4: Batch validation route
 * 
 * Location: routes/validationRuns.js
 * 
 * Usage:
 * POST /api/validation-runs/batch
 * Content-Type: application/json
 * 
 * Body:
 * {
 *   "providers": [
 *     { "name": "Dr. A", "npi": "111", ... },
 *     { "name": "Dr. B", "npi": "222", ... }
 *   ]
 * }
 */
export async function batchValidateProviders(req, res) {
  try {
    const { providers } = req.body;

    if (!Array.isArray(providers) || providers.length === 0) {
      return res.status(400).json({
        error: "Invalid providers array",
      });
    }

    const results = [];
    const startTime = Date.now();

    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i];

      try {
        const result = await executeValidationWorkflow(provider, {
          providerId: `batch_${i}_${provider.npi}`,
          verbose: false,
        });

        results.push({
          index: i,
          providerName: provider.name,
          npi: provider.npi,
          success: result.success,
          status: result.state?.directoryStatus,
          confidence: result.state?.overallConfidenceScore,
          needsReview: result.state?.needsHumanReview,
          error: result.error || null,
        });
      } catch (error) {
        results.push({
          index: i,
          providerName: provider.name,
          npi: provider.npi,
          success: false,
          error: error.message,
        });
      }
    }

    const totalTime = Date.now() - startTime;
    const successCount = results.filter((r) => r.success).length;
    const reviewCount = results.filter((r) => r.needsReview).length;

    res.json({
      success: true,
      summary: {
        totalProviders: providers.length,
        successful: successCount,
        failed: providers.length - successCount,
        needsReview: reviewCount,
        averageTimePerProvider:
          Math.round(totalTime / providers.length),
        totalTime,
      },
      results,
    });
  } catch (error) {
    console.error("Batch validation error:", error);
    res.status(500).json({
      error: "Batch validation failed",
      message: error.message,
    });
  }
}

/**
 * Integration Point 5: WebSocket streaming for real-time updates
 * 
 * Location: Setup in main server file or separate WebSocket handler
 * 
 * Usage:
 * const ws = new WebSocket('ws://localhost:5000/validate-stream');
 * ws.send(JSON.stringify({ providerId: 'prov_123', providerData: {...} }));
 */
export function setupValidationWebSocket(io) {
  io.on("connection", (socket) => {
    socket.on("validate-provider", async (data) => {
      const { providerId, providerData } = data;

      try {
        // Stream validation steps in real-time
        await streamValidationWorkflow(
          providerData,
          (stepInfo) => {
            socket.emit("validation-step", {
              providerId,
              step: stepInfo.nodeName,
              timestamp: stepInfo.timestamp,
            });
          },
          { providerId }
        );

        socket.emit("validation-complete", {
          providerId,
          message: "Validation workflow completed",
        });
      } catch (error) {
        socket.emit("validation-error", {
          providerId,
          error: error.message,
        });
      }
    });
  });
}

/**
 * Database Schema Extensions for Supabase
 * 
 * Run these migrations to add workflow support:
 * 
 * -- Validation runs table
 * CREATE TABLE validation_runs (
 *   id BIGSERIAL PRIMARY KEY,
 *   provider_id VARCHAR NOT NULL,
 *   workflow_id VARCHAR UNIQUE NOT NULL,
 *   status VARCHAR NOT NULL,
 *   directory_status VARCHAR,
 *   confidence_score NUMERIC,
 *   needs_review BOOLEAN,
 *   review_severity VARCHAR,
 *   started_at TIMESTAMP,
 *   completed_at TIMESTAMP,
 *   execution_time_ms INTEGER,
 *   created_at TIMESTAMP DEFAULT NOW()
 * );
 * 
 * -- Directory entries table
 * CREATE TABLE directory_entries (
 *   id BIGSERIAL PRIMARY KEY,
 *   provider_id VARCHAR NOT NULL,
 *   validation_run_id BIGINT REFERENCES validation_runs(id),
 *   name VARCHAR NOT NULL,
 *   npi VARCHAR,
 *   specialty VARCHAR,
 *   address VARCHAR,
 *   phone VARCHAR,
 *   website VARCHAR,
 *   confidence NUMERIC,
 *   verified_level VARCHAR,
 *   latitude NUMERIC,
 *   longitude NUMERIC,
 *   published_at TIMESTAMP,
 *   created_at TIMESTAMP DEFAULT NOW()
 * );
 * 
 * -- Review tasks table
 * CREATE TABLE review_tasks (
 *   id BIGSERIAL PRIMARY KEY,
 *   validation_run_id BIGINT REFERENCES validation_runs(id),
 *   provider_id VARCHAR NOT NULL,
 *   task_type VARCHAR,
 *   priority VARCHAR,
 *   priority_score INTEGER,
 *   due_date TIMESTAMP,
 *   review_reasons JSONB,
 *   conflicting_data JSONB,
 *   suggested_actions JSONB,
 *   status VARCHAR DEFAULT 'PENDING',
 *   assigned_to VARCHAR,
 *   created_at TIMESTAMP DEFAULT NOW(),
 *   updated_at TIMESTAMP DEFAULT NOW()
 * );
 * 
 * -- Validation reports table
 * CREATE TABLE validation_reports (
 *   id BIGSERIAL PRIMARY KEY,
 *   validation_run_id BIGINT REFERENCES validation_runs(id),
 *   provider_id VARCHAR NOT NULL,
 *   report_data JSONB,
 *   confidence_scores JSONB,
 *   anomalies JSONB,
 *   created_at TIMESTAMP DEFAULT NOW()
 * );
 * 
 * -- Upload validations table (for tracking batch uploads)
 * CREATE TABLE upload_validations (
 *   id BIGSERIAL PRIMARY KEY,
 *   file_id VARCHAR NOT NULL,
 *   file_name VARCHAR,
 *   provider_id VARCHAR NOT NULL,
 *   workflow_id VARCHAR,
 *   source_type VARCHAR,
 *   validation_status VARCHAR,
 *   confidence_score NUMERIC,
 *   extracted_data JSONB,
 *   workflow_state_summary JSONB,
 *   processed_at TIMESTAMP DEFAULT NOW(),
 *   created_at TIMESTAMP DEFAULT NOW()
 * );
 * 
 * -- Create indexes for performance
 * CREATE INDEX idx_validation_runs_provider ON validation_runs(provider_id);
 * CREATE INDEX idx_validation_runs_status ON validation_runs(status);
 * CREATE INDEX idx_directory_entries_provider ON directory_entries(provider_id);
 * CREATE INDEX idx_review_tasks_status ON review_tasks(status);
 * CREATE INDEX idx_upload_validations_file ON upload_validations(file_id);
 */

export default {
  createValidationRunWorkflow,
  ValidatorServiceWorkflowIntegration,
  processUploadedProviderWithWorkflow,
  batchValidateProviders,
  setupValidationWebSocket,
};
