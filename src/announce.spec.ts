import {
  request,
  app,
  resetApiTestState,
  prismaMock
} from './test/apiTestHarness';

beforeEach(() => resetApiTestState());

const KEY = 'a'.repeat(32);

const mockContribution = {
  id: 12,
  releaseId: 34,
  type: 'flac',
  createdAt: new Date('2026-06-13T00:00:00Z'),
  release: { title: 'Album', community: { name: 'Music' } },
  collaborators: [{ name: 'Artist A' }, { name: 'Artist B' }]
};

// ─── gating ───────────────────────────────────────────────────────────────────

describe('GET /api/announce/feed — gating', () => {
  it('rejects a request with no key (400)', async () => {
    const res = await request(app).get('/api/announce/feed');
    expect(res.status).toBe(400);
  });

  it('dead-links an invalid / rotated key (401)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await request(app).get(`/api/announce/feed?key=${KEY}`);
    expect(res.status).toBe(401);
  });

  it('rejects a disabled member (401)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 7,
      disabled: true
    } as never);
    const res = await request(app).get(`/api/announce/feed?key=${KEY}`);
    expect(res.status).toBe(401);
  });
});

// ─── feed contents (notify-and-link) ──────────────────────────────────────────

describe('GET /api/announce/feed — contents', () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 7,
      disabled: false
    } as never);
  });

  it('returns new contributions as notify-and-link items', async () => {
    prismaMock.contribution.findMany.mockResolvedValue([
      mockContribution
    ] as never);

    const res = await request(app).get(`/api/announce/feed?key=${KEY}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toEqual({
      id: 12,
      releaseId: 34,
      title: 'Album',
      artists: ['Artist A', 'Artist B'],
      community: 'Music',
      type: 'flac',
      createdAt: '2026-06-13T00:00:00.000Z',
      // notify-and-link: a plain app link, never a tokenized download URL.
      link: 'http://localhost:3000/releases/34'
    });
    expect(res.body.items[0].link).not.toContain(KEY);
  });

  it('applies the since cursor to the query', async () => {
    prismaMock.contribution.findMany.mockResolvedValue([] as never);

    await request(app).get(`/api/announce/feed?key=${KEY}&since=100`);

    expect(prismaMock.contribution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { gt: 100 } } })
    );
  });

  it('caps the limit (rejects > 100)', async () => {
    const res = await request(app).get(
      `/api/announce/feed?key=${KEY}&limit=500`
    );
    expect(res.status).toBe(400);
  });

  it('tolerates a contribution with no community', async () => {
    prismaMock.contribution.findMany.mockResolvedValue([
      { ...mockContribution, release: { title: 'Solo', community: null } }
    ] as never);

    const res = await request(app).get(`/api/announce/feed?key=${KEY}`);

    expect(res.status).toBe(200);
    expect(res.body.items[0].community).toBeNull();
  });
});

// ─── RSS/XML (#140) ───────────────────────────────────────────────────────────

describe('GET /api/announce/feed.xml', () => {
  it('dead-links an invalid / rotated key (401)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await request(app).get(`/api/announce/feed.xml?key=${KEY}`);
    expect(res.status).toBe(401);
  });

  it('renders the same items as valid RSS 2.0', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 7,
      disabled: false
    } as never);
    prismaMock.contribution.findMany.mockResolvedValue([
      mockContribution
    ] as never);

    const res = await request(app).get(`/api/announce/feed.xml?key=${KEY}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/rss+xml');
    expect(res.text).toContain('<rss version="2.0">');
    expect(res.text).toContain(
      '<title>Artist A, Artist B — Album [flac]</title>'
    );
    expect(res.text).toContain(
      '<link>http://localhost:3000/releases/34</link>'
    );
    expect(res.text).toContain('stellar-contribution-12');
    expect(res.text).toContain('<category>Music</category>');
    // The key must never leak into the rendered feed body.
    expect(res.text).not.toContain(KEY);
  });

  it('xml-escapes item content', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 7,
      disabled: false
    } as never);
    prismaMock.contribution.findMany.mockResolvedValue([
      {
        ...mockContribution,
        release: { title: 'Rock & <Roll>', community: { name: 'Music' } }
      }
    ] as never);

    const res = await request(app).get(`/api/announce/feed.xml?key=${KEY}`);

    expect(res.text).toContain('Rock &amp; &lt;Roll&gt;');
    expect(res.text).not.toContain('Rock & <Roll>');
  });
});
