import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildXQuery, applyEngagementFilter } from '../src/services/social/x/XQueryBuilder.js';
import { parseXUrl } from '../src/services/social/x/XUrlParser.js';
import { computeTrendScoreBatch, engagementValue, normalize } from '../src/services/scoring/TrendScore.js';
import { MockAIProvider } from '../src/services/ai/MockAIProvider.js';
import { ideasToJson } from '../src/services/export/JsonExporter.js';
import { validateAnalysisOutput, validateIdeasOutput } from '../src/services/ai/validators.js';
import { humanizeXApiError } from '../src/services/social/x/XAdapter.js';

// ---------- XQueryBuilder ----------
test('XQueryBuilder builds base filters (excluding min_faves / min_retweets)', () => {
  const q = buildXQuery({
    keyword: 'ChatGPT 仕事', language: 'ja',
    excludeReposts: true, excludeKeywords: ['宣伝'],
    minLikes: 100, minReposts: 20
  });
  assert.match(q, /"ChatGPT 仕事"/);
  assert.match(q, /lang:ja/);
  assert.match(q, /-is:retweet/);
  assert.match(q, /-宣伝/);
  // 重要: X API v2 では非対応。クエリに含めないこと。
  assert.doesNotMatch(q, /min_faves/);
  assert.doesNotMatch(q, /min_retweets/);
});

test('applyEngagementFilter filters posts app-side', () => {
  const posts = [
    { like_count: 50, repost_count: 5 },
    { like_count: 150, repost_count: 10 },
    { like_count: 200, repost_count: 25 }
  ];
  const r = applyEngagementFilter(posts, { minLikes: 100, minReposts: 10 });
  assert.equal(r.length, 2);
  const r2 = applyEngagementFilter(posts, {}); // no filter
  assert.equal(r2.length, 3);
});

// ---------- XUrlParser ----------
test('XUrlParser parses standard X URL', () => {
  const p = parseXUrl('https://x.com/ai_yamada/status/1234567890');
  assert.equal(p.post_id, '1234567890');
  assert.equal(p.username, 'ai_yamada');
});
test('XUrlParser rejects invalid host', () => {
  assert.equal(parseXUrl('https://example.com/status/1'), null);
});

// ---------- XAdapter error mapping ----------
test('humanizeXApiError maps 429 to friendly message', () => {
  const e = humanizeXApiError(429);
  assert.equal(e.code, 'rate_limited');
  assert.match(e.message, /利用上限に達しました/);
});
test('humanizeXApiError maps 401 without leaking token value', () => {
  const e = humanizeXApiError(401);
  assert.equal(e.code, 'unauthorized');
  // トークン値らしき文字列 (AAAA...形式や github_pat_ / ghp_ 系) が含まれてはいけない。
  // 「Bearer Token」という語自体はユーザー向け説明として許容する。
  assert.doesNotMatch(e.message, /AAAA[A-Za-z0-9]{10,}/);
  assert.doesNotMatch(e.message, /(ghp_|github_pat_|sk-)[A-Za-z0-9_]+/);
});

// ---------- TrendScore ----------
test('TrendScore: follower unknown → velocity 100% (no penalty)', () => {
  // 2件: 1件目は follower_count = null (不明), 2件目は 100000
  const now = Date.now();
  const posts = [
    { like_count: 500, repost_count: 50, reply_count: 5, quote_count: 2, follower_count: null, published_at: new Date(now - 3600*1000).toISOString() },
    { like_count: 500, repost_count: 50, reply_count: 5, quote_count: 2, follower_count: 100000, published_at: new Date(now - 3600*1000).toISOString() }
  ];
  const s = computeTrendScoreBatch(posts);
  // follower不明の投稿はvelocity 100% → normalizeで両者engagement同じなので trend_score は 50 (min==max→50)
  // フォロワー既知側は velocity 60% + relEng 40%だが両者velocity同じ、relEngは1件しか無いのでnormalizeで50
  // つまり両方 50 になる (0にならない=ペナルティ無し) が主眼
  assert.equal(s[0].trend_score, 50);
  assert.ok(s[1].trend_score >= 0);
  assert.ok(s[0].trend_score > 0, 'follower不明でも 0 にならない (ペナルティ無し)');
});

test('TrendScore: normalize uses actual min/max, no forced 0', () => {
  // 全部同じ値なら 50 になる (以前は0が混入していた)
  const r = normalize([10, 10, 10]);
  assert.deepEqual(r, [50, 50, 50]);
  // min > 0 なら 0 に潰れない
  const r2 = normalize([100, 200, 300]);
  assert.equal(r2[0], 0);   // min→0
  assert.equal(r2[2], 100); // max→100
  assert.equal(r2[1], 50);
});

test('TrendScore: mixed follower known/unknown works together', () => {
  const now = Date.now();
  const posts = [
    { like_count: 100, repost_count: 10, reply_count: 5, quote_count: 2, follower_count: 10000, published_at: new Date(now - 3600*1000).toISOString() },
    { like_count: 200, repost_count: 20, reply_count: 5, quote_count: 2, follower_count: null,   published_at: new Date(now - 3600*1000).toISOString() },
    { like_count: 300, repost_count: 30, reply_count: 5, quote_count: 2, follower_count: 50000,  published_at: new Date(now - 3600*1000).toISOString() }
  ];
  const s = computeTrendScoreBatch(posts);
  assert.equal(s.length, 3);
  for (const p of s) assert.ok(p.trend_score >= 0 && p.trend_score <= 100);
});

test('engagementValue formula', () => {
  const v = engagementValue({ like_count: 10, repost_count: 5, reply_count: 4, quote_count: 2 });
  assert.equal(v, 10 + 5 * 2 + 4 * 1.5 + 2 * 2.5);
});

// ---------- AI validators ----------
test('validateAnalysisOutput: rejects missing summary', () => {
  const r = validateAnalysisOutput({
    topic: 't', target_audience: 'x', hook_type: 'x', hook: '', problem: '', promise: '',
    content_structure: [], cta_type: '', cta: '', emotion: [], novelty: '',
    why_it_may_have_worked: [], reusable_patterns: [], avoid_copying: [], adaptation_direction: []
  });
  assert.equal(r.ok, false);
});

test('validateAnalysisOutput: coerces single string to array', () => {
  const r = validateAnalysisOutput({
    summary: 'ok', topic: 't', target_audience: 'x', hook_type: 'x', hook: '', problem: '', promise: '',
    content_structure: 'one-liner',
    cta_type: '', cta: '', emotion: [], novelty: '',
    why_it_may_have_worked: ['a'], reusable_patterns: ['p'], avoid_copying: [], adaptation_direction: []
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.content_structure, ['one-liner']);
});

test('validateIdeasOutput: rejects when ideas is not array', () => {
  const r = validateIdeasOutput({ ideas: 'oops' });
  assert.equal(r.ok, false);
});
test('validateIdeasOutput: rejects when personal_experience_needed missing', () => {
  const r = validateIdeasOutput({
    ideas: [{ title: 't', hook: 'h', angle: 'a', structure: ['s'], key_points: ['k'], reference_patterns: [] }]
  });
  assert.equal(r.ok, false);
});
test('validateIdeasOutput: accepts valid payload', () => {
  const r = validateIdeasOutput({
    ideas: [{
      title: 't', objective: 'o', target: 'x', hook: 'h', angle: 'a',
      structure: ['s'], key_points: ['k'], personal_experience_needed: ['exp'], reference_patterns: ['p']
    }]
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.ideas.length, 1);
});

// ---------- MockAIProvider ----------
test('MockAIProvider generates valid analysis JSON', async () => {
  const p = new MockAIProvider();
  const r = await p.generateStructuredOutput('ANALYZE_POST\nPOST_TEXT: 実はChatGPTを使うと3倍速くなる\nPOST_META', {});
  assert.ok(r.summary);
  assert.ok(Array.isArray(r.reusable_patterns));
  assert.ok(Array.isArray(r.why_it_may_have_worked));
  const v = validateAnalysisOutput(r);
  assert.equal(v.ok, true, 'MockAIProviderの出力は validator を通過するはず');
});

test('MockAIProvider generates idea set', async () => {
  const p = new MockAIProvider();
  const r = await p.generateStructuredOutput('IDEA_GENERATION\nPOST_TEXT: test\nUSER_PROFILE', {});
  assert.equal(r.ideas.length, 3);
  assert.ok(r.ideas[0].personal_experience_needed.length > 0);
  const v = validateIdeasOutput(r);
  assert.equal(v.ok, true, 'MockAIProviderの出力は validator を通過するはず');
});

test('ideasToJson maps to content brief', () => {
  const out = ideasToJson([{ id: 'i1', title: 't', structure: ['a'], platform: 'x', target: 'x users' }]);
  assert.equal(out[0].idea_id, 'i1');
  assert.deepEqual(out[0].structure, ['a']);
});
