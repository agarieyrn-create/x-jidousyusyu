// XQueryBuilder: 検索条件から X API 検索クエリ文字列を組み立てる
// See: https://developer.x.com/en/docs/x-api/tweets/search/integrate/build-a-query

export function buildXQuery(params = {}) {
  const {
    keyword,
    language = 'ja',
    excludeKeywords = [],
    fromUsername,
    excludeReposts = true,
    excludeReplies = false,
    minLikes,
    minReposts
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
  if (minLikes && minLikes > 0) parts.push(`min_faves:${minLikes}`);
  if (minReposts && minReposts > 0) parts.push(`min_retweets:${minReposts}`);
  return parts.join(' ');
}
