/**
 * LRN Formatting and Privacy Utilities
 * Conforms to DepEd Learner Reference Number standards (12-digit numeric)
 * and Data Privacy Act of 2012 (RA 10173) masking requirements.
 */

/**
 * Masks a 12-digit DepEd LRN for privacy display.
 * Retains the first 6 digits (school/division identifier) and masks the last 6.
 * Example: '109876543210' -> '109876******'
 *
 * @param {string|number} lrn - The 12-digit Learner Reference Number
 * @returns {string} The masked LRN string, or 'N/A' if missing
 */
export function maskLrn(lrn) {
  if (!lrn && lrn !== 0) return 'N/A';
  const clean = String(lrn).trim();
  if (!clean) return 'N/A';

  // If already masked (contains *), return as-is
  if (clean.includes('*')) return clean;

  if (clean.length <= 6) {
    return clean.slice(0, Math.min(clean.length, 3)) + '***';
  }

  return clean.slice(0, 6) + '******';
}

/**
 * Checks whether an LRN matches a search query, matching either
 * the full LRN or the masked version.
 *
 * @param {string|number} lrn - Full LRN
 * @param {string} query - User search query
 * @returns {boolean}
 */
export function matchLrnQuery(lrn, query) {
  if (!lrn || !query) return false;
  const q = String(query).trim().toLowerCase();
  if (!q) return false;

  const raw = String(lrn).toLowerCase();
  const masked = maskLrn(lrn).toLowerCase();

  return raw.includes(q) || masked.includes(q);
}
