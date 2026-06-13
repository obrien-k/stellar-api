/**
 * Release-Announce Feed (PRD-02) — the AnnounceKey-gated firehose of new
 * Contributions (the out-of-band torrent-announce stand-in, Golden Rule 3).
 *
 * This is the shared substrate: the IRC announce bot relays from it (polling
 * the `sinceId` cursor) and the RSS/XML feed (#140) renders the same items.
 *
 * Delivery is **notify-and-link** (#136): each item carries a plain link into
 * the app's release page — never a tokenized download URL. Consumption stays a
 * session-authed accounted grant; the link only saves a click.
 *
 * Authentication is the AnnounceKey itself: the key lives in the feed URL, so
 * rotating it dead-links the prior URL (resolveAnnounceKey stops matching).
 */
import { prisma } from '../lib/prisma';
import { email } from './config';

export interface AnnounceItem {
  /** Contribution id — also the feed cursor. */
  id: number;
  releaseId: number;
  title: string;
  artists: string[];
  community: string | null;
  type: string;
  createdAt: Date;
  /** Link into the app's release page (notify-and-link, #136). */
  link: string;
}

export interface AnnounceFeedOptions {
  /** Return only contributions newer than this id (cursor). */
  sinceId?: number;
  limit: number;
}

const releaseUrl = (releaseId: number): string =>
  `${email.siteUrl}/releases/${releaseId}`;

/**
 * Resolve an AnnounceKey to the owning active user, or null if it does not
 * match (unset, wrong, or rotated → the old URL is dead).
 */
export const resolveAnnounceKey = async (
  key: string
): Promise<number | null> => {
  if (!key) return null;
  const user = await prisma.user.findUnique({
    where: { announceKey: key },
    select: { id: true, disabled: true }
  });
  if (!user || user.disabled) return null;
  return user.id;
};

/** The new-Contribution firehose, newest first, with an optional cursor. */
export const getAnnounceFeed = async (
  opts: AnnounceFeedOptions
): Promise<AnnounceItem[]> => {
  const contributions = await prisma.contribution.findMany({
    where: opts.sinceId ? { id: { gt: opts.sinceId } } : undefined,
    orderBy: { id: 'desc' },
    take: opts.limit,
    select: {
      id: true,
      releaseId: true,
      type: true,
      createdAt: true,
      release: {
        select: { title: true, community: { select: { name: true } } }
      },
      collaborators: { select: { name: true } }
    }
  });

  return contributions.map((c) => ({
    id: c.id,
    releaseId: c.releaseId,
    title: c.release.title,
    artists: c.collaborators.map((a) => a.name),
    community: c.release.community?.name ?? null,
    type: c.type,
    createdAt: c.createdAt,
    link: releaseUrl(c.releaseId)
  }));
};

const escapeXml = (s: string): string =>
  s.replace(
    /[<>&'"]/g,
    (ch) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;'
      })[ch] as string
  );

const itemTitle = (item: AnnounceItem): string => {
  const artists = item.artists.length ? `${item.artists.join(', ')} — ` : '';
  return `${artists}${item.title} [${item.type}]`;
};

/** Render the feed as an RSS 2.0 document (#140) — same items as the JSON feed. */
export const renderAnnounceRss = (items: AnnounceItem[]): string => {
  const entries = items
    .map((item) => {
      const category = item.community
        ? `\n      <category>${escapeXml(item.community)}</category>`
        : '';
      return `    <item>
      <title>${escapeXml(itemTitle(item))}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="false">stellar-contribution-${item.id}</guid>
      <pubDate>${item.createdAt.toUTCString()}</pubDate>${category}
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Stellar — Release Announce</title>
    <link>${escapeXml(email.siteUrl)}</link>
    <description>New contributions on Stellar</description>
${entries}
  </channel>
</rss>`;
};
