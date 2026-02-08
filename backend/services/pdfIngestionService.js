import { sendToAzureOCR, pollOcr } from "./tools/azureOcrClient.js";
import { supabase } from "../supabaseClient.js";
import { runValidationForImportedProviders } from "./validationService.js";

/**
 * Parse provider data from OCR text using regex patterns and heuristics
 * @param {Array<Object>} ocrLines - Array of OCR text blocks/lines
 * @returns {Array<Object>} Array of parsed provider objects
 */
function parseProvidersFromOcr(ocrLines) {
  const providers = [];
  let currentProvider = {};
  
  // Regex patterns for various fields - with proper value extraction
  const npiPattern = /NPI[:\s]*(\d{10})/i;
  const phonePattern = /(?:Phone|TEL|Ph)[:\s]*(\(?[\d\s\-\.\)]{10,14})/i;
  const zipPattern = /\b(\d{5})(?:[-\s]?\d{4})?\b/;
  const statePattern = /\b([A-Z]{2})\b(?:\s*\d{5})?/;
  const licensePattern = /License[:\s]*([A-Z0-9\-]+)/i;
  const namePattern = /(?:Name|PROVIDER|Provider Name)[:\s]*(.+)/i;
  const addressPattern = /(?:Address|Address Line)[:\s]*(.+)/i;
  const cityPattern = /(?:City)[:\s]*(.+)/i;
  const stateFromLabelPattern = /(?:State|ST)[:\s]*([A-Z]{2})/i;
  const zipFromLabelPattern = /(?:Zip|ZIP|Zip Code)[:\s]*(\d{5}(?:[-\s]?\d{4})?)/i;
  const specialtyPattern = /(?:Specialty|Specialization|Speciality)[:\s]*(.+)/i;

  // Extract text from OCR lines (handle both { text: "..." } and string formats)
  const textLines = ocrLines
    .map(line => {
      if (typeof line === 'string') return line;
      if (line.text) return line.text;
      if (line.words && Array.isArray(line.words)) {
        // Azure structure: line.words[].text
        return line.words.map(w => {
          if (typeof w === 'string') return w;
          if (w.text) return w.text;
          return '';
        }).join(' ');
      }
      // Fallback: try to stringify and extract anything useful
      return JSON.stringify(line);
    })
    .filter(t => t && t.trim().length > 0)
    .map(t => t.trim());

  console.info('[PDF Ingestion] Extracted text lines for parsing:', textLines.length);
  if (textLines.length > 0) {
    console.info('[PDF Ingestion] Sample text lines:', textLines.slice(0, 5).join(' | '));
  }

  // Combine all text for easier parsing
  const fullText = textLines.join('\n');

  // Split by common provider delimiters or patterns (strict, predictable delimiters only)
  const blocks = fullText.split(/(?:^|\n)(?:\d+\.|PROVIDER|---+)/mi);

  for (const block of blocks) {
    if (!block.trim()) continue;

    const lines = block.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length === 0) continue;

    const provider = {
      provider_code: null,
      name: null,
      phone: null,
      address_line1: null,
      city: null,
      state: null,
      zip: null,
      speciality: null,
      license_number: null,
      license_state: null,
      npi: null
    };

    // Parse lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Try labeled extraction first (e.g., "Name: VALUE")
      
      // Extract Name from "Name: VALUE" format
      const nameMatch = line.match(namePattern);
      if (nameMatch && !provider.name) {
        provider.name = nameMatch[1].trim().replace(/^[A-Za-z\s:]+:\s*/, '');
      }

      // Extract NPI
      const npiMatch = line.match(npiPattern);
      if (npiMatch) provider.npi = npiMatch[1];

      // Extract phone
      const phoneMatch = line.match(phonePattern);
      if (phoneMatch) {
        provider.phone = phoneMatch[1].replace(/\s+/g, '').replace(/[\(\)]/g, '');
      }

      // Extract license
      const licenseMatch = line.match(licensePattern);
      if (licenseMatch) provider.license_number = licenseMatch[1].trim();

      // Extract address from "Address: VALUE" format
      const addressMatch = line.match(addressPattern);
      if (addressMatch && !provider.address_line1) {
        provider.address_line1 = addressMatch[1].trim();
      }

      // Extract city from "City: VALUE" format
      const cityMatch = line.match(cityPattern);
      if (cityMatch && !provider.city) {
        provider.city = cityMatch[1].trim();
      }

      // Extract state from "State: VALUE" format
      const stateFromLabelMatch = line.match(stateFromLabelPattern);
      if (stateFromLabelMatch && !provider.state) {
        provider.state = stateFromLabelMatch[1].trim();
      }

      // Extract zip from "Zip: VALUE" format
      const zipFromLabelMatch = line.match(zipFromLabelPattern);
      if (zipFromLabelMatch && !provider.zip) {
        provider.zip = zipFromLabelMatch[1].replace(/[\s-]/g, '');
      }

      // Extract specialty from "Specialty: VALUE" format
      const specialtyMatch = line.match(specialtyPattern);
      if (specialtyMatch && !provider.speciality) {
        provider.speciality = specialtyMatch[1].trim();
      }

      // Fallback: Extract address components from unstructured text
      const stateMatch = line.match(statePattern);
      if (stateMatch && !provider.state && !line.match(/State[:\s]/i)) {
        provider.state = stateMatch[1];
      }

      const zipMatch = line.match(zipPattern);
      if (zipMatch && !provider.zip && !line.match(/Zip[:\s]/i)) {
        provider.zip = zipMatch[1];
      }

      // Heuristic: lines with commas often contain "City, State" pattern
      if (line.includes(',') && !provider.city && !line.match(/City[:\s]/i)) {
        const parts = line.split(',');
        if (parts.length >= 2) {
          provider.city = parts[0].trim();
          // State might be in second part
          const stateInPart = parts[1].match(/[A-Z]{2}/);
          if (stateInPart) provider.state = stateInPart[0];
        }
      }

      // Try to find address (typically contains numbers and street keywords)
      if (!provider.address_line1 && line.match(/\d+\s+\w+\s+(st|ave|blvd|road|drive|lane|court|street)/i)) {
        provider.address_line1 = line.substring(0, 100);
      }

      // Try to identify name if not already set (first non-empty, non-metadata line often is name)
      if (!provider.name && line.length > 5 && !line.match(/^\d/) && !line.match(phonePattern) && 
          !line.match(/[A-Z]{2}\s*\d{5}/) && !line.match(/^[A-Z\s]+[:\s]/)) {
        provider.name = line.substring(0, 100).trim();
      }

      // Specialty heuristics (look for common medical terms)
      if (!provider.speciality) {
        const specialtyKeywords = ['physician', 'surgeon', 'dentist', 'nurse', 'therapist', 'center', 'clinic', 'hospital', 'podiatrist', 'dermatology', 'cardiology'];
        if (specialtyKeywords.some(kw => line.toLowerCase().includes(kw))) {
          provider.speciality = line.substring(0, 100).trim();
        }
      }
    }

    // Only add provider if it has at least a name
    if (provider.name && provider.name.trim().length > 2) {
      providers.push(provider);
    }
  }

  // Fallback: if no providers found, try to parse each text line as a potential provider
  if (providers.length === 0 && textLines.length > 0) {
    console.info('[PDF Ingestion] No providers found with structured parsing, attempting line-by-line fallback...');
    
    for (let i = 0; i < textLines.length; i++) {
      const line = textLines[i];
      
      // Skip very short lines or common non-provider lines
      if (line.length < 5 || /^(page|address|city|state|zip|phone|fax|npi|license|id|\d+)$/i.test(line)) {
        continue;
      }
      
      // Try to extract any structured data from this line and following lines
      const provider = {
        provider_code: null,
        name: null,
        phone: null,
        address_line1: null,
        city: null,
        state: null,
        zip: null,
        speciality: null,
        license_number: null,
        license_state: null,
        npi: null
      };

      // Assume this line is the provider name
      provider.name = line.substring(0, 100).trim();

      // Look ahead for additional info
      for (let j = i + 1; j < Math.min(i + 5, textLines.length); j++) {
        const nextLine = textLines[j];
        
        const npiMatch = nextLine.match(npiPattern);
        if (npiMatch) provider.npi = npiMatch[1];
        
        const phoneMatch = nextLine.match(phonePattern);
        if (phoneMatch) {
          provider.phone = phoneMatch[1].replace(/\s+/g, '').replace(/[\(\)]/g, '');
        }
        
        const zipMatch = nextLine.match(zipPattern);
        if (zipMatch && !provider.zip) {
          provider.zip = zipMatch[1];
        }
        
        const stateMatch = nextLine.match(statePattern);
        if (stateMatch && !provider.state) {
          provider.state = stateMatch[1];
        }
        
        if (!provider.address_line1 && nextLine.match(/\d+\s+\w+\s+(st|ave|blvd|road|drive|lane|court|street)/i)) {
          provider.address_line1 = nextLine.substring(0, 100);
        }
      }

      if (provider.name && provider.name.trim().length > 2) {
        providers.push(provider);
      }
    }
    
    console.info('[PDF Ingestion] Fallback parsing found', providers.length, 'providers');
  }

  return providers;
}

/**
 * Main function to ingest PDF and process providers
 * @param {Buffer} pdfBuffer - PDF file as buffer
 * @param {String} fileName - Original filename for logging
 * @returns {Promise<Object>} { providersInserted, runId }
 */
export async function ingestPdf(pdfBuffer, fileName) {
  try {
    console.info('[PDF Ingestion] Starting OCR processing for:', fileName);

    // Step 1: Send PDF to Azure Vision OCR
    console.info('[PDF Ingestion] Sending PDF to Azure Vision API...');
    const operationUrl = await sendToAzureOCR(pdfBuffer);
    console.info('[PDF Ingestion] OCR operation URL:', operationUrl);

    // Step 2: Poll until OCR completes
    console.info('[PDF Ingestion] Polling for OCR completion...');
    const ocrResult = await pollOcr(operationUrl);
    console.info('[PDF Ingestion] OCR completed successfully');

    // Step 3: Extract text lines from OCR result
    const ocrLines = [];
    console.info('[PDF Ingestion] OCR Result status:', ocrResult.status);
    console.info('[PDF Ingestion] OCR Result keys:', Object.keys(ocrResult));
    
    // Azure Vision Read API v3.2 returns analyzeResult directly on top level for polling,
    // but can also return readResults directly
    let readResults = null;
    
    if (ocrResult.analyzeResult && ocrResult.analyzeResult.readResults) {
      // Structure: { analyzeResult: { readResults: [...] } }
      readResults = ocrResult.analyzeResult.readResults;
      console.info('[PDF Ingestion] Found readResults in analyzeResult');
    } else if (ocrResult.readResults) {
      // Structure: { readResults: [...] }
      readResults = ocrResult.readResults;
      console.info('[PDF Ingestion] Found readResults at top level');
    } else if (Array.isArray(ocrResult)) {
      // Direct array
      readResults = ocrResult;
      console.info('[PDF Ingestion] Result is direct array');
    }

    if (readResults && Array.isArray(readResults)) {
      console.info('[PDF Ingestion] Processing', readResults.length, 'pages');
      
      for (const page of readResults) {
        console.info('[PDF Ingestion] Page has', page.lines ? page.lines.length : 0, 'lines');
        
        if (page.lines && Array.isArray(page.lines)) {
          ocrLines.push(...page.lines);
        }
      }
    } else {
      console.warn('[PDF Ingestion] Could not find readResults in response structure');
      console.info('[PDF Ingestion] Full response:', JSON.stringify(ocrResult).substring(0, 500));
    }

    console.info('[PDF Ingestion] Extracted', ocrLines.length, 'text blocks from OCR');
    
    if (ocrLines.length > 0) {
      const sampleLines = ocrLines.slice(0, 5).map(l => typeof l === 'string' ? l : (l.text || JSON.stringify(l).substring(0, 50))).join(' | ');
      console.info('[PDF Ingestion] First few text blocks:', sampleLines);
    } else {
      console.warn('[PDF Ingestion] No text blocks extracted! OCR may have failed or PDF might be scanned images.');
    }

    // Step 4: Parse OCR text into structured providers
    const parsedProviders = parseProvidersFromOcr(ocrLines);
    console.info('[PDF Ingestion] Parsed', parsedProviders.length, 'providers from OCR text');

    if (parsedProviders.length === 0) {
      throw new Error('No providers could be parsed from PDF OCR result. The PDF may not contain readable text, or the provider information may not match the expected format (Name, NPI, Phone, Address).');
    }

    // Step 5: Insert providers into database
    let providersInserted = 0;
    const insertedProviderIds = [];

    for (const provider of parsedProviders) {
      try {
        // Ensure required fields
        if (!provider.name) continue;

        const { data: insertedProvider, error: insertError } = await supabase
          .from('providers')
          .insert({
            name: provider.name,
            phone: provider.phone || null,
            address_line1: provider.address_line1 || null,
            city: provider.city || null,
            state: provider.state || null,
            zip: provider.zip || null,
            speciality: provider.speciality || null,
            license_number: provider.license_number || null,
            npi_id: provider.npi || null, // Use npi_id field from schema
            email: null // PDF OCR typically doesn't extract email
          })
          .select();

        if (insertError) {
          console.error('[PDF Ingestion] Failed to insert provider:', provider.name, insertError.message || insertError);
          continue;
        }

        if (insertedProvider && insertedProvider.length > 0) {
          const insertedProviderId = insertedProvider[0].id;
          insertedProviderIds.push(insertedProviderId);
          providersInserted++;

          // Step 6: Store OCR data in provider_sources
          try {
            await supabase.from('provider_sources').insert({
              provider_id: insertedProviderId,
              source_type: 'PDF_OCR',
              raw_data: {
                originalFileName: fileName,
                parsedData: provider,
                ocrFullText: ocrLines.map(l => l.text || l).join('\n'),
                ocrTimestamp: new Date().toISOString()
              }
            });
          } catch (sourceErr) {
            console.error('[PDF Ingestion] Failed to insert provider_sources for', insertedProviderId, sourceErr.message || sourceErr);
            // Don't fail the whole process for source storage
          }
        }
      } catch (err) {
        console.error('[PDF Ingestion] Unexpected error inserting provider:', err.message || err);
      }
    }

    console.info('[PDF Ingestion] Successfully inserted', providersInserted, 'providers');

    // Step 7: Trigger validation workflow for inserted providers
    console.info('[PDF Ingestion] Triggering validation workflow for', insertedProviderIds.length, 'providers');
    const runId = await runValidationForImportedProviders(insertedProviderIds);

    return {
      providersInserted,
      runId
    };
  } catch (error) {
    console.error('[PDF Ingestion] Fatal error:', error.message || error);
    throw error;
  }
}
