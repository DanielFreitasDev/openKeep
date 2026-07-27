import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enAuth from './locales/en/auth.json';
import enCommon from './locales/en/common.json';
import enEditor from './locales/en/editor.json';
import enNotes from './locales/en/notes.json';
import enSettings from './locales/en/settings.json';
import enShell from './locales/en/shell.json';
import enTrash from './locales/en/trash.json';
import ptAuth from './locales/pt-BR/auth.json';
import ptCommon from './locales/pt-BR/common.json';
import ptEditor from './locales/pt-BR/editor.json';
import ptNotes from './locales/pt-BR/notes.json';
import ptSettings from './locales/pt-BR/settings.json';
import ptShell from './locales/pt-BR/shell.json';
import ptTrash from './locales/pt-BR/trash.json';

export const resources = {
  en: {
    common: enCommon,
    shell: enShell,
    auth: enAuth,
    notes: enNotes,
    editor: enEditor,
    trash: enTrash,
    settings: enSettings,
  },
  'pt-BR': {
    common: ptCommon,
    shell: ptShell,
    auth: ptAuth,
    notes: ptNotes,
    editor: ptEditor,
    trash: ptTrash,
    settings: ptSettings,
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
