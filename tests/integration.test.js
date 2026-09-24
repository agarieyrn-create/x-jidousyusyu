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

test('IT#5: POST /ideas/generate creates >=3 ideas', async () => {
  const app = createAppFor(wsA);
  const r = await jsonReq(app, 'POST', '/api/ideas/generate', { post_id: flowPostId });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.ideas));
  assert.ok(r.body.ideas.length >= 3, `最低3案返る (実際: ${r.body.ideas.length})`);
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

// ---------------- UPSERT & days filter ----------------
const { upsertPostsBatch } = await import('../src/api/routes.js');

test('UPSERT#1: refetching same X post updates metrics but keeps id / is_saved / created_at', async () => {
  // 1回目: 挿入
  const before = upsertPostsBatch({
    workspaceId: wsA,
    posts: [{
      platform: 'x',
      external_post_id: 'upsert_test_001',
      author_id: 'u_x',
      username: 'test_user', display_name: 'Test User',
      text: '最初のテキスト',
      url: 'https://x.com/test_user/status/upsert_test_001',
      published_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      like_count: 10, repost_count: 2, reply_count: 1, quote_count: 0,
      follower_count: 1000,
      trend_score: 20,
      source_keyword: 'AI',
      has_media: false
    }]
  });
  assert.equal(before[0].mode, 'inserted');
  const inserted = db.prepare('SELECT * FROM research_posts WHERE id = ?').get(before[0].id);
  // 保存済みマークをユーザーが付けたと仮定
  db.prepare('UPDATE research_posts SET is_saved = 1 WHERE id = ?').run(inserted.id);
  const originalId = inserted.id;
  const originalCreatedAt = inserted.created_at;

  // 2回目: 同じ external_post_id で数値だけ増えて再取得された想定
  await new Promise(r => setTimeout(r, 5)); // 同一ミリ秒でupdated_atが同値になるのを防ぐ
  const after = upsertPostsBatch({
    workspaceId: wsA,
    posts: [{
      platform: 'x',
      external_post_id: 'upsert_test_001',
      author_id: 'u_x',
      username: 'test_user_renamed', display_name: 'Test User (renamed)',
      text: '最初のテキスト (加筆)',
      url: 'https://x.com/test_user/status/upsert_test_001',
      published_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      like_count: 500, repost_count: 80, reply_count: 40, quote_count: 5,
      follower_count: 2000,
      trend_score: 92.5,
      source_keyword: 'AI2',
      has_media: true
    }]
  });
  assert.equal(after[0].mode, 'updated');
  assert.equal(after[0].id, originalId, 'idは維持される');

  const now = db.prepare('SELECT * FROM research_posts WHERE id = ?').get(originalId);
  // 更新されるべき項目
  assert.equal(now.like_count, 500);
  assert.equal(now.repost_count, 80);
  assert.equal(now.reply_count, 40);
  assert.equal(now.quote_count, 5);
  assert.equal(now.follower_count, 2000);
  assert.equal(now.trend_score, 92.5);
  assert.equal(now.text, '最初のテキスト (加筆)');
  assert.equal(now.username, 'test_user_renamed');
  assert.equal(now.display_name, 'Test User (renamed)');
  assert.equal(now.has_media, 1);
  assert.equal(now.source_keyword, 'AI2');
  assert.notEqual(now.updated_at, originalCreatedAt, 'updated_atは更新される');
  // 維持されるべき項目
  assert.equal(now.id, originalId);
  assert.equal(now.workspace_id, wsA);
  assert.equal(now.is_saved, 1, 'is_savedはユーザー設定が保持される');
  assert.equal(now.created_at, originalCreatedAt);
});

test('UPSERT#2: same external_post_id in another workspace is stored independently', () => {
  const r = upsertPostsBatch({
    workspaceId: wsB,
    posts: [{ platform: 'x', external_post_id: 'upsert_test_001', text: 'wsB側', like_count: 1,
      published_at: new Date().toISOString() }]
  });
  assert.equal(r[0].mode, 'inserted', 'wsBでは新規行');
  const rows = db.prepare('SELECT * FROM research_posts WHERE external_post_id = ? ORDER BY workspace_id').all('upsert_test_001');
  assert.equal(rows.length, 2, 'workspaceごとに1行ずつ');
  const a = rows.find(x => x.workspace_id === wsA);
  const b = rows.find(x => x.workspace_id === wsB);
  assert.equal(a.like_count, 500, 'wsAの数値はwsBの取得で上書きされない');
  assert.equal(a.is_saved, 1);
  assert.equal(b.like_count, 1);
  assert.equal(b.is_saved, 0);
  assert.notEqual(a.id, b.id);
});

test('DAYS#1: research/search DEMO respects days filter', async () => {
  // wsAに、10日前と2日前の投稿を1件ずつ入れる
  const app = createAppFor(wsA);
  upsertPostsBatch({
    workspaceId: wsA,
    posts: [
      {
        platform: 'x', external_post_id: 'days_old_1',
        text: 'AIのテスト投稿(10日前)', url: 'https://x.com/xx/status/days_old_1',
        published_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        like_count: 100, repost_count: 10, reply_count: 1, quote_count: 0,
        follower_count: 1000, trend_score: 50, has_media: false, source_keyword: 'AI'
      },
      {
        platform: 'x', external_post_id: 'days_new_1',
        text: 'AIのテスト投稿(2日前)', url: 'https://x.com/xx/status/days_new_1',
        published_at: new Date(Date.now() - 2 * 86400000).toISOString(),
        like_count: 100, repost_count: 10, reply_count: 1, quote_count: 0,
        follower_count: 1000, trend_score: 50, has_media: false, source_keyword: 'AI'
      }
    ]
  });
  // days=3 で検索すると10日前のは含まれないはず
  const r = await jsonReq(app, 'POST', '/api/research/search', { keywords: ['AI'], days: 3, minLikes: 0, minReposts: 0 });
  assert.equal(r.status, 200);
  const ids = r.body.posts.map(p => p.external_post_id);
  assert.ok(ids.includes('days_new_1'), '2日前の投稿は含まれる');
  assert.ok(!ids.includes('days_old_1'), '10日前の投稿は除外される');
});
