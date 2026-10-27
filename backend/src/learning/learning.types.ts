/**
 * Shape of the `learning` site_content key.
 *
 * Only fields Duolingo actually reports are ever populated: streak, and XP per
 * course. Vocabulary counts and study minutes are NOT exposed by the public
 * profile, so we do not invent them. `level` is self-declared per course and
 * must never be derived from XP.
 */
export type LearningCourse = {
  /** ISO 639-1 code, e.g. "es". */
  code: string;
  /** Title as Duolingo reports it, e.g. "Spanish". */
  title: string;
  /** XP earned inside this course only. */
  xp: number;
  /** Language the course is taught from, e.g. "ro". */
  fromLanguage?: string;
  /**
   * First sync that saw this course. The pace estimate divides its hours by the
   * time since here, so a course added today reports no pace until it has
   * history rather than inheriting the account's age.
   */
  firstSeenAt: string;
  /** Self-assessed CEFR level (A1..C2). Declared by hand, never inferred. */
  level?: string;
  /** When the level was declared (ISO date). */
  levelSince?: string;
};

export type LearningSnapshot = {
  /** False when the account has no courses at all, or the profile is unreadable. */
  available: boolean;
  source: 'duolingo';
  /** Consecutive practice days across the whole account. */
  streak?: number;
  /** XP across every course on the account. */
  totalXp?: number;
  /** Language the account learns from, e.g. "ro". Informational. */
  fromLanguage?: string;
  /** When the Duolingo account was created (ISO). */
  createdAt?: string;
  courses: LearningCourse[];
  /** When the sync last ran successfully. */
  syncedAt: string;
};
