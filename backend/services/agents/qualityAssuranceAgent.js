import { supabase } from "../../supabaseClient.js";
import { normalizeAddressComponent, normalizeText } from "../tools/addressUtils.js";
import {
  addressSimilarity,
  sourceWeightedVote,
  finalScore,
  determineAction,
  determineSeverity
} from "../utils/scoringUtils.js";

/**
 * Normalize specialty text for comparison by:
 * - Converting to lowercase
 * - Removing punctuation and extra whitespace
 * - Sorting words alphabetically (handles "Certified Registered Nurse Anesthetist" vs "Nurse Anesthetist, Certified Registered")
 */
function normalizeSpecialty(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[,.-]/g, ' ')  // Replace punctuation with spaces
    .replace(/\s+/g, ' ')    // Normalize multiple spaces to single space
    .trim()
    .split(' ')
    .filter(word => word.length > 0)
    .sort()                  // Sort words alphabetically
    .join(' ');
}

/**
 * Normalize phone number for comparison by removing all non-digit characters
 */
function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

export async function runQualityAssurance(provider, runId) {
  const { data: sources } = await supabase
    .from("provider_sources")
    .select("*")
    .eq("provider_id", provider.id);

  if (!sources || sources.length === 0) return { needsReview: false };

  const suggested = {};

  // Helper: Extract boolean match for each source
  const sourceMatches = {
    npi: false,
    azure: false,
    scrape: false,
    pdf: false
  };

  // Check NPI data
  const npiSource = sources.find(s => s.source_type === "NPI_API");
  if (npiSource && npiSource.raw_data && npiSource.raw_data.isFound) {
    sourceMatches.npi = true;
    const npiPhone = npiSource.raw_data.phone;
    if (npiPhone && normalizePhone(npiPhone) !== normalizePhone(provider.phone)) {
      // Compute confidence score using new algorithm
      const phoneScore = 1; // Phone mismatch detected = high signal
      const addressScore = addressSimilarity(provider.address_line1, provider.address_line1); // Same address = perfect match
      const srcScore = sourceWeightedVote({ npi: true, azure: false, scrape: false, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore, phoneScore: 0 });

      suggested.phone = {
        oldValue: provider.phone,
        suggestedValue: npiPhone,
        confidence,
        sourceType: "NPI_API",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }

    const npiSpec = npiSource.raw_data.speciality;
    if (npiSpec && normalizeSpecialty(npiSpec) !== normalizeSpecialty(provider.speciality)) {
      const srcScore = sourceWeightedVote({ npi: true, azure: false, scrape: false, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.5, phoneScore: 0 });

      suggested.speciality = {
        oldValue: provider.speciality,
        suggestedValue: npiSpec,
        confidence,
        sourceType: "NPI_API",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }
  }

  // Check Azure Maps address validation
  const azureSource = sources.find(s => s.source_type === "AZURE_MAPS");
  if (azureSource && azureSource.raw_data) {
    sourceMatches.azure = true;
    const azureData = azureSource.raw_data;

    // If address was not found (NO_RESULTS), create a low-confidence issue
    if (!azureData.isValid && azureData.reason === "NO_RESULTS") {
      const srcScore = sourceWeightedVote({ npi: false, azure: true, scrape: false, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0, phoneScore: 0 });

      suggested.address_line1 = {
        oldValue: provider.address_line1 || '',
        suggestedValue: "Address not found - please verify",
        confidence,
        sourceType: "AZURE_MAPS",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }

    // If address was found, compare components
    if (azureData.isValid && azureData.formattedAddress) {
      // Compare ZIP code
      if (azureData.postalCode && provider.zip && azureData.postalCode !== provider.zip) {
        const srcScore = sourceWeightedVote({ npi: false, azure: true, scrape: false, pdf: false });
        const addrScore = addressSimilarity(provider.address_line1, azureData.formattedAddress);
        const confidence = finalScore({ sourceScore: srcScore, addressScore: addrScore, phoneScore: 0 });

        suggested.zip = {
          oldValue: provider.zip,
          suggestedValue: azureData.postalCode,
          confidence,
          sourceType: "AZURE_MAPS",
          action: determineAction(confidence),
          severity: determineSeverity(confidence)
        };
      }

      // Compare city (normalized)
      if (azureData.city && provider.city) {
        const normalizedAzureCity = normalizeAddressComponent(azureData.city);
        const normalizedProviderCity = normalizeAddressComponent(provider.city);
        
        if (normalizedAzureCity !== normalizedProviderCity) {
          const srcScore = sourceWeightedVote({ npi: false, azure: true, scrape: false, pdf: false });
          const addrScore = addressSimilarity(provider.city, azureData.city);
          const confidence = finalScore({ sourceScore: srcScore, addressScore: addrScore, phoneScore: 0 });

          suggested.city = {
            oldValue: provider.city,
            suggestedValue: azureData.city,
            confidence,
            sourceType: "AZURE_MAPS",
            action: determineAction(confidence),
            severity: determineSeverity(confidence)
          };
        }
      }

      // Compare state
      if (azureData.state && provider.state) {
        const normalizedAzureState = normalizeText(azureData.state);
        const normalizedProviderState = normalizeText(provider.state);
        
        if (normalizedAzureState !== normalizedProviderState) {
          const srcScore = sourceWeightedVote({ npi: false, azure: true, scrape: false, pdf: false });
          const addrScore = addressSimilarity(provider.state, azureData.state);
          const confidence = finalScore({ sourceScore: srcScore, addressScore: addrScore, phoneScore: 0 });

          suggested.state = {
            oldValue: provider.state,
            suggestedValue: azureData.state,
            confidence,
            sourceType: "AZURE_MAPS",
            action: determineAction(confidence),
            severity: determineSeverity(confidence)
          };
        }
      }

      // Use Azure Maps score to flag low-confidence matches
      if (azureData.score && azureData.score < 0.6) {
        const srcScore = sourceWeightedVote({ npi: false, azure: true, scrape: false, pdf: false });
        const confidence = finalScore({ sourceScore: srcScore, addressScore: azureData.score, phoneScore: 0 });

        suggested.address_line1 = {
          oldValue: provider.address_line1 || '',
          suggestedValue: azureData.formattedAddress.split(',')[0] || azureData.formattedAddress,
          confidence,
          sourceType: "AZURE_MAPS",
          action: determineAction(confidence),
          severity: determineSeverity(confidence)
        };
      }
    }
  }

  // Check Azure POI (business) data
  const poiSource = sources.find(s => s.source_type === "AZURE_POI");
  if (poiSource && poiSource.raw_data && poiSource.raw_data.isFound) {
    sourceMatches.azure = true;
    const poi = poiSource.raw_data;

    // Phone comparison
    if (poi.phone && normalizePhone(poi.phone) !== normalizePhone(provider.phone)) {
      const srcScore = sourceWeightedVote({ npi: false, azure: true, scrape: false, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.5, phoneScore: 0 });

      suggested.phone = {
        oldValue: provider.phone || '',
        suggestedValue: poi.phone,
        confidence,
        sourceType: "AZURE_POI",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }

    // Address comparisons
    if (poi.postalCode && provider.zip && poi.postalCode !== provider.zip) {
      const srcScore = sourceWeightedVote({ npi: false, azure: true, scrape: false, pdf: false });
      const addrScore = addressSimilarity(provider.address_line1, poi.formattedAddress || '');
      const confidence = finalScore({ sourceScore: srcScore, addressScore: addrScore, phoneScore: 0 });

      suggested.zip = {
        oldValue: provider.zip,
        suggestedValue: poi.postalCode,
        confidence,
        sourceType: "AZURE_POI",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }

    if (poi.city && provider.city) {
      const normalizedPoiCity = normalizeAddressComponent(poi.city);
      const normalizedProviderCity = normalizeAddressComponent(provider.city);
      if (normalizedPoiCity !== normalizedProviderCity) {
        const srcScore = sourceWeightedVote({ npi: false, azure: true, scrape: false, pdf: false });
        const addrScore = addressSimilarity(provider.city, poi.city);
        const confidence = finalScore({ sourceScore: srcScore, addressScore: addrScore, phoneScore: 0 });

        suggested.city = {
          oldValue: provider.city,
          suggestedValue: poi.city,
          confidence,
          sourceType: "AZURE_POI",
          action: determineAction(confidence),
          severity: determineSeverity(confidence)
        };
      }
    }

    if (poi.state && provider.state) {
      const normalizedPoiState = normalizeText(poi.state);
      const normalizedProviderState = normalizeText(provider.state);
      if (normalizedPoiState !== normalizedProviderState) {
        const srcScore = sourceWeightedVote({ npi: false, azure: true, scrape: false, pdf: false });
        const addrScore = addressSimilarity(provider.state, poi.state);
        const confidence = finalScore({ sourceScore: srcScore, addressScore: addrScore, phoneScore: 0 });

        suggested.state = {
          oldValue: provider.state,
          suggestedValue: poi.state,
          confidence,
          sourceType: "AZURE_POI",
          action: determineAction(confidence),
          severity: determineSeverity(confidence)
        };
      }
    }

    // Website enrichment (if provider has no website field, leave oldValue empty)
    if (poi.website) {
      const srcScore = sourceWeightedVote({ npi: false, azure: true, scrape: false, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.5, phoneScore: 0 });

      suggested.website = {
        oldValue: provider.website || '',
        suggestedValue: poi.website,
        confidence,
        sourceType: "AZURE_POI",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }
  }

  // Check scraping enrichment data
  const scrapingSource = sources.find(s => s.source_type === "SCRAPING_ENRICHMENT");
  if (scrapingSource && scrapingSource.raw_data && scrapingSource.raw_data.isFound) {
    sourceMatches.scrape = true;
    const scraped = scrapingSource.raw_data;

    // Phone comparison (only if not already suggested by other sources)
    if (scraped.phone && !suggested.phone && normalizePhone(scraped.phone) !== normalizePhone(provider.phone)) {
      const srcScore = sourceWeightedVote({ npi: false, azure: false, scrape: true, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.4, phoneScore: 0 });

      suggested.phone = {
        oldValue: provider.phone || '',
        suggestedValue: scraped.phone,
        confidence,
        sourceType: "SCRAPING_ENRICHMENT",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }

    // Website enrichment (only if not already suggested)
    if (scraped.website && !suggested.website) {
      const srcScore = sourceWeightedVote({ npi: false, azure: false, scrape: true, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.3, phoneScore: 0 });

      suggested.website = {
        oldValue: provider.website || '',
        suggestedValue: scraped.website,
        confidence,
        sourceType: "SCRAPING_ENRICHMENT",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }
  }

  // Check PDF OCR data
  const pdfSource = sources.find(s => s.source_type === "PDF_OCR");
  if (pdfSource && pdfSource.raw_data) {
    sourceMatches.pdf = true;
    const pdfData = pdfSource.raw_data;

    // Compare extracted name (if present)
    if (pdfData.name && pdfData.name !== provider.name) {
      const srcScore = sourceWeightedVote({ npi: false, azure: false, scrape: false, pdf: true });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.3, phoneScore: 0 });

      suggested.name = {
        oldValue: provider.name || '',
        suggestedValue: pdfData.name,
        confidence,
        sourceType: "PDF_OCR",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }

    // Compare extracted phone (if present)
    if (pdfData.phone && normalizePhone(pdfData.phone) !== normalizePhone(provider.phone)) {
      const srcScore = sourceWeightedVote({ npi: false, azure: false, scrape: false, pdf: true });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.2, phoneScore: 0 });

      if (!suggested.phone) {
        suggested.phone = {
          oldValue: provider.phone || '',
          suggestedValue: pdfData.phone,
          confidence,
          sourceType: "PDF_OCR",
          action: determineAction(confidence),
          severity: determineSeverity(confidence)
        };
      }
    }

    // Compare extracted address (if present)
    if (pdfData.address && pdfData.address !== provider.address_line1) {
      const srcScore = sourceWeightedVote({ npi: false, azure: false, scrape: false, pdf: true });
      const addrScore = addressSimilarity(provider.address_line1, pdfData.address);
      const confidence = finalScore({ sourceScore: srcScore, addressScore: addrScore, phoneScore: 0 });

      if (!suggested.address_line1) {
        suggested.address_line1 = {
          oldValue: provider.address_line1 || '',
          suggestedValue: pdfData.address,
          confidence,
          sourceType: "PDF_OCR",
          action: determineAction(confidence),
          severity: determineSeverity(confidence)
        };
      }
    }
  }

  // Check TrueLens Website scraping data
  const trueLensSource = sources.find(s => s.source_type === "TRUELENS_WEBSITE");
  if (trueLensSource && trueLensSource.raw_data && trueLensSource.raw_data.isFound) {
    const webData = trueLensSource.raw_data.data;
    
    // Phone Number
    if (webData.phone && !suggested.phone && normalizePhone(webData.phone) !== normalizePhone(provider.phone)) {
      const srcScore = sourceWeightedVote({ npi: false, azure: false, scrape: true, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.7, phoneScore: 0 });
      
      suggested.phone = {
        oldValue: provider.phone || 'Not available',
        suggestedValue: webData.phone,
        confidence,
        sourceType: "TRUELENS_WEBSITE",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }
    
    // Address
    if (webData.address && !suggested.address_line1) {
      const srcScore = sourceWeightedVote({ npi: false, azure: false, scrape: true, pdf: false });
      const addrScore = addressSimilarity(provider.address_line1, webData.address);
      const confidence = finalScore({ sourceScore: srcScore, addressScore: addrScore, phoneScore: 0 });
      
      suggested.address_line1 = {
        oldValue: provider.address_line1 || 'Not available',
        suggestedValue: webData.address,
        confidence,
        sourceType: "TRUELENS_WEBSITE",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }
    
    // Specialty
    if (webData.specialty && !suggested.speciality && normalizeSpecialty(webData.specialty) !== normalizeSpecialty(provider.speciality)) {
      const srcScore = sourceWeightedVote({ npi: false, azure: false, scrape: true, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.7, phoneScore: 0 });
      
      suggested.speciality = {
        oldValue: provider.speciality || 'Not available',
        suggestedValue: webData.specialty,
        confidence,
        sourceType: "TRUELENS_WEBSITE",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }
    
    // License Number
    if (webData.license_number && webData.license_number !== provider.license_number) {
      const srcScore = sourceWeightedVote({ npi: false, azure: false, scrape: true, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.7, phoneScore: 0 });
      
      suggested.license_number = {
        oldValue: provider.license_number || 'Not available',
        suggestedValue: webData.license_number,
        confidence,
        sourceType: "TRUELENS_WEBSITE",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }
    
    // License State
    if (webData.license_state) {
      const srcScore = sourceWeightedVote({ npi: false, azure: false, scrape: true, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.7, phoneScore: 0 });
      
      suggested.license_state = {
        oldValue: provider.license_state || 'Not available',
        suggestedValue: webData.license_state,
        confidence,
        sourceType: "TRUELENS_WEBSITE",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }
    
    // License Status
    if (webData.license_status) {
      const srcScore = sourceWeightedVote({ npi: false, azure: false, scrape: true, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.7, phoneScore: 0 });
      
      suggested.license_status = {
        oldValue: provider.license_status || 'Not available',
        suggestedValue: webData.license_status,
        confidence,
        sourceType: "TRUELENS_WEBSITE",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }
    
    // Office Hours
    if (webData.office_hours) {
      const srcScore = sourceWeightedVote({ npi: false, azure: false, scrape: true, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.6, phoneScore: 0 });
      
      suggested.office_hours = {
        oldValue: 'Not available',
        suggestedValue: webData.office_hours,
        confidence,
        sourceType: "TRUELENS_WEBSITE",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }
    
    // Accepting New Patients
    if (webData.accepting_new_patients !== undefined) {
      const srcScore = sourceWeightedVote({ npi: false, azure: false, scrape: true, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.6, phoneScore: 0 });
      
      suggested.accepting_new_patients = {
        oldValue: 'Not available',
        suggestedValue: webData.accepting_new_patients ? 'Yes' : 'No',
        confidence,
        sourceType: "TRUELENS_WEBSITE",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }
    
    // Telehealth Available
    if (webData.telehealth_available !== undefined) {
      const srcScore = sourceWeightedVote({ npi: false, azure: false, scrape: true, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.6, phoneScore: 0 });
      
      suggested.telehealth_available = {
        oldValue: 'Not available',
        suggestedValue: webData.telehealth_available ? 'Yes' : 'No',
        confidence,
        sourceType: "TRUELENS_WEBSITE",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }
    
    // Affiliations
    if (webData.affiliations) {
      const srcScore = sourceWeightedVote({ npi: false, azure: false, scrape: true, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.5, phoneScore: 0 });
      
      suggested.affiliations = {
        oldValue: 'Not available',
        suggestedValue: webData.affiliations,
        confidence,
        sourceType: "TRUELENS_WEBSITE",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }
  }

  // Check NPI Certifications data
  const npiCertSource = sources.find(s => s.source_type === "NPI_CERTIFICATIONS");
  if (npiCertSource && npiCertSource.raw_data && npiCertSource.raw_data.isFound) {
    const certData = npiCertSource.raw_data;
    
    // Primary Certification/Specialty
    if (certData.specialty && normalizeSpecialty(certData.specialty) !== normalizeSpecialty(provider.speciality)) {
      const srcScore = sourceWeightedVote({ npi: true, azure: false, scrape: false, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.8, phoneScore: 0 });
      
      if (!suggested.speciality) {
        suggested.speciality = {
          oldValue: provider.speciality || 'Not available',
          suggestedValue: certData.specialty,
          confidence,
          sourceType: "NPI_CERTIFICATIONS",
          action: determineAction(confidence),
          severity: determineSeverity(confidence)
        };
      }
    }
    
    // Single certification field - show primary or first certification
    if (certData.certifications && certData.certifications.length > 0) {
      const primaryCert = certData.certifications.find(c => c.isPrimary) || certData.certifications[0];
      const srcScore = sourceWeightedVote({ npi: true, azure: false, scrape: false, pdf: false });
      const confidence = finalScore({ sourceScore: srcScore, addressScore: 0.8, phoneScore: 0 });
      
      suggested.certification = {
        oldValue: 'Not available',
        suggestedValue: primaryCert.name + (primaryCert.license ? ` (License: ${primaryCert.license})` : ''),
        confidence,
        sourceType: "NPI_CERTIFICATIONS",
        action: determineAction(confidence),
        severity: determineSeverity(confidence)
      };
    }
  }

  // Prepare issue rows for bulk insert
  const issueRows = Object.entries(suggested).map(([fieldName, s]) => ({
    provider_id: provider.id,
    run_id: runId,
    field_name: fieldName,
    old_value: s.oldValue,
    suggested_value: s.suggestedValue,
    confidence: s.confidence,
    severity: s.severity,
    action: s.action,
    source_type: s.sourceType || "UNKNOWN",
    status: "OPEN"
  }));

  if (issueRows.length === 0) return { needsReview: false };

  try {
    const { data: inserted, error: insertErr } = await supabase.from("validation_issues").insert(issueRows);
    if (insertErr) {
      console.error("Failed to insert validation issues for provider", provider.id, insertErr.message || insertErr);
      return { needsReview: false };
    }

    return { needsReview: inserted && inserted.length > 0 };
  } catch (err) {
    console.error("Unexpected error inserting validation issues", err);
    return { needsReview: false };
  }
}
