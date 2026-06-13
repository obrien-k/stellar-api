import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { irc } from '../modules/config';

/** Constant-time equality that also tolerates length mismatch. */
const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
};

/**
 * Gate for endpoints the IRC bot calls with its scoped token (Golden Rule 5).
 * Fails closed: if `STELLAR_IRC_BOT_TOKEN` is unset, every request is rejected.
 */
export const requireBotToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const expected = irc.botToken;
  const header = req.headers.authorization ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!expected || !provided || !safeEqual(provided, expected)) {
    res.status(401).json({ msg: 'Unauthorized' });
    return;
  }
  next();
};
