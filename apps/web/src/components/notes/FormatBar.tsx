import type { Editor } from '@tiptap/react';
import { useTranslation } from 'react-i18next';

/** Keep's formatting bar: H1/H2/normal, bold/italic/underline, clear. */
export function FormatBar({ editor }: { editor: Editor }) {
  const { t } = useTranslation('editor');
  return (
    <div className="flex items-center gap-0.5 border-(--outline-variant) border-t px-2 py-1">
      <FormatButton
        label={t('formatH1')}
        active={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </FormatButton>
      <FormatButton
        label={t('formatH2')}
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </FormatButton>
      <FormatButton
        label={t('formatNormal')}
        active={editor.isActive('paragraph')}
        onClick={() => editor.chain().focus().setParagraph().run()}
      >
        ¶
      </FormatButton>
      <span className="mx-1 h-5 w-px bg-(--outline-variant)" />
      <FormatButton
        label={t('formatBold')}
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </FormatButton>
      <FormatButton
        label={t('formatItalic')}
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </FormatButton>
      <FormatButton
        label={t('formatUnderline')}
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <u>U</u>
      </FormatButton>
      <span className="mx-1 h-5 w-px bg-(--outline-variant)" />
      <FormatButton
        label={t('formatClear')}
        active={false}
        onClick={() => editor.chain().focus().unsetAllMarks().setParagraph().run()}
      >
        ⌫
      </FormatButton>
    </div>
  );
}

function FormatButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      data-tooltip={label}
      onClick={onClick}
      className={`flex h-9 min-w-9 items-center justify-center rounded px-1.5 text-on-surface-variant text-sm hover:bg-(--surface-hover) ${
        active ? 'bg-(--surface-hover) text-on-surface' : ''
      }`}
    >
      {children}
    </button>
  );
}
