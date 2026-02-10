import { supabase } from "../../supabaseClient.js";
import { searchBusinessWithAzure } from "../tools/mapsClient.js";
import { scrapeProviderInfo } from "../tools/webScraper.js";
import { scrapeTrueLensWebsite } from "../tools/trueLensWebsiteScraper.js";
import { scrapeNPICertifications } from "../tools/npiCertificationsScraper.js";

export async function runInfoEnrichment(provider) {
  console.info(`\n[Info Enrichment] ========== Starting Enrichment for ${provider.name} (ID: ${provider.id}) ==========`);
  console.info(`[Info Enrichment] NPI: ${provider.npi_id}, City: ${provider.city}, State: ${provider.state}`);

  // ===============================================
  // STEP 1: AZURE MAPS BUSINESS (POI) LOOKUP + ADDRESS VALIDATION
  // ===============================================
  console.info("[Info Enrichment] STEP 1: Starting Azure Maps POI lookup...");
  const poiData = await searchBusinessWithAzure(provider);
  let poiFound = false;

  console.info("[Info Enrichment] Azure POI Result:", JSON.stringify(poiData).substring(0, 200));

  if (poiData) {
    try {
      const { error } = await supabase.from("provider_sources").insert({
        provider_id: provider.id,
        source_type: "AZURE_POI",
        raw_data: poiData
      });

      if (error) {
        console.error("Failed to insert AZURE_POI provider_sources for", provider.id, error.message || error);
      } else {
        poiFound = poiData.isFound === true;
        console.info(`[Info Enrichment] Azure POI data inserted. Found: ${poiFound}`);
      }

      // ✅ ADDRESS VALIDATION USING AZURE POI
      // Only update if address was NOT already verified by Azure Maps (authoritative source)
      if (poiFound && poiData.address && 
          !(provider.address_verified === true && provider.address_source === "AZURE_MAPS")) {
        const azureAddress = {
          address: poiData.address.street || null,
          city: poiData.address.city || null,
          state: poiData.address.state || null,
          zip: poiData.address.postalCode || null
        };

        const isAddressDifferent =
          azureAddress.address && (
            azureAddress.address !== provider.address ||
            azureAddress.city !== provider.city ||
            azureAddress.state !== provider.state ||
            azureAddress.zip !== provider.zip
          );

        if (isAddressDifferent) {
          const { error: updateErr } = await supabase
            .from("providers")
            .update({
              address: azureAddress.address,
              city: azureAddress.city,
              state: azureAddress.state,
              zip: azureAddress.zip,
              address_verified: true,
              address_source: "AZURE_POI"
            })
            .eq("id", provider.id);

          if (updateErr) {
            console.error("[Info Enrichment] Failed to update provider address:", updateErr.message);
          } else {
            console.info("[Info Enrichment] Provider address validated and updated using Azure POI");
          }
        }
      } else if (provider.address_verified === true && provider.address_source === "AZURE_MAPS") {
        console.info("[Info Enrichment] Skipping Azure POI address update - address already verified by Azure Maps");
      }

    } catch (err) {
      console.error("[Info Enrichment] Unexpected error in Azure POI step", err);
    }
  } else {
    console.warn("[Info Enrichment] Azure POI returned null/no data");
  }

  // ===============================================
  // STEP 2: TRUELENS WEBSITE SCRAPING
  // ===============================================
  console.info("[Info Enrichment] STEP 2: Starting TrueLens website scraping...");
  const trueLensData = await scrapeTrueLensWebsite(provider.name);
  
  console.info("[Info Enrichment] TrueLens Result:", JSON.stringify(trueLensData).substring(0, 200));

  if (trueLensData && trueLensData.isFound) {
    try {
      const { error } = await supabase.from("provider_sources").insert({
        provider_id: provider.id,
        source_type: "TRUELENS_WEBSITE",
        raw_data: trueLensData
      });
      if (error) {
        console.error("[Info Enrichment] Failed to insert TRUELENS_WEBSITE source:", error.message);
      } else {
        console.info("[Info Enrichment] TrueLens data inserted successfully");
      }
    } catch (err) {
      console.error("[Info Enrichment] Error inserting TRUELENS_WEBSITE source:", err);
    }
  } else {
    console.warn("[Info Enrichment] TrueLens provider not found on website");
  }

  // ===============================================
  // STEP 3: NPI CERTIFICATIONS SCRAPING
  // ===============================================
  console.info("[Info Enrichment] STEP 3: Starting NPI certifications scraping...");
  if (provider.npi_id) {
    console.info("[Info Enrichment] NPI ID:", provider.npi_id);
    const npiCertData = await scrapeNPICertifications(provider.npi_id, provider.name);

    console.info("[Info Enrichment] NPI Certifications Result:", JSON.stringify(npiCertData).substring(0, 300));

    if (npiCertData && npiCertData.isFound) {
      try {
        const { error } = await supabase.from("provider_sources").insert({
          provider_id: provider.id,
          source_type: "NPI_CERTIFICATIONS",
          raw_data: npiCertData
        });
        if (error) {
          console.error("[Info Enrichment] Failed to insert NPI_CERTIFICATIONS source:", error.message);
        } else {
          console.info("[Info Enrichment] NPI Certifications data inserted successfully");
          if (npiCertData.certifications) {
            console.info(`[Info Enrichment] Found ${npiCertData.certifications.length} certifications`);
            npiCertData.certifications.forEach(cert => {
              console.info(`  - ${cert.name} (Primary: ${cert.isPrimary})`);
            });
          }
        }

        // ===== UPDATE PROVIDER FROM NPI DATA =====
        if (npiCertData.npiData) {
          const npiRaw = npiCertData.npiData;
          const updates = {};
          const addresses = npiRaw.addresses || [];
          const primaryAddr = addresses.find(a => a.address_purpose === "LOCATION") || addresses[0];
          const taxonomies = npiRaw.taxonomies || [];
          const primaryTax = taxonomies.find(t => t.primary) || taxonomies[0] || {};

          // Update phone
          if (primaryAddr?.telephone_number && !provider.phone) {
            updates.phone = primaryAddr.telephone_number;
            console.info("[Info Enrichment] Updating phone from NPI data:", updates.phone);
          }

          // Update address
          if (primaryAddr?.address_1 && (!provider.address || provider.address === 'N/A')) {
            updates.address = primaryAddr.address_1;
            if (primaryAddr.city) updates.city = primaryAddr.city;
            if (primaryAddr.state) updates.state = primaryAddr.state;
            if (primaryAddr.postal_code) updates.zip = primaryAddr.postal_code;
            console.info("[Info Enrichment] Updating address from NPI data:", primaryAddr.address_1);
          }

          // Update license
          if (primaryTax.license && !provider.license_number) {
            updates.license_number = primaryTax.license;
            console.info("[Info Enrichment] Updating license from NPI data:", primaryTax.license);
          }

          // Update specialty
          if (primaryTax.desc && !provider.speciality) {
            updates.speciality = primaryTax.desc;
            console.info("[Info Enrichment] Updating specialty from NPI data:", primaryTax.desc);
          }

          if (Object.keys(updates).length > 0) {
            const { error: updateErr } = await supabase
              .from("providers")
              .update(updates)
              .eq("id", provider.id);

            if (updateErr) {
              console.error("[Info Enrichment] Failed to update provider from NPI data:", updateErr.message);
            } else {
              console.info("[Info Enrichment] ✓ Provider updated with NPI data:", Object.keys(updates).join(', '));
            }
          }
        }
      } catch (err) {
        console.error("[Info Enrichment] Error inserting NPI_CERTIFICATIONS source:", err);
      }
    } else {
      console.warn("[Info Enrichment] NPI Certifications - data not found or isFound is false");
    }
  } else {
    console.warn("[Info Enrichment] No NPI ID provided, skipping NPI Certifications step");
  }

  // ===============================================
  // STEP 4: WEB SCRAPING
  // ===============================================
  console.info("[Info Enrichment] STEP 4: Starting web scraping...");
  let scrapedData = null;

  try {
    scrapedData = await scrapeProviderInfo({
      id: provider.id,
      name: provider.name,
      npi_id: provider.npi_id,
      city: provider.city,
      state: provider.state,
      phone: provider.phone,
      website: provider.website,
      speciality: provider.speciality,
      affiliations_json: provider.affiliations_json
    });

    console.info("[Info Enrichment] Web Scraping Result:", JSON.stringify(scrapedData).substring(0, 300));

    if (scrapedData && scrapedData.isFound) {
      console.info(`[Info Enrichment] Web scraping SUCCESSFUL for provider ${provider.id}`);
      console.info(`[Info Enrichment] Scraped from sources: ${scrapedData.sources.join(', ')}`);
      
      if (scrapedData.appointment_timings && scrapedData.appointment_timings.length > 0) {
        console.info(`[Info Enrichment] Found ${scrapedData.appointment_timings.length} appointment timing entries`);
      }
      
      if (scrapedData.hospital_affiliations && scrapedData.hospital_affiliations.length > 0) {
        console.info(`[Info Enrichment] Found ${scrapedData.hospital_affiliations.length} hospital affiliations`);
      }
      
      try {
        const { error } = await supabase.from("provider_sources").insert({
          provider_id: provider.id,
          source_type: "SCRAPING_ENRICHMENT",
          raw_data: scrapedData
        });

        if (error) {
          console.error("[Info Enrichment] Failed to insert SCRAPING_ENRICHMENT:", error.message || error);
        } else {
          console.info("[Info Enrichment] Web scraping data inserted successfully");
        }
      } catch (err) {
        console.error("[Info Enrichment] Unexpected error inserting SCRAPING_ENRICHMENT", err);
      }
    } else {
      console.warn("[Info Enrichment] Web scraping did not find data. isFound:", scrapedData?.isFound);
      console.warn("[Info Enrichment] Sources found:", scrapedData?.sources);
    }
  } catch (err) {
    console.error("[Info Enrichment] Exception during web scraping:", err.message || err);
  }

  // ===============================================
  // STEP 5: UPDATE PROVIDER FIELDS FROM ALL SOURCES
  // ===============================================
  console.info("[Info Enrichment] STEP 5: Updating provider fields from all gathered sources...");
  let providerEmail = null;
  const finalUpdates = {};

  // Gather email from any source
  if (poiData?.email) {
    providerEmail = poiData.email;
    console.info("[Info Enrichment] Email found from Azure POI:", providerEmail);
  }
  if (!providerEmail && scrapedData?.email) {
    providerEmail = scrapedData.email;
    console.info("[Info Enrichment] Email found from web scraping:", providerEmail);
  }

  if (providerEmail && !provider.email) {
    finalUpdates.email = providerEmail;
  }

  // Gather phone from any source (if still missing)
  if (!provider.phone) {
    const scrapedPhone = scrapedData?.phone || poiData?.phone;
    if (scrapedPhone) {
      finalUpdates.phone = scrapedPhone;
      console.info("[Info Enrichment] Phone found from scraped data:", scrapedPhone);
    }
  }

  // Gather address from scraped data (if still missing)
  if (!provider.address || provider.address === 'N/A') {
    if (scrapedData?.address) {
      if (typeof scrapedData.address === 'string') {
        finalUpdates.address = scrapedData.address;
      } else if (scrapedData.address.street) {
        finalUpdates.address = scrapedData.address.street;
        if (scrapedData.address.city) finalUpdates.city = scrapedData.address.city;
        if (scrapedData.address.state) finalUpdates.state = scrapedData.address.state;
        if (scrapedData.address.zip) finalUpdates.zip = scrapedData.address.zip;
      }
      console.info("[Info Enrichment] Address found from scraped data:", JSON.stringify(scrapedData.address).substring(0, 150));
    }
  }

  // Apply all updates at once
  if (Object.keys(finalUpdates).length > 0) {
    try {
      const { error: updateErr } = await supabase
        .from("providers")
        .update(finalUpdates)
        .eq("id", provider.id);

      if (updateErr) {
        console.error("[Info Enrichment] Failed to update provider fields:", updateErr.message);
      } else {
        console.info("[Info Enrichment] ✓ Provider updated with:", Object.keys(finalUpdates).join(', '));
      }
    } catch (err) {
      console.error("[Info Enrichment] Error updating provider fields:", err);
    }
  } else {
    console.info("[Info Enrichment] No new fields to update (already populated or no data found)");
  }

  console.info(`[Info Enrichment] ========== Enrichment Complete for ${provider.name} ==========\n`);
  return { poiData, scrapedData };
}
