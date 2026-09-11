// XUrlParser: X (旧Twitter) の投稿URLからPost IDを抽出
// 対応: https://x.com/username/status/1234567890 / twitter.com / mobile.twitter.com

export function parseXUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, '');
    if (!/(^|\.)x\.com$/.test(host) && !/(^|\.)twitter\.com$/.test(host)) {
      return null;
    }
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex(p => p === 'status' || p === 'statuses');
    if (idx === -1 || !parts[idx + 1]) return null;
    const postId = parts[idx + 1].split('?')[0];
    if (!/^\d+$/.test(postId)) return null;
    const username = parts[0] && parts[0] !== 'i' ? parts[0] : null;
    return { platform: 'x', post_id: postId, username };
  } catch {
    return null;
  }
}
