/**
 * Test Deep Scraping URL Generation
 * Run with: node testDeepScraping.js
 */

// Mock provider data
const testProviders = [
  {
    id: 'test-1',
    name: 'JOHN DOE MD',
    npi_id: '1234567890',
    city: 'Baltimore',
    state: 'MD',
    address_line1: '123 Main St',
    zip: '21201',
    phone: '555-100-0001',
    speciality: 'Internal Medicine'
  },
  {
    id: 'test-2',
    name: 'JANE SMITH DDS',
    npi_id: '9876543210',
    city: 'New York',
    state: 'NY',
    address_line1: '456 Park Ave',
    zip: '10022',
    phone: '555-200-0002',
    speciality: 'General Dentistry'
  },
  {
    id: 'test-3',
    name: 'ROBERT JOHNSON DO',
    npi_id: '1122334455',
    city: 'Cleveland',
    state: 'OH',
    address_line1: '789 Cedar Rd',
    zip: '44106',
    phone: '555-300-0003',
    speciality: 'Family Medicine'
  }
];

// URL generation function (copied from deepScrapingAgent.js)
function buildCandidateUrls(provider) {
  const urls = [];
  const searchName = encodeURIComponent(provider.name || '');
  const npi = provider.npi_id || '';

  // Provider website from Azure POI
  if (provider.website) urls.push(provider.website);

  // NPI Registry Profile (official government source)
  if (npi) {
    urls.push(`https://npiregistry.cms.hhs.gov/provider-view/${npi}`);
  }

  // Healthgrades - Major provider directory
  if (searchName) {
    urls.push(`https://www.healthgrades.com/search?what=${searchName}&where=&pageNum=1`);
  }

  // WebMD Physician Directory
  if (searchName) {
    urls.push(`https://doctor.webmd.com/find-a-doctor/search?q=${searchName}`);
  }

  // Vitals.com
  if (searchName) {
    urls.push(`https://www.vitals.com/search?q=${searchName}`);
  }

  // Zocdoc
  if (searchName && provider.city) {
    const city = encodeURIComponent(provider.city);
    urls.push(`https://www.zocdoc.com/search/?dr_specialty=&address=${city}&insurance_carrier=-1&searchQueryGuid=&search_query=${searchName}`);
  }

  // State medical board URLs
  if (provider.state) {
    const state = provider.state.toUpperCase();
    const lastName = extractLastName(provider.name || '');
    
    if (state === 'MD' && lastName) {
      urls.push(`https://www.mbp.state.md.us/bpqapp/`);
    } else if (state === 'VA' && lastName) {
      urls.push(`https://www.dhp.virginia.gov/lookup/`);
    } else if (state === 'CA' && lastName) {
      urls.push(`https://search.dca.ca.gov/`);
    } else if (state === 'NY' && lastName) {
      urls.push(`https://www.nysed.gov/online-verifications-professional-licenses`);
    } else if (state === 'TX' && lastName) {
      urls.push(`https://profile.tmb.state.tx.us/OnlineVerification`);
    } else if (state === 'FL' && lastName) {
      urls.push(`https://mqa-internet.doh.state.fl.us/MQASearchServices/HealthCareProviders`);
    }
  }

  // Hospital directory URLs (based on city)
  if (provider.city && searchName) {
    const city = provider.city.toLowerCase();
    if (city.includes('baltimore')) {
      urls.push(`https://www.hopkinsmedicine.org/find-a-doctor`);
      urls.push(`https://www.medstarhealth.org/doctors`);
    } else if (city.includes('cleveland')) {
      urls.push(`https://my.clevelandclinic.org/staff`);
    } else if (city.includes('new york') || city.includes('nyc')) {
      urls.push(`https://www.mountsinai.org/profiles`);
      urls.push(`https://www.nyp.org/physician`);
    } else if (city.includes('boston')) {
      urls.push(`https://www.massgeneral.org/doctors`);
      urls.push(`https://www.brighamandwomens.org/find-a-doctor`);
    } else if (city.includes('philadelphia')) {
      urls.push(`https://www.pennmedicine.org/find-a-doctor`);
    } else if (city.includes('chicago')) {
      urls.push(`https://www.nm.org/doctors`);
    } else if (city.includes('los angeles') || city.includes('la')) {
      urls.push(`https://www.cedars-sinai.org/find-a-doctor`);
    } else if (city.includes('houston')) {
      urls.push(`https://www.houstonmethodist.org/doctor`);
    }
  }

  return [...new Set(urls)]; // Remove duplicates
}

function extractLastName(fullName) {
  if (!fullName) return '';
  
  // Remove titles and credentials
  const cleaned = fullName.replace(/\b(DR|MD|DO|DDS|DMD|DPM|PA|NP|RN|PharmD|PhD|DVM|PC|INC|LLC)\b\.?/gi, '').trim();
  
  // Split by comma (Last, First format)
  if (cleaned.includes(',')) {
    return cleaned.split(',')[0].trim();
  }
  
  // Split by space and take last word
  const parts = cleaned.split(/\s+/);
  return parts[parts.length - 1];
}

// Test URL generation
console.log('='.repeat(80));
console.log('DEEP SCRAPING URL GENERATION TEST');
console.log('='.repeat(80));

testProviders.forEach(provider => {
  console.log(`\nProvider: ${provider.name} (NPI: ${provider.npi_id})`);
  console.log(`Location: ${provider.city}, ${provider.state}`);
  console.log(`\nGenerated URLs:`);
  
  const urls = buildCandidateUrls(provider);
  
  if (urls.length === 0) {
    console.log('  ❌ NO URLS GENERATED');
  } else {
    urls.forEach((url, i) => {
      console.log(`  ${i + 1}. ${url}`);
    });
    console.log(`\n  ✅ Total: ${urls.length} URLs`);
  }
  
  console.log('-'.repeat(80));
});

console.log('\n✅ Test complete!');
console.log('\nExpected behavior:');
console.log('  - Each provider should generate 5-8 URLs');
console.log('  - NPI Registry URL should always be present');
console.log('  - Healthgrades, WebMD, Vitals URLs based on name');
console.log('  - State medical board URLs based on state');
console.log('  - Hospital directory URLs based on city');
