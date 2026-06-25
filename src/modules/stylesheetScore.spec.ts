import {
  scoreStylesheetSelection,
  scoreStylesheetTier
} from './stylesheetScore';

// PRD-03 stylesheet scoring (docs/prd/03-stylesheet-themes-and-scoring.md).
// Pure: CRS deltas for {user, site, author} from a selection event.
// USER_BASE = 0.1, SITE_BASE = 0.1415926535. Weights are PRD interpretation
// pending confirmation (see flags in PRD-03); change constants + this spec together.
const SITE_BASE = 0.1415926535;

describe('scoreStylesheetSelection', () => {
  it('credits the site its base CRS when a user picks the default theme', () => {
    const a = scoreStylesheetSelection({
      userId: 1,
      origin: { kind: 'site', isDefault: true }
    });
    expect(a.user).toBeCloseTo(0.1, 10); // USER_BASE x1
    expect(a.site).toBeCloseTo(SITE_BASE, 10); // SITE_BASE x1
    expect(a.author).toBeNull();
  });

  it('doubles the user reward for a non-default site theme', () => {
    const a = scoreStylesheetSelection({
      userId: 1,
      origin: { kind: 'site', isDefault: false }
    });
    expect(a.user).toBeCloseTo(0.2, 10); // USER_BASE x2
    expect(a.site).toBeCloseTo(SITE_BASE, 10);
    expect(a.author).toBeNull();
  });

  it('routes the x3 site bonus to the staff author when adopting a staff stylesheet', () => {
    const a = scoreStylesheetSelection({
      userId: 1,
      origin: { kind: 'staff', authorId: 42 }
    });
    expect(a.user).toBeCloseTo(0.3, 10); // USER_BASE x3
    expect(a.site).toBe(0); // routed away from the site
    expect(a.author).toEqual({ userId: 42, delta: SITE_BASE * 3 });
  });

  it('rewards the user but credits no site/author for an authorless external (prune/community handled elsewhere)', () => {
    const a = scoreStylesheetSelection({
      userId: 1,
      origin: { kind: 'external' }
    });
    expect(a.user).toBeCloseTo(0.3, 10); // USER_BASE x3 — customization still counts
    expect(a.site).toBe(0); // unowned external earns the site nothing
    expect(a.author).toBeNull(); // prune/investigate (or Community) at the permission layer
  });

  it('pays the author the x5 bonus when another user adopts their stylesheet', () => {
    const a = scoreStylesheetSelection({
      userId: 1,
      origin: { kind: 'author', authorId: 7 }
    });
    expect(a.user).toBeCloseTo(0.3, 10); // adopter: USER_BASE x3
    expect(a.site).toBe(0);
    expect(a.author).toEqual({ userId: 7, delta: SITE_BASE * 5 });
  });

  it('gives the x5 user reward but no author bonus when using your own stylesheet', () => {
    // FLAG: self-selection is not an "adoption" — author bonus only fires for
    // OTHER users adopting, so self-use pays the user reward only (anti-farm).
    const a = scoreStylesheetSelection({
      userId: 7,
      origin: { kind: 'author', authorId: 7 }
    });
    expect(a.user).toBeCloseTo(0.5, 10); // USER_BASE x5
    expect(a.site).toBe(0);
    expect(a.author).toBeNull();
  });
});

// PRD-03 target #2 (#121) tiering escalation curve. Back-loaded marginal
// (tax-bracket) schedule over distinct adoptions, rates as fractions of the base
// author delta b = SITE_BASE x5. The cap (6) lives in reputation.ts, NOT here —
// this scorer returns the raw bracket sum, so band 4 runs past 6 unclamped.
describe('scoreStylesheetTier', () => {
  const b = SITE_BASE * 5; // base author delta ≈ 0.708

  it('scores zero adoptions as zero', () => {
    expect(scoreStylesheetTier(0)).toBe(0);
  });

  it('pins each band-end cumulative', () => {
    expect(scoreStylesheetTier(3)).toBeCloseTo(3 * 0.3 * b, 10); // 0.64
    expect(scoreStylesheetTier(8)).toBeCloseTo((3 * 0.3 + 5 * 0.45) * b, 10); // 2.23
    expect(scoreStylesheetTier(15)).toBeCloseTo(
      (3 * 0.3 + 5 * 0.45 + 7 * 0.65) * b,
      10
    ); // 5.45
  });

  it('scores a mid-band count at the prior bands plus the partial band', () => {
    // 5 adoptions: full band 1 (3) + 2 into band 2.
    expect(scoreStylesheetTier(5)).toBeCloseTo((3 * 0.3 + 2 * 0.45) * b, 10);
  });

  it('keeps climbing past the cap unclamped (band 4 is open-ended)', () => {
    // The dimension cap is reputation.ts's job; the curve itself is monotone up.
    expect(scoreStylesheetTier(30)).toBeGreaterThan(scoreStylesheetTier(16));
    expect(scoreStylesheetTier(16)).toBeCloseTo(
      (3 * 0.3 + 5 * 0.45 + 7 * 0.65 + 1 * 0.85) * b,
      10
    ); // 6.05, pre-clamp
  });

  it('is strictly monotonic and back-loaded (later adoptions worth more)', () => {
    for (let n = 1; n <= 25; n++) {
      expect(scoreStylesheetTier(n)).toBeGreaterThan(
        scoreStylesheetTier(n - 1)
      );
    }
    // Back-loaded: the marginal value of the 16th adoption exceeds the 1st.
    const marginal = (n: number) =>
      scoreStylesheetTier(n) - scoreStylesheetTier(n - 1);
    expect(marginal(16)).toBeGreaterThan(marginal(1));
  });

  it('floors and clamps non-integer / negative inputs', () => {
    expect(scoreStylesheetTier(-4)).toBe(0);
    expect(scoreStylesheetTier(3.9)).toBeCloseTo(scoreStylesheetTier(3), 10);
  });
});
