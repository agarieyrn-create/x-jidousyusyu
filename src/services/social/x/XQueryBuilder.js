// XQueryBuilder: 検索条件から X API 検索クエリ文字列を組み立てる
// See: https://developer.x.com/en/docs/x-api/tweets/search/integrate/build-a-query
//
// 注意: X API v2 Recent Search (Essential/Basic tier) では
//   min_faves: / min_retweets: 演算子は非対応です (エラーになるか無視される)。
//   このため 「最低いいね数 / 最低リポスト数」 は検索クエリに含めず、
//   取得後にアプリ側 (XAdapter.postFilter / routes) でフィルタします。

export function buildXQuery(params = {}) {
  const {
    keyword,
    language = 'ja',
    excludeKeywords = [],
    fromUsername,
    excludeReposts = true,
    excludeReplies = false
    // minLikes / minReposts は「意図的に」ここでは使用しない
  } = params;

  const parts = [];
  if (keyword) {
    if (/\s/.test(keyword)) parts.push(`"${keyword}"`);
    else parts.push(keyword);
  }
  if (language) parts.push(`lang:${language}`);
  if (fromUsername) parts.push(`from:${fromUsername.replace(/^@/, '')}`);
  if (excludeReposts) parts.push('-is:retweet');
  if (excludeReplies) parts.push('-is:reply');
  for (const ex of (excludeKeywords || [])) {
    if (!ex) continue;
    parts.push(`-${/\s/.test(ex) ? `"${ex}"` : ex}`);
  }
  return parts.join(' ');
}

// アプリ側フィルタ: 取得後の投稿列に対して最低いいね/リポスト条件を適用する
export function applyEngagementFilter(posts, { minLikes = 0, minReposts = 0 } = {}) {
  if (!Array.isArray(posts)) return [];
  const ml = Number(minLikes) || 0;
  const mr = Number(minReposts) || 0;
  if (ml <= 0 && mr <= 0) return posts;
  return posts.filter(p =>
    (Number(p.like_count) || 0) >= ml &&
    (Number(p.repost_count) || 0) >= mr
  );
}
