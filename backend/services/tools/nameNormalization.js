/**
 * Normalize provider names for improved search accuracy
 * Converts "CHRISTINE JACKSON BARTOLOMEI (RDHAP, BS)" to "CHRISTINE JACKSON BARTOLOMEI RDHAP BS"
 * This helps with searching on databases that use different formatting
 */

export function normalizeProviderNameForSearch(name) {
  if (!name || typeof name !== 'string') {
    return name;
  }

  // Replace parentheses with spaces and remove commas within credentials
  // "CHRISTINE JACKSON BARTOLOMEI (RDHAP, BS)" -> "CHRISTINE JACKSON BARTOLOMEI RDHAP BS"
  let normalized = name
    .replace(/\(/g, ' ')           // Replace opening parenthesis with space
    .replace(/\)/g, ' ')           // Replace closing parenthesis with space
    .replace(/,/g, ' ')            // Replace commas with spaces
    .replace(/\s+/g, ' ')          // Replace multiple spaces with single space
    .trim();                        // Remove leading/trailing whitespace

  return normalized;
}

/**
 * Extract just the name part without credentials
 * "CHRISTINE JACKSON BARTOLOMEI (RDHAP, BS)" -> "CHRISTINE JACKSON BARTOLOMEI"
 */
export function extractNameWithoutCredentials(name) {
  if (!name || typeof name !== 'string') {
    return name;
  }

  // Remove everything from opening parenthesis onwards
  const cleanName = name.split('(')[0].trim();
  return cleanName;
}

/**
 * Extract credentials from the provider name
 * "CHRISTINE JACKSON BARTOLOMEI (RDHAP, BS)" -> ["RDHAP", "BS"]
 */
export function extractCredentials(name) {
  if (!name || typeof name !== 'string') {
    return [];
  }

  // Extract content within parentheses
  const credentialsMatch = name.match(/\((.*?)\)/);
  if (!credentialsMatch) {
    return [];
  }

  // Split by comma and clean up
  const credentials = credentialsMatch[1]
    .split(',')
    .map(cred => cred.trim())
    .filter(cred => cred.length > 0);

  return credentials;
}
