import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { assertCan } from "$lib/server/auth/authorize";
import { pageElementManager } from "$lib/server/page/pageElementManager";
import { pageManager } from "$lib/server/page/pageManager";
import { userComponentManager } from "$lib/server/page/userComponentManager";
import { userThemeManager } from "$lib/server/theme/userThemeManager";
import { DEFAULT_THEME_NAME } from "$lib/themes/defaultThemeCss";
import { projectManager } from "$lib/server/project/projectManager";
import { neverThrowErrorToString } from "$lib/util/neverThrow";

export const load: PageServerLoad = async ({ locals, params }) => {
  assertCan(locals.ability, "read", "Project");
  assertCan(locals.ability, "read", "Page");

  const project = projectManager.getByName(params.projectName);
  if (project.isErr()) {
    if (project.error.reason === "PROJECT_NOT_FOUND") error(404, project.error.cause);
    error(500, neverThrowErrorToString(project.error));
  }

  const pages = pageManager.getAllForProject(project.value.id);
  if (pages.isErr()) error(500, neverThrowErrorToString(pages.error));

  const page = pages.value.find((item) => item.name === params.pageName);
  if (!page) {
    error(404, `Page ${params.pageName} does not exist in project ${project.value.name}`);
  }

  const elements = pageElementManager.list({ type: "page", pageId: page.id });
  if (elements.isErr()) error(500, neverThrowErrorToString(elements.error));

  const definitions = userComponentManager.getDefinitions();
  if (definitions.isErr()) error(500, neverThrowErrorToString(definitions.error));

  const themes = userThemeManager.getAll();
  if (themes.isErr()) error(500, neverThrowErrorToString(themes.error));
  const theme =
    themes.value.find((item) => item.id === project.value.themeId) ??
    themes.value.find((item) => item.name === DEFAULT_THEME_NAME) ??
    themes.value[0] ??
    null;

  return {
    project: project.value,
    page,
    elements: elements.value,
    userComponents: definitions.value.filter(
      (definition) => definition.component.projectId === project.value.id,
    ),
    theme,
  };
};
