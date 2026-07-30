import codeSvg from '@material-symbols/svg-700/outlined/code.svg?raw';
import codeBlockSvg from '@material-symbols/svg-700/outlined/data_object.svg?raw';
import bulletListSvg from '@material-symbols/svg-700/outlined/format_list_bulleted.svg?raw';
import orderedListSvg from '@material-symbols/svg-700/outlined/format_list_numbered.svg?raw';
import quoteSvg from '@material-symbols/svg-700/outlined/format_quote.svg?raw';
import ruleSvg from '@material-symbols/svg-700/outlined/horizontal_rule.svg?raw';
import linkSvg from '@material-symbols/svg-700/outlined/link.svg?raw';
import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyLink } from '../../lib/tiptap.js';
import { Icon } from '../Icon.js';

/**
 * Keep's formatting bar, widened to the markdown vocabulary. Everything here
 * is also reachable by typing markdown — the bar is for people who do not
 * think in `**`, and for touch, where typing syntax is the worse gesture.
 */
export function FormatBar({ editor }: { editor: Editor }) {
  const { t } = useTranslation('editor');
  const [linkOpen, setLinkOpen] = useState(false);

  return (
    <div className="relative border-(--outline-variant) border-t">
      {linkOpen && <LinkField editor={editor} onClose={() => setLinkOpen(false)} />}
      <div className="flex items-center gap-0.5 overflow-x-auto px-2 py-1">
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
          label={t('formatH3')}
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </FormatButton>
        <FormatButton
          label={t('formatNormal')}
          active={editor.isActive('paragraph')}
          onClick={() => editor.chain().focus().setParagraph().run()}
        >
          ¶
        </FormatButton>
        <Divider />
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
        <FormatButton
          label={t('formatStrike')}
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <s>S</s>
        </FormatButton>
        <Divider />
        <FormatButton
          label={t('formatBulletList')}
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <Icon svg={bulletListSvg} size={18} />
        </FormatButton>
        <FormatButton
          label={t('formatOrderedList')}
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <Icon svg={orderedListSvg} size={18} />
        </FormatButton>
        <FormatButton
          label={t('formatQuote')}
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Icon svg={quoteSvg} size={18} />
        </FormatButton>
        <Divider />
        <FormatButton
          label={t('formatCode')}
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Icon svg={codeSvg} size={18} />
        </FormatButton>
        <FormatButton
          label={t('formatCodeBlock')}
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Icon svg={codeBlockSvg} size={18} />
        </FormatButton>
        <FormatButton
          label={t('formatLink')}
          active={editor.isActive('link')}
          onClick={() => setLinkOpen((open) => !open)}
        >
          <Icon svg={linkSvg} size={18} />
        </FormatButton>
        <FormatButton
          label={t('formatRule')}
          active={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Icon svg={ruleSvg} size={18} />
        </FormatButton>
        <Divider />
        <FormatButton
          label={t('formatClear')}
          active={false}
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          ⌫
        </FormatButton>
      </div>
    </div>
  );
}

/** The url field for the link button; pre-filled when the caret sits on a link. */
function LinkField({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [url, setUrl] = useState<string>(() => editor.getAttributes('link').href ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation('editor');

  useEffect(() => inputRef.current?.focus(), []);

  const submit = () => {
    applyLink(editor, url);
    onClose();
  };

  return (
    <div className="-top-12 absolute right-2 left-2 z-10 flex items-center gap-1 rounded bg-surface-container p-1 shadow-(--elevation-3)">
      <input
        ref={inputRef}
        type="url"
        value={url}
        placeholder={t('formatLinkPlaceholder')}
        aria-label={t('formatLink')}
        className="min-w-0 flex-1 bg-transparent px-2 py-1 text-on-surface text-sm outline-none"
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <button
        type="button"
        onClick={submit}
        className="rounded px-2 py-1 text-primary text-sm hover:bg-(--surface-hover)"
      >
        {t('formatLinkApply')}
      </button>
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px flex-none bg-(--outline-variant)" />;
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
      className={`flex h-9 min-w-9 flex-none items-center justify-center rounded px-1.5 text-on-surface-variant text-sm hover:bg-(--surface-hover) ${
        active ? 'bg-(--surface-hover) text-on-surface' : ''
      }`}
    >
      {children}
    </button>
  );
}
