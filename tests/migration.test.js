// 旧スキーマ UNIQUE(platform, external_post_id) のDBが、起動時に
// UNIQUE(workspace_id, platform, external_post_id) へ移行されデータが保持されることを検証
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-mig-'));
const file = path.join(dir, 'old.sqlite');
{
  const old = new Database(file);
  old.exec(`CREATE TABLE research_posts (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, platform TEXT NOT NULL DEFAULT 'x',
    external_post_id TEXT NOT NULL, author_id TEXT, username TEXT, display_name TEXT, text TEXT, url TEXT,
    published_at TEXT, like_count INTEGER DEFAULT 0, repost_count INTEGER DEFAULT 0, reply_count INTEGER DEFAULT 0,
    quote_count INTEGER DEFAULT 0, follower_count INTEGER DEFAULT 0, trend_score REAL DEFAULT 0, source_keyword TEXT,
    is_saved INTEGER NOT NULL DEFAULT 0, has_media INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(platform, external_post_id));`);
  old.prepare(`INSERT INTO research_posts (id, workspace_id, external_post_id, like_count, is_saved, created_at, updated_at)
    VALUES ('pst_old', 'wsp_a', 'ext1', 42, 1, '2026-01-01', '2026-01-01')`).run();
  old.close();
}
process.env.DB_PATH = file;
const { db } = await import('../src/db/index.js');

after(() => { try { db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); });

test('MIGRATION: unique key becomes workspace-scoped and data is preserved', () => {
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE name='research_posts'").get().sql;
  assert.match(sql, /UNIQUE\(workspace_id, platform, external_post_id\)/);
  const row = db.prepare("SELECT * FROM research_posts WHERE id='pst_old'").get();
  assert.equal(row.like_count, 42);
  assert.equal(row.is_saved, 1);
  // 別workspaceに同じexternal_post_idを入れられる
  db.prepare(`INSERT INTO research_posts (id, workspace_id, external_post_id, created_at, updated_at)
    VALUES ('pst_b', 'wsp_b', 'ext1', 'x', 'x')`).run();
  assert.equal(db.prepare("SELECT COUNT(*) c FROM research_posts WHERE external_post_id='ext1'").get().c, 2);
});
