/**
 * Data Validation Node
 * Verifies correctness of provider data using NPI Registry, state licensing, 
 * website scraping, and phone verification
 */

import { normalizePhone, validatePhoneFormat } from "../tools/phoneUtils.js";
import {
  extractZip,
  extractCity,
  normalizeAddressComponent,
  normalizeText,
  validateAddressFormat,
  validateState,
} from "../tools/addressUtils.js";

/**
 * Validate NPI format (local check only)
 */
async function validateNPI(state) {
  try {
    if (!state.inputData.npi) {
      return {
        success: false,
        error: "NPI not provided",
        data: null,
      };
    }

    const npi = String(state.inputData.npi).trim();
    const formatValid = /^\d{10}$/.test(npi);

    return {
      success: formatValid,
      data: { npi },
      validation: {
        npiFormatValid: formatValid,
      },
      error: formatValid ? null : "INVALID_NPI_FORMAT",
    };
  } catch (error) {
    console.error("NPI validation error:", error.message);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
}



/**
 * Main Data Validation Agent Node
 * Orchestrates all validation steps and aggregates results
 */
export async function dataValidationNode(state) {
  console.log(`[DataValidation] Processing provider: ${state.providerId}`);

  try {
    const input = state.inputData || {};
    const validationDiscrepancies = [...(state.validationDiscrepancies || [])];
    const validationSources = [...(state.validationSources || [])];

    const missingFields = [];
    const malformedFields = [];
    const requiredFields = {};

    const requiredList = ["name", "address", "phone", "state"];
    for (const field of requiredList) {
      const value = input[field];
      const present = value !== undefined && value !== null && String(value).trim().length > 0;
      requiredFields[field] = { present, valid: present };
      if (!present) {
        missingFields.push(field);
        validationDiscrepancies.push({
          field,
          issue: "MISSING_REQUIRED_FIELD",
          severity: "HIGH",
          sourceType: "INPUT_VALIDATION",
          confidence: 0.6,
        });
      }
    }

    const normalizedPhone = input.phone ? normalizePhone(input.phone) : null;
    const phoneValid = normalizedPhone ? validatePhoneFormat(normalizedPhone) : false;
    if (input.phone && !phoneValid) {
      malformedFields.push({ field: "phone", reason: "INVALID_PHONE_FORMAT" });
      validationDiscrepancies.push({
        field: "phone",
        issue: "INVALID_PHONE_FORMAT",
        severity: "HIGH",
        sourceType: "INPUT_VALIDATION",
        suggestedValue: normalizedPhone || null,
        confidence: 0.65,
      });
    }

    const addressValidation = input.address ? validateAddressFormat(input.address) : { isValid: false, components: {} };
    if (input.address && !addressValidation.isValid) {
      malformedFields.push({ field: "address", reason: "INVALID_ADDRESS_FORMAT" });
      validationDiscrepancies.push({
        field: "address",
        issue: "INVALID_ADDRESS_FORMAT",
        severity: "HIGH",
        sourceType: "INPUT_VALIDATION",
        confidence: 0.6,
      });
    }

    const stateValidation = input.state ? validateState(input.state) : { isValid: false, code: null };
    if (input.state && !stateValidation.isValid) {
      malformedFields.push({ field: "state", reason: "INVALID_STATE" });
      validationDiscrepancies.push({
        field: "state",
        issue: "INVALID_STATE",
        severity: "HIGH",
        sourceType: "INPUT_VALIDATION",
        suggestedValue: stateValidation.code || null,
        confidence: 0.7,
      });
    }

    const npiResult = await validateNPI(state);
    if (!npiResult.success && npiResult.error === "INVALID_NPI_FORMAT") {
      malformedFields.push({ field: "npi", reason: "INVALID_NPI_FORMAT" });
      validationDiscrepancies.push({
        field: "npi",
        issue: "INVALID_NPI_FORMAT",
        severity: "MEDIUM",
        sourceType: "INPUT_VALIDATION",
        confidence: 0.6,
      });
    }

    const normalizedData = {
      name: input.name ? normalizeText(input.name) : null,
      npi: input.npi ? String(input.npi).trim() : null,
      address: input.address ? normalizeAddressComponent(input.address) : null,
      phone: normalizedPhone || null,
      website: input.website ? String(input.website).trim() : null,
      specialty: input.specialty ? normalizeText(input.specialty) : null,
      state: stateValidation.code || (input.state ? input.state.toUpperCase() : null),
      city: input.city || extractCity(input.address),
      zip: input.zip || extractZip(input.address),
    };

    const hardReject = missingFields.length > 0 || malformedFields.some(f => ["address", "state"].includes(f.field));

    validationSources.push({
      source: "INPUT_VALIDATION",
      success: missingFields.length === 0 && malformedFields.length === 0,
      errors: [...missingFields, ...malformedFields.map(m => `${m.field}:${m.reason}`)],
      timestamp: new Date().toISOString(),
    });

    return {
      ...state,
      normalizedData,
      validationResults: {
        requiredFields,
        missingFields,
        malformedFields,
        hardReject,
      },
      validationDiscrepancies,
      validationSources,
      externalResults: {
        ...(state.externalResults || {}),
        phone: {
          success: phoneValid,
          data: normalizedPhone ? { normalizedPhone } : null,
          error: phoneValid ? null : "INVALID_PHONE_FORMAT",
        },
        npi: {
          success: npiResult.success,
          data: npiResult.data || null,
          error: npiResult.error || null,
        },
      },
      workflowStatus: "IN_PROGRESS",
    };
  } catch (error) {
    console.error("[DataValidation] Error:", error.message);

    return {
      ...state,
      errorLog: [
        ...(state.errorLog || []),
        {
          stage: "data_validation",
          error: error.message,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}
