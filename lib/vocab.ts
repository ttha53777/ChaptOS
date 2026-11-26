/**
 * UI vocabulary system.
 *
 * Each VocabKey is a canonical term used in nav labels and page headings.
 * OrganizationConfig.vocabularyOverrides stores a sparse map of overrides;
 * resolveLabel() falls back to DEFAULT_LABELS when no override is set.
 *
 * Plurals are derived at render time via the `pluralize` package — store
 * the singular form only, pass plural=true to resolveLabel() when needed.
 */

import pluralize from "pluralize";

// The keys and defaults live in ./vocab-keys (no pluralize), so the native app can
// share them; re-exported here, where every web caller imports them from.
import { VOCAB_KEYS, DEFAULT_LABELS, type VocabKey, type VocabOverrides } from "./vocab-keys";
export { VOCAB_KEYS, DEFAULT_LABELS, type VocabKey, type VocabOverrides };

/**
 * Keep only known VocabKeys from an arbitrary override map, so client input
 * can't pollute the JSON column with unknown keys. Pure — shared by setVocab
 * (the config PATCH) and provisionOrg (the create blueprint).
 */
export function sanitizeVocabOverrides(overrides: Record<string, string>): VocabOverrides {
  const validKeys = new Set<string>(VOCAB_KEYS);
  const sanitized: VocabOverrides = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (validKeys.has(k)) sanitized[k as VocabKey] = v;
  }
  return sanitized;
}

/**
 * Resolve a vocab key to its display string.
 *
 * @param key      - canonical vocab key
 * @param overrides - sparse map from OrganizationConfig.vocabularyOverrides
 * @param plural   - whether to return the plural form
 */
export function resolveLabel(
  key: VocabKey,
  overrides: VocabOverrides,
  plural = false,
): string {
  const singular = overrides[key] ?? DEFAULT_LABELS[key];
  return plural ? pluralize(singular) : singular;
}
