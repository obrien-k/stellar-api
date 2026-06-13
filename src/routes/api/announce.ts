import express, { Response } from 'express';
import { asyncHandler } from '../../modules/asyncHandler';
import { validateQuery, parsedQuery } from '../../middleware/validate';
import {
  announceFeedQuerySchema,
  type AnnounceFeedQuery
} from '../../schemas/announce';
import {
  resolveAnnounceKey,
  getAnnounceFeed,
  renderAnnounceRss,
  type AnnounceItem
} from '../../modules/announceFeed';

const router = express.Router();

const DEFAULT_LIMIT = 50;

/**
 * Shared gate + fetch for both feed representations: resolve the AnnounceKey
 * (an invalid/rotated key dead-links the URL → 401) and return the items, or
 * null if the response was already ended with a 401.
 */
const loadFeed = async (
  res: Response,
  query: AnnounceFeedQuery
): Promise<AnnounceItem[] | null> => {
  const userId = await resolveAnnounceKey(query.key);
  if (userId === null) {
    res.status(401).json({ msg: 'Invalid announce key' });
    return null;
  }
  return getAnnounceFeed({
    sinceId: query.since,
    limit: query.limit ?? DEFAULT_LIMIT
  });
};

// GET /api/announce/feed?key=&since=&limit= — the AnnounceKey-gated firehose of
// new Contributions (JSON). The IRC bot relays from it by polling `since`.
router.get(
  '/feed',
  validateQuery(announceFeedQuerySchema),
  asyncHandler(async (_req, res) => {
    const items = await loadFeed(res, parsedQuery<AnnounceFeedQuery>(res));
    if (items === null) return;
    res.json({ items });
  })
);

// GET /api/announce/feed.xml — the same firehose as an RSS 2.0 feed (#140).
router.get(
  '/feed.xml',
  validateQuery(announceFeedQuerySchema),
  asyncHandler(async (_req, res) => {
    const items = await loadFeed(res, parsedQuery<AnnounceFeedQuery>(res));
    if (items === null) return;
    res.type('application/rss+xml').send(renderAnnounceRss(items));
  })
);

export default router;
