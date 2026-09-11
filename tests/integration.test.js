// Integration Test:
//  Research Search → Post 取得 → 保存 → AI分析 → Idea生成 → Idea保存 → Content Brief
//  外部APIは使わずMockのみで完結。
//
//  加えて Workspace 分離テストとして、
//   別Workspaceのデータは 取得 / 更新 / 削除 いずれもできないことを検証する。

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// DBファイルパスを固定 (import 前にセットする必要がある)
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-it-'));
const TMP_DB  = path.join(TMP_DIR, 'test.sqlite');
process.env.DB_PATH = TMP_DB;
// AI / X はDEMO MODEで走らせる
delete process.env.AI_API_KEY;
delete process.env.AI_PROVIDER;
delete process.env.X_BEARER_TOKEN;

// ここで初めてDB / route / seed を import (env は上でセット済み)
const { db, uid, nowIso, toJson } = await import('../src/db/index.js');
const { seed } = await import('../src/db/seed.js');
const { createApiRoutes } = await import('../src/api/routes.js');
const { Hono } = await import('hono');

// Seed(=1個目のWorkspace)
const { workspaceId: wsA } = seed();

// 2個目のWorkspaceを別ユーザーとして直接作る
const wsB = uid('wsp');
const usrB = uid('usr');
const now = nowIso();
db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
  .run(usrB, 'other@radar.local', 'x', now);
db.prepare('INSERT INTO workspaces (id, user_id, name, created_at) VALUES (?, ?, ?, ?)')
  .run(wsB, usrB, 'Other Workspace', now);

// ヘルパー: workspaceIdを可変に切り替えられるHonoアプリを作る
function createAppFor(workspaceId) {
  const app = new Hono();
  app.route('/api', createApiRoutes({ getWorkspaceId: () => workspaceId }));
  return app;
}

async function jsonReq(app, method, url, body) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await app.request(url, init);
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

after(() => {
  try { db.close(); } catch {}
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
});

// ---------------- Integration flow ----------------
let flowPostId = null;
let flowIdeaId = null;

test('IT#1: research/search (DEMO MODE) returns mock posts', async () => {
  const app = createAppFor(wsA);
  const r = await jsonReq(app, 'POST', '/api/research/search',
    { keywords: ['AI'], days: 30, minLikes: 0, minReposts: 0 });
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'demo');
  assert.ok(Array.isArray(r.body.posts));
  assert.ok(r.body.posts.length > 0, 'DEMO MODEで少なくとも1件返る');
  flowPostId = r.body.posts[0].id;
  assert.ok(typeof flowPostId === 'string' && flowPostId.startsWith('pst_'));
});

test('IT#2: GET /posts/:id returns owned post', async () => {
  const app = createAppFor(wsA);
  const r = await jsonReq(app, 'GET', `/api/posts/${flowPostId}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.post.id, flowPostId);
});

test('IT#3: POST /posts/:id/save marks as saved', async () => {
  const app = createAppFor(wsA);
  const r = await jsonReq(app, 'POST', `/api/posts/${flowPostId}/save`, { saved: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.is_saved, true);
});

test('IT#4: POST /posts/:id/analyze creates analysis via Mock AI', async () => {
  const app = createAppFor(wsA);
  const r = await jsonReq(app, 'POST', `/api/posts/${flowPostId}/analyze`, {});
  assert.equal(r.status, 200);
  assert.ok(r.body.analysis.summary, 'analysis.summary が入る');
  assert.ok(Array.isArray(r.body.analysis.reusable_patterns));
});

test('IT#5: POST /ideas/generate creates 3 ideas', async () => {
  const app = createAppFor(wsA);
  const r = await jsonReq(app, 'POST', '/api/ideas/generate', { post_id: flowPostId });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.ideas));
  assert.ok(r.body.ideas.length >= 1, '少なくとも1案返る');
  flowIdeaId = r.body.ideas[0].id;
});

test('IT#6: PUT /ideas/:id updates status', async () => {
  const app = createAppFor(wsA);
  const r = await jsonReq(app, 'PUT', `/api/ideas/${flowIdeaId}`, { status: '採用候補' });
  assert.equal(r.status, 200);
  assert.equal(r.body.idea.status, '採用候補');
});

test('IT#7: GET /ideas/:id/brief returns content brief JSON', async () => {
  const app = createAppFor(wsA);
  const r = await jsonReq(app, 'GET', `/api/ideas/${flowIdeaId}/brief`);
  assert.equal(r.status, 200);
  assert.equal(r.body.idea_id, flowIdeaId);
});

// ---------------- Workspace isolation ----------------
test('WS-ISO#1: other workspace cannot GET my post → 404', async () => {
  const app = createAppFor(wsB);
  const r = await jsonReq(app, 'GET', `/api/posts/${flowPostId}`);
  assert.equal(r.status, 404);
  assert.equal(r.body.error, 'not_found');
});

test('WS-ISO#2: other workspace cannot save my post → 404', async () => {
  const app = createAppFor(wsB);
  const r = await jsonReq(app, 'POST', `/api/posts/${flowPostId}/save`, { saved: false });
  assert.equal(r.status, 404);
  // かつ DB上の is_saved は変わっていない
  const cur = db.prepare('SELECT is_saved FROM research_posts WHERE id = ?').get(flowPostId);
  assert.equal(cur.is_saved, 1);
});

test('WS-ISO#3: other workspace cannot analyze my post → 404', async () => {
  const app = createAppFor(wsB);
  const r = await jsonReq(app, 'POST', `/api/posts/${flowPostId}/analyze`, {});
  assert.equal(r.status, 404);
});

test('WS-ISO#4: other workspace cannot update my idea → 404', async () => {
  const app = createAppFor(wsB);
  const r = await jsonReq(app, 'PUT', `/api/ideas/${flowIdeaId}`, { status: 'DELETED_BY_ATTACKER' });
  assert.equal(r.status, 404);
  const cur = db.prepare('SELECT status FROM ideas WHERE id = ?').get(flowIdeaId);
  assert.equal(cur.status, '採用候補', 'wsBによる書き換えが起きていない');
});

test('WS-ISO#5: other workspace cannot read my idea brief → 404', async () => {
  const app = createAppFor(wsB);
  const r = await jsonReq(app, 'GET', `/api/ideas/${flowIdeaId}/brief`);
  assert.equal(r.status, 404);
});

test('WS-ISO#6: other workspace cannot delete my keyword → 404', async () => {
  // wsA のkeywordを1件取り出して、wsB でDELETE試行
  const kw = db.prepare('SELECT id FROM research_keywords WHERE workspace_id = ? LIMIT 1').get(wsA);
  assert.ok(kw);
  const app = createAppFor(wsB);
  const r = await jsonReq(app, 'DELETE', `/api/keywords/${kw.id}`);
  assert.equal(r.status, 404);
  const still = db.prepare('SELECT id FROM research_keywords WHERE id = ?').get(kw.id);
  assert.ok(still, 'wsBの操作でwsAのkeywordが消えていない');
});

test('WS-ISO#7: other workspace cannot update my keyword → 404', async () => {
  const kw = db.prepare('SELECT id, keyword FROM research_keywords WHERE workspace_id = ? LIMIT 1').get(wsA);
  const app = createAppFor(wsB);
  const r = await jsonReq(app, 'PUT', `/api/keywords/${kw.id}`, { keyword: 'HACKED' });
  assert.equal(r.status, 404);
  const still = db.prepare('SELECT keyword FROM research_keywords WHERE id = ?').get(kw.id);
  assert.equal(still.keyword, kw.keyword, 'wsBの操作でwsAのkeywordが書き換わっていない');
});

test('WS-ISO#8: other workspace cannot see any of wsA posts in /posts list', async () => {
  const app = createAppFor(wsB);
  const r = await jsonReq(app, 'GET', '/api/posts');
  assert.equal(r.status, 200);
  assert.equal(r.body.posts.length, 0, 'wsB は 0件');
});

test('WS-ISO#9: other workspace cannot delete my watch account → 404', async () => {
  const wa = db.prepare('SELECT id FROM watch_accounts WHERE workspace_id = ? LIMIT 1').get(wsA);
  assert.ok(wa);
  const app = createAppFor(wsB);
  const r = await jsonReq(app, 'DELETE', `/api/watch-accounts/${wa.id}`);
  assert.equal(r.status, 404);
  const still = db.prepare('SELECT id FROM watch_accounts WHERE id = ?').get(wa.id);
  assert.ok(still, 'wsBの操作でwsAのwatch_accountが消えていない');
});

test('WS-ISO#10: other workspace analysis endpoint → 404 for wsA account', async () => {
  const wa = db.prepare('SELECT id FROM watch_accounts WHERE workspace_id = ? LIMIT 1').get(wsA);
  const app = createAppFor(wsB);
  const r = await jsonReq(app, 'GET', `/api/watch-accounts/${wa.id}/analysis`);
  assert.equal(r.status, 404);
});
