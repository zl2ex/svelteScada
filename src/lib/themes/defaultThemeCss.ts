import editorTheme from "../../routes/editorTheme.css?raw";
import { unwrapThemeCss, wrapThemeCss } from "$lib/themes/css";

export const DEFAULT_THEME_NAME = "Default";

const paletteFamilies = [
  "primary",
  "secondary",
  "tertiary",
  "success",
  "warning",
  "error",
  "surface",
] as const;

const colorPairs = [
  [50, 950],
  [100, 900],
  [200, 800],
  [300, 700],
  [400, 600],
  [600, 400],
  [700, 300],
  [800, 200],
  [900, 100],
  [950, 50],
] as const;

export const LIGHT_DARK_PAIRINGS_CSS = paletteFamilies
  .flatMap((family) =>
    colorPairs.flatMap(([light, dark]) => [
      `  --color-${family}-${light}-${dark}: light-dark(var(--color-${family}-${light}), var(--color-${family}-${dark}));`,
      `  --color-${family}-contrast-${light}-${dark}: light-dark(var(--color-${family}-contrast-${light}), var(--color-${family}-contrast-${dark}));`,
    ]),
  )
  .join("\n");

const componentCss = `
   /***** default classes, change properties and values but dont remove the classes it will break default styling for some components *****/
  & .input,
  & .select,
  & .textarea {
    min-height: 2rem;
    border: var(--default-border-width) solid var(--color-surface-300-700);
    border-radius: var(--radius-base);
    background-color: var(--color-surface-100-900);
    color: var(--color-surface-950-50);
    padding: 0.1rem 0.6rem;
    outline: none;
    cursor: text;
    transition:
      border-color 150ms ease,
      background-color 150ms ease,
      box-shadow 150ms ease;
  }

 
  & .input:hover,
  & .select:hover,
  & .textarea:hover {
    background-color: var(--color-surface-200-800);
  }

 
  & .input:focus-visible,
  & .select:focus-visible,
  & .textarea:focus-visible {
    outline: var(--default-outline-width) var(--color-primary-500);
  }

 
  & .input:active,
  & .select:active,
  & .textarea:active {
    background-color: var(--color-surface-300-700);
  }

  & .input::placeholder,
  & .select::placeholder,
  & .textarea::placeholder {
    opacity: 50%;
  }

  & .checkbox {
    accent-color: var(--color-primary-500);
    inline-size: 1rem;
    block-size: 1rem;
  }

  & .btn {
    min-height: 2rem;
    background-color: var(--color-surface-200-800);
    border-radius: var(--radius-base);
    color: inherit;
    padding: 0.1rem 0.75rem;
    cursor: pointer;
    transition:
      background-color 150ms ease,
  }

  & .btn:hover {
    background-color: var(--color-surface-300-700);
  }

  & .btn:active {
    background-color: var(--color-surface-400-600);
  }


  & .btn:focus-visible {
    outline: var(--default-outline-width) solid var(--color-primary-500);
  }


  & .btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;

export const DEFAULT_THEME_BODY = `\t/***** theme varibles, change values and add more as needed but dont remove any as it will break default styling *****/\n\t${unwrapThemeCss(editorTheme)}\n${LIGHT_DARK_PAIRINGS_CSS}\n${componentCss}`;
export const DEFAULT_THEME_CSS = wrapThemeCss(DEFAULT_THEME_NAME, DEFAULT_THEME_BODY);
