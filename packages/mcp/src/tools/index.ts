import * as attachments from './attachments.js';
import * as checklist from './checklist.js';
import * as collaborators from './collaborators.js';
import * as importExport from './import-export.js';
import * as labels from './labels.js';
import * as links from './links.js';
import * as notes from './notes.js';
import * as reminders from './reminders.js';
import * as search from './search.js';
import * as settings from './settings.js';
import type { ToolDef } from './types.js';
import * as versions from './versions.js';

/** The full catalog — 43 tools covering everything the UI can do. */
export const allTools: ToolDef[] = [
  // notes
  notes.listNotes,
  notes.getNote,
  notes.createNote,
  notes.updateNote,
  notes.setNoteState,
  notes.trashNote,
  notes.restoreNote,
  notes.deleteNoteForever,
  notes.emptyTrash,
  notes.copyNote,
  notes.convertNote,
  // checklist
  checklist.addChecklistItems,
  checklist.updateChecklistItem,
  checklist.deleteChecklistItem,
  checklist.uncheckAllItems,
  checklist.deleteCheckedItems,
  // labels
  labels.listLabels,
  labels.createLabel,
  labels.renameLabel,
  labels.deleteLabel,
  labels.addLabelToNote,
  labels.removeLabelFromNote,
  // reminders
  reminders.setReminder,
  reminders.removeReminder,
  reminders.snoozeReminder,
  reminders.dismissReminder,
  // search
  search.searchNotes,
  // versions
  versions.listNoteVersions,
  versions.getNoteVersion,
  versions.restoreNoteVersion,
  // collaborators
  collaborators.listCollaborators,
  collaborators.addCollaborator,
  collaborators.setCollaboratorRole,
  collaborators.removeCollaborator,
  // attachments
  attachments.uploadImage,
  attachments.getAttachment,
  attachments.deleteAttachment,
  // links
  links.getLinkPreview,
  // settings
  settings.getSettings,
  settings.updateSettings,
  // import/export
  importExport.exportNotes,
  importExport.getJob,
  importExport.downloadExport,
  importExport.importTakeout,
];
