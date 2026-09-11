// XAdapter: SocialResearchAdapter の X 実装
// APIキーが未設定なら search() は空を返し、呼び出し側が DEMO MODE (DB内Mock) を使う。
// 本番では X API v2 recent search を呼ぶ想定。ここでは骨組みのみ用意する。

import { buildXQuery } from './XQueryBuilder.js';
import { parseXUrl } from './XUrlParser.js';

export class XAdapter {
  constructor({ bearerToken } = {}) {
    this.bearerToken = bearerToken || process.env.X_BEARER_TOKEN || null;
  }

  isConfigured() {
    return !!this.bearerToken;
  }

  async search(params) {
    if (!this.isConfigured()) return { posts: [], mode: 'unconfigured' };
    const q = buildXQuery(params);
    const url = new URL('https://api.x.com/2/tweets/search/recent');
    url.searchParams.set('query', q);
    url.searchParams.set('max_results', String(Math.min(100, params.perKeyword || 20)));
    url.searchParams.set('tweet.fields', 'created_at,public_metrics,author_id,lang,entities,attachments');
    url.searchParams.set('expansions', 'author_id');
    url.searchParams.set('user.fields', 'username,name,public_metrics');
    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${this.bearerToken}` }
      });
      if (!res.ok) {
        const body = await res.text();
        return { posts: [], mode: 'error', error: `X API ${res.status}: ${body.slice(0, 200)}` };
      }
      const data = await res.json();
      const users = new Map();
      for (const u of (data.includes?.users || [])) users.set(u.id, u);
      const posts = (data.data || []).map(t => this.normalize(t, users.get(t.author_id), params.keyword));
      return { posts, mode: 'live' };
    } catch (e) {
      return { posts: [], mode: 'error', error: String(e?.message || e) };
    }
  }

  async getPost(url) {
    if (!this.isConfigured()) return null;
    const parsed = parseXUrl(url);
    if (!parsed) return null;
    const apiUrl = new URL(`https://api.x.com/2/tweets/${parsed.post_id}`);
    apiUrl.searchParams.set('tweet.fields', 'created_at,public_metrics,author_id,lang,entities,attachments');
    apiUrl.searchParams.set('expansions', 'author_id');
    apiUrl.searchParams.set('user.fields', 'username,name,public_metrics');
    try {
      const res = await fetch(apiUrl.toString(), {
        headers: { Authorization: `Bearer ${this.bearerToken}` }
      });
      if (!res.ok) return null;
      const data = await res.json();
      const author = (data.includes?.users || [])[0];
      return data.data ? this.normalize(data.data, author) : null;
    } catch {
      return null;
    }
  }

  normalize(tweet, user, sourceKeyword = null) {
    const pm = tweet.public_metrics || {};
    return {
      external_post_id: tweet.id,
      author_id: tweet.author_id || (user?.id ?? null),
      username: user?.username ?? null,
      display_name: user?.name ?? null,
      text: tweet.text,
      url: user?.username
        ? `https://x.com/${user.username}/status/${tweet.id}`
        : `https://x.com/i/status/${tweet.id}`,
      published_at: tweet.created_at,
      like_count: pm.like_count || 0,
      repost_count: pm.retweet_count || 0,
      reply_count: pm.reply_count || 0,
      quote_count: pm.quote_count || 0,
      follower_count: user?.public_metrics?.followers_count || 0,
      source_keyword: sourceKeyword,
      has_media: !!tweet.attachments?.media_keys?.length
    };
  }
}
