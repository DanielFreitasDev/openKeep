import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import nodemailer from 'nodemailer';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { account, session, user, verification } from '../db/schema/auth.js';
import { userSettings } from '../db/schema/settings.js';

/**
 * Better Auth, core only (email/password + optional OAuth). Pinned exact —
 * plugins deliberately avoided (see docs/DECISIONS.md).
 */
export function createAuth(config: Config, db: Db) {
  const mailer = config.SMTP_URL ? nodemailer.createTransport(config.SMTP_URL) : null;

  return betterAuth({
    baseURL: config.APP_URL,
    basePath: '/api/auth',
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(config.APP_URL).origin],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      ...(mailer
        ? {
            sendResetPassword: async ({
              user: u,
              url,
            }: {
              user: { email: string };
              url: string;
            }) => {
              await mailer.sendMail({
                from: config.SMTP_FROM ?? 'openkeep@localhost',
                to: u.email,
                subject: 'Reset your OpenKeep password',
                text: `Click the link to reset your OpenKeep password:\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
              });
            },
          }
        : {}),
    },
    session: {
      cookieCache: { enabled: true, maxAge: 300 },
    },
    socialProviders: {
      ...(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: config.GOOGLE_CLIENT_ID,
              clientSecret: config.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
      ...(config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: config.GITHUB_CLIENT_ID,
              clientSecret: config.GITHUB_CLIENT_SECRET,
            },
          }
        : {}),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (u) => {
            await db.insert(userSettings).values({ userId: u.id }).onConflictDoNothing();
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image?: string | null | undefined;
  emailVerified: boolean;
}
