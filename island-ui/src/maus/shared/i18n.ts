// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
// NOTE (Steroids island): the OpenMausBot string catalog (~280KB en.json plus
// 9 more locales) is deliberately NOT ported. t() is an identity function with
// {param} interpolation, so every screen compiles and runs; catalog strings
// render as their keys. To restore real strings: copy openmaus
// src/locales/en.json (+ others) to maus/shared/locales/, re-add the pack
// registry, and look activePack up here. LocaleKey is string so all current
// t("some.key") call sites keep compiling unchanged.

/** "zh-Hant-TW" → exact tag, then "zh-hant", then "zh", then "en". Pure, for tests. */
export function resolveLocale(tag: string | undefined, available: ReadonlySet<string>): string {
  if (!tag) return "en";
  let candidate = tag.toLowerCase();
  while (candidate) {
    if (available.has(candidate)) return candidate;
    const separator = candidate.lastIndexOf("-");
    if (separator < 0) break;
    candidate = candidate.slice(0, separator);
  }
  return "en";
}

export type LocaleKey = string;
export type LocalePack = Partial<Record<string, string>>;

/** Switch the active language. Stub: records the tag only. */
export function setLocale(tag: string | undefined): string {
  active = typeof tag === "string" && tag ? tag.toLowerCase() : "en";
  return active;
}

/** The BCP-47 tag stub: echoes the code back. */
export function documentLanguage(code: string): string {
  return code;
}

/** The locale t() is answering in. */
export function activeLocale(): string {
  return active;
}

let active = "en";
setLocale(globalThis.navigator?.language);

/** Translate a server-chosen key. Stub: the server's English fallback is the
 * only real wording we have, so prefer it over the key. */
export function tFromServer(key: string | undefined, fallback: string | undefined): string | undefined {
  return fallback ?? key;
}

/** Look up a catalog string. English pack ported (see locales/en.json,
 * OpenMausBot Apache-2.0); other locales fall back to English, then the key. */
import enPack from "./locales/en.json";

const en: Record<string, string> = enPack as Record<string, string>;

export function t(key: LocaleKey, params?: Record<string, string | number>): string {
  const hit = en[key] ?? key;
  if (!params) return hit;
  return hit.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
