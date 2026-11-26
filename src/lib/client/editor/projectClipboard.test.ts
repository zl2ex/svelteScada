import { describe, expect, it } from "vitest";
import type { ElementRecord } from "$lib/elements/elementTypes";
import type { PageRecord } from "$lib/elements/pageTypes";
import {
  z_ElementInsert,
  z_PageInsert,
  z_ProjectInsert,
  type ProjectSelect,
} from "$lib/sqlite/tables";
import {
  collectElementSubtree,
  createElementCopy,
  createPageCopy,
  createProjectCopy,
  parseProjectClipboard,
  toClipboardElement,
  toClipboardPage,
  toClipboardProject,
  uniqueRouteName,
} from "./projectClipboard";

function project(overrides: Partial<ProjectSelect> = {}): ProjectSelect {
  return {
    id: "project-1",
    name: "site",
    version: "1.0.0",
    description: "Site",
    themeId: null,
    grid_enabled: true,
    grid_spacing: 5,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function page(overrides: Partial<PageRecord> = {}): PageRecord {
  return {
    id: "page-1",
    projectId: "project-1",
    name: "overview",
    sortIndex: 0,
    createdAt: 3,
    updatedAt: 4,
    ...overrides,
  };
}

function element(overrides: Partial<ElementRecord> = {}): ElementRecord {
  return {
    id: "element-1",
    parentId: null,
    sortIndex: 0,
    kind: "html",
    tag: "div",
    baseComponent: null,
    referencedComponentId: null,
    name: "container",
    text: null,
    attributes: {},
    properties: {},
    style: {},
    styleClass: [],
    bindings: null,
    createdAt: 5,
    updatedAt: 6,
    ...overrides,
  };
}

function elementItem(rootId: string, elements: ElementRecord[]) {
  return {
    type: "element" as const,
    rootId,
    elements: elements.map(toClipboardElement),
  };
}

function projectItem(source: ProjectSelect, sourcePages: PageRecord[], elements: ElementRecord[]) {
  return {
    type: "project" as const,
    project: toClipboardProject(source),
    pages: sourcePages.map((sourcePage) => ({
      page: toClipboardPage(sourcePage),
      elements: elements
        .filter((entry) => entry.name.startsWith(sourcePage.id))
        .map(toClipboardElement),
    })),
  };
}

describe("database insert timestamp defaults", () => {
  it("fills timestamps when insert payloads omit them", () => {
    const page = z_PageInsert.parse({ projectId: "project-1", name: "overview" });
    const project = z_ProjectInsert.parse({ name: "site" });
    const element = z_ElementInsert.parse({ kind: "html", tag: "div" });

    expect(page.createdAt).toBeTypeOf("number");
    expect(page.updatedAt).toBeTypeOf("number");
    expect(project.createdAt).toBeTypeOf("number");
    expect(project.updatedAt).toBeTypeOf("number");
    expect(element.createdAt).toBeTypeOf("number");
    expect(element.updatedAt).toBeTypeOf("number");
  });
});

describe("parseProjectClipboard", () => {
  it("rejects invalid JSON and invalid payloads", () => {
    expect(parseProjectClipboard("not json").isErr()).toBe(true);
    expect(parseProjectClipboard(JSON.stringify([{ type: "element" }])).isErr()).toBe(true);
  });

  it("adds fresh timestamps to copied records", () => {
    const source = element();
    const copied = toClipboardElement(source);

    expect(copied).not.toHaveProperty("createdAt");
    expect(copied).not.toHaveProperty("updatedAt");

    const parsed = parseProjectClipboard(JSON.stringify([elementItem(source.id, [source])]));
    expect(parsed.isOk()).toBe(true);
    if (parsed.isErr()) return;

    const parsedElement = parsed.value[0];
    if (parsedElement.type !== "element") return;
    expect(parsedElement.elements[0].createdAt).toBeTypeOf("number");
    expect(parsedElement.elements[0].updatedAt).toBeTypeOf("number");
  });

  it("rejects cycles and disconnected element trees", () => {
    const first = element({ id: "first", parentId: "second", name: "first" });
    const second = element({ id: "second", parentId: "first", name: "second" });

    expect(
      parseProjectClipboard(JSON.stringify([elementItem("first", [first, second])])).isErr(),
    ).toBe(true);
  });
});

describe("copy remapping", () => {
  it("remaps an element subtree under the pasted parent", () => {
    const child = element({ id: "child", parentId: "root", name: "child" });
    const root = element({ id: "root", name: "root" });
    const source = [root, child];
    const parsed = parseProjectClipboard(JSON.stringify([elementItem("root", source)]));
    expect(parsed.isOk()).toBe(true);
    if (parsed.isErr()) return;

    const item = parsed.value[0];
    if (item.type !== "element") return;
    const remapped = createElementCopy(item, null, 0);

    expect(remapped).toHaveLength(2);
    expect(remapped[0].id).not.toBe("root");
    expect(remapped[1].id).not.toBe("child");
    expect(remapped[0].parentId).toBeNull();
    expect(remapped[1].parentId).toBe(remapped[0].id);
  });

  it("remaps a copied page into another project with a unique name", () => {
    const sourcePage = page({ name: "overview" });
    const root = element({ id: "root", name: "overview-root" });
    const child = element({ id: "child", parentId: "root", name: "overview-child" });
    const parsed = parseProjectClipboard(
      JSON.stringify([
        {
          type: "page",
          page: toClipboardPage(sourcePage),
          elements: [root, child].map(toClipboardElement),
        },
      ]),
    );
    expect(parsed.isOk()).toBe(true);
    if (parsed.isErr()) return;

    const item = parsed.value[0];
    if (item.type !== "page") return;
    const copied = createPageCopy(item, "target-project", [
      page({ id: "existing", name: "overview" }),
    ]);

    expect(copied.page.id).not.toBe(sourcePage.id);
    expect(copied.page.projectId).toBe("target-project");
    expect(copied.page.name).toBe("overview-copy");
    expect(copied.page.sortIndex).toBe(1);
    expect(copied.elements[0].id).not.toBe(root.id);
    expect(copied.elements[1].parentId).toBe(copied.elements[0].id);
  });

  it("remaps project pages and keeps each page's elements together", () => {
    const source = project();
    const firstPage = page({ id: "page-1", name: "first", sortIndex: 1 });
    const secondPage = page({ id: "page-2", name: "second", sortIndex: 0 });
    const firstElement = element({ id: "first", name: "page-1-first" });
    const firstChild = element({ id: "first-child", parentId: "first", name: "page-1-child" });
    const secondElement = element({ id: "second", name: "page-2-second" });

    const parsed = parseProjectClipboard(
      JSON.stringify([
        projectItem(source, [firstPage, secondPage], [firstElement, firstChild, secondElement]),
      ]),
    );
    expect(parsed.isOk()).toBe(true);
    if (parsed.isErr()) return;

    const item = parsed.value[0];
    if (item.type !== "project") return;
    const copied = createProjectCopy(item, [source]);

    expect(copied.project.id).not.toBe(source.id);
    expect(copied.project.name).toBe("site-copy");
    expect(copied.pages.map((entry) => entry.page.name)).toEqual(["second", "first"]);
    expect(copied.pages[0].page.projectId).toBe(copied.project.id);
    expect(copied.pages[0].elements.map((entry) => entry.name)).toEqual(["page-2-second"]);
    expect(copied.pages[1].elements.map((entry) => entry.name)).toEqual([
      "page-1-first",
      "page-1-child",
    ]);
    expect(copied.pages[1].elements[1].parentId).toBe(copied.pages[1].elements[0].id);
    expect(
      new Set(copied.pages.flatMap((entry) => entry.elements.map((item) => item.id))).size,
    ).toBe(3);
  });
});

describe("clipboard helpers", () => {
  it("collects an element subtree", () => {
    const elements = {
      root: element({ id: "root" }),
      child: element({ id: "child", parentId: "root", name: "child" }),
      other: element({ id: "other", name: "other" }),
    };

    expect(collectElementSubtree(elements, "root").map((entry) => entry.id)).toEqual([
      "root",
      "child",
    ]);
  });

  it("creates unique route names without exceeding the route limit", () => {
    expect(uniqueRouteName("site", ["site"])).toBe("site-copy");
    expect(uniqueRouteName("site", ["site", "site-copy"])).toBe("site-copy-2");
    expect(uniqueRouteName("a".repeat(64), ["a".repeat(64)])).toHaveLength(64);
  });
});
