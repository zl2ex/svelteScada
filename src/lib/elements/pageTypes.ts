import type { PageSelect } from "$lib/sqlite/tables";

export type PageRecord = PageSelect;

export type PageWithPath = PageRecord & {
  path: string;
};

/**
 * Builds the path for a page from its name.
 *
 * @param pages - Record of pages keyed by id
 * @param id - Id of the target page
 * @returns The page path, or an empty string when the page is missing
 */
export function pagePath(pages: Record<string, PageRecord>, id: string) {
  const page = pages[id];
  return page ? `/${page.name}` : "";
}

/**
 * Builds the full route for a page within a project.
 *
 * @param pages - Record of pages keyed by id
 * @param projectName - Name of the project
 * @param id - Id of the target page
 * @returns The project-scoped route, or the project root when the page is missing
 */
export function pageRoute(pages: Record<string, PageRecord>, projectName: string, id: string) {
  return `/${projectName}${pagePath(pages, id)}`;
}

/**
 * Returns all pages sorted by sort index then name.
 *
 * @param pages - Record of pages keyed by id
 * @returns An array of pages in display order
 */
export function sortedPages(pages: Record<string, PageRecord>) {
  return Object.values(pages).sort(
    (a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name),
  );
}
