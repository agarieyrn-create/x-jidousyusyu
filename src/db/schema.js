// SQLite Schema Definition for Content Research Radar

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE,
  main_topic TEXT,
  sub_topics TEXT,           -- JSON array
  target_audience TEXT,
  objectives TEXT,           -- JSON array
  writing_style TEXT,
  excluded_topics TEXT,      -- JSON array
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS research_keywords (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'ai'
  created_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS watch_accounts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'x',
  username TEXT NOT NULL,
  display_name TEXT,
  external_user_id TEXT,
  followers INTEGER DEFAULT 0,
  tags TEXT,                  -- JSON array
  memo TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS research_posts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'x',
  external_post_id TEXT NOT NULL,
  author_id TEXT,
  username TEXT,
  display_name TEXT,
  text TEXT,
  url TEXT,
  published_at TEXT,
  like_count INTEGER DEFAULT 0,
  repost_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  quote_count INTEGER DEFAULT 0,
  follower_count INTEGER DEFAULT 0,
  trend_score REAL DEFAULT 0,
  source_keyword TEXT,
  is_saved INTEGER NOT NULL DEFAULT 0,
  has_media INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, platform, external_post_id),
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL UNIQUE,
  summary TEXT,
  topic TEXT,
  target_audience TEXT,
  hook_type TEXT,
  hook TEXT,
  problem TEXT,
  promise TEXT,
  content_structure TEXT,       -- JSON array
  cta_type TEXT,
  cta TEXT,
  emotion TEXT,                 -- JSON array
  novelty TEXT,
  why_it_may_have_worked TEXT,  -- JSON array
  reusable_patterns TEXT,       -- JSON array
  avoid_copying TEXT,           -- JSON array
  adaptation_direction TEXT,    -- JSON array
  model TEXT,
  prompt_version TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(post_id) REFERENCES research_posts(id)
);

CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_post_id TEXT,
  title TEXT,
  objective TEXT,
  target TEXT,
  hook TEXT,
  angle TEXT,
  structure TEXT,                    -- JSON array
  key_points TEXT,                   -- JSON array
  personal_experience_needed TEXT,   -- JSON array
  reference_patterns TEXT,           -- JSON array
  status TEXT DEFAULT 'Inbox',
  tags TEXT,                         -- JSON array
  platform TEXT DEFAULT 'x',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS idx_posts_workspace ON research_posts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_posts_saved ON research_posts(is_saved);
CREATE INDEX IF NOT EXISTS idx_posts_score ON research_posts(trend_score);
CREATE INDEX IF NOT EXISTS idx_ideas_workspace ON ideas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_keywords_workspace ON research_keywords(workspace_id);
`;
