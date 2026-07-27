import { createAuth } from '../auth/auth.js';
import { loadConfig, loadDotenv } from '../config.js';
import { createDb } from './client.js';
import { runMigrations } from './migrate.js';
import { user } from './schema/auth.js';

/**
 * Dev seed: demo account (+ demo notes from M2 on).
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

void userId; // demo notes are seeded here from M2 on
void user;

await pool.end();
