/**
 * Shape of the `learning` site_content key.
 *
 * Only fields Duolingo actually reports are ever populated: streak, XP inside
 * the Spanish course, and total account XP. Vocabulary counts and study
 * minutes are NOT exposed by the public profile, so we do not invent them.
 * `level` is self-declared and must never be derived from XP.
 */
export type LearningSnapshot = {
  /** False when the account has no Spanish course, or the profile is unreadable. */
  available: boolean;
  source: 'duolingo';
  /** Consecutive practice days, straight from the profile. */
  streak?: number;
  /** XP earned in the Spanish course only. */
  xp?: number;
  /** XP across every course on the account. */
  totalXp?: number;
  /** Language the account learns from, e.g. "en". Informational. */
  fromLanguage?: string;
  /** Self-assessed CEFR level (A1..C2). Declared by hand, never inferred. */
  level?: string;
  /** When the level was declared (ISO date). */
  levelSince?: string;
  /** When the sync last ran successfully. */
  syncedAt: string;
  /** When the Duolingo account was created (ISO), used to estimate a pace. */
  createdAt?: string;
};
