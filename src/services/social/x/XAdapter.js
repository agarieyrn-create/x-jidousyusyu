// XAdapter: SocialResearchAdapter の X 実装
// APIキーが未設定なら search() は空を返し、呼び出し側が DEMO MODE (DB内Mock) を使う。
// 本番では X API v2 recent search を呼ぶ。
// 注意: min_faves / min_retweets はクエリに含めず、取得後にアプリ側でフィルタします。

import { buildXQuery, applyEngagementFilter } from './XQueryBuilder.js';
import { parseXUrl } from './XUrlParser.js';

/**
 * X APIエラーをユーザーに理解しやすい日本語メッセージへ変換する。
 * BearerToken などの機密情報は絶対に含めない。
 * @param {number} status  HTTP status
 * @returns {{code: string, message: string}}
 */
export function humanizeXApiError(status) {
  const s = Number(status);
  if (s === 400) return { code: 'bad_request', message: 'X APIのリクエストが不正です。検索条件を見直してください。' };
  if (s === 401) return { code: 'unauthorized', message: 'X APIの認証に失敗しました。Bearer Tokenの設定を確認してください。' };
  if (s === 403) return { code: 'forbidden', message: 'X APIのアクセス権限がありません。プラン/権限を確認してください。' };
  if (s === 429) return { code: 'rate_limited', message: 'X APIの利用上限に達しました。時間をおいて再度お試しください。' };
  if (s >= 500 && s < 600) return { code: 'server_error', message: 'X API側で一時的な障害が発生している可能性があります。しばらく待って再度お試しください。' };
  return { code: 'unknown', message: `X APIでエラーが発生しました (status ${s || 'unknown'})。しばらく待って再度お試しください。` };
}

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
        const err = humanizeXApiError(res.status);
        // レスポンスbody / Authorization header は絶対にログや戻り値に含めない
        return { posts: [], mode: 'error', error: err.message, error_code: err.code, http_status: res.status };
      }
      const data = await res.json();
      const users = new Map();
      for (const u of (data.includes?.users || [])) users.set(u.id, u);
      let posts = (data.data || []).map(t => this.normalize(t, users.get(t.author_id), params.keyword));
      // アプリ側フィルタ (min_faves / min_retweets の代替)
      posts = applyEngagementFilter(posts, {
        minLikes: params.minLikes,
        minReposts: params.minReposts
      });
      return { posts, mode: 'live' };
    } catch (e) {
      // ネットワーク層エラー: 内部詳細を出しすぎない
      return {
        posts: [],
        mode: 'error',
        error: 'X APIへの接続に失敗しました。ネットワーク状態を確認してください。',
        error_code: 'network_error'
      };
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
      // followers_count が undefined の場合は null を保持し、
      // Trend Score 側で「follower不明」として扱えるようにする。
      follower_count: (user?.public_metrics?.followers_count ?? null),
      source_keyword: sourceKeyword,
      has_media: !!tweet.attachments?.media_keys?.length
    };
  }
}
