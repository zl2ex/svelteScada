export function filterAutocompleteItems(items: string[], query: string, limit = 12) {
  const normalized = query.trim().toLowerCase();
  return items
    .filter((item) => item.toLowerCase().includes(normalized))
    .slice(0, Math.max(0, limit));
}
