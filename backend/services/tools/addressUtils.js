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

