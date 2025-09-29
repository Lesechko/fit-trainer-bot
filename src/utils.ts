export function calculateProgramDay(startDateISO: string, now: Date = new Date()): number {
  const [y, m, d] = startDateISO.split('-').map((n) => Number(n));
  if (!y || !m || !d) return 1;
  const startUTC = Date.UTC(y, m - 1, d, 0, 0, 0);
  const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0);
  const diffDays = Math.floor((nowUTC - startUTC) / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays + 1);
}

