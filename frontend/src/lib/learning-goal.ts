import type { LearningCourse } from './api';

/**
 * How the B2 goal is estimated. These are assumptions, not measurements, so
 * they live in one place with their sources rather than scattered in the view.
 *
 * HOURS_TO_B2 — focused hours from zero to B2: 500 to 600 per the Cambridge
 *   guided-learning bands (A2 180-200, B1 350-400, B2 500-600), corroborated by
 *   the FSI's 600-750 hours to Spanish working proficiency. We take the floor of
 *   the range for a Romanian speaker, who starts closer to a Romance language
 *   than an English speaker does. The same band is applied to Italian.
 *
 * SECONDS_PER_XP — Duolingo bills 10 XP for a lesson of roughly four minutes,
 *   so about 24 seconds per XP (≈150 XP an hour). XP is inflated by streak
 *   freezes and double-XP boosts, which is why the result is shown as an
 *   estimate and never as a measurement of level.
 */
export const HOURS_TO_B2 = 500;
export const SECONDS_PER_XP = 24;

export type LearningGoal = {
  /** Share of the B2 hours accumulated, clamped to 0..100. */
  percent: number;
  hoursDone: number;
  hoursLeft: number;
  hoursTarget: number;
  /** Months left at the pace since the course was first seen; null if unknown. */
  monthsLeft: number | null;
};

const MS_PER_DAY = 86_400_000;
const DAYS_PER_MONTH = 30.4;
/** Below this there is not enough history for a pace to mean anything. */
const MIN_DAYS_FOR_PACE = 3;

/** Hours of study implied by an XP total. */
export function hoursFromXp(xp: number): number {
  return (xp * SECONDS_PER_XP) / 3600;
}

/**
 * Months still needed at the learner's own pace on this course. Returns null
 * rather than a guess when the pace cannot be established: a course started
 * today says nothing about how fast someone actually moves.
 */
function monthsAtPace(hoursDone: number, hoursLeft: number, since?: string): number | null {
  if (!since || hoursDone <= 0) return null;
  const days = (Date.now() - Date.parse(since)) / MS_PER_DAY;
  if (!Number.isFinite(days) || days < MIN_DAYS_FOR_PACE) return null;
  const hoursPerDay = hoursDone / days;
  if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0) return null;
  return hoursLeft / hoursPerDay / DAYS_PER_MONTH;
}

/**
 * Turns one course into progress towards B2.
 *
 * The percent is time-based on purpose. An XP percentage would imply that
 * filling the bar means reaching B2, and it does not: Duolingo's own later
 * sections cover B1 content, and the app cannot rehearse the unscripted
 * speaking that decides B2.
 */
export function computeGoal(course: Pick<LearningCourse, 'xp' | 'firstSeenAt'>): LearningGoal {
  const hoursDone = hoursFromXp(course.xp);
  const hoursLeft = Math.max(HOURS_TO_B2 - hoursDone, 0);
  return {
    percent: Math.min(100, (hoursDone / HOURS_TO_B2) * 100),
    hoursDone,
    hoursLeft,
    hoursTarget: HOURS_TO_B2,
    monthsLeft: monthsAtPace(hoursDone, hoursLeft, course.firstSeenAt),
  };
}

/** A course paired with its computed goal, ready to render. */
export type LearningRow = { course: LearningCourse; goal: LearningGoal };

/** Goals for every course, ordered by XP so the main language leads. */
export function computeGoals(courses: LearningCourse[]): LearningRow[] {
  return [...courses]
    .sort((a, b) => b.xp - a.xp)
    .map((course) => ({ course, goal: computeGoal(course) }));
}
