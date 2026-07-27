import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enAuth from './locales/en/auth.json';
import enCommon from './locales/en/common.json';
import enShell from './locales/en/shell.json';
import ptAuth from './locales/pt-BR/auth.json';
import ptCommon from './locales/pt-BR/common.json';
import ptShell from './locales/pt-BR/shell.json';

export const resources = {
  en: {
    common: enCommon,
    shell: enShell,
    auth: enAuth,
  },
  'pt-BR': {
    common: ptCommon,
    shell: ptShell,
    auth: ptAuth,
  },
} as const;

export function detectLanguage(): 'en' | 'pt-BR' {
  if (typeof navigator === 'undefined') return 'en';
  const lang = navigator.language?.toLowerCase() ?? 'en';
  return lang.startsWith('pt') ? 'pt-BR' : 'en';
}

export function initI18n(lng = detectLanguage()) {
  return i18n.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });
}

export default i18n;
