import type { PageSelect } from "$lib/sqlite/tables";

export type PageRecord = PageSelect;

export type PageWithPath = PageRecord & {
  path: string;
};

export function pagePath(pages: Record<string, PageRecord>, id: string) {
  const page = pages[id];
  return page ? `/${page.name}` : "";
}

export function pageRoute(pages: Record<string, PageRecord>, projectName: string, id: string) {
  return `/${projectName}${pagePath(pages, id)}`;
}

export function sortedPages(pages: Record<string, PageRecord>) {
  return Object.values(pages).sort(
    (a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name),
  );
}
