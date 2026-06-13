import express from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/errors';
import { authHandler } from '../../modules/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { validateParams, parsedParams } from '../../middleware/validate';
import {
  ensureKey,
  rotateKey,
  getKeys,
  type KeyKind
} from '../../modules/keys';

const router = express.Router();

const kindParams = z.object({ kind: z.enum(['irc', 'announce']) });

// GET /api/keys — the owning user's IRC & Announce keys (the only surface that
// exposes them; they are never returned in general user/profile payloads).
router.get(
  '/',
  requireAuth,
  authHandler(async (req, res) => {
    const keys = await getKeys(req.user.id);
    if (!keys) throw new AppError(404, 'User not found');
    res.json(keys);
  })
);

// POST /api/keys/:kind — generate-on-demand: mints the key if absent, otherwise
// returns the current value (idempotent).
router.post(
  '/:kind',
  requireAuth,
  validateParams(kindParams),
  authHandler(async (req, res) => {
    const { kind } = parsedParams<{ kind: KeyKind }>(res);
    const key = await ensureKey(req.user.id, kind);
    res.json({ kind, key });
  })
);

// POST /api/keys/:kind/rotate — force a fresh value, invalidating the prior one
// (announce: dead-links the feed URL; irc: drops any always-on session).
router.post(
  '/:kind/rotate',
  requireAuth,
  validateParams(kindParams),
  authHandler(async (req, res) => {
    const { kind } = parsedParams<{ kind: KeyKind }>(res);
    const key = await rotateKey(req.user.id, kind);
    res.json({ kind, key });
  })
);

export default router;
