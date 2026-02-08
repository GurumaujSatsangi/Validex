/**
 * Information Enrichment Node
 * LangGraph node that enriches provider data with additional sources
 * - Calls Azure Maps POI for business listings
 * - Scrapes TrueLens website for license info
 * - Scrapes NPI certifications
 * - Performs web scraping on provider website
 * All results written to state, no local variables
 */

import { getNpiDataByNpiId, searchNpiByName, searchNpiOnlineDatabase } from "../tools/npiClient.js";
import { scrapeNPICertifications } from "../tools/npiCertificationsScraper.js";
import { scrapeTrueLensWebsite } from "../tools/trueLensWebsiteScraper.js";
import { scrapeProviderInfo } from "../tools/webScraper.js";
import { validateAddressWithAzure, searchBusinessWithAzure } from "../tools/mapsClient.js";
import { supabase } from "../../supabaseClient.js";

export async function informationEnrichmentNode(state) {
  console.log("[InfoEnrichment] Starting enrichment for provider:", state.providerId);

  const input = state.normalizedData || state.inputData || {};
  const validationSources = [...(state.validationSources || [])];
  const errorLog = [...(state.errorLog || [])];
  const externalResults = { ...(state.externalResults || {}) };
  let normalizedData = { ...(state.normalizedData || state.inputData || {}) };

  // NPI verification with web scraping fallback
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

      // If API search failed or returned no results, try web scraping on npidb.org and providerwire.com
      if (!npiData || !npiData.isFound) {
        console.info("[InfoEnrichment] NPI API search unsuccessful, attempting web scraping on online databases");
        npiData = await searchNpiOnlineDatabase({
          name: input.name,
          city: input.city,
          state: input.state,
        });
      }
    }

    if (npiData && npiData.isFound && npiData.npi) {
      // Found NPI - persist to database if provider doesn't have one
      if (!input.npi) {
        try {
          const { error: updateErr } = await supabase
            .from("providers")
            .update({ npi_id: npiData.npi })
            .eq("id", state.providerId);

          if (updateErr) {
            console.warn("[InfoEnrichment] Failed to update NPI in database:", updateErr.message);
          } else {
            console.info("[InfoEnrichment] Successfully saved found NPI to database:", npiData.npi);
            normalizedData.npi = npiData.npi;
          }
        } catch (dbErr) {
          console.error("[InfoEnrichment] Error updating NPI in database:", dbErr.message);
        }
      }

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
      externalResults.truelens = { success: true, data: trueLensData.data || null, error: null };
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
      externalResults.truelens = { success: false, data: null, error: "TRUELENS_NOT_FOUND" };
      externalResults.license = { success: false, data: null, error: "LICENSE_NOT_FOUND" };
      validationSources.push({ source: "LICENSE_REGISTRY", success: false, error: "LICENSE_NOT_FOUND" });
    }
  } catch (error) {
    externalResults.truelens = { success: false, data: null, error: error.message };
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
    let websiteCandidate = input.website || null;
    // If website not provided, try Azure POI to find business website
    if (!websiteCandidate) {
      const poi = await searchBusinessWithAzure({
        id: state.providerId,
        name: input.name,
        city: input.city,
        state: input.state,
      });
      if (poi && poi.isFound) {
        externalResults.azure = { success: true, data: poi, error: null };
        validationSources.push({ source: "AZURE_POI", success: true, timestamp: new Date().toISOString() });
        websiteCandidate = poi.website || null;
        // If Azure gives a normalized address, keep it for QA
        if (poi.formattedAddress) {
          externalResults.azure.data.address = poi.formattedAddress;
        }
      } else {
        validationSources.push({ source: "AZURE_POI", success: false, error: poi?.reason || "NO_RESULTS" });
      }
    }

    if (websiteCandidate) {
      const scrapedData = await scrapeProviderInfo({ name: input.name, website: websiteCandidate });
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

  // Azure address normalization
  try {
    const addr = await validateAddressWithAzure({
      id: state.providerId,
      address_line1: input.address,
      city: input.city,
      state: input.state,
      zip: input.zip,
    });
    if (addr && addr.isValid) {
      externalResults.azureAddress = { success: true, data: addr, error: null };
      validationSources.push({ source: "AZURE_MAPS", success: true, timestamp: new Date().toISOString() });
    } else {
      validationSources.push({ source: "AZURE_MAPS", success: false, error: addr?.reason || "NO_RESULTS" });
    }
  } catch (error) {
    validationSources.push({ source: "AZURE_MAPS", success: false, error: error.message });
    errorLog.push({ stage: "information_enrichment", source: "AZURE_MAPS", error: error.message, timestamp: new Date().toISOString() });
  }

  // NPI Certifications enrichment
  try {
    if (normalizedData.npi) {
      const certs = await scrapeNPICertifications(normalizedData.npi, normalizedData.name);
      if (certs && certs.isFound && (certs.certifications || []).length > 0) {
        externalResults.certifications = { success: true, data: certs, error: null };
        validationSources.push({ source: "NPI_CERTIFICATIONS", success: true, timestamp: new Date().toISOString() });
      } else {
        externalResults.certifications = { success: false, data: certs || null, error: "CERTIFICATIONS_NOT_FOUND" };
        validationSources.push({ source: "NPI_CERTIFICATIONS", success: false, error: "CERTIFICATIONS_NOT_FOUND" });
      }
    } else {
      externalResults.certifications = { success: false, data: null, error: "NPI_NOT_PROVIDED" };
      validationSources.push({ source: "NPI_CERTIFICATIONS", success: false, error: "NPI_NOT_PROVIDED" });
    }
  } catch (error) {
    externalResults.certifications = { success: false, data: null, error: error.message };
    validationSources.push({ source: "NPI_CERTIFICATIONS", success: false, error: error.message });
    errorLog.push({ stage: "information_enrichment", source: "NPI_CERTIFICATIONS", error: error.message, timestamp: new Date().toISOString() });
  }

  return {
    ...state,
    normalizedData,
    externalResults,
    validationSources,
    errorLog,
    workflowStatus: "IN_PROGRESS",
  };
}
