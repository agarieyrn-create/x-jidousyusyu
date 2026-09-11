// Trend Score (Content Research Radar 独自指標)
//
// engagementValue = likes + reposts*2 + replies*1.5 + quotes*2.5
// velocity        = engagementValue / (hours since posted)
// relEng          = engagementValue / followerCount   (フォロワー数取得可能な場合のみ)
//
// 各投稿ごとに:
//   follower_count > 0  → velocity 60% + relativeEngagement 40%
//   follower_count 不明 → velocity 100%
// を計算し、検索結果内の実測 min/max で 0-100 に正規化する。
// (以前は Math.min(...values, 0) と 0 を強制混入させていたが、それはやめる)

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

/**
 * 配列を 0-100 の相対値に正規化する。
 * - 空配列 → 空配列
 * - min === max (全部同じ値) → すべて 50 を返す (差が無いなら中央値)
 * - null / undefined は 0 として扱う
 * 意図的に 0 を最小値として"混入"はしない: 実測値のみで min/max を取る。
 */
export function normalize(values) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const nums = values.map(v => (typeof v === 'number' && Number.isFinite(v)) ? v : 0);
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  if (max === min) return nums.map(() => 50);
  const range = max - min;
  return nums.map(v => ((v - min) / range) * 100);
}

/**
 * 検索結果配列に対して trend_score を付与して返す。
 * @param {Array<object>} posts
 * @returns {Array<object>}
 */
export function computeTrendScoreBatch(posts) {
  if (!Array.isArray(posts) || posts.length === 0) return [];

  const velocities = posts.map(p => engagementValue(p) / hoursSince(p.published_at));
  const normV = normalize(velocities);

  // relEng: フォロワーが取得できているものだけで正規化する。
  // 「follower_count が undefined / null / <= 0 の投稿」は relEng に不参加とし、
  //  velocity 100% で評価する (ペナルティを与えない)。
  const relEngRaw = posts.map(p => {
    const f = p.follower_count;
    if (f === undefined || f === null) return null;
    if (Number(f) <= 0) return null;
    return engagementValue(p) / Number(f);
  });

  // フォロワー分かる投稿だけを取り出して正規化
  const knownIdx = [];
  const knownValues = [];
  for (let i = 0; i < relEngRaw.length; i++) {
    if (relEngRaw[i] !== null) {
      knownIdx.push(i);
      knownValues.push(relEngRaw[i]);
    }
  }
  const knownNormalized = normalize(knownValues);
  const normR = new Array(posts.length).fill(null);
  knownIdx.forEach((idx, k) => { normR[idx] = knownNormalized[k]; });

  return posts.map((p, i) => {
    let score;
    if (normR[i] !== null) {
      score = normV[i] * 0.6 + normR[i] * 0.4;
    } else {
      score = normV[i]; // velocity 100%
    }
    return { ...p, trend_score: Math.round(score * 100) / 100 };
  });
}
