import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildXQuery } from '../src/services/social/x/XQueryBuilder.js';
import { parseXUrl } from '../src/services/social/x/XUrlParser.js';
import { computeTrendScoreBatch, engagementValue } from '../src/services/scoring/TrendScore.js';
import { MockAIProvider } from '../src/services/ai/MockAIProvider.js';
import { ideasToJson } from '../src/services/export/JsonExporter.js';

test('XQueryBuilder builds base filters', () => {
  const q = buildXQuery({ keyword: 'ChatGPT 仕事', language: 'ja', excludeReposts: true, excludeKeywords: ['宣伝'], minLikes: 100 });
  assert.match(q, /"ChatGPT 仕事"/);
  assert.match(q, /lang:ja/);
  assert.match(q, /-is:retweet/);
  assert.match(q, /-宣伝/);
  assert.match(q, /min_faves:100/);
});

test('XUrlParser parses standard X URL', () => {
  const p = parseXUrl('https://x.com/ai_yamada/status/1234567890');
  assert.equal(p.post_id, '1234567890');
  assert.equal(p.username, 'ai_yamada');
});
test('XUrlParser rejects invalid host', () => {
  assert.equal(parseXUrl('https://example.com/status/1'), null);
});

test('TrendScore uses velocity + relEng', () => {
  const posts = [
    { like_count: 1000, repost_count: 100, reply_count: 10, quote_count: 5, follower_count: 100000, published_at: new Date(Date.now() - 3600*1000).toISOString() },
    { like_count: 100, repost_count: 30, reply_count: 5, quote_count: 3, follower_count: 5000, published_at: new Date(Date.now() - 3600*1000).toISOString() }
  ];
  const s = computeTrendScoreBatch(posts);
  assert.equal(s.length, 2);
  // Smaller follower with proportionally higher relEng should still get comparable score
  assert.ok(s[1].trend_score > 0);
});

test('engagementValue formula', () => {
  const v = engagementValue({ like_count: 10, repost_count: 5, reply_count: 4, quote_count: 2 });
  assert.equal(v, 10 + 5 * 2 + 4 * 1.5 + 2 * 2.5);
});

test('MockAIProvider generates valid analysis JSON', async () => {
  const p = new MockAIProvider();
  const r = await p.generateStructuredOutput('ANALYZE_POST\nPOST_TEXT: 実はChatGPTを使うと3倍速くなる\nPOST_META', {});
  assert.ok(r.summary);
  assert.ok(Array.isArray(r.reusable_patterns));
  assert.ok(Array.isArray(r.why_it_may_have_worked));
});

test('MockAIProvider generates idea set', async () => {
  const p = new MockAIProvider();
  const r = await p.generateStructuredOutput('IDEA_GENERATION\nPOST_TEXT: test\nUSER_PROFILE', {});
  assert.equal(r.ideas.length, 3);
  assert.ok(r.ideas[0].personal_experience_needed.length > 0);
});

test('ideasToJson maps to content brief', () => {
  const out = ideasToJson([{ id: 'i1', title: 't', structure: ['a'], platform: 'x', target: 'x users' }]);
  assert.equal(out[0].idea_id, 'i1');
  assert.deepEqual(out[0].structure, ['a']);
});
