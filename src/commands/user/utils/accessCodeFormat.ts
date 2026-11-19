/**
 * Generate a random access code (alphanumeric).
 * Length is typically 12 (8 + 4 from two Math.random slices).
 */
export function generateAccessCode(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6)
  );
}

/**
 * WayForPay / docs helper: paid deep-link URL for a course slug.
 */
export function buildPaidStartUrl(botUsername: string, courseSlug: string): string {
  return `https://t.me/${botUsername}?start=paid-${courseSlug}`;
}
