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
import { validateAddressWithAzure } from "../tools/mapsClient.js";
import { supabase } from "../../supabaseClient.js";

export async function informationEnrichmentNode(state) {
  console.log("[InfoEnrichment] Starting enrichment for provider:", state.providerId);

  const input = state.normalizedData || state.inputData || {};
  const validationSources = [...(state.validationSources || [])];
  const errorLog = [...(state.errorLog || [])];
  const externalResults = { ...(state.externalResults || {}) };
  let normalizedData = { ...(state.normalizedData || state.inputData || {}) };

  // Run independent API calls in parallel
  const [npiResult, trueLensResult, azureAddressResult] = await Promise.allSettled([
    // 1. NPI verification with web scraping fallback
    (async () => {
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

          return { success: true, data: npiData, error: null };
        } else {
          return { success: false, data: npiData || null, error: "NPI_NOT_FOUND" };
        }
      } catch (error) {
        return { success: false, data: null, error: error.message };
      }
    })(),

    // 2. License registry (via TrueLens website data)
    (async () => {
      try {
        const trueLensData = await scrapeTrueLensWebsite(input.name);

        if (trueLensData && trueLensData.isFound) {
          const licenseStatus = trueLensData.data?.license_status || trueLensData.data?.licenseStatus || null;
          const licenseNumber = trueLensData.data?.license_number || trueLensData.data?.licenseNumber || null;
          return {
            success: true,
            trueLensData: trueLensData.data || null,
            licenseData: {
              licenseStatus,
              licenseNumber,
              raw: trueLensData,
            },
            error: null,
          };
        } else {
          return { success: false, trueLensData: null, licenseData: null, error: "TRUELENS_NOT_FOUND" };
        }
      } catch (error) {
        return { success: false, trueLensData: null, licenseData: null, error: error.message };
      }
    })(),

    // 3. Azure address normalization
    (async () => {
      try {
        const addr = await validateAddressWithAzure({
          id: state.providerId,
          address_line1: input.address,
          city: input.city,
          state: input.state,
          zip: input.zip,
        });
        if (addr && addr.isValid) {
          return { success: true, data: addr, error: null };
        } else {
          return { success: false, data: null, error: addr?.reason || "NO_RESULTS" };
        }
      } catch (error) {
        return { success: false, data: null, error: error.message };
      }
    })(),
  ]);

  // Process NPI result
  if (npiResult.status === "fulfilled") {
    externalResults.npi = npiResult.value;
    if (npiResult.value.success) {
      validationSources.push({ source: "NPI_API", success: true, timestamp: new Date().toISOString() });
      
      // ===== UPDATE PROVIDER RECORD WITH NPI DATA =====
      const npiData = npiResult.value.data;
      if (npiData && npiData.isFound) {
        const updates = {};

        // Update phone if provider doesn't have one
        if (npiData.phone && !input.phone) {
          updates.phone = npiData.phone;
          normalizedData.phone = npiData.phone;
          console.info("[InfoEnrichment] Updating provider phone from NPI:", npiData.phone);
        }

        // Update license if provider doesn't have one
        if (npiData.license && !input.license_number) {
          updates.license_number = npiData.license;
          normalizedData.license_number = npiData.license;
          console.info("[InfoEnrichment] Updating provider license from NPI:", npiData.license);
        }

        // Update specialty if provider doesn't have one
        if (npiData.speciality && !input.speciality) {
          updates.speciality = npiData.speciality;
          normalizedData.speciality = npiData.speciality;
          console.info("[InfoEnrichment] Updating provider specialty from NPI:", npiData.speciality);
        }

        // Update address from NPI if provider doesn't have one
        if (npiData.address && (!input.address || input.address === 'N/A')) {
          if (npiData.address.address_1) updates.address = npiData.address.address_1;
          if (npiData.address.city) updates.city = npiData.address.city;
          if (npiData.address.state) updates.state = npiData.address.state;
          if (npiData.address.postal_code) updates.zip = npiData.address.postal_code;
          normalizedData.address = npiData.address.address_1 || normalizedData.address;
          normalizedData.city = npiData.address.city || normalizedData.city;
          normalizedData.state = npiData.address.state || normalizedData.state;
          normalizedData.zip = npiData.address.postal_code || normalizedData.zip;
          console.info("[InfoEnrichment] Updating provider address from NPI:", JSON.stringify(npiData.address));
        }

        // Persist updates to database
        if (Object.keys(updates).length > 0) {
          try {
            const { error: updateErr } = await supabase
              .from("providers")
              .update(updates)
              .eq("id", state.providerId);

            if (updateErr) {
              console.warn("[InfoEnrichment] Failed to update provider from NPI data:", updateErr.message);
            } else {
              console.info("[InfoEnrichment] ✓ Provider updated with NPI data:", Object.keys(updates).join(', '));
            }
          } catch (dbErr) {
            console.error("[InfoEnrichment] Error updating provider from NPI data:", dbErr.message);
          }
        }
      }
    } else {
      validationSources.push({ source: "NPI_API", success: false, error: npiResult.value.error });
    }
  } else {
    externalResults.npi = { success: false, data: null, error: npiResult.reason };
    validationSources.push({ source: "NPI_API", success: false, error: npiResult.reason });
    errorLog.push({ stage: "information_enrichment", source: "NPI_API", error: npiResult.reason, timestamp: new Date().toISOString() });
  }

  // Process TrueLens result
  if (trueLensResult.status === "fulfilled") {
    externalResults.truelens = { success: trueLensResult.value.success, data: trueLensResult.value.trueLensData, error: trueLensResult.value.error };
    if (trueLensResult.value.licenseData) {
      externalResults.license = {
        success: !!trueLensResult.value.licenseData.licenseStatus,
        data: trueLensResult.value.licenseData,
        error: trueLensResult.value.licenseData.licenseStatus ? null : "LICENSE_NOT_FOUND",
      };
      validationSources.push({ source: "LICENSE_REGISTRY", success: !!trueLensResult.value.licenseData.licenseStatus, timestamp: new Date().toISOString() });
    } else {
      externalResults.license = { success: false, data: null, error: "LICENSE_NOT_FOUND" };
      validationSources.push({ source: "LICENSE_REGISTRY", success: false, error: "LICENSE_NOT_FOUND" });
    }
  } else {
    externalResults.truelens = { success: false, data: null, error: trueLensResult.reason };
    externalResults.license = { success: false, data: null, error: trueLensResult.reason };
    validationSources.push({ source: "LICENSE_REGISTRY", success: false, error: trueLensResult.reason });
    errorLog.push({ stage: "information_enrichment", source: "LICENSE_REGISTRY", error: trueLensResult.reason, timestamp: new Date().toISOString() });
  }

  // Process Azure address result
  if (azureAddressResult.status === "fulfilled") {
    if (azureAddressResult.value.success) {
      externalResults.azureAddress = { success: true, data: azureAddressResult.value.data, error: null };
      validationSources.push({ source: "AZURE_MAPS", success: true, timestamp: new Date().toISOString() });
    } else {
      validationSources.push({ source: "AZURE_MAPS", success: false, error: azureAddressResult.value.error });
    }
  } else {
    validationSources.push({ source: "AZURE_MAPS", success: false, error: azureAddressResult.reason });
    errorLog.push({ stage: "information_enrichment", source: "AZURE_MAPS", error: azureAddressResult.reason, timestamp: new Date().toISOString() });
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
