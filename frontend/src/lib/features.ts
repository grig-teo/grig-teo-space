/**
 * Temporary surface switches.
 *
 * Each flag hides a whole feature without deleting it: the components, routes
 * and database content all stay in place, so flipping the flag back to `true`
 * restores the feature with no other change.
 */

/**
 * Blog section: the landing-page block, its header nav link and the hero
 * "articles" stat all follow this flag. The /blog routes keep working, so
 * existing links and the sitemap entry are unaffected.
 */
export const SHOW_BLOG = false;
