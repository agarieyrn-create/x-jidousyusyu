// LIVE MODE Integration Test
//  X API / OpenAI を実際には呼ばず、globalThis.fetch を差し替えて
//  LIVE経路 (XAdapter → days/engagement filter → Trend Score → UPSERT) と
//  エラー処理 (X 429, OpenAI 429/401) を検証する。

import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-live-'));
process.env.DB_PATH = path.join(TMP_DIR, 'live.sqlite');
const FAKE_X_TOKEN = 'AAAAFAKE_X_BEARER_TOKEN_SHOULD_NEVER_LEAK_1234567890';
const FAKE_AI_KEY = 'sk-FAKE_OPENAI_KEY_SHOULD_NEVER_LEAK_1234567890';
process.env.X_BEARER_TOKEN = FAKE_X_TOKEN;
delete process.env.AI_API_KEY;
delete process.env.AI_PROVIDER;

const { db } = await import('../src/db/index.js');
const { seed } = await import('../src/db/seed.js');
const { createApiRoutes } = await import('../src/api/routes.js');
const { Hono } = await import('hono');

const { workspaceId: ws } = seed();
const app = new Hono();
app.route('/api', createApiRoutes({ getWorkspaceId: () => ws }));

const realFetch = globalThis.fetch;
let xResponder = null;     // (url) => {status, body}
let aiResponder = null;
const calledUrls = [];

globalThis.fetch = async (url, init) => {
  const u = String(url);
  calledUrls.push(u);
  if (u.startsWith('https://api.x.com/') && xResponder) {
    const r = xResponder(u);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (u.startsWith('https://api.openai.com/') && aiResponder) {
    const r = aiResponder(u, init);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`unexpected fetch in test: ${u}`);
};

after(() => {
  globalThis.fetch = realFetch;
  try { db.close(); } catch {}
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
});
beforeEach(() => { calledUrls.length = 0; });

async function post(url, body) {
  const res = await app.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text), raw: text };
}

const hoursAgo = h => new Date(Date.now() - h * 3600000).toISOString();

function xPayload(tweets) {
  return {
    status: 200,
    body: {
      data: tweets.map(t => ({
        id: t.id, text: t.text, author_id: 'u1', created_at: t.created_at,
        public_metrics: { like_count: t.likes, retweet_count: t.rts, reply_count: 1, quote_count: 0 }
      })),
      includes: { users: [{ id: 'u1', username: 'live_user', name: 'Live User', public_metrics: { followers_count: 5000 } }] }
    }
  };
}

test('LIVE#1: query excludes min_faves/min_retweets; days + minLikes filtered app-side', async () => {
  xResponder = () => xPayload([
    { id: 'L1', text: 'AI 新しい', created_at: hoursAgo(2),  likes: 300, rts: 30 },  // 残る
    { id: 'L2', text: 'AI 古い',   created_at: hoursAgo(30), likes: 900, rts: 90 },  // days=1で除外
    { id: 'L3', text: 'AI 弱い',   created_at: hoursAgo(3),  likes: 10,  rts: 1 }    // minLikesで除外
  ]);
  const r = await post('/api/research/search', { keywords: ['AI'], days: 1, minLikes: 100, minReposts: 10 });
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'live');
  const ids = r.body.posts.map(p => p.external_post_id).sort();
  assert.deepEqual(ids, ['L1']);

  const xCall = calledUrls.find(u => u.startsWith('https://api.x.com/2/tweets/search/recent'));
  const q = new URL(xCall).searchParams.get('query');
  assert.doesNotMatch(q, /min_faves|min_retweets/);
  assert.match(q, /lang:ja/);
});

test('LIVE#2: refetch updates metrics (UPSERT) and keeps is_saved', async () => {
  const row = db.prepare("SELECT * FROM research_posts WHERE workspace_id = ? AND external_post_id = 'L1'").get(ws);
  db.prepare('UPDATE research_posts SET is_saved = 1 WHERE id = ?').run(row.id);

  xResponder = () => xPayload([{ id: 'L1', text: 'AI 新しい', created_at: hoursAgo(2), likes: 1200, rts: 150 }]);
  const r = await post('/api/research/search', { keywords: ['AI'], days: 1 });
  assert.equal(r.status, 200);
  const after = db.prepare('SELECT * FROM research_posts WHERE id = ?').get(row.id);
  assert.equal(after.like_count, 1200);
  assert.equal(after.repost_count, 150);
  assert.equal(after.is_saved, 1);
  assert.equal(after.created_at, row.created_at);
  const count = db.prepare("SELECT COUNT(*) c FROM research_posts WHERE workspace_id = ? AND external_post_id = 'L1'").get(ws).c;
  assert.equal(count, 1);
});

test('LIVE#3: X 429 → HTTP 429 + friendly message, no token leak', async () => {
  xResponder = () => ({ status: 429, body: { title: 'Too Many Requests', detail: `token=${FAKE_X_TOKEN}` } });
  const r = await post('/api/research/search', { keywords: ['AI'], days: 1 });
  assert.equal(r.status, 429);
  assert.equal(r.body.error_code, 'rate_limited');
  assert.match(r.body.error, /X APIの利用上限に達しました/);
  assert.ok(!r.raw.includes(FAKE_X_TOKEN), 'レスポンスにBearer Tokenが含まれない');
  assert.ok(!r.raw.includes('Too Many Requests'), 'X APIの生bodyを返さない');
});

test('LIVE#4: X 401 → friendly message, no token leak', async () => {
  xResponder = () => ({ status: 401, body: { detail: FAKE_X_TOKEN } });
  const r = await post('/api/research/search', { keywords: ['AI'], days: 1 });
  assert.equal(r.status, 502);
  assert.equal(r.body.error_code, 'unauthorized');
  assert.ok(!r.raw.includes(FAKE_X_TOKEN));
});

test('LIVE#5: OpenAI 429 → HTTP 429, no retry, nothing saved, no key leak', async () => {
  process.env.AI_PROVIDER = 'openai';
  process.env.AI_API_KEY = FAKE_AI_KEY;
  try {
    let aiCalls = 0;
    aiResponder = () => { aiCalls++; return { status: 429, body: { error: { message: `key ${FAKE_AI_KEY}` } } }; };
    const row = db.prepare("SELECT id FROM research_posts WHERE workspace_id = ? AND external_post_id = 'L1'").get(ws);
    const before = db.prepare('SELECT COUNT(*) c FROM analyses').get().c;
    const r = await post(`/api/posts/${row.id}/analyze`, {});
    assert.equal(r.status, 429);
    assert.equal(r.body.error_code, 'rate_limited');
    assert.match(r.body.error, /AIサービスの利用上限/);
    assert.equal(aiCalls, 1, '上限エラーでは再生成リトライしない');
    assert.ok(!r.raw.includes(FAKE_AI_KEY));
    assert.equal(db.prepare('SELECT COUNT(*) c FROM analyses').get().c, before, 'DBに保存しない');
  } finally {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_API_KEY;
  }
});

test('LIVE#6: OpenAI 401 on idea generation → no ideas saved', async () => {
  process.env.AI_PROVIDER = 'openai';
  process.env.AI_API_KEY = FAKE_AI_KEY;
  try {
    aiResponder = () => ({ status: 401, body: {} });
    const row = db.prepare("SELECT id FROM research_posts WHERE workspace_id = ? AND external_post_id = 'L1'").get(ws);
    const before = db.prepare('SELECT COUNT(*) c FROM ideas').get().c;
    const r = await post('/api/ideas/generate', { post_id: row.id });
    assert.equal(r.status, 502);
    assert.equal(r.body.error_code, 'unauthorized');
    assert.ok(!r.raw.includes(FAKE_AI_KEY));
    assert.equal(db.prepare('SELECT COUNT(*) c FROM ideas').get().c, before);
  } finally {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_API_KEY;
  }
});
