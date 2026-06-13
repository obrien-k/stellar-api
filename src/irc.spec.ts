import {
  request,
  app,
  resetApiTestState,
  prismaMock
} from './test/apiTestHarness';

beforeEach(() => resetApiTestState());

const TOKEN = 'test-bot-token';
const validBody = {
  day: '2026-06-13',
  entries: [
    { username: 'alice', channel: '#announce', count: 42 },
    { username: 'bob', channel: '#general', count: 7 }
  ]
};

// ─── auth (scoped bot token) ──────────────────────────────────────────────────

describe('POST /api/irc/activity — auth', () => {
  it('rejects a request with no token (401)', async () => {
    const res = await request(app).post('/api/irc/activity').send(validBody);
    expect(res.status).toBe(401);
  });

  it('rejects a request with the wrong token (401)', async () => {
    const res = await request(app)
      .post('/api/irc/activity')
      .set('Authorization', 'Bearer wrong-token')
      .send(validBody);
    expect(res.status).toBe(401);
  });
});

// ─── upsert ───────────────────────────────────────────────────────────────────

describe('POST /api/irc/activity — upsert', () => {
  it('upserts counts for resolved users and reports applied count', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 1, username: 'alice' },
      { id: 2, username: 'bob' }
    ] as never);
    prismaMock.$transaction.mockResolvedValue([] as never);

    const res = await request(app)
      .post('/api/irc/activity')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ applied: 2, skipped: [] });
    expect(prismaMock.ircActivity.upsert).toHaveBeenCalledTimes(2);
    // SET semantics (idempotent), not blind increment.
    const firstCall = prismaMock.ircActivity.upsert.mock.calls[0][0];
    expect(firstCall.update).toEqual({ msgCount: 42 });
    expect(firstCall.create.msgCount).toBe(42);
  });

  it('skips unknown / disabled accounts without failing the batch', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 1, username: 'alice' }
    ] as never);
    prismaMock.$transaction.mockResolvedValue([] as never);

    const res = await request(app)
      .post('/api/irc/activity')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ applied: 1, skipped: ['bob'] });
    expect(prismaMock.ircActivity.upsert).toHaveBeenCalledTimes(1);
  });

  it('defaults the day to today (UTC) when omitted', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 1, username: 'alice' }
    ] as never);
    prismaMock.$transaction.mockResolvedValue([] as never);

    const res = await request(app)
      .post('/api/irc/activity')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        entries: [{ username: 'alice', channel: '#announce', count: 1 }]
      });

    expect(res.status).toBe(200);
    const call = prismaMock.ircActivity.upsert.mock.calls[0][0];
    const day = new Date(call.where.userId_channel_day!.day);
    // Midnight UTC of some day.
    expect(day.getUTCHours()).toBe(0);
    expect(day.getUTCMinutes()).toBe(0);
  });
});

// ─── validation ───────────────────────────────────────────────────────────────

describe('POST /api/irc/activity — validation', () => {
  it('rejects an empty entries array (400)', async () => {
    const res = await request(app)
      .post('/api/irc/activity')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ entries: [] });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed channel (400)', async () => {
    const res = await request(app)
      .post('/api/irc/activity')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        entries: [{ username: 'alice', channel: 'announce', count: 1 }]
      });
    expect(res.status).toBe(400);
  });

  it('rejects a negative count (400)', async () => {
    const res = await request(app)
      .post('/api/irc/activity')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        entries: [{ username: 'alice', channel: '#announce', count: -1 }]
      });
    expect(res.status).toBe(400);
  });
});
