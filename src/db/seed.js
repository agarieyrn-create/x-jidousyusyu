// Seed DEMO data + default user/workspace/profile/keywords
import crypto from 'node:crypto';
import { db, uid, nowIso, toJson } from './index.js';
import { MOCK_POSTS } from './mockPosts.js';
import { computeTrendScoreBatch } from '../services/scoring/TrendScore.js';

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function seed() {
  // Default demo user
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get('demo@radar.local');
  let userId, workspaceId;

  if (!existing) {
    userId = uid('usr');
    workspaceId = uid('wsp');
    const now = nowIso();

    db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, 'demo@radar.local', sha256('demo1234'), now);

    db.prepare('INSERT INTO workspaces (id, user_id, name, created_at) VALUES (?, ?, ?, ?)')
      .run(workspaceId, userId, 'Demo Workspace', now);

    db.prepare(`INSERT INTO profiles
      (id, workspace_id, main_topic, sub_topics, target_audience, objectives, writing_style, excluded_topics, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      uid('prf'),
      workspaceId,
      'AI活用・業務効率化',
      toJson(['ChatGPT', 'AI自動化', 'GAS', 'n8n', 'AIアプリ開発', '非エンジニア向けAI活用']),
      'AIに興味はあるが、仕事への取り入れ方が分からない会社員・個人事業主',
      toJson(['認知獲得', 'フォロワー増加', 'note誘導']),
      '初心者にも分かる言葉で説明する。専門用語を減らす。実体験を中心にする。',
      toJson(['過度な誇張表現', '根拠のない稼げる系']),
      now, now
    );

    // Default keywords (AI generated flavor)
    const defaultKeywords = [
      'AI 業務効率化', 'ChatGPT 仕事', 'ChatGPT 自動化',
      'AI 自動化', 'AI 仕事術', '非エンジニア AI',
      'AIアプリ', 'n8n', 'GAS AI', 'AI エージェント'
    ];
    const kwStmt = db.prepare(
      'INSERT INTO research_keywords (id, workspace_id, keyword, is_active, source, created_at) VALUES (?, ?, ?, 1, ?, ?)'
    );
    for (const k of defaultKeywords) kwStmt.run(uid('kw'), workspaceId, k, 'ai', now);

    // Watch accounts (mock)
    const waStmt = db.prepare(
      'INSERT INTO watch_accounts (id, workspace_id, platform, username, display_name, external_user_id, followers, tags, memo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    waStmt.run(uid('wa'), workspaceId, 'x', 'ai_yamada', 'AI活用のヤマダ', 'u_1001', 42000, toJson(['AI発信', '競合']), '毎朝ChatGPTのTipsを発信', now);
    waStmt.run(uid('wa'), workspaceId, 'x', 'gyoumu_ai', '業務改善AIラボ', 'u_1002', 18500, toJson(['初心者向け']), '業務効率化事例が豊富', now);
    waStmt.run(uid('wa'), workspaceId, 'x', 'nocode_taro', 'ノーコードたろう', 'u_1003', 9800, toJson(['文章構成参考']), 'n8n / GAS 事例を紹介', now);
  } else {
    userId = existing.id;
    workspaceId = db.prepare('SELECT id FROM workspaces WHERE user_id = ?').get(userId).id;
  }

  // Insert mock posts only if not already inserted
  const count = db.prepare('SELECT COUNT(*) AS c FROM research_posts WHERE workspace_id = ?').get(workspaceId).c;
  if (count === 0) {
    const scored = computeTrendScoreBatch(MOCK_POSTS);
    const stmt = db.prepare(`INSERT OR IGNORE INTO research_posts
      (id, workspace_id, platform, external_post_id, author_id, username, display_name,
       text, url, published_at, like_count, repost_count, reply_count, quote_count, follower_count,
       trend_score, source_keyword, is_saved, has_media, created_at, updated_at)
      VALUES (@id, @workspace_id, @platform, @external_post_id, @author_id, @username, @display_name,
              @text, @url, @published_at, @like_count, @repost_count, @reply_count, @quote_count, @follower_count,
              @trend_score, @source_keyword, 0, @has_media, @created_at, @updated_at)`);

    const now = nowIso();
    for (const p of scored) {
      stmt.run({
        id: uid('pst'),
        workspace_id: workspaceId,
        platform: 'x',
        external_post_id: p.external_post_id,
        author_id: p.author_id,
        username: p.username,
        display_name: p.display_name,
        text: p.text,
        url: p.url,
        published_at: p.published_at,
        like_count: p.like_count,
        repost_count: p.repost_count,
        reply_count: p.reply_count,
        quote_count: p.quote_count,
        follower_count: p.follower_count,
        trend_score: p.trend_score,
        source_keyword: p.source_keyword,
        has_media: p.has_media ? 1 : 0,
        created_at: now,
        updated_at: now
      });
    }
  }

  refreshDemoPostDates(workspaceId);
  return { userId, workspaceId };
}

// DEMO用モック投稿 (external_post_id が demo_ で始まるもの) の published_at を
// 起動のたびに「現在時刻からの相対時間」へ戻す。
// これをしないと、DBを作ってから数日経つとモックが期間外になり DEMO検索が0件になる。
// ユーザーの保存フラグ・分析・アイデアはそのまま残る。
export function refreshDemoPostDates(workspaceId) {
  const upd = db.prepare(`UPDATE research_posts SET published_at = ?
    WHERE workspace_id = ? AND platform = 'x' AND external_post_id = ?`);
  const byId = new Map(MOCK_POSTS.map(p => [p.external_post_id, p]));
  const rows = db.prepare(`SELECT id, external_post_id, like_count, repost_count, reply_count, quote_count, follower_count, published_at
    FROM research_posts WHERE workspace_id = ? AND external_post_id LIKE 'demo\_%' ESCAPE '\\'`).all(workspaceId);
  if (rows.length === 0) return 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      const m = byId.get(r.external_post_id);
      if (m) upd.run(m.published_at, workspaceId, r.external_post_id);
    }
    // 日時が変わったのでスコアも再計算
    const fresh = db.prepare(`SELECT * FROM research_posts WHERE workspace_id = ? AND external_post_id LIKE 'demo\_%' ESCAPE '\\'`).all(workspaceId);
    const scored = computeTrendScoreBatch(fresh);
    const us = db.prepare('UPDATE research_posts SET trend_score = ? WHERE id = ?');
    for (const p of scored) us.run(p.trend_score, p.id);
  });
  tx();
  return rows.length;
}
