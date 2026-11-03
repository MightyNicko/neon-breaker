// Add a language: create src/i18n/<code>.js and register it below.
import en from '../i18n/en.js';
import sv from '../i18n/sv.js';

const dictionaries = { en, sv };
export const LANGS = Object.keys(dictionaries);
export const DEFAULT_LANG = 'en';

let current = DEFAULT_LANG;

export function setLang(code) { current = dictionaries[code] ? code : DEFAULT_LANG; }
export function getLang() { return current; }

// t('key', {n: 3}) replaces {n}; falls back to English, then to the key itself.
export function t(key, params) {
  let s = dictionaries[current][key] ?? dictionaries[DEFAULT_LANG][key] ?? key;
  if (params) for (const k in params) s = s.split(`{${k}}`).join(String(params[k]));
  return s;
}

// Native name of a language, shown in the language picker.
export function langName(code) { return dictionaries[code].lang_name; }
