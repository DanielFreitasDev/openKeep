import { z } from 'zod';

/** SDK-neutral prompt definitions; registration happens in server.ts. */
export interface PromptDef {
  name: string;
  title: string;
  description: string;
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous catalog
  argsSchema?: z.ZodObject<any>;
  // biome-ignore lint/suspicious/noExplicitAny: args validated by argsSchema
  build: (args: any) => string;
}

export const capturePrompt: PromptDef = {
  name: 'capture_note',
  title: 'Capture a note',
  description:
    'Turn raw content (a thought, a snippet, a list) into a well-structured OpenKeep note.',
  argsSchema: z.object({
    content: z.string().describe('The raw content to capture'),
    context: z
      .string()
      .optional()
      .describe('Optional context: where this came from, why it matters'),
  }),
  build: (args: { content: string; context?: string }) =>
    [
      'Capture the following as an OpenKeep note using the create_note tool.',
      '',
      'Guidelines:',
      '- Give it a short, descriptive title.',
      '- If the content is enumerable (shopping, tasks, steps), use checklist items; otherwise a markdown body.',
      '- Attach 1–2 existing labels when they clearly fit (check list_labels); only create a new label when nothing fits.',
      '- If the content mentions a date or deadline, add a reminder for it.',
      '',
      `Content:\n${args.content}`,
      ...(args.context ? ['', `Context: ${args.context}`] : []),
    ].join('\n'),
};

export const dailyReviewPrompt: PromptDef = {
  name: 'daily_review',
  title: 'Daily review',
  description:
    'Review reminders, pinned notes and recent activity, and summarize what needs attention.',
  build: () =>
    [
      'Do a daily review of my OpenKeep notes:',
      '',
      '1. search_notes with type=reminder — list reminders due today or overdue (compare reminder_at with the current date), each with its note title.',
      '2. list_notes — summarize the pinned notes in one line each.',
      '3. From the same listing, mention notes updated recently that look unfinished (empty body, unchecked items).',
      '',
      'End with a short "needs attention" list. Do not modify anything unless I ask.',
    ].join('\n'),
};

export const allPrompts: PromptDef[] = [capturePrompt, dailyReviewPrompt];
