import { describe, expect, it } from 'vitest';
import { noteCard, noteRender } from './render.js';
import { FakeOpenKeepClient } from './tools/fake-client.js';

describe('noteCard', () => {
  it('omits empty/default fields and truncates the snippet at 200 chars', () => {
    const client = new FakeOpenKeepClient();
    const long = 'x'.repeat(300);
    const note = client.seedNote({ bodyHtml: `<p>${long}</p>` });
    const card = noteCard(note, new Map());

    expect(card.snippet).toHaveLength(201); // 200 + ellipsis
    expect(card.snippet?.endsWith('…')).toBe(true);
    expect(card.title).toBeUndefined();
    expect(card.color).toBeUndefined();
    expect(card.pinned).toBeUndefined();
    expect(card.labels).toBeUndefined();
    expect(card.items_total).toBeUndefined();
  });

  it('projects labels by name and counts checklist state', () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({
      type: 'list',
      title: 'List',
      pinned: true,
      color: 'coral',
      labelIds: ['l1'],
      items: [
        { id: 'i1', text: 'a', checked: true, indent: 0, position: 'a0' },
        { id: 'i2', text: 'b', checked: false, indent: 0, position: 'a1' },
      ],
    });
    const card = noteCard(note, new Map([['l1', 'mercado']]));
    expect(card).toMatchObject({
      title: 'List',
      pinned: true,
      color: 'coral',
      labels: ['mercado'],
      items_total: 2,
      items_checked: 1,
    });
    expect(card.snippet).toBe('[x] a\n[ ] b');
  });
});

describe('noteRender', () => {
  it('derives plain text, orders items without positions, and gates html', () => {
    const client = new FakeOpenKeepClient();
    const text = client.seedNote({ title: 'T', bodyHtml: '<p>a &amp; b</p>' });
    const rendered = noteRender(text, new Map());
    expect(rendered.text).toBe('a & b');
    expect(rendered.body_html).toBeUndefined();
    expect(rendered.items).toBeUndefined();

    const withHtml = noteRender(text, new Map(), { includeHtml: true });
    expect(withHtml.body_html).toBe('<p>a &amp; b</p>');

    const list = client.seedNote({
      type: 'list',
      items: [{ id: 'i1', text: 'x', checked: false, indent: 1, position: 'zz' }],
    });
    const renderedList = noteRender(list, new Map());
    expect(renderedList.items).toEqual([{ id: 'i1', text: 'x', checked: false, indent: 1 }]);
    expect(JSON.stringify(renderedList)).not.toContain('position');
  });
});
