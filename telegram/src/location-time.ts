import tzlookup from 'tz-lookup';

/**
 * Turns the owner's device coordinates into a real IANA timezone.
 *
 * A longitude/15 estimate is not good enough: Moscow sits near 37°E, which
 * naively gives UTC+2 while the actual offset is UTC+3. `tz-lookup` resolves
 * the true zone from a bundled timezone map, and `Intl` then applies whatever
 * offset (including DST) that zone has on the date in question.
 */
export function resolveZone(lat: number, lon: number): string {
  try {
    return tzlookup(lat, lon);
  } catch {
    return 'UTC';
  }
}

/** The local calendar date (YYYY-MM-DD) and hour (0-23) in `zone`. */
export function localNow(zone: string, at: Date = new Date()): { date: string; hour: number } {
  return { date: localDate(zone, at), hour: localHour(zone, at) };
}

/** Local calendar date as YYYY-MM-DD, used as the once-per-day key. */
export function localDate(zone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Local hour of day, 0-23. h23 avoids the "24" some locales return at midnight. */
export function localHour(zone: string, at: Date = new Date()): number {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(at);
  return Number(formatted);
}
