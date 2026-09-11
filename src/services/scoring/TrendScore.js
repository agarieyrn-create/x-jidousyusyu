// Trend Score (Content Research Radar 独自指標)
//
// engagementValue = likes + reposts*2 + replies*1.5 + quotes*2.5
// velocity        = engagementValue / (hours since posted)
// relEng          = engagementValue / followerCount   (フォロワー数取得可能な場合)
// 検索結果内で velocity 60% + relEng 40% を 0-100 に正規化
// フォロワー数がない場合は velocity のみ

export function engagementValue(post) {
  return (post.like_count || 0)
    + (post.repost_count || 0) * 2
    + (post.reply_count || 0) * 1.5
    + (post.quote_count || 0) * 2.5;
}

function hoursSince(iso) {
  if (!iso) return 24;
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffHours = Math.max(0.5, (now - t) / 3600000);
  return diffHours;
}

function normalize(values) {
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  return values.map(v => ((v - min) / range) * 100);
}

export function computeTrendScoreBatch(posts) {
  if (!posts || posts.length === 0) return [];

  const velocities = posts.map(p => engagementValue(p) / hoursSince(p.published_at));
  const relEngs = posts.map(p => {
    const f = p.follower_count;
    return f && f > 0 ? engagementValue(p) / f : null;
  });

  const hasFollowerData = relEngs.some(v => v !== null);
  const normV = normalize(velocities);
  const normR = hasFollowerData
    ? normalize(relEngs.map(v => (v === null ? 0 : v)))
    : normV;

  return posts.map((p, i) => {
    const score = hasFollowerData
      ? normV[i] * 0.6 + normR[i] * 0.4
      : normV[i];
    return { ...p, trend_score: Math.round(score * 100) / 100 };
  });
}
