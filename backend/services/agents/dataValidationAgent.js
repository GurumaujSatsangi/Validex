import { supabase } from "../../supabaseClient.js";
import { getNpiData } from "../tools/npiClient.js";
import { validateAddressWithAzure } from "../tools/mapsClient.js";

export async function runDataValidation(provider) {
  // Validate NPI data
  const npiData = await getNpiData(provider);

  if (npiData) {
    try {
      const { data, error } = await supabase.from("provider_sources").insert({
        provider_id: provider.id,
        source_type: "NPI_API",
        raw_data: npiData
      });
      if (error) {
        console.error('Failed to insert provider_sources for', provider.id, error.message || error);
      }
    } catch (err) {
      console.error('Unexpected error inserting provider_sources', err);
    }
  }

  // Validate address using Azure Maps
  const azureData = await validateAddressWithAzure(provider);

  if (azureData) {
    try {
      const { data, error } = await supabase.from("provider_sources").insert({
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
