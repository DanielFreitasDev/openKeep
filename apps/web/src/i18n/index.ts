import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enAdmin from './locales/en/admin.json';
import enApiTokens from './locales/en/apiTokens.json';
import enAuth from './locales/en/auth.json';
import enCommon from './locales/en/common.json';
import enDrawing from './locales/en/drawing.json';
import enEditor from './locales/en/editor.json';
import enImportExport from './locales/en/importExport.json';
import enLabels from './locales/en/labels.json';
import enNotes from './locales/en/notes.json';
import enOauth from './locales/en/oauth.json';
import enReminders from './locales/en/reminders.json';
import enSearch from './locales/en/search.json';
import enSettings from './locales/en/settings.json';
import enSharing from './locales/en/sharing.json';
import enShell from './locales/en/shell.json';
import enShortcuts from './locales/en/shortcuts.json';
import enTrash from './locales/en/trash.json';
import enWebhooks from './locales/en/webhooks.json';
import ptAdmin from './locales/pt-BR/admin.json';
import ptApiTokens from './locales/pt-BR/apiTokens.json';
import ptAuth from './locales/pt-BR/auth.json';
import ptCommon from './locales/pt-BR/common.json';
import ptDrawing from './locales/pt-BR/drawing.json';
import ptEditor from './locales/pt-BR/editor.json';
import ptImportExport from './locales/pt-BR/importExport.json';
import ptLabels from './locales/pt-BR/labels.json';
import ptNotes from './locales/pt-BR/notes.json';
import ptOauth from './locales/pt-BR/oauth.json';
import ptReminders from './locales/pt-BR/reminders.json';
import ptSearch from './locales/pt-BR/search.json';
import ptSettings from './locales/pt-BR/settings.json';
import ptSharing from './locales/pt-BR/sharing.json';
import ptShell from './locales/pt-BR/shell.json';
import ptShortcuts from './locales/pt-BR/shortcuts.json';
import ptTrash from './locales/pt-BR/trash.json';
import ptWebhooks from './locales/pt-BR/webhooks.json';

export const resources = {
  en: {
    common: enCommon,
    shell: enShell,
    auth: enAuth,
    notes: enNotes,
    oauth: enOauth,
    editor: enEditor,
    drawing: enDrawing,
    trash: enTrash,
    settings: enSettings,
    labels: enLabels,
    search: enSearch,
    reminders: enReminders,
    sharing: enSharing,
    shortcuts: enShortcuts,
    importExport: enImportExport,
    apiTokens: enApiTokens,
    admin: enAdmin,
    webhooks: enWebhooks,
  },
  'pt-BR': {
    common: ptCommon,
    shell: ptShell,
    auth: ptAuth,
    notes: ptNotes,
    oauth: ptOauth,
    editor: ptEditor,
    drawing: ptDrawing,
    trash: ptTrash,
    settings: ptSettings,
    labels: ptLabels,
    search: ptSearch,
    reminders: ptReminders,
    sharing: ptSharing,
    shortcuts: ptShortcuts,
    importExport: ptImportExport,
    apiTokens: ptApiTokens,
    admin: ptAdmin,
    webhooks: ptWebhooks,
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
