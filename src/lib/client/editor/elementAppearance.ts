import type { ElementRecord } from "$lib/elements/elementTypes";
import { extractCssVariableNames } from "$lib/themes/css";

export type AppearanceFieldKind = "common" | "svg" | "html";
export type AppearanceControl = "visibility" | "number" | "color" | "text" | "select";

export type AppearanceOption = {
  label: string;
  value: string;
};

export type AppearanceField = {
  property: string;
  label: string;
  kind: AppearanceFieldKind;
  control: AppearanceControl;
  placeholder?: string;
  options?: AppearanceOption[];
  suggestions?: string[];
  min?: number;
  max?: number;
  step?: number;
};

const CSS_COLOR_SUGGESTIONS = [
  "inherit",
  "currentColor",
  "transparent",
  "black",
  "white",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "gray",
];

const visibilityOptions: AppearanceOption[] = [
  { label: "visible", value: "" },
  { label: "hidden", value: "hidden" },
  { label: "collapse", value: "collapse" },
];

const strokeStyleOptions: AppearanceOption[] = [
  { label: "Solid", value: "" },
  { label: "Dashed", value: "8 4" },
  { label: "Dotted", value: "2 4" },
];

const lineCapOptions: AppearanceOption[] = [
  { label: "Default (butt)", value: "" },
  { label: "Butt", value: "butt" },
  { label: "Round", value: "round" },
  { label: "Square", value: "square" },
];

const borderStyleOptions: AppearanceOption[] = [
  { label: "Default (solid)", value: "" },
  { label: "Solid", value: "solid" },
  { label: "Dashed", value: "dashed" },
  { label: "Dotted", value: "dotted" },
  { label: "Double", value: "double" },
  { label: "None", value: "none" },
];

export const appearanceFields: AppearanceField[] = [
  {
    property: "visibility",
    label: "Visibility",
    kind: "common",
    control: "visibility",
    placeholder: "visible",
    options: visibilityOptions,
  },
  {
    property: "opacity",
    label: "Opacity",
    kind: "common",
    control: "number",
    placeholder: "1",
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    property: "stroke",
    label: "Stroke",
    kind: "svg",
    placeholder: "none",
    control: "color",
  },
  {
    property: "fill",
    label: "Fill",
    kind: "svg",
    placeholder: "none",
    control: "color",
  },
  {
    property: "stroke-width",
    label: "Stroke width",
    kind: "svg",
    control: "text",
    suggestions: ["0", "1", "2", "3", "4", "var(--default-border-width)"],
  },
  {
    property: "stroke-dasharray",
    label: "Stroke style",
    kind: "svg",
    control: "select",
    options: strokeStyleOptions,
  },
  {
    property: "stroke-linecap",
    label: "Line cap",
    kind: "svg",
    control: "select",
    options: lineCapOptions,
  },
  {
    property: "color",
    label: "Text color",
    kind: "html",
    placeholder: "inherit",
    control: "color",
  },
  {
    property: "background-color",
    label: "Background color",
    kind: "html",
    placeholder: "inherit",
    control: "color",
  },
  {
    property: "border-radius",
    label: "Border radius",
    kind: "html",
    control: "text",
    placeholder: "0",
    suggestions: [
      "0",
      "0.125rem",
      "0.25rem",
      "0.33rem",
      "0.5rem",
      "1rem",
      "9999px",
      "var(--radius-base)",
      "var(--radius-container)",
    ],
  },
  {
    property: "border-style",
    label: "Border style",
    kind: "html",
    control: "select",
    placeholder: "solid",
    options: borderStyleOptions,
  },
  {
    property: "border-color",
    label: "Border color",
    kind: "html",
    control: "color",
    placeholder: "currentColor",
  },
];

/**
 * Selects appearance fields that apply to a set of elements.
 * @param elements - Selected elements.
 * @returns The applicable fields, or none for mixed or user component selections.
 */
export function appearanceFieldsFor(elements: ElementRecord[]) {
  if (elements.length === 0 || elements.some((element) => element.kind === "user-component")) {
    return [];
  }

  const allSvg = elements.every((element) => element.kind === "svg");
  const allHtml = elements.every(
    (element) => element.kind === "html" || element.kind === "base-component",
  );

  return appearanceFields.filter(
    (field) =>
      field.kind === "common" ||
      (field.kind === "svg" && allSvg) ||
      (field.kind === "html" && allHtml),
  );
}

/**
 * Returns the style keys managed by appearance controls for elements.
 * @param elements - Selected elements.
 * @returns The managed style keys.
 */
export function appearanceManagedStyleKeys(elements: ElementRecord[]) {
  return new Set(appearanceFieldsFor(elements).map((field) => field.property));
}

/**
 * Builds suggestion values for an appearance field, including theme variables.
 * @param field - Appearance field.
 * @param themeCss - Theme CSS used to extract variables.
 * @returns Deduplicated suggestion values.
 */
export function appearanceSuggestions(field: AppearanceField, themeCss: string) {
  const themeVariables = extractCssVariableNames(themeCss).map((name) => `var(${name})`);
  const suggestions = [...(field.suggestions ?? []), ...themeVariables];

  if (field.control === "color") suggestions.push(...CSS_COLOR_SUGGESTIONS);
  if (field.property === "border-radius") {
    suggestions.push(
      ...themeVariables.filter((value) => value.includes("radius")),
      ...(field.suggestions ?? []),
    );
  }

  return [...new Set(suggestions)];
}

/**
 * Returns select options, appending a custom option for unlisted values.
 * @param field - Appearance field.
 * @param value - Current value.
 * @returns The available options.
 */
export function appearanceOptions(field: AppearanceField, value: string) {
  const options = field.options ?? [];
  if (!value || options.some((option) => option.value === value)) return options;
  return [...options, { label: `Custom (${value})`, value }];
}

/**
 * Normalizes a CSS hex color to six-digit form.
 * @param value - Color value to normalize.
 * @param [fallback] - Value returned for non-hex colors (defaults to "#000000").
 * @returns The normalized hex color or fallback.
 */
export function toHexColor(value: string, fallback = "#000000") {
  const trimmed = value.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  return fallback;
}
