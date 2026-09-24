// SQLite Database Adapter
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCHEMA_SQL } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'radar.sqlite');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(SCHEMA_SQL);
migrateResearchPostsUnique();

// 旧スキーマ UNIQUE(platform, external_post_id) → UNIQUE(workspace_id, platform, external_post_id)
// 既存DBでは SQLite の制約変更ができないためテーブル再作成で移行する (データ・idは保持)。
function migrateResearchPostsUnique() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='research_posts'").get();
  if (!row || /UNIQUE\s*\(\s*workspace_id\s*,\s*platform\s*,\s*external_post_id\s*\)/i.test(row.sql)) return;
  const newSql = row.sql
    .replace(/CREATE TABLE\s+(IF NOT EXISTS\s+)?research_posts/i, 'CREATE TABLE research_posts_new')
    .replace(/UNIQUE\s*\(\s*platform\s*,\s*external_post_id\s*\)/i, 'UNIQUE(workspace_id, platform, external_post_id)');
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(newSql);
      db.exec('INSERT INTO research_posts_new SELECT * FROM research_posts');
      db.exec('DROP TABLE research_posts');
      db.exec('ALTER TABLE research_posts_new RENAME TO research_posts');
      db.exec('CREATE INDEX IF NOT EXISTS idx_posts_workspace ON research_posts(workspace_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_posts_saved ON research_posts(is_saved)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_posts_score ON research_posts(trend_score)');
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

// Utility helpers
export function jsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function toJson(value) {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function nowIso() {
  return new Date().toISOString();
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
