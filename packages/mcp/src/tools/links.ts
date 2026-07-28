import { z } from 'zod';
import { defineTool } from './types.js';

export const getLinkPreview = defineTool({
  name: 'get_link_preview',
  description:
    'Get the cached rich preview (title, description, site, image) for a URL found in a note. status=pending means the fetch was just queued — ask again shortly; status=disabled means the user turned previews off.',
  inputSchema: z.object({ url: z.url().max(2000).describe('The http(s) URL to preview') }),
  annotations: { readOnlyHint: true },
  handler: async (client, args) => client.getLinkPreview(args.url),
});
