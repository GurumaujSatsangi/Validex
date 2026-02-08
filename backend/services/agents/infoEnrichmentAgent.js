import { supabase } from "../../supabaseClient.js";
import { searchBusinessWithAzure } from "../tools/mapsClient.js";
import { scrapeProviderInfo } from "../tools/webScraper.js";
import { scrapeTrueLensWebsite } from "../tools/trueLensWebsiteScraper.js";
import { scrapeNPICertifications } from "../tools/npiCertificationsScraper.js";

export async function runInfoEnrichment(provider) {
  // ===============================================
  // STEP 1: AZURE MAPS BUSINESS (POI) LOOKUP + ADDRESS VALIDATION
  // ===============================================
  const poiData = await searchBusinessWithAzure(provider);
  let poiFound = false;

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
      console.error("Unexpected error inserting AZURE_POI provider_sources", err);
    }
  }

  // ===============================================
  // STEP 2: TRUELENS WEBSITE SCRAPING
  // ===============================================
  console.info("[Info Enrichment] Scraping TrueLens website for", provider.name);
  const trueLensData = await scrapeTrueLensWebsite(provider.name);

  if (trueLensData && trueLensData.isFound) {
    try {
      const { error } = await supabase.from("provider_sources").insert({
        provider_id: provider.id,
        source_type: "TRUELENS_WEBSITE",
        raw_data: trueLensData
      });
      if (error) {
        console.error("Failed to insert TRUELENS_WEBSITE source:", error.message);
      }
    } catch (err) {
      console.error("Error inserting TRUELENS_WEBSITE source:", err);
    }
  }

  // ===============================================
  // STEP 3: NPI CERTIFICATIONS SCRAPING
  // ===============================================
  if (provider.npi_id) {
    console.info("[Info Enrichment] Scraping NPI certifications for NPI:", provider.npi_id);
    const npiCertData = await scrapeNPICertifications(provider.npi_id, provider.name);

    if (npiCertData && npiCertData.isFound) {
      try {
        const { error } = await supabase.from("provider_sources").insert({
          provider_id: provider.id,
          source_type: "NPI_CERTIFICATIONS",
          raw_data: npiCertData
        });
        if (error) {
          console.error("Failed to insert NPI_CERTIFICATIONS source:", error.message);
        }
      } catch (err) {
        console.error("Error inserting NPI_CERTIFICATIONS source:", err);
      }
    }
  }

  // ===============================================
  // STEP 4: WEB SCRAPING
  // ===============================================
  let scrapedData = null;

  console.info("[Info Enrichment] Running web scraping for provider", provider.id);
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

  if (scrapedData && scrapedData.isFound) {
    console.info(`[Info Enrichment] Web scraping successful for provider ${provider.id}`);
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
        console.error("Failed to insert SCRAPING_ENRICHMENT provider_sources for", provider.id, error.message || error);
      }
    } catch (err) {
      console.error("Unexpected error inserting SCRAPING_ENRICHMENT provider_sources", err);
    }
  }

  // ===============================================
  // STEP 5: UPDATE PROVIDER EMAIL IF FOUND
  // ===============================================
  let providerEmail = null;

  if (poiData?.email) providerEmail = poiData.email;
  if (!providerEmail && scrapedData?.email) providerEmail = scrapedData.email;

  if (providerEmail && !provider.email) {
    try {
      const { error: updateErr } = await supabase
        .from("providers")
        .update({ email: providerEmail })
        .eq("id", provider.id);

      if (updateErr) {
        console.error("[Info Enrichment] Failed to update provider email:", updateErr.message);
      }
    } catch (err) {
      console.error("[Info Enrichment] Error updating provider email:", err);
    }
  }

  return { poiData, scrapedData };
}
