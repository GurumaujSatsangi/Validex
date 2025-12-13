import axios from 'axios';

/**
 * Scrape certification data from NPI Registry API
 */
export async function scrapeNPICertifications(npiId, providerName) {
  try {
    console.log(`[NPI Certifications] Fetching data for NPI: ${npiId}`);
    
    const url = `https://npiregistry.cms.hhs.gov/api/?number=${npiId}&version=2.1`;
    
    const response = await axios.get(url, {
      timeout: 10000
    });
    
    if (response.data.result_count === 0) {
      return { isFound: false };
    }
    
    const result = response.data.results[0];
    const certifications = [];
    
    // Extract taxonomy (specialty/certification)
    if (result.taxonomies && result.taxonomies.length > 0) {
      result.taxonomies.forEach(tax => {
        if (tax.desc) {
          certifications.push({
            name: tax.desc,
            code: tax.code,
            isPrimary: tax.primary || false,
            license: tax.license || null,
            state: tax.state || null
          });
        }
      });
    }
    
    console.log(`[NPI Certifications] Found ${certifications.length} certifications`);
    
    return {
      isFound: true,
      certifications,
      specialty: certifications.find(c => c.isPrimary)?.name || certifications[0]?.name
    };
  } catch (error) {
    console.error('[NPI Certifications] Error:', error.message);
    return { isFound: false, error: error.message };
  }
}
