/**
 * PRD-03 stylesheet scoring — docs/prd/03-stylesheet-themes-and-scoring.md.
 *
 * Pure function: given a stylesheet-selection event, return the Community
 * Reputation Score (CRS) deltas for the selecting user, the site, and any
 * author/staff recipient. No DB — mirrors the pure-scoring style of ratio.ts.
 *
 * Weights are pinned from PRD-03 and flagged there as interpretation pending
 * confirmation; change the constants here + the spec together.
 */

export type StylesheetOrigin =
  | { kind: 'site'; isDefault: boolean } // built-in site stylesheet (default = Sublime)
  | { kind: 'staff'; authorId: number } // authored by a SysOp/staff user
  | { kind: 'external' } // user's own external stylesheet URL
  | { kind: 'author'; authorId: number }; // a user-authored stylesheet

export interface StylesheetSelection {
  userId: number;
  origin: StylesheetOrigin;
}

export interface CrsAccrual {
  /** CRS to the selecting user (reward for customizing). */
  user: number;
  /** CRS to the site's own KPI score. */
  site: number;
  /** CRS routed to a staff/author recipient, if any. */
  author: { userId: number; delta: number } | null;
}

const USER_BASE = 0.1;
const SITE_BASE = 0.1415926535;

export const scoreStylesheetSelection = (
  selection: StylesheetSelection
): CrsAccrual => {
  const { userId, origin } = selection;

  switch (origin.kind) {
    case 'site':
      // Built-in theme: site keeps its base; user reward doubles off-default.
      return {
        user: USER_BASE * (origin.isDefault ? 1 : 2),
        site: SITE_BASE,
        author: null
      };

    case 'staff':
      // Adopting a staff-authored theme: the x3 bonus is routed to that staff
      // member, not the site.
      return {
        user: USER_BASE * 3,
        site: 0,
        author: { userId: origin.authorId, delta: SITE_BASE * 3 }
      };

    case 'external':
      // Authorless external stylesheet: the user's customization still earns the
      // engagement reward, but NOTHING accrues to the site. An unowned external
      // .css/.scss is a prune/investigate candidate — or, if other users share it,
      // a hidden Community stylesheet — resolved at the permission / link-health
      // layer, not credited here. An external that resolves to an author is scored
      // as `author` instead.
      return { user: USER_BASE * 3, site: 0, author: null };

    case 'author': {
      const isSelf = origin.authorId === userId;
      // Self-use is not an adoption — pay only the user reward, no author bonus
      // (FLAG: PRD-03 anti-farm interpretation). Others adopting pay the author x5.
      return {
        user: USER_BASE * (isSelf ? 5 : 3),
        site: 0,
        author: isSelf
          ? null
          : { userId: origin.authorId, delta: SITE_BASE * 5 }
      };
    }
  }
};

// ─── Tiering escalation curve (PRD-03 target #2, #121) ───────────────────────
// An author's stylesheet-dimension CRS as a function of how many distinct
// members have adopted their sheets. Replaces the old flat per-adoption reward
// with a back-loaded marginal schedule: early adoptions score BELOW the base
// rate, the marginal rate climbs each band, and the dimension cap (held in
// reputation.ts) is reached only by sustained popularity (~16 adoptions). We
// shape the climb, not the ceiling — a celebrated theme author should have to
// earn the cap, but a cosmetic signal must not dominate global CRS.
//
// Marginal (tax-bracket), not a whole-count multiplier, so the score is
// monotonic and cliff-free: it's read-time over the live adoption count
// (ADR-0007), so when a sheet loses adoptions the score eases down instead of
// re-rating every past adoption across a tier boundary. Rates are fractions of
// the base author delta `TIER_BASE`, so retuning the base rescales the curve.
const TIER_BASE = scoreStylesheetSelection({
  userId: 0,
  origin: { kind: 'author', authorId: 1 }
}).author!.delta;

// Each band scores adoptions up to (and including) `upTo` at `rate × TIER_BASE`;
// `upTo: null` is the open-ended top band. Cumulative band-end CRS: 0.64 / 2.23
// / 5.45 — the cap (6, in reputation.ts) lands at ~adoption 16 inside band 4.
const TIER_BANDS: ReadonlyArray<{ upTo: number | null; rate: number }> = [
  { upTo: 3, rate: 0.3 },
  { upTo: 8, rate: 0.45 },
  { upTo: 15, rate: 0.65 },
  { upTo: null, rate: 0.85 }
];

export const scoreStylesheetTier = (adoptions: number): number => {
  const n = Math.max(0, Math.floor(adoptions));
  let scored = 0; // adoptions already credited in lower bands
  let total = 0;
  for (const band of TIER_BANDS) {
    if (scored >= n) break;
    const bandTop = band.upTo ?? n;
    const inBand = Math.min(n, bandTop) - scored;
    total += inBand * band.rate * TIER_BASE;
    scored += inBand;
  }
  return total;
};
