import { z } from 'zod';
import { LIMITS } from '../constants/limits.js';
import { zId } from './common.js';

export const zLabel = z.object({
  id: zId,
  name: z.string(),
  createdAt: z.iso.datetime(),
});
export type Label = z.infer<typeof zLabel>;

export const zLabelName = z.string().trim().min(1).max(LIMITS.labelNameMax);

export const zCreateLabel = z.object({ name: zLabelName });
export const zRenameLabel = z.object({ name: zLabelName });
