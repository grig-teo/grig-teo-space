/**
 * Minimal type declaration for `tz-lookup`, which ships no TypeScript types.
 * It exposes a single default export that maps coordinates to an IANA zone.
 */
declare module 'tz-lookup' {
  /** Returns the IANA timezone name for a coordinate, e.g. "Europe/Moscow". */
  export default function tzlookup(latitude: number, longitude: number): string;
}
