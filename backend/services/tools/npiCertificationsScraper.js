import axios from 'axios';

/**
 * Scrape certification data from NPI Registry API
 */
export async function scrapeNPICertifications(npiId, providerName) {
  try {
    console.log(`\n[NPI Certifications] ========== Starting NPI Lookup ==========`);
    console.log(`[NPI Certifications] NPI ID: ${npiId}`);
    console.log(`[NPI Certifications] Provider Name: ${providerName}`);
    
    const url = `https://npiregistry.cms.hhs.gov/api/?number=${npiId}&version=2.1`;
    console.log(`[NPI Certifications] API URL: ${url}`);
    
    const response = await axios.get(url, {
      timeout: 10000
    });
    
    console.log(`[NPI Certifications] API Response status:`, response.status);
    console.log(`[NPI Certifications] Result count:`, response.data.result_count);

    if (response.data.result_count === 0) {
      console.log(`[NPI Certifications] ✗ No results found for NPI ${npiId}`);
      return { isFound: false };
    }
    
    const result = response.data.results[0];
    console.log(`[NPI Certifications] Provider name from API:`, result.basic?.name || 'N/A');
    console.log(`[NPI Certifications] Taxonomies count:`, result.taxonomies?.length || 0);

    const certifications = [];
    
    // Extract taxonomy (specialty/certification)
    if (result.taxonomies && result.taxonomies.length > 0) {
      console.log(`[NPI Certifications] Processing ${result.taxonomies.length} taxonomies...`);
      
      result.taxonomies.forEach((tax, idx) => {
        if (tax.desc) {
          console.log(`  [${idx + 1}] ${tax.desc} (Primary: ${tax.primary}, Code: ${tax.code})`);
          
          certifications.push({
            name: tax.desc,
            code: tax.code,
            isPrimary: tax.primary || false,
            license: tax.license || null,
            state: tax.state || null
          });
        }
      });
    } else {
      console.log(`[NPI Certifications] ⚠ No taxonomies found`);
    }

    console.log(`[NPI Certifications] ✓ Found ${certifications.length} certifications`);
    
    const result_obj = {
      isFound: true,
      certifications,
      specialty: certifications.find(c => c.isPrimary)?.name || certifications[0]?.name,
      npiData: result
    };

    console.log(`[NPI Certifications] Primary specialty:`, result_obj.specialty);
    console.log(`[NPI Certifications] ========== NPI Lookup Complete ==========\n`);
    
    return result_obj;
  } catch (error) {
    console.error(`[NPI Certifications] ✗ Error:`, error.message);
    if (error.response) {
      console.error(`[NPI Certifications] Response status:`, error.response.status);
      console.error(`[NPI Certifications] Response data:`, error.response.data);
    }
    return { isFound: false, error: error.message };
  }
}
