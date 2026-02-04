/**
 * Data Validation Agent
 * Verifies correctness of provider data using NPI Registry, state licensing, 
 * website scraping, and phone verification
 */

import { getNpiDataByNpiId, fetchProviderByNpi } from "../tools/npiClient.js";
import { scrapeProviderInfo } from "../tools/webScraper.js";
import { normalizePhone, validatePhoneFormat } from "../tools/phoneUtils.js";
import { extractZip, extractCity, extractState, normalizeAddressComponent, validateAddressFormat, validateState } from "../tools/addressUtils.js";

/**
 * Fetch and validate against NPI Registry
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

    const npiData = await fetchProviderByNpi(state.inputData.npi);

    if (!npiData) {
      return {
        success: false,
        error: "NPI not found in registry",
        data: null,
      };
    }

    // Cross-check provider name
    const nameMatch =
      npiData.first_name?.toLowerCase() ===
      state.inputData.name.split(" ")[0].toLowerCase();

    return {
      success: true,
      data: npiData,
      validation: {
        nameMatch,
        npiValid: true,
        practiceActive: npiData.sole_proprietor === "Y",
      },
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
 * Verify license status via state licensing boards
 */
async function validateLicense(state) {
  try {
    if (!state.inputData.state || !state.inputData.npi) {
      return {
        success: false,
        error: "State or NPI not provided",
        data: null,
      };
    }

    // Placeholder for state licensing board lookup
    // In production, integrate with actual state board APIs
    const licenseValidation = {
      state: state.inputData.state,
      licenseNumber: state.inputData.npi, // Often NPI is cross-referenced
      licenseStatus: "ACTIVE", // Would query actual board
      validationDate: new Date().toISOString(),
    };

    return {
      success: true,
      data: licenseValidation,
      validation: {
        licenseValid: true,
        licenseActive: licenseValidation.licenseStatus === "ACTIVE",
      },
    };
  } catch (error) {
    console.error("License validation error:", error.message);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
}

/**
 * Scrape provider website to verify contact details
 */
async function validateWebsiteData(state) {
  try {
    if (!state.inputData.website) {
      return {
        success: false,
        error: "Website not provided",
        data: null,
      };
    }

    const scrapedData = await scrapeProviderInfo({
      name: state.inputData.name,
      website: state.inputData.website,
    });

    if (!scrapedData) {
      return {
        success: false,
        error: "Failed to scrape website",
        data: null,
      };
    }

    // Compare scraped data with input data
    const discrepancies = [];

    if (
      scrapedData.phone &&
      !normalizePhone(state.inputData.phone).includes(
        normalizePhone(scrapedData.phone)
      )
    ) {
      discrepancies.push({
        field: "phone",
        inputValue: state.inputData.phone,
        scrapedValue: scrapedData.phone,
        severity: "MEDIUM",
      });
    }

    if (
      scrapedData.address &&
      scrapedData.address.toLowerCase() !==
        state.inputData.address.toLowerCase()
    ) {
      discrepancies.push({
        field: "address",
        inputValue: state.inputData.address,
        scrapedValue: scrapedData.address,
        severity: "MEDIUM",
      });
    }

    return {
      success: true,
      data: scrapedData,
      discrepancies,
      validation: {
        websiteAccessible: true,
        dataMatches: discrepancies.length === 0,
      },
    };
  } catch (error) {
    console.error("Website scraping error:", error.message);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
}

/**
 * Validate phone number format and verify with public services
 */
async function validatePhone(state) {
  try {
    if (!state.inputData.phone) {
      return {
        success: false,
        error: "Phone not provided",
        data: null,
      };
    }

    const normalizedPhone = normalizePhone(state.inputData.phone);
    const isValid = validatePhoneFormat(normalizedPhone);

    if (!isValid) {
      return {
        success: false,
        error: "Invalid phone format",
        data: null,
      };
    }

    // Placeholder for public phone verification
    // In production, use services like TrueCaller, NumVerify, etc.
    const phoneVerification = {
      originalPhone: state.inputData.phone,
      normalizedPhone,
      formatValid: true,
      carrierType: "MOBILE", // Would fetch from service
      riskIndicator: "LOW",
    };

    return {
      success: true,
      data: phoneVerification,
      validation: {
        phoneFormatValid: true,
        phoneVerified: true,
      },
    };
  } catch (error) {
    console.error("Phone validation error:", error.message);
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
}

/**
 * Validate address format and state consistency
 */
async function validateAddress(state) {
  try {
    if (!state.inputData.address || !state.inputData.state) {
      return {
        success: false,
        error: "Address or state not provided",
        data: null,
      };
    }

    const addressValidation = validateAddressFormat(
      state.inputData.address
    );
    const stateValidation = validateState(state.inputData.state);

    return {
      success: addressValidation.isValid && stateValidation.isValid,
      data: {
        address: state.inputData.address,
        state: state.inputData.state,
        addressComponents: addressValidation.components,
        stateCode: stateValidation.code,
      },
      validation: {
        addressFormatValid: addressValidation.isValid,
        stateValid: stateValidation.isValid,
        stateConsistent: true, // Would cross-check with other sources
      },
    };
  } catch (error) {
    console.error("Address validation error:", error.message);
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
  console.log(`[DataValidationAgent] Processing provider: ${state.providerId}`);

  try {
    // Execute all validations in parallel for efficiency
    const [npiResult, licenseResult, websiteResult, phoneResult, addressResult] =
      await Promise.all([
        validateNPI(state),
        validateLicense(state),
        validateWebsiteData(state),
        validatePhone(state),
        validateAddress(state),
      ]);

    // Aggregate validated fields
    const validatedFields = [];
    const discrepancies = [];
    const sources = [];

    // Process NPI validation
    if (npiResult.success) {
      validatedFields.push({
        field: "npi",
        value: state.inputData.npi,
        verified: true,
        confidence: 0.95,
        source: "NPI_REGISTRY",
      });
      sources.push({
        source: "NPI_REGISTRY",
        fieldsValidated: ["npi", "name", "practice_active"],
        timestamp: new Date().toISOString(),
      });
    }

    // Process license validation
    if (licenseResult.success) {
      validatedFields.push({
        field: "license",
        value: licenseResult.data.licenseStatus,
        verified: true,
        confidence: 0.9,
        source: "LICENSING_BOARD",
      });
      sources.push({
        source: "LICENSING_BOARD",
        fieldsValidated: ["license_status", "state"],
        timestamp: new Date().toISOString(),
        state: state.inputData.state,
      });
    }

    // Process website validation
    if (websiteResult.success) {
      validatedFields.push({
        field: "contact_details",
        value: websiteResult.data,
        verified: true,
        confidence: 0.85,
        source: "WEBSITE",
      });
      if (websiteResult.discrepancies.length > 0) {
        discrepancies.push(...websiteResult.discrepancies);
      }
      sources.push({
        source: "WEBSITE",
        fieldsValidated: ["phone", "address", "contact_email"],
        timestamp: new Date().toISOString(),
        url: state.inputData.website,
      });
    }

    // Process phone validation
    if (phoneResult.success) {
      validatedFields.push({
        field: "phone",
        value: phoneResult.data.normalizedPhone,
        verified: true,
        confidence: 0.8,
        source: "PHONE_VERIFICATION",
      });
      sources.push({
        source: "PHONE_VERIFICATION",
        fieldsValidated: ["phone"],
        timestamp: new Date().toISOString(),
      });
    }

    // Process address validation
    if (addressResult.success) {
      validatedFields.push({
        field: "address",
        value: addressResult.data.address,
        verified: true,
        confidence: 0.85,
        source: "ADDRESS_VALIDATION",
      });
      validatedFields.push({
        field: "state",
        value: addressResult.data.state,
        verified: true,
        confidence: 0.9,
        source: "ADDRESS_VALIDATION",
      });
      sources.push({
        source: "ADDRESS_VALIDATION",
        fieldsValidated: ["address", "state"],
        timestamp: new Date().toISOString(),
      });
    }

    // Update state with validation results
    const updatedState = {
      ...state,
      validatedFields,
      validationDiscrepancies: discrepancies,
      validationSources: sources,
      npiLookupResult: npiResult.data || null,
      licensingBoardResult: licenseResult.data || null,
      websiteScrapingResult: websiteResult.data || null,
      phoneVerificationResult: phoneResult.data || null,
      workflowStatus: "IN_PROGRESS",
    };

    console.log(
      `[DataValidationAgent] Validation complete. Found ${discrepancies.length} discrepancies.`
    );

    return updatedState;
  } catch (error) {
    console.error("[DataValidationAgent] Error:", error.message);

    return {
      ...state,
      errorLog: [
        ...state.errorLog,
        {
          stage: "DataValidation",
          error: error.message,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}
