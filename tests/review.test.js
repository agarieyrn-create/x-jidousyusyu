// レビューで見つかった不具合の回帰テスト
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-rv-'));
process.env.DB_PATH = path.join(TMP_DIR, 'rv.sqlite');
delete process.env.AI_API_KEY; delete process.env.AI_PROVIDER; delete process.env.X_BEARER_TOKEN;

const { db } = await import('../src/db/index.js');
const { seed, refreshDemoPostDates } = await import('../src/db/seed.js');
const { createApiRoutes } = await import('../src/api/routes.js');
const { Hono } = await import('hono');
const { workspaceId: ws } = seed();
const app = new Hono();
app.route('/api', createApiRoutes({ getWorkspaceId: () => ws }));

after(() => { try { db.close(); } catch {} fs.rmSync(TMP_DIR, { recursive: true, force: true }); });

async function call(method, url, body, raw) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (raw !== undefined) init.body = raw; else if (body !== undefined) init.body = JSON.stringify(body);
  const res = await app.request(url, init);
  const t = await res.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, body: j, raw: t };
}

test('RV#1: DEMO mock posts stay searchable even if DB is old (dates refreshed on boot)', async () => {
  // 20日前に作ったDBを再現: demo投稿を全部20日古くする
  db.prepare(`UPDATE research_posts SET published_at = datetime(published_at, '-20 days') WHERE external_post_id LIKE 'demo_%'`).run();
  const before = await call('POST', '/api/research/search', { days: 7 });
  assert.equal(before.body.posts.length, 0, '古いままだと0件 (不具合の再現)');
  const n = refreshDemoPostDates(ws);
  assert.equal(n, 32);
  const r = await call('POST', '/api/research/search', { days: 7 });
  assert.ok(r.body.posts.length > 0, `リフレッシュ後はヒットする (${r.body.posts.length}件)`);
});

test('RV#2: malformed JSON → 400 (not 500)', async () => {
  const r = await call('POST', '/api/research/search', undefined, '{bad');
  assert.equal(r.status, 400);
  assert.match(r.body.error, /形式が不正/);
});

test('RV#3: keywords as string / days as garbage do not crash search', async () => {
  const r1 = await call('POST', '/api/research/search', { keywords: 'AI' });
  assert.equal(r1.status, 200);
  const r2 = await call('POST', '/api/research/search', { days: 'abc', minLikes: 'x' });
  assert.equal(r2.status, 200);
});

test('RV#4: blank / duplicate keywords are rejected or skipped', async () => {
  assert.equal((await call('POST', '/api/keywords', { keywords: ['   '] })).status, 400);
  const a = await call('POST', '/api/keywords', { keywords: ['重複KW', '重複KW'] });
  assert.equal(a.body.inserted.length, 1);
  const b = await call('POST', '/api/keywords', { keywords: ['重複KW'] });
  assert.equal(b.body.inserted.length, 0);
  assert.deepEqual(b.body.skipped, ['重複KW']);
  const cnt = db.prepare("SELECT COUNT(*) c FROM research_keywords WHERE workspace_id = ? AND keyword = '重複KW'").get(ws).c;
  assert.equal(cnt, 1);
});

test('RV#5: watch account requires valid username and rejects duplicates', async () => {
  assert.equal((await call('POST', '/api/watch-accounts', { username: '' })).status, 400);
  assert.equal((await call('POST', '/api/watch-accounts', { username: 'bad name!' })).status, 400);
  assert.equal((await call('POST', '/api/watch-accounts', { username: '@new_acc' })).status, 200);
  assert.equal((await call('POST', '/api/watch-accounts', { username: 'NEW_ACC' })).status, 409);
});

test('RV#6: manual import rejects empty text and javascript: URLs are not stored', async () => {
  assert.equal((await call('POST', '/api/manual-import', { type: 'text', text: '  ' })).status, 400);
  assert.equal((await call('POST', '/api/manual-import', { type: 'url', url: 'javascript:alert(1)' })).status, 400);
  const r = await call('POST', '/api/manual-import', { type: 'text', text: '本文', url: 'javascript:alert(1)' });
  assert.equal(r.status, 200);
  const row = db.prepare('SELECT url FROM research_posts WHERE id = ?').get(r.body.id);
  assert.equal(row.url, null);
});

test('RV#7: idea generate without post_id → 400, invalid idea status → 400', async () => {
  assert.equal((await call('POST', '/api/ideas/generate', {})).status, 400);
  const post = db.prepare('SELECT id FROM research_posts WHERE workspace_id = ? LIMIT 1').get(ws);
  const g = await call('POST', '/api/ideas/generate', { post_id: post.id });
  assert.equal(g.status, 200);
  const r = await call('PUT', `/api/ideas/${g.body.ideas[0].id}`, { status: 'HACK' });
  assert.equal(r.status, 400);
});

test('RV#8: unexpected errors return generic message without internals', async () => {
  const bad = new Hono();
  bad.route('/api', createApiRoutes({ getWorkspaceId: () => { throw new Error('SECRET_INTERNAL_DETAIL'); } }));
  const res = await bad.request('/api/keywords');
  const t = await res.text();
  assert.equal(res.status, 500);
  assert.ok(!t.includes('SECRET_INTERNAL_DETAIL'));
});
