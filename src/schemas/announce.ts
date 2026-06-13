import { z } from 'zod';

// The AnnounceKey lives in the feed URL (so rotation dead-links it); `since` is
// the contribution-id cursor for pollers, `limit` bounds the page.
export const announceFeedQuerySchema = z.object({
  key: z.string().min(1),
  since: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

export type AnnounceFeedQuery = z.infer<typeof announceFeedQuerySchema>;
