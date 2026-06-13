import {
  request,
  app,
  resetApiTestState,
  prismaMock
} from './test/apiTestHarness';
import { Prisma } from '@prisma/client';

beforeEach(() => resetApiTestState());

const URLSAFE_32 = /^[A-Za-z0-9_-]{32}$/;

// ─── GET /api/keys ────────────────────────────────────────────────────────────

describe('GET /api/keys', () => {
  it('returns the current user keys (may be null)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ircKey: 'irc-existing',
      announceKey: null
    } as never);

    const res = await request(app).get('/api/keys');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ircKey: 'irc-existing', announceKey: null });
  });

  it('returns 404 when the user no longer exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/keys');

    expect(res.status).toBe(404);
  });
});

// ─── POST /api/keys/:kind (generate-on-demand) ────────────────────────────────

describe('POST /api/keys/:kind', () => {
  it('mints a 32-char url-safe key when the user has none', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ircKey: null } as never);
    prismaMock.user.update.mockResolvedValue({} as never);

    const res = await request(app).post('/api/keys/irc');

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('irc');
    expect(res.body.key).toMatch(URLSAFE_32);
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: returns the existing key without writing', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      announceKey: 'announce-existing'
    } as never);

    const res = await request(app).post('/api/keys/announce');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: 'announce', key: 'announce-existing' });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown key kind with 400', async () => {
    const res = await request(app).post('/api/keys/bogus');
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/keys/:kind/rotate ──────────────────────────────────────────────

describe('POST /api/keys/:kind/rotate', () => {
  it('always writes a fresh key, invalidating the prior value', async () => {
    prismaMock.user.update.mockResolvedValue({} as never);

    const res = await request(app).post('/api/keys/irc/rotate');

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('irc');
    expect(res.body.key).toMatch(URLSAFE_32);
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
  });

  it('retries once on a unique collision (P2002), then succeeds', async () => {
    prismaMock.user.update
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.0.0'
        })
      )
      .mockResolvedValueOnce({} as never);

    const res = await request(app).post('/api/keys/announce/rotate');

    expect(res.status).toBe(200);
    expect(res.body.key).toMatch(URLSAFE_32);
    expect(prismaMock.user.update).toHaveBeenCalledTimes(2);
  });

  it('rejects an unknown key kind with 400', async () => {
    const res = await request(app).post('/api/keys/bogus/rotate');
    expect(res.status).toBe(400);
  });
});
