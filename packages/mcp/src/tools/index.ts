import * as attachments from './attachments.js';
import * as calendar from './calendar.js';
import * as checklist from './checklist.js';
import * as collaborators from './collaborators.js';
import * as drawings from './drawings.js';
import * as importExport from './import-export.js';
import * as labels from './labels.js';
import * as links from './links.js';
import * as notes from './notes.js';
import * as reminders from './reminders.js';
import * as search from './search.js';
import * as settings from './settings.js';
import * as shareLinks from './share-links.js';
import type { ToolDef } from './types.js';
import * as versions from './versions.js';

/** The full catalog — every REST surface a personal access token can reach. */
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
  notes.mergeNotes,
  notes.deleteAllNotes,
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
  // calendar feed
  calendar.getCalendarFeed,
  calendar.rotateCalendarFeed,
  calendar.revokeCalendarFeed,
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
  // public share link
  shareLinks.getShareLink,
  shareLinks.createShareLink,
  shareLinks.revokeShareLink,
  // attachments
  attachments.uploadImage,
  attachments.uploadAudio,
  attachments.uploadFile,
  attachments.getAttachment,
  attachments.deleteAttachment,
  // drawings
  drawings.getDrawing,
  drawings.createDrawing,
  drawings.updateDrawing,
  // links
  links.getLinkPreview,
  // settings
  settings.getSettings,
  settings.updateSettings,
  settings.getStorageUsage,
  // import/export
  importExport.exportNotes,
  importExport.getJob,
  importExport.downloadExport,
  importExport.importTakeout,
  importExport.importMarkdown,
];
