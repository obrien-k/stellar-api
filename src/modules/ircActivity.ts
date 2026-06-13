/**
 * IRC Activity Rollup (ADR-0012) — the durable substrate for IRCScore.
 *
 * The bot upserts one row per member × channel × day of MESSAGE counts. The
 * count for a (user, channel, day) is the bot's authoritative running total for
 * that UTC day, so re-sending it is idempotent (we SET, never blind-increment).
 * Messages only — presence/idle is never recorded.
 */
import { prisma } from '../lib/prisma';

export interface ActivityEntry {
  username: string;
  channel: string;
  count: number;
}

export interface UpsertResult {
  applied: number;
  /** Usernames that did not resolve to an active account (skipped, not fatal). */
  skipped: string[];
}

/** Normalise an incoming `YYYY-MM-DD` (or default to now) to a UTC date. */
export const toUtcDay = (day?: string): Date => {
  const base = day ? new Date(`${day}T00:00:00.000Z`) : new Date();
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate())
  );
};

/**
 * Upsert a batch of per-channel daily message counts for one day. Unknown or
 * disabled accounts are skipped (reported, not fatal) so one bad name can't
 * sink the whole flush.
 */
export const upsertActivity = async (
  day: Date,
  entries: ActivityEntry[]
): Promise<UpsertResult> => {
  const usernames = [...new Set(entries.map((e) => e.username))];
  const users = await prisma.user.findMany({
    where: { username: { in: usernames }, disabled: false },
    select: { id: true, username: true }
  });
  const idByName = new Map(users.map((u) => [u.username, u.id]));

  const skipped = new Set<string>();
  const ops = [];
  for (const e of entries) {
    const userId = idByName.get(e.username);
    if (userId === undefined) {
      skipped.add(e.username);
      continue;
    }
    ops.push(
      prisma.ircActivity.upsert({
        where: {
          userId_channel_day: { userId, channel: e.channel, day }
        },
        create: { userId, channel: e.channel, day, msgCount: e.count },
        update: { msgCount: e.count }
      })
    );
  }

  if (ops.length > 0) await prisma.$transaction(ops);
  return { applied: ops.length, skipped: [...skipped] };
};
