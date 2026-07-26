import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { BundledLanguage } from "shiki";
import type {
  CodeHighlighterPlugin,
  HighlightOptions,
  HighlightResult,
  ThemeInput,
} from "@streamdown/code";

/** Syntax highlighting for the pill's agent markdown.
 *
 *  `@streamdown/code`'s stock `code` plugin pulls Shiki's full bundle — every
 *  one of its ~300 grammars becomes a lazily-imported chunk, which took this
 *  app's build output from 0.7 MB of JS to 10.8 MB. `CodeHighlighterPlugin` is
 *  a public interface, so this implements it against Shiki's fine-grained core
 *  with the handful of languages this codebase's agent actually emits.
 *  Anything else renders as plain, unhighlighted code. */
const LANGUAGES = {
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  swift: () => import("shiki/langs/swift.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
};

const ALIASES: Record<string, keyof typeof LANGUAGES> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  shell: "shellscript",
  console: "shellscript",
  md: "markdown",
  yml: "yaml",
  py: "python",
};

const THEMES = ["github-light", "github-dark"] as const satisfies [ThemeInput, ThemeInput];

function resolveLanguage(language: string): keyof typeof LANGUAGES | undefined {
  const normalized = language.trim().toLowerCase();
  if (normalized in LANGUAGES) return normalized as keyof typeof LANGUAGES;
  return ALIASES[normalized];
}

let highlighterPromise: Promise<HighlighterCore> | undefined;

function getHighlighter(): Promise<HighlighterCore> {
  return (highlighterPromise ??= createHighlighterCore({
    themes: [import("shiki/themes/github-light.mjs"), import("shiki/themes/github-dark.mjs")],
    langs: Object.values(LANGUAGES).map((load) => load()),
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  }));
}

const results = new Map<string, HighlightResult>();
const waiting = new Map<string, Set<(result: HighlightResult) => void>>();

/** Keyed on length plus both ends rather than the whole body — every streamed
 *  delta re-highlights the block, so the key is built far more often than it
 *  is missed. */
function cacheKey(code: string, language: string): string {
  return `${language}:${code.length}:${code.slice(0, 100)}:${code.slice(-100)}`;
}

export const shikiCodePlugin: CodeHighlighterPlugin = {
  name: "shiki",
  type: "code-highlighter",
  getThemes: () => [...THEMES],
  getSupportedLanguages: () => Object.keys(LANGUAGES) as BundledLanguage[],
  supportsLanguage: (language) => resolveLanguage(language) !== undefined,
  highlight: (
    { code, language }: HighlightOptions,
    callback?: (result: HighlightResult) => void,
  ): HighlightResult | null => {
    const lang = resolveLanguage(language) ?? "text";
    const key = cacheKey(code, lang);
    const cached = results.get(key);
    if (cached) return cached;

    if (callback) {
      const listeners = waiting.get(key) ?? new Set();
      listeners.add(callback);
      waiting.set(key, listeners);
    }

    void getHighlighter()
      .then((highlighter) => {
        const tokens = highlighter.codeToTokens(code, {
          lang,
          themes: { light: THEMES[0], dark: THEMES[1] },
        });
        results.set(key, tokens);
        for (const listener of waiting.get(key) ?? []) listener(tokens);
        waiting.delete(key);
      })
      .catch((error: unknown) => {
        console.error("murmur: code highlighting failed", error);
        waiting.delete(key);
      });

    return null;
  },
};
