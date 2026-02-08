import { supabase } from "../../supabaseClient.js";
import { getNpiDataByNpiId, searchNpiByName } from "../tools/npiClient.js";
import { validateAddressWithAzure } from "../tools/mapsClient.js";

const AZURE_MIN_SCORE = 0.7;

export async function runDataValidation(provider) {
  // ===============================================
  // STEP 1: NPI VALIDATION & ENRICHMENT
  // ===============================================
  let npiData = null;
  let npiIdToUpdate = null;

  if (provider.npi_id && provider.npi_id.trim().length > 0) {
    console.info("[NPI] Looking up by NPI ID:", provider.npi_id, "for provider", provider.id);
    npiData = await getNpiDataByNpiId(provider.npi_id);
  } else {
    console.info("[NPI] Searching by name for provider", provider.id);
    npiData = await searchNpiByName(provider);

    if (npiData?.isFound && npiData.npi) {
      npiIdToUpdate = npiData.npi;

      try {
        const { error } = await supabase
          .from("providers")
          .update({ npi_id: npiIdToUpdate })
          .eq("id", provider.id);

        if (!error) provider.npi_id = npiIdToUpdate;
      } catch (err) {
        console.error("Error updating provider NPI ID", err);
      }
    }
  }

  // Store NPI source (always)
  try {
    await supabase.from("provider_sources").insert({
      provider_id: provider.id,
      source_type: "NPI_API",
      raw_data: npiData || { isFound: false }
    });
  } catch (err) {
    console.error("Error inserting NPI provider_sources", err);
  }

  // ===============================================
  // STEP 2: AZURE MAPS ADDRESS VALIDATION (FIXED)
  // ===============================================
  const azureData = await validateAddressWithAzure(provider);

  if (azureData) {
    // Store Azure result (audit trail)
    try {
      await supabase.from("provider_sources").insert({
        provider_id: provider.id,
        source_type: "AZURE_MAPS",
        raw_data: azureData
      });
    } catch (err) {
      console.error("Error inserting AZURE_MAPS provider_sources", err);
    }

    // ✅ APPLY AZURE RESULT IF CONFIDENT
    if (azureData.isValid && (azureData.score ?? 0) >= AZURE_MIN_SCORE) {
      const addressUpdate = {
        address_line1: azureData.address?.street || provider.address_line1,
        city: azureData.address?.city || provider.city,
        state: azureData.address?.state || provider.state,
        zip: azureData.address?.postalCode || provider.zip,
        address_verified: true,
        address_source: "AZURE_MAPS",
        updated_at: new Date().toISOString()
      };

      try {
        const { error } = await supabase
          .from("providers")
          .update(addressUpdate)
          .eq("id", provider.id);

        if (!error) {
          console.info("[Azure Maps] Address validated and normalized for provider", provider.id);

          // keep in-memory provider in sync
          Object.assign(provider, addressUpdate);
        }
      } catch (err) {
        console.error("[Azure Maps] Failed to update provider address", err);
      }
    }
  }

  return { npiData, azureData };
}
