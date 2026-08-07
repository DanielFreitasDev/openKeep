/**
 * "Print" / "Save as PDF" for one note.
 *
 * The page that reaches the printer is built here instead of printing the open
 * editor: the title and the checklist rows are native textareas, which print
 * clipped to their scroll height, and the modal would drag the whole app chrome
 * onto the paper. So the sheet is a plain article appended to <body>, hidden on
 * screen and revealed only inside `@media print` (styles/app.css), where
 * everything else on the page is hidden instead.
 *
 * Everything happens in the browser, like "Download as .md": no server round
 * trip, it works offline, and what prints is the note as it reads right now —
 * including edits the autosave still owes.
 */

export interface PrintItem {
  text: string;
  checked: boolean;
  indent: 0 | 1;
}

export interface PrintNoteData {
  /** Empty when the note has no title — the sheet then starts at the content. */
  title: string;
  /** Sanitized note html; empty for checklists. */
  bodyHtml: string;
  /** Checklist rows in the order the editor shows them. */
  items: PrintItem[];
  /** Image/drawing attachments, originals, in note order. */
  imageUrls: string[];
  /** Already-localized footer pieces: label names, then "Edited …". */
  meta: string[];
  /** Browsers name the PDF after document.title. */
  documentTitle: string;
}

export const PRINT_ROOT_ID = 'print-root';

/** How long a slow image may hold the print dialog back. */
const IMAGE_TIMEOUT_MS = 3000;

/** The printable article: title, images, content, footer — no chrome. */
export function buildPrintSheet(data: PrintNoteData): HTMLElement {
  const article = document.createElement('article');
  article.className = 'print-note';

  if (data.title) {
    const title = document.createElement('h1');
    title.className = 'print-title';
    title.textContent = data.title;
    article.append(title);
  }

  for (const url of data.imageUrls) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.className = 'print-image';
    article.append(img);
  }

  if (data.items.length > 0) {
    article.append(itemList(data.items));
  } else if (data.bodyHtml) {
    const body = document.createElement('div');
    body.className = 'note-body print-body';
    // Server-sanitized allowlist html — the same contract the card preview and
    // the editor render under (see the server's lib/sanitize).
    body.innerHTML = data.bodyHtml;
    article.append(body);
  }

  if (data.meta.length > 0) {
    const footer = document.createElement('footer');
    footer.className = 'print-meta';
    footer.textContent = data.meta.join(' · ');
    article.append(footer);
  }

  return article;
}

function itemList(items: PrintItem[]): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'print-items';

  for (const item of items) {
    const row = document.createElement('li');
    row.className = 'print-item';
    if (item.checked) row.classList.add('print-item-checked');
    if (item.indent === 1) row.classList.add('print-item-indent');

    const box = document.createElement('span');
    box.className = 'print-box';
    // Text glyphs rather than the Material icons: a checkbox has to survive
    // printing with backgrounds and images turned off.
    box.textContent = item.checked ? '☑' : '☐';

    const text = document.createElement('span');
    text.className = 'print-text';
    text.textContent = item.text;

    row.append(box, text);
    list.append(row);
  }

  return list;
}

/** Teardown of the mounted sheet, while one is waiting for `afterprint`. */
let pendingRestore: (() => void) | null = null;

/**
 * Mounts the sheet, waits for its images and opens the print dialog. Cleanup
 * rides on `afterprint`, not on `window.print()` returning: only Chrome blocks
 * there, and tearing the sheet down too early prints a blank page elsewhere.
 */
export function printNote(data: PrintNoteData): Promise<void> {
  return printSheet(buildPrintSheet(data), data.documentTitle);
}

/**
 * One picture on a page of its own, centred — what the picture viewer prints.
 * No title, no footer: the sheet is the photograph, as in Keep.
 */
export function printImage(url: string, documentTitle: string): Promise<void> {
  const page = document.createElement('div');
  page.className = 'print-photo-page';
  const img = document.createElement('img');
  img.src = url;
  img.alt = '';
  img.className = 'print-photo';
  page.append(img);
  return printSheet(page, documentTitle);
}

async function printSheet(sheet: HTMLElement, documentTitle: string): Promise<void> {
  // Printing twice before `afterprint` arrives: undo the first sheet whole —
  // dropping only its element would leave its listener to restore a document
  // title that is itself a note title by then.
  pendingRestore?.();

  const host = document.createElement('div');
  host.id = PRINT_ROOT_ID;
  host.append(sheet);
  document.body.append(host);

  const previousTitle = document.title;
  document.title = documentTitle;

  const restore = () => {
    host.remove();
    document.title = previousTitle;
    window.removeEventListener('afterprint', restore);
    pendingRestore = null;
  };
  window.addEventListener('afterprint', restore);
  pendingRestore = restore;

  // The sheet is display:none until the print stylesheet applies, so images
  // have to be awaited explicitly — a still-loading <img> prints as a gap.
  await imagesSettled(host);

  try {
    window.print();
  } catch {
    restore();
  }
}

function imagesSettled(root: HTMLElement): Promise<unknown> {
  const pending = [...root.querySelectorAll('img')].filter((img) => !img.complete);
  if (pending.length === 0) return Promise.resolve();

  const loaded = Promise.all(
    pending.map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        }),
    ),
  );
  // A broken or slow attachment must not hold the dialog hostage.
  return Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, IMAGE_TIMEOUT_MS))]);
}
