/**
 * Filters autocomplete items by a case-insensitive substring match.
 *
 * @param items - candidate items
 * @param query - text to match against each item
 * @param [limit] - maximum number of results (defaults to 12)
 * @returns the matching items, capped at `limit`
 */
export function filterAutocompleteItems(items: string[], query: string, limit = 12) {
  const normalized = query.trim().toLowerCase();
  return items
    .filter((item) => item.toLowerCase().includes(normalized))
    .slice(0, Math.max(0, limit));
}

/**
 * Finds an autocomplete item whose value exactly equals the query.
 *
 * @param items - candidate items
 * @param query - exact value to look for
 * @returns the matching item, or null when none matches
 */
export function findExactAutocompleteItem(items: string[], query: string) {
  return items.find((item) => item === query) ?? null;
}
