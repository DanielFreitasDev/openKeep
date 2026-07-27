import { count, eq } from 'drizzle-orm';
import { createAuth } from '../auth/auth.js';
import { loadConfig, loadDotenv } from '../config.js';
import { createNote } from '../modules/notes/service.js';
import { createDb } from './client.js';
import { runMigrations } from './migrate.js';
import { notes } from './schema/notes.js';

/**
 * Dev seed: demo account + a Keep-like sample board.
 *   email: demo@openkeep.local  password: demo-password
 */
loadDotenv();
const config = loadConfig();
await runMigrations(config.DATABASE_URL);

const { pool, db } = createDb(config.DATABASE_URL);
const auth = createAuth(config, db);

const DEMO_EMAIL = 'demo@openkeep.local';
const DEMO_PASSWORD = 'demo-password';

const existing = await db.query.user.findFirst({
  where: (u, { eq }) => eq(u.email, DEMO_EMAIL),
});

let userId: string;
if (existing) {
  userId = existing.id;
  console.info(`demo user already exists (${DEMO_EMAIL})`);
} else {
  const res = await auth.api.signUpEmail({
    body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: 'Demo User' },
  });
  userId = res.user.id;
  console.info(`created demo user ${DEMO_EMAIL} (password: ${DEMO_PASSWORD})`);
}

const [countRow] = await db
  .select({ noteCount: count() })
  .from(notes)
  .where(eq(notes.ownerId, userId));
const noteCount = countRow?.noteCount ?? 0;

if (noteCount > 0) {
  console.info(`demo user already has ${noteCount} notes — skipping note seed`);
} else {
  const samples = [
    {
      title: 'Welcome to OpenKeep 👋',
      bodyHtml:
        '<p>This is an open-source, self-hostable Keep-style notes app.</p><p><strong>Bold</strong>, <em>italic</em>, <u>underline</u> and two heading levels are supported.</p>',
      pinned: true,
      color: 'sand' as const,
    },
    {
      title: 'Groceries',
      type: 'list' as const,
      items: [
        { text: 'Milk', checked: false, indent: 0 as const },
        { text: 'Bread', checked: false, indent: 0 as const },
        { text: 'Sourdough', checked: false, indent: 1 as const },
        { text: 'Coffee', checked: true, indent: 0 as const },
      ],
      color: 'mint' as const,
      background: 'groceries' as const,
    },
    {
      title: 'Trip ideas',
      bodyHtml: '<p>Chapada Diamantina</p><p>Jericoacoara</p><p>Fernando de Noronha</p>',
      color: 'fog' as const,
      background: 'travel' as const,
    },
    {
      title: '',
      bodyHtml:
        '<p>Read about PostgreSQL 18 full-text search: https://www.postgresql.org/docs/</p>',
      color: 'default' as const,
    },
    {
      title: 'Moqueca recipe',
      bodyHtml: '<p>Fish, coconut milk, dendê oil, bell peppers, lime and coriander.</p>',
      color: 'peach' as const,
      background: 'recipes' as const,
    },
  ];

  for (const s of samples) {
    await createNote(db, userId, {
      type: s.type ?? 'text',
      title: s.title,
      bodyHtml: 'bodyHtml' in s && s.bodyHtml ? s.bodyHtml : '',
      items: 'items' in s && s.items ? s.items : [],
      pinned: s.pinned ?? false,
      color: s.color ?? 'default',
      background: ('background' in s ? s.background : undefined) ?? 'none',
    });
  }
  console.info(`seeded ${samples.length} demo notes`);
}

await pool.end();
