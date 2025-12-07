import { supabase } from "../../supabaseClient.js";
import { getNpiDataByNpiId, searchNpiByName } from "../tools/npiClient.js";
import { validateAddressWithAzure } from "../tools/mapsClient.js";

export async function runDataValidation(provider) {
  // ===============================================
  // STEP 1: NPI VALIDATION & ENRICHMENT
  // ===============================================
  let npiData = null;
  let npiIdToUpdate = null;

  if (provider.npi_id && provider.npi_id.trim().length > 0) {
    // Provider already has NPI - lookup by NPI ID
    console.info("[NPI] Looking up by NPI ID:", provider.npi_id, "for provider", provider.id);
    npiData = await getNpiDataByNpiId(provider.npi_id);
  } else {
    // Provider does NOT have NPI - search by name/location
    console.info("[NPI] Searching by name for provider", provider.id);
    npiData = await searchNpiByName(provider);

    // If NPI found, update provider record with the NPI ID
    if (npiData && npiData.isFound && npiData.npi) {
      npiIdToUpdate = npiData.npi;
      console.info("[NPI] Found NPI ID", npiIdToUpdate, "for provider", provider.id, "- updating record");
      
      try {
        const { error: updateError } = await supabase
          .from("providers")
          .update({ npi_id: npiIdToUpdate })
          .eq("id", provider.id);

        if (updateError) {
          console.error("Failed to update provider NPI ID", provider.id, updateError.message || updateError);
        } else {
          // Update local provider object to reflect change
          provider.npi_id = npiIdToUpdate;
        }
      } catch (err) {
        console.error("Unexpected error updating provider NPI ID", provider.id, err);
      }
    }
  }

  // Store NPI data in provider_sources regardless of found status
  if (npiData) {
    try {
      const { error } = await supabase.from("provider_sources").insert({
        provider_id: provider.id,
        source_type: "NPI_API",
        raw_data: npiData
      });
      if (error) {
        console.error('Failed to insert NPI provider_sources for', provider.id, error.message || error);
      }
    } catch (err) {
      console.error('Unexpected error inserting NPI provider_sources', err);
    }
  } else {
    // No NPI data found at all - insert negative record
    try {
      const { error } = await supabase.from("provider_sources").insert({
        provider_id: provider.id,
        source_type: "NPI_API",
        raw_data: { isFound: false }
      });
      if (error) {
        console.error('Failed to insert NPI not-found provider_sources for', provider.id, error.message || error);
      }
    } catch (err) {
      console.error('Unexpected error inserting NPI not-found provider_sources', err);
    }
  }

  // ===============================================
  // STEP 2: AZURE MAPS ADDRESS VALIDATION
  // ===============================================
  const azureData = await validateAddressWithAzure(provider);

  if (azureData) {
    try {
      const { error } = await supabase.from("provider_sources").insert({
        provider_id: provider.id,
        source_type: "AZURE_MAPS",
        raw_data: {
          isValid: azureData.isValid,
          formattedAddress: azureData.formattedAddress,
          postalCode: azureData.postalCode,
          city: azureData.city,
          state: azureData.state,
          location: azureData.location,
          score: azureData.score,
          reason: azureData.reason,
          raw: azureData.raw
        }
      });
      if (error) {
        console.error('Failed to insert AZURE_MAPS provider_sources for', provider.id, error.message || error);
      }
    } catch (err) {
      console.error('Unexpected error inserting AZURE_MAPS provider_sources', err);
    }
  }

  return { npiData, azureData };
}
