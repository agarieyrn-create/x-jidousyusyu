// API routes (Hono). UIコンポーネントから直接DBを触らずここに集約。
//
// セキュリティ原則:
//   - 全ID指定APIは必ず WHERE id = ? AND workspace_id = ? で所有権確認する。
//   - analyses は workspace_id を直接持たないので research_posts JOIN で確認する。
//   - 所有権NG → 404 (存在自体を伏せる) を返す。
import { Hono } from 'hono';
import { db, jsonArray, toJson, nowIso, uid } from '../db/index.js';
import { computeTrendScoreBatch } from '../services/scoring/TrendScore.js';
import { XAdapter } from '../services/social/x/XAdapter.js';
import { applyEngagementFilter } from '../services/social/x/XQueryBuilder.js';
import { ManualAdapter } from '../services/social/manual/ManualAdapter.js';
import { generateKeywords } from '../services/ai/KeywordGenerator.js';
import { analyzePost } from '../services/ai/Analyzer.js';
import { generateIdeas } from '../services/ai/IdeaGenerator.js';
import { ideasToCsv } from '../services/export/CsvExporter.js';
import { ideasToJson, ideaToBrief } from '../services/export/JsonExporter.js';
import { parseXUrl } from '../services/social/x/XUrlParser.js';

// AIProviderError → HTTP応答。キーやレスポンスbodyは含めない。
function aiErrorResponse(c, e, fallbackMessage) {
  if (e && e.name === 'AIProviderError') {
    const status = e.code === 'rate_limited' ? 429 : 502;
    return c.json({ error: e.message, error_code: e.code }, status);
  }
  return c.json({ error: fallbackMessage }, 500);
}

async function safeAnalyze(post) {
  try { return { analysis: await analyzePost(post) }; }
  catch (e) { return { error: e }; }
}

// ---- 入力正規化 helpers ----
class BadRequest extends Error { constructor(m) { super(m); this.name = 'BadRequest'; } }
async function readJson(c) {
  try {
    const b = await c.req.json();
    if (b === null || typeof b !== 'object' || Array.isArray(b)) throw new Error();
    return b;
  } catch {
    throw new BadRequest('リクエストの形式が不正です (JSONオブジェクトを送ってください)');
  }
}
function toStrList(v) {
  if (v === undefined || v === null || v === '') return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[\n,]/);
  return arr.map(x => String(x ?? '').trim()).filter(Boolean);
}
function toInt(v, def, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
function toBool(v, def) {
  if (v === undefined || v === null) return def;
  if (typeof v === 'string') return !['false', '0', ''].includes(v.toLowerCase());
  return !!v;
}
// http/https 以外 (javascript: 等) のURLは保存しない
function safeHttpUrl(v) {
  if (!v) return null;
  try {
    const u = new URL(String(v).trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.toString() : null;
  } catch { return null; }
}

export function createApiRoutes({ getWorkspaceId }) {
  const api = new Hono();

  // 共通エラーハンドラ: 内部エラーの詳細はクライアントに返さない
  api.onError((err, c) => {
    if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
    console.error('[api error]', c.req.method, c.req.path, err?.message);
    return c.json({ error: 'サーバー内部でエラーが発生しました。時間をおいて再度お試しください。' }, 500);
  });

  // ---------- 所有権 helper ----------
  // それぞれ「id と workspace_id が一致した行」だけを返す。
  // 一致しなければ undefined を返す (=呼び出し側で 404)。
  function findKeywordOwned(id, wid)      { return db.prepare('SELECT * FROM research_keywords WHERE id = ? AND workspace_id = ?').get(id, wid); }
  function findPostOwned(id, wid)         { return db.prepare('SELECT * FROM research_posts WHERE id = ? AND workspace_id = ?').get(id, wid); }
  function findWatchOwned(id, wid)        { return db.prepare('SELECT * FROM watch_accounts WHERE id = ? AND workspace_id = ?').get(id, wid); }
  function findIdeaOwned(id, wid)         { return db.prepare('SELECT * FROM ideas WHERE id = ? AND workspace_id = ?').get(id, wid); }
  // analyses は post_id 経由でしか辿らないため、post 所有権と一体で使う。

  // ---------- health / status ----------
  api.get('/status', c => {
    const x = new XAdapter();
    const aiProvider = (process.env.AI_PROVIDER || '').toLowerCase();
    const aiKey = !!process.env.AI_API_KEY;
    return c.json({
      app: 'content-research-radar',
      env: process.env.APP_ENV || 'development',
      demo_mode: !x.isConfigured() || !aiKey,
      integrations: {
        x_api: x.isConfigured() ? 'connected' : 'not_configured',
        ai: aiKey && aiProvider ? `${aiProvider}:connected` : 'mock'
      }
    });
  });

  // ---------- profile ----------
  api.get('/profile', c => {
    const wid = getWorkspaceId(c);
    const row = db.prepare('SELECT * FROM profiles WHERE workspace_id = ?').get(wid);
    if (!row) return c.json({ profile: null });
    return c.json({
      profile: {
        ...row,
        sub_topics: jsonArray(row.sub_topics),
        objectives: jsonArray(row.objectives),
        excluded_topics: jsonArray(row.excluded_topics)
      }
    });
  });

  api.put('/profile', async c => {
    const wid = getWorkspaceId(c);
    const body = await readJson(c);
    const existing = db.prepare('SELECT id FROM profiles WHERE workspace_id = ?').get(wid);
    const now = nowIso();
    if (existing) {
      db.prepare(`UPDATE profiles SET main_topic=?, sub_topics=?, target_audience=?, objectives=?,
        writing_style=?, excluded_topics=?, updated_at=? WHERE workspace_id=?`).run(
        body.main_topic || '',
        toJson(body.sub_topics || []),
        body.target_audience || '',
        toJson(body.objectives || []),
        body.writing_style || '',
        toJson(body.excluded_topics || []),
        now, wid
      );
    } else {
      db.prepare(`INSERT INTO profiles (id, workspace_id, main_topic, sub_topics, target_audience,
        objectives, writing_style, excluded_topics, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        uid('prf'), wid, body.main_topic || '',
        toJson(body.sub_topics || []),
        body.target_audience || '',
        toJson(body.objectives || []),
        body.writing_style || '',
        toJson(body.excluded_topics || []),
        now, now
      );
    }
    return c.json({ ok: true });
  });

  // ---------- keywords ----------
  api.get('/keywords', c => {
    const wid = getWorkspaceId(c);
    const rows = db.prepare('SELECT * FROM research_keywords WHERE workspace_id = ? ORDER BY created_at DESC').all(wid);
    return c.json({ keywords: rows });
  });

  api.post('/keywords', async c => {
    const wid = getWorkspaceId(c);
    const body = await readJson(c);
    if (body.regenerate) {
      const profile = db.prepare('SELECT * FROM profiles WHERE workspace_id = ?').get(wid);
      const gen = await generateKeywords({
        mainTopic: profile?.main_topic,
        subTopics: jsonArray(profile?.sub_topics),
        targetAudience: profile?.target_audience
      });
      return c.json({ suggestions: gen.keywords, source: gen.source });
    }
    const now = nowIso();
    const list = [...new Set(toStrList(body.keywords !== undefined ? body.keywords : body.keyword).map(k => k.slice(0, 100)))];
    if (list.length === 0) throw new BadRequest('キーワードを入力してください');
    const existing = new Set(db.prepare('SELECT keyword FROM research_keywords WHERE workspace_id = ?').all(wid).map(r => r.keyword));
    const inserted = [];
    const skipped = [];
    for (const k of list) {
      if (existing.has(k)) { skipped.push(k); continue; }
      existing.add(k);
      const id = uid('kw');
      try {
        db.prepare('INSERT INTO research_keywords (id, workspace_id, keyword, is_active, source, created_at) VALUES (?, ?, ?, 1, ?, ?)')
          .run(id, wid, k, body.source || 'user', now);
        inserted.push({ id, keyword: k });
      } catch (e) { skipped.push(k); }
    }
    return c.json({ ok: true, inserted, skipped });
  });

  api.put('/keywords/:id', async c => {
    const wid = getWorkspaceId(c);
    const id = c.req.param('id');
    const target = findKeywordOwned(id, wid);
    if (!target) return c.json({ error: 'not_found' }, 404);

    const body = await readJson(c);
    const fields = [];
    const vals = [];
    if (body.keyword !== undefined) {
      const kw = String(body.keyword ?? '').trim().slice(0, 100);
      if (!kw) throw new BadRequest('キーワードを入力してください');
      fields.push('keyword = ?'); vals.push(kw);
    }
    if (body.is_active !== undefined) { fields.push('is_active = ?'); vals.push(body.is_active ? 1 : 0); }
    if (fields.length === 0) return c.json({ ok: true });
    vals.push(id, wid);
    db.prepare(`UPDATE research_keywords SET ${fields.join(', ')} WHERE id = ? AND workspace_id = ?`).run(...vals);
    return c.json({ ok: true });
  });

  api.delete('/keywords/:id', c => {
    const wid = getWorkspaceId(c);
    const id = c.req.param('id');
    const info = db.prepare('DELETE FROM research_keywords WHERE id = ? AND workspace_id = ?').run(id, wid);
    if (info.changes === 0) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true });
  });

  // ---------- research search ----------
  api.post('/research/search', async c => {
    const wid = getWorkspaceId(c);
    const body = await readJson(c);
    const keywords = toStrList(body.keywords).slice(0, 5);
    const days = toInt(body.days, 7, 1, 30);           // X Recent Searchは直近7日だがDEMOは30日まで許容
    const minLikes = toInt(body.minLikes, 0, 0, 1e9);
    const minReposts = toInt(body.minReposts, 0, 0, 1e9);
    const language = ['ja', 'en'].includes(body.language) ? body.language : 'ja';
    const excludeReposts = toBool(body.excludeReposts, true);
    const excludeReplies = toBool(body.excludeReplies, false);
    const excludeKeywords = toStrList(body.excludeKeywords);
    const fromUsername = typeof body.fromUsername === 'string' && body.fromUsername.trim()
      ? body.fromUsername.trim().replace(/^@/, '') : undefined;

    const status = [];
    const x = new XAdapter();
    let live = 0, demoUsed = 0, duplicates = 0;
    const results = [];

    const keywordList = keywords.length > 0
      ? keywords
      : db.prepare('SELECT keyword FROM research_keywords WHERE workspace_id = ? AND is_active = 1 LIMIT 5').all(wid).map(r => r.keyword);

    if (x.isConfigured() && keywordList.length > 0) {
      status.push(`Xから投稿を取得しています (${keywordList.length}キーワード)`);
      let sawFatalError = null;
      for (const kw of keywordList.slice(0, 5)) {
        const r = await x.search({
          keyword: kw, language,
          minLikes, minReposts,   // XAdapterが取得後にpost-filterを行う
          excludeKeywords, fromUsername,
          excludeReposts, excludeReplies, perKeyword: 20
        });
        if (r.mode === 'error') {
          // ユーザー向けメッセージのみ格納。Bearer Token等の機密情報は含まない。
          status.push(`X APIエラー: ${r.error}`);
          if (r.error_code === 'rate_limited' || r.error_code === 'unauthorized' || r.error_code === 'forbidden') {
            sawFatalError = r;
            break; // 続けても同じエラーになるので早期打ち切り
          }
          continue;
        }
        for (const p of r.posts) {
          results.push({ ...p, source_keyword: kw });
          live++;
        }
      }
      if (sawFatalError && results.length === 0) {
        // 実データが1件も無くエラーで終わったケース: 明示的にエラー応答を返す
        return c.json({
          mode: 'error',
          status,
          error: sawFatalError.error,
          error_code: sawFatalError.error_code,
          posts: [],
          stats: { live: 0, demo: 0, duplicates: 0 }
        }, sawFatalError.error_code === 'rate_limited' ? 429 : 502);
      }
    } else {
      status.push('DEMO MODE: 保存済みモックデータからフィルタします');
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const rows = db.prepare(`SELECT * FROM research_posts WHERE workspace_id = ? AND published_at >= ?
        AND like_count >= ? AND repost_count >= ?`).all(wid, since, minLikes, minReposts);
      let filtered = rows;
      if (keywordList.length > 0) {
        filtered = filtered.filter(r =>
          keywordList.some(k => (r.text || '').toLowerCase().includes(k.toLowerCase()) || r.source_keyword === k)
        );
      }
      if (fromUsername) {
        filtered = filtered.filter(r => (r.username || '') === fromUsername.replace(/^@/, ''));
      }
      if (excludeKeywords.length) {
        filtered = filtered.filter(r => !excludeKeywords.some(k => (r.text || '').includes(k)));
      }
      demoUsed = filtered.length;
      const scored = computeTrendScoreBatch(filtered);
      const upd = db.prepare('UPDATE research_posts SET trend_score = ? WHERE id = ? AND workspace_id = ?');
      for (const p of scored) upd.run(p.trend_score, p.id, wid);
      status.push(`${demoUsed}件取得しました`);
      status.push('Trend Scoreを計算しました');
      return c.json({
        mode: 'demo',
        status,
        posts: scored.map(mapDbRowToPost),
        stats: { live: 0, demo: demoUsed, duplicates: 0 }
      });
    }

    // Live: 重複排除 + score
    status.push(`${results.length}件取得しました`);
    // 期間フィルタ (X APIの取得結果もdays指定に合わせて古い投稿を除外する)
    if (Number(days) > 0) {
      const cutoffMs = Date.now() - Number(days) * 86400000;
      const before = results.length;
      for (let i = results.length - 1; i >= 0; i--) {
        const t = results[i].published_at ? new Date(results[i].published_at).getTime() : NaN;
        if (!Number.isFinite(t) || t < cutoffMs) results.splice(i, 1);
      }
      if (before !== results.length) {
        status.push(`期間外(${days}日より古い) ${before - results.length}件を除外しました`);
      }
    }
    const dedup = [];
    const seen = new Set();
    for (const p of results) {
      const key = `x:${p.external_post_id}`;
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      dedup.push(p);
    }
    status.push(`重複${duplicates}件を除外しました`);
    const scored = computeTrendScoreBatch(dedup);
    upsertPostsBatch({ workspaceId: wid, posts: scored });
    status.push('Trend Scoreを計算しました');
    const savedRows = db.prepare(`SELECT * FROM research_posts WHERE workspace_id = ? AND external_post_id IN (${dedup.map(() => '?').join(',') || "''"})`)
      .all(wid, ...dedup.map(p => p.external_post_id));
    return c.json({
      mode: 'live',
      status,
      posts: savedRows.map(mapDbRowToPost),
      stats: { live, demo: 0, duplicates }
    });
  });

  // ---------- posts ----------
  api.get('/posts', c => {
    const wid = getWorkspaceId(c);
    const savedOnly = c.req.query('saved') === '1';
    const sort = c.req.query('sort') || 'trend_score';
    const dir = c.req.query('dir') === 'asc' ? 'ASC' : 'DESC';
    const allowedSort = ['trend_score','like_count','repost_count','reply_count','published_at','created_at'];
    const s = allowedSort.includes(sort) ? sort : 'trend_score';
    const where = savedOnly ? 'AND is_saved = 1' : '';
    const rows = db.prepare(`SELECT p.*, (SELECT 1 FROM analyses a WHERE a.post_id = p.id) AS has_analysis
      FROM research_posts p WHERE workspace_id = ? ${where} ORDER BY ${s} ${dir} LIMIT 200`).all(wid);
    return c.json({ posts: rows.map(mapDbRowToPost) });
  });

  api.get('/posts/:id', c => {
    const wid = getWorkspaceId(c);
    const id = c.req.param('id');
    const post = findPostOwned(id, wid);
    if (!post) return c.json({ error: 'not_found' }, 404);
    const analysis = db.prepare('SELECT * FROM analyses WHERE post_id = ?').get(id);
    return c.json({
      post: mapDbRowToPost(post),
      analysis: analysis ? mapAnalysisRow(analysis) : null
    });
  });

  api.post('/posts/:id/save', async c => {
    const wid = getWorkspaceId(c);
    const id = c.req.param('id');
    const post = findPostOwned(id, wid);
    if (!post) return c.json({ error: 'not_found' }, 404);
    const body = await c.req.json().catch(() => ({}));
    const val = body.saved === false ? 0 : 1;
    db.prepare('UPDATE research_posts SET is_saved = ?, updated_at = ? WHERE id = ? AND workspace_id = ?')
      .run(val, nowIso(), id, wid);
    return c.json({ ok: true, is_saved: !!val });
  });

  // ---------- analyze ----------
  api.post('/posts/:id/analyze', async c => {
    const wid = getWorkspaceId(c);
    const id = c.req.param('id');
    const post = findPostOwned(id, wid);
    if (!post) return c.json({ error: 'not_found' }, 404);
    const existing = db.prepare('SELECT * FROM analyses WHERE post_id = ?').get(id);
    if (existing) return c.json({ analysis: mapAnalysisRow(existing), cached: true });

    const { analysis, error: aiErr } = await safeAnalyze(mapDbRowToPost(post));
    if (aiErr) return aiErrorResponse(c, aiErr, 'AI分析に失敗しました。時間をおいて再度お試しください。');
    if (!analysis) return c.json({ error: 'AI分析に失敗しました。時間をおいて再度お試しください。' }, 500);
    const aid = uid('ana');
    const now = nowIso();
    db.prepare(`INSERT INTO analyses
      (id, post_id, summary, topic, target_audience, hook_type, hook, problem, promise,
       content_structure, cta_type, cta, emotion, novelty,
       why_it_may_have_worked, reusable_patterns, avoid_copying, adaptation_direction,
       model, prompt_version, created_at)
      VALUES (@id, @post_id, @summary, @topic, @target_audience, @hook_type, @hook, @problem, @promise,
              @content_structure, @cta_type, @cta, @emotion, @novelty,
              @why, @reusable, @avoid, @adapt, @model, @prompt_version, @created_at)`).run({
      id: aid, post_id: id,
      summary: analysis.summary || '',
      topic: analysis.topic || '',
      target_audience: analysis.target_audience || '',
      hook_type: analysis.hook_type || '',
      hook: analysis.hook || '',
      problem: analysis.problem || '',
      promise: analysis.promise || '',
      content_structure: toJson(analysis.content_structure || []),
      cta_type: analysis.cta_type || '',
      cta: analysis.cta || '',
      emotion: toJson(analysis.emotion || []),
      novelty: analysis.novelty || '',
      why: toJson(analysis.why_it_may_have_worked || []),
      reusable: toJson(analysis.reusable_patterns || []),
      avoid: toJson(analysis.avoid_copying || []),
      adapt: toJson(analysis.adaptation_direction || []),
      model: analysis.model || '',
      prompt_version: analysis.prompt_version || 'v1',
      created_at: now
    });
    const saved = db.prepare('SELECT * FROM analyses WHERE id = ?').get(aid);
    return c.json({ analysis: mapAnalysisRow(saved), cached: false });
  });

  api.post('/posts/analyze-top', async c => {
    const wid = getWorkspaceId(c);
    const body = await c.req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(20, Number(body.limit) || 10));
    const rows = db.prepare(`SELECT p.* FROM research_posts p
      LEFT JOIN analyses a ON a.post_id = p.id
      WHERE p.workspace_id = ? AND a.id IS NULL
      ORDER BY p.trend_score DESC LIMIT ?`).all(wid, limit);
    const done = [];
    const failed = [];
    for (const post of rows) {
      const { analysis, error: aiErr } = await safeAnalyze(mapDbRowToPost(post));
      if (aiErr?.fatal) {
        // 上限/認証エラーは残りも失敗するので打ち切る
        return c.json({ ok: false, analyzed: done.length, post_ids: done, failed: [...failed, post.id], error: aiErr.message, error_code: aiErr.code }, aiErr.code === 'rate_limited' ? 429 : 502);
      }
      if (!analysis) { failed.push(post.id); continue; }
      const aid = uid('ana');
      db.prepare(`INSERT OR IGNORE INTO analyses
        (id, post_id, summary, topic, target_audience, hook_type, hook, problem, promise,
         content_structure, cta_type, cta, emotion, novelty,
         why_it_may_have_worked, reusable_patterns, avoid_copying, adaptation_direction,
         model, prompt_version, created_at)
        VALUES (@id, @post_id, @summary, @topic, @target_audience, @hook_type, @hook, @problem, @promise,
                @content_structure, @cta_type, @cta, @emotion, @novelty,
                @why, @reusable, @avoid, @adapt, @model, @prompt_version, @created_at)`).run({
        id: aid, post_id: post.id,
        summary: analysis.summary || '', topic: analysis.topic || '',
        target_audience: analysis.target_audience || '', hook_type: analysis.hook_type || '',
        hook: analysis.hook || '', problem: analysis.problem || '', promise: analysis.promise || '',
        content_structure: toJson(analysis.content_structure || []),
        cta_type: analysis.cta_type || '', cta: analysis.cta || '',
        emotion: toJson(analysis.emotion || []), novelty: analysis.novelty || '',
        why: toJson(analysis.why_it_may_have_worked || []),
        reusable: toJson(analysis.reusable_patterns || []),
        avoid: toJson(analysis.avoid_copying || []),
        adapt: toJson(analysis.adaptation_direction || []),
        model: analysis.model || '', prompt_version: analysis.prompt_version || 'v1',
        created_at: nowIso()
      });
      done.push(post.id);
    }
    return c.json({ ok: true, analyzed: done.length, post_ids: done, failed });
  });

  // ---------- watch accounts ----------
  api.get('/watch-accounts', c => {
    const wid = getWorkspaceId(c);
    const rows = db.prepare('SELECT * FROM watch_accounts WHERE workspace_id = ? ORDER BY created_at DESC').all(wid);
    return c.json({ accounts: rows.map(r => ({ ...r, tags: jsonArray(r.tags) })) });
  });

  api.post('/watch-accounts', async c => {
    const wid = getWorkspaceId(c);
    const body = await readJson(c);
    const username = String(body.username ?? '').trim().replace(/^@/, '');
    if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) throw new BadRequest('usernameは英数字と_の1〜15文字で入力してください');
    const dup = db.prepare('SELECT id FROM watch_accounts WHERE workspace_id = ? AND platform = ? AND lower(username) = lower(?)').get(wid, body.platform || 'x', username);
    if (dup) return c.json({ error: 'このアカウントは既に登録されています' }, 409);
    const id = uid('wa');
    db.prepare(`INSERT INTO watch_accounts
      (id, workspace_id, platform, username, display_name, external_user_id, followers, tags, memo, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, wid, body.platform || 'x',
      username,
      body.display_name || null, body.external_user_id || null,
      Number(body.followers) || 0,
      toJson(body.tags || []), body.memo || null, nowIso()
    );
    return c.json({ ok: true, id });
  });

  api.delete('/watch-accounts/:id', c => {
    const wid = getWorkspaceId(c);
    const id = c.req.param('id');
    const info = db.prepare('DELETE FROM watch_accounts WHERE id = ? AND workspace_id = ?').run(id, wid);
    if (info.changes === 0) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true });
  });

  // ---------- watch account analysis ----------
  api.get('/watch-accounts/:id/analysis', c => {
    const wid = getWorkspaceId(c);
    const acc = findWatchOwned(c.req.param('id'), wid);
    if (!acc) return c.json({ error: 'not_found' }, 404);
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const posts = db.prepare(`SELECT p.*, (SELECT hook_type FROM analyses WHERE post_id = p.id) as hook_type,
      (SELECT topic FROM analyses WHERE post_id = p.id) as topic,
      (SELECT cta_type FROM analyses WHERE post_id = p.id) as cta_type
      FROM research_posts p WHERE workspace_id = ? AND username = ? AND published_at >= ?`)
      .all(wid, acc.username, since);
    if (posts.length === 0) return c.json({ account: { ...acc, tags: jsonArray(acc.tags) }, stats: null, posts: [] });
    const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const stats = {
      count: posts.length,
      avg_likes: avg(posts.map(p => p.like_count)),
      avg_reposts: avg(posts.map(p => p.repost_count)),
      avg_replies: avg(posts.map(p => p.reply_count)),
      avg_trend_score: Math.round(avg(posts.map(p => p.trend_score || 0)) * 100) / 100,
      hooks: countBy(posts.map(p => p.hook_type).filter(Boolean)),
      topics: countBy(posts.map(p => p.topic).filter(Boolean)),
      ctas: countBy(posts.map(p => p.cta_type).filter(Boolean))
    };
    const top = [...posts].sort((a, b) => (b.trend_score || 0) - (a.trend_score || 0)).slice(0, 5);
    return c.json({ account: { ...acc, tags: jsonArray(acc.tags) }, stats, posts: top.map(mapDbRowToPost) });
  });

  // ---------- manual import ----------
  api.post('/manual-import', async c => {
    const wid = getWorkspaceId(c);
    const body = await readJson(c);
    const adapter = new ManualAdapter();
    let normalized;
    if (body.type === 'url') {
      if (!safeHttpUrl(body.url)) throw new BadRequest('http(s)で始まる投稿URLを入力してください');
      normalized = await adapter.importFromUrl({ url: body.url, memo: body.memo, tags: body.tags });
    } else {
      if (!String(body.text ?? '').trim()) throw new BadRequest('本文を入力してください');
      normalized = adapter.importFromText({
        text: body.text, url: body.url, username: body.username,
        platform: body.platform, memo: body.memo, tags: body.tags
      });
    }
    const scored = computeTrendScoreBatch([normalized])[0];
    const id = uid('pst');
    const now = nowIso();
    try {
      db.prepare(`INSERT INTO research_posts
        (id, workspace_id, platform, external_post_id, author_id, username, display_name,
         text, url, published_at, like_count, repost_count, reply_count, quote_count, follower_count,
         trend_score, source_keyword, is_saved, has_media, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`).run(
        id, wid, scored.platform || 'manual', scored.external_post_id, scored.author_id || null,
        scored.username || null, scored.display_name || null, scored.text || '',
        safeHttpUrl(scored.url), scored.published_at,
        scored.like_count || 0, scored.repost_count || 0, scored.reply_count || 0, scored.quote_count || 0,
        scored.follower_count || 0, scored.trend_score || 0, null,
        scored.has_media ? 1 : 0, now, now
      );
    } catch (e) {
      if (String(e?.code || '').startsWith('SQLITE_CONSTRAINT')) return c.json({ error: 'この投稿は既に登録されています' }, 409);
      throw e;
    }
    return c.json({ ok: true, id });
  });

  // ---------- ideas ----------
  api.post('/ideas/generate', async c => {
    const wid = getWorkspaceId(c);
    const body = await readJson(c);
    const postId = typeof body.post_id === 'string' ? body.post_id : '';
    if (!postId) throw new BadRequest('post_id を指定してください');
    const post = findPostOwned(postId, wid);
    if (!post) return c.json({ error: 'not_found' }, 404);
    let analysisRow = db.prepare('SELECT * FROM analyses WHERE post_id = ?').get(postId);
    let analysis = analysisRow ? mapAnalysisRow(analysisRow) : null;
    if (!analysis) {
      const r = await safeAnalyze(mapDbRowToPost(post));
      if (r.error) return aiErrorResponse(c, r.error, 'AI分析に失敗しました。');
      analysis = r.analysis;
      if (!analysis) return c.json({ error: 'AI分析に失敗したためアイデア生成もできません。時間をおいて再度お試しください。' }, 500);
    }
    const profileRow = db.prepare('SELECT * FROM profiles WHERE workspace_id = ?').get(wid);
    const profile = profileRow ? {
      ...profileRow,
      sub_topics: jsonArray(profileRow.sub_topics),
      objectives: jsonArray(profileRow.objectives),
      excluded_topics: jsonArray(profileRow.excluded_topics)
    } : {};
    let out;
    try {
      out = await generateIdeas({ post: mapDbRowToPost(post), analysis, profile });
    } catch (e) {
      return aiErrorResponse(c, e, 'アイデア生成に失敗しました');
    }
    if (!out.ideas || out.ideas.length === 0) {
      // validate 2連続失敗 → DBには入れない
      return c.json({ error: out.error || 'アイデア生成に失敗しました' }, 500);
    }
    const insert = db.prepare(`INSERT INTO ideas
      (id, workspace_id, source_post_id, title, objective, target, hook, angle, structure,
       key_points, personal_experience_needed, reference_patterns, status, tags, platform,
       created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Inbox', ?, 'x', ?, ?)`);
    const now = nowIso();
    const ids = [];
    for (const idea of out.ideas) {
      const iid = uid('idea');
      insert.run(iid, wid, postId,
        idea.title || '', idea.objective || '', idea.target || '',
        idea.hook || '', idea.angle || '',
        toJson(idea.structure || []),
        toJson(idea.key_points || []),
        toJson(idea.personal_experience_needed || []),
        toJson(idea.reference_patterns || []),
        toJson(idea.tags || []),
        now, now);
      ids.push(iid);
    }
    const rows = db.prepare(`SELECT * FROM ideas WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    return c.json({ ideas: rows.map(mapIdeaRow) });
  });

  api.get('/ideas', c => {
    const wid = getWorkspaceId(c);
    const status = c.req.query('status');
    const where = status ? 'AND status = ?' : '';
    const vals = status ? [wid, status] : [wid];
    const rows = db.prepare(`SELECT * FROM ideas WHERE workspace_id = ? ${where} ORDER BY created_at DESC`).all(...vals);
    return c.json({ ideas: rows.map(mapIdeaRow) });
  });

  api.put('/ideas/:id', async c => {
    const wid = getWorkspaceId(c);
    const id = c.req.param('id');
    const cur = findIdeaOwned(id, wid);
    if (!cur) return c.json({ error: 'not_found' }, 404);

    const body = await readJson(c);
    const next = { ...cur };
    const STATUSES = ['Inbox','採用候補','採用','作成中','投稿済み','保留'];
    if (body.status !== undefined && !STATUSES.includes(body.status)) throw new BadRequest('不正なステータスです');
    for (const k of ['title','objective','target','hook','angle','status','platform']) {
      if (body[k] !== undefined) next[k] = body[k];
    }
    for (const k of ['structure','key_points','personal_experience_needed','reference_patterns','tags']) {
      if (body[k] !== undefined) next[k] = toJson(body[k]);
    }
    next.updated_at = nowIso();
    db.prepare(`UPDATE ideas SET title=@title, objective=@objective, target=@target, hook=@hook, angle=@angle,
      structure=@structure, key_points=@key_points, personal_experience_needed=@personal_experience_needed,
      reference_patterns=@reference_patterns, status=@status, tags=@tags, platform=@platform, updated_at=@updated_at
      WHERE id=@id AND workspace_id=@workspace_id`).run(next);
    const updated = db.prepare('SELECT * FROM ideas WHERE id = ? AND workspace_id = ?').get(id, wid);
    return c.json({ ok: true, idea: mapIdeaRow(updated) });
  });

  api.get('/ideas/:id/brief', c => {
    const wid = getWorkspaceId(c);
    const idea = findIdeaOwned(c.req.param('id'), wid);
    if (!idea) return c.json({ error: 'not_found' }, 404);
    return c.json(ideaToBrief(mapIdeaRow(idea)));
  });

  // ---------- exports ----------
  api.get('/export/ideas.csv', c => {
    const wid = getWorkspaceId(c);
    const rows = db.prepare('SELECT * FROM ideas WHERE workspace_id = ?').all(wid).map(mapIdeaRow);
    return new Response(ideasToCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ideas.csv"'
      }
    });
  });

  api.get('/export/ideas.json', c => {
    const wid = getWorkspaceId(c);
    const rows = db.prepare('SELECT * FROM ideas WHERE workspace_id = ?').all(wid).map(mapIdeaRow);
    return new Response(JSON.stringify(ideasToJson(rows), null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ideas.json"'
      }
    });
  });

  // ---------- dashboard ----------
  api.get('/dashboard', c => {
    const wid = getWorkspaceId(c);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();
    const todayCount = db.prepare('SELECT COUNT(*) AS c FROM research_posts WHERE workspace_id = ? AND created_at >= ?').get(wid, todayIso).c;
    const top = db.prepare('SELECT * FROM research_posts WHERE workspace_id = ? ORDER BY trend_score DESC LIMIT 5').all(wid);
    const recentSaved = db.prepare('SELECT * FROM research_posts WHERE workspace_id = ? AND is_saved = 1 ORDER BY updated_at DESC LIMIT 5').all(wid);
    const ideaCounts = { Inbox: 0, '採用候補': 0, '採用': 0 };
    for (const s of Object.keys(ideaCounts)) {
      ideaCounts[s] = db.prepare('SELECT COUNT(*) AS c FROM ideas WHERE workspace_id = ? AND status = ?').get(wid, s).c;
    }
    // Hook / topic trends (workspace_id 一致する post の analysis のみ)
    const analyses = db.prepare(`SELECT a.hook_type, a.topic FROM analyses a
      JOIN research_posts p ON p.id = a.post_id WHERE p.workspace_id = ? AND p.is_saved = 1`).all(wid);
    const hooks = countBy(analyses.map(a => a.hook_type).filter(Boolean));
    const topics = countBy(analyses.map(a => a.topic).filter(Boolean));
    return c.json({
      today_count: todayCount,
      top_posts: top.map(mapDbRowToPost),
      recent_saved: recentSaved.map(mapDbRowToPost),
      idea_counts: ideaCounts,
      hooks, topics
    });
  });

  return api;
}

// --------- helpers ---------
function mapDbRowToPost(r) {
  return {
    id: r.id, workspace_id: r.workspace_id, platform: r.platform,
    external_post_id: r.external_post_id, author_id: r.author_id,
    username: r.username, display_name: r.display_name,
    text: r.text, url: r.url, published_at: r.published_at,
    like_count: r.like_count, repost_count: r.repost_count,
    reply_count: r.reply_count, quote_count: r.quote_count,
    follower_count: r.follower_count, trend_score: r.trend_score,
    source_keyword: r.source_keyword,
    is_saved: !!r.is_saved, has_media: !!r.has_media,
    has_analysis: r.has_analysis === 1 || r.has_analysis === true,
    created_at: r.created_at, updated_at: r.updated_at
  };
}

function mapAnalysisRow(r) {
  return {
    id: r.id, post_id: r.post_id,
    summary: r.summary, topic: r.topic, target_audience: r.target_audience,
    hook_type: r.hook_type, hook: r.hook, problem: r.problem, promise: r.promise,
    content_structure: jsonArray(r.content_structure),
    cta_type: r.cta_type, cta: r.cta,
    emotion: jsonArray(r.emotion), novelty: r.novelty,
    why_it_may_have_worked: jsonArray(r.why_it_may_have_worked),
    reusable_patterns: jsonArray(r.reusable_patterns),
    avoid_copying: jsonArray(r.avoid_copying),
    adaptation_direction: jsonArray(r.adaptation_direction),
    model: r.model, prompt_version: r.prompt_version, created_at: r.created_at
  };
}

function mapIdeaRow(r) {
  return {
    id: r.id, workspace_id: r.workspace_id, source_post_id: r.source_post_id,
    title: r.title, objective: r.objective, target: r.target, hook: r.hook, angle: r.angle,
    structure: jsonArray(r.structure), key_points: jsonArray(r.key_points),
    personal_experience_needed: jsonArray(r.personal_experience_needed),
    reference_patterns: jsonArray(r.reference_patterns),
    status: r.status, tags: jsonArray(r.tags), platform: r.platform,
    created_at: r.created_at, updated_at: r.updated_at
  };
}

function countBy(arr) {
  const m = {};
  for (const v of arr) m[v] = (m[v] || 0) + 1;
  return Object.entries(m).map(([k, v]) => ({ key: k, count: v })).sort((a, b) => b.count - a.count);
}

/**
 * research_posts への UPSERT (SQLite ON CONFLICT)。
 * キー: UNIQUE(workspace_id, platform, external_post_id)
 * 既存行は text / username / display_name / like_count / repost_count / reply_count /
 *   quote_count / follower_count / trend_score / has_media / source_keyword / updated_at を更新。
 * id / workspace_id / is_saved / created_at は保持。
 * 別workspaceの同一投稿は別行として独立に保持される。
 */
export function upsertPostsBatch({ workspaceId, posts }) {
  const now = nowIso();
  const stmt = db.prepare(`INSERT INTO research_posts
    (id, workspace_id, platform, external_post_id, author_id, username, display_name,
     text, url, published_at, like_count, repost_count, reply_count, quote_count, follower_count,
     trend_score, source_keyword, is_saved, has_media, created_at, updated_at)
    VALUES (@id, @workspace_id, @platform, @external_post_id, @author_id, @username, @display_name,
            @text, @url, @published_at, @like_count, @repost_count, @reply_count, @quote_count, @follower_count,
            @trend_score, @source_keyword, 0, @has_media, @now, @now)
    ON CONFLICT(workspace_id, platform, external_post_id) DO UPDATE SET
      text = excluded.text,
      username = excluded.username,
      display_name = excluded.display_name,
      like_count = excluded.like_count,
      repost_count = excluded.repost_count,
      reply_count = excluded.reply_count,
      quote_count = excluded.quote_count,
      follower_count = excluded.follower_count,
      trend_score = excluded.trend_score,
      has_media = excluded.has_media,
      source_keyword = excluded.source_keyword,
      updated_at = excluded.updated_at
    RETURNING id`);

  const results = [];
  db.transaction(list => {
    for (const p of list) {
      const newId = uid('pst');
      const r = stmt.get({
        id: newId,
        workspace_id: workspaceId,
        platform: p.platform || 'x',
        external_post_id: p.external_post_id,
        author_id: p.author_id || null,
        username: p.username ?? null,
        display_name: p.display_name ?? null,
        text: p.text ?? '',
        url: p.url || null,
        published_at: p.published_at || null,
        like_count: p.like_count || 0,
        repost_count: p.repost_count || 0,
        reply_count: p.reply_count || 0,
        quote_count: p.quote_count || 0,
        follower_count: p.follower_count ?? 0,
        trend_score: p.trend_score || 0,
        source_keyword: p.source_keyword ?? null,
        has_media: p.has_media ? 1 : 0,
        now
      });
      results.push({ id: r.id, mode: r.id === newId ? 'inserted' : 'updated' });
    }
  })(posts);
  return results;
}
