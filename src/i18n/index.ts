/**
 * @maskweaver/i18n
 * 
 * Internationalization infrastructure for Maskweaver.
 * Phase 1: English only, but structure ready for expansion.
 */

import en from './locales/en.json';

export type Locale = 'en' | 'ko' | 'zh' | 'ja';
export type TranslationKey = keyof typeof en;

const translations: Record<Locale, Record<string, string>> = {
  en,
  ko: en, // Fallback to English
  zh: en, // Fallback to English
  ja: en, // Fallback to English
};

let currentLocale: Locale = 'en';

/**
 * Set the current locale
 */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

/**
 * Get the current locale
 */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Translate a key
 */
export function t(key: string, params?: Record<string, string>): string {
  const translation = translations[currentLocale][key] || translations.en[key] || key;
  
  if (!params) {
    return translation;
  }
  
  // Replace {{param}} placeholders
  return translation.replace(/\{\{(\w+)\}\}/g, (_, paramKey) => {
    return params[paramKey] || `{{${paramKey}}}`;
  });
}

/**
 * Load translations for a locale
 */
export async function loadLocale(locale: Locale): Promise<void> {
  if (translations[locale] && translations[locale] !== translations.en) {
    return; // Already loaded
  }
  
  try {
    const module = await import(`./locales/${locale}.json`);
    translations[locale] = module.default;
  } catch {
    console.warn(`Failed to load locale ${locale}, falling back to English`);
    translations[locale] = translations.en;
  }
}

export default { t, setLocale, getLocale, loadLocale };
