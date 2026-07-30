import { describe, expect, it } from 'vitest';
import { markdownFileName, noteToMarkdown, parseMarkdownNote } from './note-markdown.js';

const textNote = {
  title: 'Groceries',
  type: 'text' as const,
  bodyHtml: '<p>milk and <strong>eggs</strong></p>',
  items: [],
};

const listNote = {
  title: 'TODO',
  type: 'list' as const,
  bodyHtml: '',
  items: [
    { text: 'one', checked: false, indent: 0 as const },
    { text: 'sub', checked: true, indent: 1 as const },
  ],
};

describe('noteToMarkdown', () => {
  it('writes the title as an H1 and the body below it', () => {
    expect(noteToMarkdown(textNote)).toBe('# Groceries\n\nmilk and **eggs**\n');
  });

  it('writes checklists as task items, keeping indent and check state', () => {
    expect(noteToMarkdown(listNote)).toBe('# TODO\n\n- [ ] one\n  - [x] sub\n');
  });

  it('omits front matter unless asked, and skips defaults when asked', () => {
    expect(noteToMarkdown(textNote, {})).not.toContain('---');
    expect(
      noteToMarkdown(textNote, { labels: ['home', 'a b', 'x,y'], pinned: true, color: 'mint' }),
    ).toBe(
      '---\nlabels: [home, a b, "x,y"]\ncolor: mint\npinned: true\n---\n\n# Groceries\n\nmilk and **eggs**\n',
    );
  });

  it('handles an empty note', () => {
    expect(noteToMarkdown({ title: '', type: 'text', bodyHtml: '', items: [] })).toBe('');
  });
});

describe('parseMarkdownNote', () => {
  it('takes the title from the leading heading and consumes it', () => {
    const note = parseMarkdownNote('# Shopping\n\nmilk');
    expect(note.title).toBe('Shopping');
    expect(note.bodyHtml).toBe('<p>milk</p>');
  });

  it('falls back to the file name, tidied up', () => {
    const note = parseMarkdownNote('just text', 'my-first_note.md');
    expect(note.title).toBe('my first note');
    expect(note.type).toBe('text');
  });

  it('turns an all-task-item file into a checklist note', () => {
    const note = parseMarkdownNote('# TODO\n\n- [ ] one\n  - [x] sub');
    expect(note.type).toBe('list');
    expect(note.items).toEqual([
      { text: 'one', checked: false, indent: 0 },
      { text: 'sub', checked: true, indent: 1 },
    ]);
  });

  it('keeps a mixed file as a text note', () => {
    const note = parseMarkdownNote('# Plan\n\nsome prose\n\n- [ ] one');
    expect(note.type).toBe('text');
    expect(note.bodyHtml).toContain('[ ] one');
  });

  it('reads front matter and strips it from the body', () => {
    const note = parseMarkdownNote(
      '---\ntitle: From meta\nlabels: [home, work]\npinned: true\ncolor: mint\n---\n\nbody',
    );
    expect(note.title).toBe('From meta');
    expect(note.meta.labels).toEqual(['home', 'work']);
    expect(note.meta.pinned).toBe(true);
    expect(note.meta.color).toBe('mint');
    expect(note.bodyHtml).toBe('<p>body</p>');
  });

  it('keeps a quoted label with a comma in one piece', () => {
    const markdown = noteToMarkdown(textNote, { labels: ['x,y', 'z'] });
    expect(parseMarkdownNote(markdown).meta.labels).toEqual(['x,y', 'z']);
  });

  it('accepts Obsidian-style tags with hashes', () => {
    expect(parseMarkdownNote('---\ntags: #home, #work\n---\nx').meta.labels).toEqual([
      'home',
      'work',
    ]);
  });

  it('round-trips a note through markdown and back', () => {
    const back = parseMarkdownNote(noteToMarkdown(listNote));
    expect(back.title).toBe(listNote.title);
    expect(back.type).toBe('list');
    expect(back.items).toEqual(listNote.items);

    const backText = parseMarkdownNote(noteToMarkdown(textNote));
    expect(backText.title).toBe(textNote.title);
    expect(backText.bodyHtml).toBe(textNote.bodyHtml);
  });
});

describe('markdownFileName', () => {
  it('builds a file-system safe name with an id suffix', () => {
    expect(markdownFileName('My note / draft', '0198abcd-1234')).toBe('My note draft-0198abcd.md');
    expect(markdownFileName('', '0198abcd-1234')).toBe('note-0198abcd.md');
  });
});
