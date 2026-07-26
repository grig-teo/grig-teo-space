import { createHash, timingSafeEqual } from 'crypto';

/**
 * Constant-time comparison of two secret strings.
 *
 * Both inputs are SHA-256 hashed first to normalize their lengths, so
 * `timingSafeEqual` always receives equal-length buffers (it throws on
 * mismatched lengths). Hashing also ensures the comparison leaks zero
 * information about the plaintext — an attacker learns only "match" or
 * "no match", never how many leading characters were correct.
 *
 * @returns `true` when the two secrets are equal, `false` otherwise.
 */
export function secureCompare(candidate: string, expected: string): boolean {
  if (!candidate || !expected) return false;
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
