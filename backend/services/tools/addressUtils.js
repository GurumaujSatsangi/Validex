/**
 * Extracts ZIP code from address string
 * @param {string} address - Address string
 * @returns {string|null} ZIP code or null
 */
export function extractZip(address) {
  if (!address) return null;
  
  // Match 5-digit ZIP or ZIP+4 format
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return zipMatch ? zipMatch[1] : null;
}

/**
 * Extracts city from address string
 * @param {string} address - Address string
 * @returns {string|null} City name or null
 */
export function extractCity(address) {
  if (!address) return null;
  
  // Typically city comes before state abbreviation
  const parts = address.split(',').map(p => p.trim());
  
  if (parts.length >= 3) {
    return parts[parts.length - 3] || null;
  }
  
  return null;
}

/**
 * Extracts state abbreviation from address string
 * @param {string} address - Address string
 * @returns {string|null} State abbreviation (e.g., "IL") or null
 */
export function extractState(address) {
  if (!address) return null;
  
  // Match 2-letter state abbreviation followed by ZIP
  const stateMatch = address.match(/\b([A-Z]{2})\s+\d{5}/);
  return stateMatch ? stateMatch[1] : null;
}

/**
 * Normalizes address component for comparison (lowercase, trim, remove punctuation)
 * @param {string} text - Address component
 * @returns {string} Normalized text
 */
export function normalizeAddressComponent(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[.,\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generic text normalization (lowercase, trim, handle common variations)
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
export function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Legacy function kept for backwards compatibility
export function normalizeAddress(addr) {
  return normalizeAddressComponent(addr);
}

/**
 * Validates address format
 * @param {string} address - Address string
 * @returns {object} Validation result with isValid and components
 */
export function validateAddressFormat(address) {
  if (!address) {
    return { isValid: false, components: {} };
  }

  const components = {
    zip: extractZip(address),
    city: extractCity(address),
    state: extractState(address),
  };

  const isValid = !!(components.zip && components.state);

  return { isValid, components };
}

/**
 * Validates state code
 * @param {string} state - State abbreviation
 * @returns {object} Validation result with isValid and code
 */
export function validateState(state) {
  const validStates = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ];

  const upperState = state ? state.toUpperCase() : null;
  const isValid = validStates.includes(upperState);

  return { isValid, code: isValid ? upperState : null };
}

/**
 * Performs strict address matching with component-level comparison
 * Returns true if addresses are effectively the same (high similarity)
 * @param {string} addr1 - First address
 * @param {string} addr2 - Second address
 * @param {number} threshold - Minimum similarity threshold (default 0.99 for near-exact matches)
 * @returns {boolean} - True if addresses match strictly, false otherwise
 */
export function addressesMatch(addr1, addr2, threshold = 0.99) {
  if (!addr1 || !addr2) return false;
  if (addr1 === addr2) return true;

  // Normalize both addresses
  const norm1 = normalizeAddressComponent(addr1);
  const norm2 = normalizeAddressComponent(addr2);

  // Exact match after normalization
  if (norm1 === norm2) return true;

  // Extract and compare key components for more intelligent matching
  const zip1 = extractZip(addr1);
  const zip2 = extractZip(addr2);

  // If both have ZIPs and they differ, addresses don't match
  if (zip1 && zip2 && zip1 !== zip2) {
    return false;
  }

  // Extract states
  const state1 = extractState(addr1);
  const state2 = extractState(addr2);

  // If both have states and they differ, addresses don't match
  if (state1 && state2 && state1 !== state2) {
    return false;
  }

  // If we have matching ZIP codes, we can consider them the same ONLY if
  // the normalized text is extremely similar (to handle formatting differences)
  if (zip1 && zip2 && zip1 === zip2) {
    // For same ZIP code, require very high text similarity (99.5%+ match)
    // This allows minor formatting differences but catches suite number changes
    const words1 = norm1.split(/\s+/).filter(w => !/^\d{5}/.test(w));
    const words2 = norm2.split(/\s+/).filter(w => !/^\d{5}/.test(w));

    if (words1.length === 0 || words2.length === 0) {
      return norm1 === norm2;
    }

    // Check exact word-for-word match first (most reliable)
    if (words1.join(' ') === words2.join(' ')) {
      return true;
    }

    // Check if all words are present (handles different ordering or minor additions)
    const allWords1Present = words1.every(w => words2.includes(w));
    const allWords2Present = words2.every(w => words1.includes(w));

    // Only consider them matching if ALL words from both addresses are present
    // and the word sets have high overlap (to catch suite number changes)
    if (allWords1Present && allWords2Present) {
      // Additional check: ensure no significant number differences (like suite numbers)
      const nums1 = norm1.match(/\d+/g) || [];
      const nums2 = norm2.match(/\d+/g) || [];

      // If different number of numbers or different values (excluding ZIP), be strict
      if (nums1.length !== nums2.length) {
        return false; // Different number of numeric components = different addresses
      }

      // Check if non-ZIP numbers match
      const zip1Str = zip1.toString();
      const zip2Str = zip2.toString();
      const nums1NoZip = nums1.filter(n => n !== zip1Str && n !== zip2Str);
      const nums2NoZip = nums2.filter(n => n !== zip1Str && n !== zip2Str);

      if (nums1NoZip.length > 0 || nums2NoZip.length > 0) {
        // Has suite/apt numbers - must match exactly
        const numsMatch = nums1NoZip.length === nums2NoZip.length &&
          nums1NoZip.every((n, i) => n === nums2NoZip[i]);
        return numsMatch;
      }

      return true;
    }
  }

  // Without ZIP codes or mismatched ZIPs, don't consider them matching
  return false;
}

/**
 * Performs relaxed address component matching
 * Checks if address components match independently
 * @param {object} addrComponents1 - { street, city, state, zip }
 * @param {object} addrComponents2 - { street, city, state, zip }
 * @returns {object} - { isMatch, matchedComponents, score }
 */
export function compareAddressComponents(addrComponents1, addrComponents2) {
  const result = {
    isMatch: false,
    matchedComponents: {},
    score: 0
  };

  if (!addrComponents1 || !addrComponents2) return result;

  let matchedCount = 0;
  let totalCount = 0;

  // Compare ZIP
  if (addrComponents1.zip || addrComponents2.zip) {
    totalCount++;
    const zipMatch = addrComponents1.zip === addrComponents2.zip;
    result.matchedComponents.zip = zipMatch;
    if (zipMatch) matchedCount++;
  }

  // Compare state
  if (addrComponents1.state || addrComponents2.state) {
    totalCount++;
    const state1 = addrComponents1.state ? addrComponents1.state.toUpperCase() : '';
    const state2 = addrComponents2.state ? addrComponents2.state.toUpperCase() : '';
    const stateMatch = state1 === state2;
    result.matchedComponents.state = stateMatch;
    if (stateMatch) matchedCount++;
  }

  // Compare city (normalized)
  if (addrComponents1.city || addrComponents2.city) {
    totalCount++;
    const city1 = normalizeText(addrComponents1.city || '');
    const city2 = normalizeText(addrComponents2.city || '');
    const cityMatch = city1 === city2;
    result.matchedComponents.city = cityMatch;
    if (cityMatch) matchedCount++;
  }

  // Compare street (normalized)
  if (addrComponents1.street || addrComponents2.street) {
    totalCount++;
    const street1 = normalizeAddressComponent(addrComponents1.street || '');
    const street2 = normalizeAddressComponent(addrComponents2.street || '');
    const streetMatch = street1 === street2;
    result.matchedComponents.street = streetMatch;
    if (streetMatch) matchedCount++;
  }

  result.score = totalCount > 0 ? matchedCount / totalCount : 0;
  result.isMatch = result.score >= 0.75; // 75% of components must match

  return result;
}

