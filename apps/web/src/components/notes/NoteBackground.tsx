import type { NoteBackground as Bg } from '@openkeep/shared';

/**
 * The 9 background illustrations — ORIGINAL minimal line-art on Keep's themes
 * (never Google's artwork). Drawn with currentColor so both themes adapt;
 * anchored bottom-right like Keep.
 */
const ART: Record<Exclude<Bg, 'none'>, React.ReactElement> = {
  groceries: (
    <g>
      <path d="M8 18h6l7 26h30l6-20H19" fill="none" strokeWidth="3" />
      <circle cx="26" cy="52" r="4" fill="none" strokeWidth="3" />
      <circle cx="46" cy="52" r="4" fill="none" strokeWidth="3" />
      <path d="M32 12c3-5 9-5 12 0M38 8v14" fill="none" strokeWidth="2.5" />
    </g>
  ),
  food: (
    <g>
      <circle cx="32" cy="36" r="16" fill="none" strokeWidth="3" />
      <circle cx="32" cy="36" r="9" fill="none" strokeWidth="2" />
      <path d="M8 20v16M12 20v16M10 36v10M56 20c-4 0-6 6-6 12v14" fill="none" strokeWidth="3" />
    </g>
  ),
  music: (
    <g>
      <path d="M22 46V14l24-6v32" fill="none" strokeWidth="3" />
      <circle cx="16" cy="46" r="6" fill="none" strokeWidth="3" />
      <circle cx="40" cy="40" r="6" fill="none" strokeWidth="3" />
    </g>
  ),
  recipes: (
    <g>
      <path d="M20 8c0 6-6 8-6 14a10 10 0 0 0 20 0c0-6-6-8-6-14" fill="none" strokeWidth="2.5" />
      <path d="M24 36v18M14 54h20M40 12h16v40H40z" fill="none" strokeWidth="3" />
      <path d="M44 20h8M44 28h8M44 36h8" fill="none" strokeWidth="2" />
    </g>
  ),
  notes: (
    <g>
      <rect x="12" y="10" width="36" height="44" rx="4" fill="none" strokeWidth="3" />
      <path d="M20 22h20M20 30h20M20 38h12" fill="none" strokeWidth="2.5" />
      <path d="M42 44l10 10" fill="none" strokeWidth="3" />
    </g>
  ),
  places: (
    <g>
      <path
        d="M32 54s-16-14-16-26a16 16 0 0 1 32 0c0 12-16 26-16 26z"
        fill="none"
        strokeWidth="3"
      />
      <circle cx="32" cy="28" r="6" fill="none" strokeWidth="3" />
    </g>
  ),
  travel: (
    <g>
      <path d="M10 44l44-24M30 32l-4-18 6-2 8 16" fill="none" strokeWidth="3" />
      <path d="M34 38l14 8 4-4-10-12" fill="none" strokeWidth="3" />
      <path d="M8 54h48" fill="none" strokeWidth="2.5" />
    </g>
  ),
  video: (
    <g>
      <rect x="8" y="16" width="34" height="30" rx="4" fill="none" strokeWidth="3" />
      <path d="M42 26l14-8v26l-14-8" fill="none" strokeWidth="3" />
    </g>
  ),
  celebration: (
    <g>
      <path d="M18 30L10 54l24-8" fill="none" strokeWidth="3" />
      <path d="M24 24l16 16" fill="none" strokeWidth="2.5" />
      <path
        d="M40 12l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM52 32l4 4M46 46l6 4"
        fill="none"
        strokeWidth="2.5"
      />
    </g>
  ),
};

export function NoteBackgroundArt({ background }: { background: Bg }) {
  if (background === 'none') return null;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className="pointer-events-none absolute right-1 bottom-1 h-20 w-20 text-on-surface-variant opacity-25"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ART[background]}
    </svg>
  );
}
