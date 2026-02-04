// Phone normalization and validation utilities
export function normalizePhone(phone) {
  if (!phone) return phone;
  return phone.replace(/[^0-9+]/g, "");
}

export function validatePhoneFormat(phone) {
  if (!phone) return false;
  const normalized = normalizePhone(phone);
  // Check for US phone format: 10 digits
  return /^\+?1?\d{10}$/.test(normalized);
}

