/**
 * Parse time delay string to milliseconds.
 * Supports: "20min", "2h", "1d", "30min", "3h", "2d", etc.
 */
export function parseDelayToMs(delay: string): number | null {
  const normalized = delay.trim().toLowerCase();

  const match = normalized.match(/^(\d+)(min|h|d)$/);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case 'min':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}
