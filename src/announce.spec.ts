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
