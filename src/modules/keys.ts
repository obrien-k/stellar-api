/**
 * Per-user IRC & Announce credentials (PRD-02).
 *
 * Two net-new credentials on `User`, both unique, lazily-generated, rotatable
 * 32-char URL-safe tokens:
 *
 *   - `ircKey`      — IRC identity / SASL secret, validated by delegated auth
 *                     (ADR-0011). Rotating it drops any always-on session.
 *   - `announceKey` — authenticates the Release-Announce Feed (RSS + IRC).
 *                     Rotating it dead-links the prior feed URL.
 *
 * Neither key ever authenticates a download — release consumption stays a
 * session-authed accounted grant. The dead-link / session-drop on rotation is
 * emergent: downstream gates (the SASL-validate endpoint, the feed) always
 * compare against the current stored value, so a rotated key simply stops
 * matching.
 */
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type KeyKind = 'irc' | 'announce';

/** 24 random bytes → exactly 32 URL-safe base64 characters. */
const generateKey = (): string => crypto.randomBytes(24).toString('base64url');

const FIELD: Record<KeyKind, 'ircKey' | 'announceKey'> = {
  irc: 'ircKey',
  announce: 'announceKey'
};

export interface UserKeys {
  ircKey: string | null;
  announceKey: string | null;
}

/** Both keys for a user, as-is (either may be null until generated). */
export const getKeys = async (userId: number): Promise<UserKeys | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ircKey: true, announceKey: true }
  });
  return user ?? null;
};

/**
 * Persist a freshly-generated value for one key, retrying once on the
 * astronomically-unlikely unique collision.
 */
const writeKey = async (userId: number, kind: KeyKind): Promise<string> => {
  const field = FIELD[kind];
  for (let attempt = 0; attempt < 2; attempt++) {
    const value = generateKey();
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { [field]: value }
      });
      return value;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        attempt === 0
      ) {
        continue;
      }
      throw err;
    }
  }
  // Unreachable: the loop either returns or throws.
  throw new Error('Failed to generate a unique key');
};

/**
 * Generate-on-demand: mint a key only if the user does not already have one,
 * then return whichever value is current (idempotent).
 */
export const ensureKey = async (
  userId: number,
  kind: KeyKind
): Promise<string> => {
  const field = FIELD[kind];
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { [field]: true } as Record<string, true>
  });
  const existing = user?.[field] as string | null | undefined;
  if (existing) return existing;
  return writeKey(userId, kind);
};

/** Force a fresh value, invalidating the prior one. */
export const rotateKey = (userId: number, kind: KeyKind): Promise<string> =>
  writeKey(userId, kind);
