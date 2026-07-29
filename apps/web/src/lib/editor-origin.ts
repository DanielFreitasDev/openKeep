/**
 * One-shot handoff of the clicked card's rect to the editor modal, which
 * morphs open from it (Keep web). Deep links have no origin — no morph.
 */
let origin: { noteId: string; rect: DOMRect } | null = null;

export function setEditorOrigin(noteId: string, rect: DOMRect): void {
  origin = { noteId, rect };
}

export function takeEditorOrigin(noteId: string): DOMRect | null {
  if (origin?.noteId !== noteId) return null;
  const { rect } = origin;
  origin = null;
  return rect;
}
