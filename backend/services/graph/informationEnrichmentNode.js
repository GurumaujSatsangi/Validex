/**
 * Information Enrichment Node
 * LangGraph node that enriches provider data with additional sources
 * - Calls Azure Maps POI for business listings
 * - Scrapes TrueLens website for license info
 * - Scrapes NPI certifications
 * - Performs web scraping on provider website
 * All results written to state, no local variables
 */

import { getNpiDataByNpiId, searchNpiByName } from "../tools/npiClient.js";
import { scrapeTrueLensWebsite } from "../tools/trueLensWebsiteScraper.js";
import { scrapeProviderInfo } from "../tools/webScraper.js";

export async function informationEnrichmentNode(state) {
  console.log("[InfoEnrichment] Starting enrichment for provider:", state.providerId);

  const input = state.normalizedData || state.inputData || {};
  const validationSources = [...(state.validationSources || [])];
  const errorLog = [...(state.errorLog || [])];
  const externalResults = { ...(state.externalResults || {}) };

  // NPI verification
  try {
    let npiData = null;
    if (input.npi) {
      npiData = await getNpiDataByNpiId(input.npi);
    } else if (input.name) {
      npiData = await searchNpiByName({
        name: input.name,
        city: input.city,
        state: input.state,
      });
    }

    if (npiData && npiData.isFound) {
      externalResults.npi = { success: true, data: npiData, error: null };
      validationSources.push({ source: "NPI_API", success: true, timestamp: new Date().toISOString() });
    } else {
      externalResults.npi = { success: false, data: npiData || null, error: "NPI_NOT_FOUND" };
      validationSources.push({ source: "NPI_API", success: false, error: "NPI_NOT_FOUND" });
    }
  } catch (error) {
    externalResults.npi = { success: false, data: null, error: error.message };
    validationSources.push({ source: "NPI_API", success: false, error: error.message });
    errorLog.push({ stage: "information_enrichment", source: "NPI_API", error: error.message, timestamp: new Date().toISOString() });
  }

  // License registry (via TrueLens website data)
  try {
    const trueLensData = await scrapeTrueLensWebsite(input.name);

    if (trueLensData && trueLensData.isFound) {
      const licenseStatus = trueLensData.data?.license_status || trueLensData.data?.licenseStatus || null;
      const licenseNumber = trueLensData.data?.license_number || trueLensData.data?.licenseNumber || null;
      externalResults.license = {
        success: !!licenseStatus,
        data: {
          licenseStatus,
          licenseNumber,
          raw: trueLensData,
        },
        error: licenseStatus ? null : "LICENSE_NOT_FOUND",
      };
      validationSources.push({ source: "LICENSE_REGISTRY", success: !!licenseStatus, timestamp: new Date().toISOString() });
    } else {
      externalResults.license = { success: false, data: null, error: "LICENSE_NOT_FOUND" };
      validationSources.push({ source: "LICENSE_REGISTRY", success: false, error: "LICENSE_NOT_FOUND" });
    }
  } catch (error) {
    externalResults.license = { success: false, data: null, error: error.message };
    validationSources.push({ source: "LICENSE_REGISTRY", success: false, error: error.message });
    errorLog.push({ stage: "information_enrichment", source: "LICENSE_REGISTRY", error: error.message, timestamp: new Date().toISOString() });
  }

  // Website scraping (provider website)
  try {
    if (input.website) {
      const scrapedData = await scrapeProviderInfo({
        name: input.name,
        website: input.website,
      });

      if (scrapedData && scrapedData.isFound) {
        externalResults.website = { success: true, data: scrapedData, error: null };
        validationSources.push({ source: "WEBSITE", success: true, timestamp: new Date().toISOString() });
      } else {
        externalResults.website = { success: false, data: scrapedData || null, error: "WEBSITE_NOT_FOUND" };
        validationSources.push({ source: "WEBSITE", success: false, error: "WEBSITE_NOT_FOUND" });
      }
    } else {
      externalResults.website = { success: false, data: null, error: "WEBSITE_NOT_PROVIDED" };
      validationSources.push({ source: "WEBSITE", success: false, error: "WEBSITE_NOT_PROVIDED" });
    }
  } catch (error) {
    externalResults.website = { success: false, data: null, error: error.message };
    validationSources.push({ source: "WEBSITE", success: false, error: error.message });
    errorLog.push({ stage: "information_enrichment", source: "WEBSITE", error: error.message, timestamp: new Date().toISOString() });
  }

  return {
    ...state,
    externalResults,
    validationSources,
    errorLog,
    workflowStatus: "IN_PROGRESS",
  };
}
