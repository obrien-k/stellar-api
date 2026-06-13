import express from 'express';
import { asyncHandler } from '../../modules/asyncHandler';
import { validateQuery, parsedQuery } from '../../middleware/validate';
import {
  announceFeedQuerySchema,
  type AnnounceFeedQuery
} from '../../schemas/announce';
import {
  resolveAnnounceKey,
  getAnnounceFeed
} from '../../modules/announceFeed';

const router = express.Router();

const DEFAULT_LIMIT = 50;

// GET /api/announce/feed?key=&since=&limit= — the AnnounceKey-gated firehose of
// new Contributions (JSON). The IRC bot relays from it; RSS renders it (#140).
// An invalid/rotated key dead-links the URL (401).
router.get(
  '/feed',
  validateQuery(announceFeedQuerySchema),
  asyncHandler(async (_req, res) => {
    const { key, since, limit } = parsedQuery<AnnounceFeedQuery>(res);

    const userId = await resolveAnnounceKey(key);
    if (userId === null) {
      res.status(401).json({ msg: 'Invalid announce key' });
      return;
    }

    const items = await getAnnounceFeed({
      sinceId: since,
      limit: limit ?? DEFAULT_LIMIT
    });
    res.json({ items });
  })
);

export default router;
