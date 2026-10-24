import type { PageServerLoad } from "./$types";
import type { PageRecord } from "$lib/page/pageTypes";
import { pageManager } from "$lib/server/page/pageManager";
import { pageElementManager } from "$lib/server/page/pageElementManager";

export const load: PageServerLoad = async ({ url }) => {
  const activePageId = url.searchParams.get("page");
  if (!activePageId) {
    return {
      activePageId: null,
      page: null,
      elements: {} as Record<string, never>,
    };
  }

  const page = pageManager.get(activePageId);
  if (page.isErr()) {
    return {
      activePageId: null,
      page: null,
      elements: {} as Record<string, never>,
    };
  }

  const elements = pageElementManager.list({
    type: "page",
    pageId: activePageId,
  });
  if (elements.isErr()) throw elements.error;

  return {
    activePageId,
    page: page.value satisfies PageRecord,
    elements: elements.value,
  };
};
