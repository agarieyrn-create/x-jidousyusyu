// ManualAdapter: ユーザーが手動でテキスト/URLを登録するアダプタ
import { parseXUrl } from '../x/XUrlParser.js';
import { XAdapter } from '../x/XAdapter.js';

export class ManualAdapter {
  constructor() {
    this.x = new XAdapter();
  }

  async importFromUrl({ url, memo, tags }) {
    const parsed = parseXUrl(url);
    if (parsed && this.x.isConfigured()) {
      const post = await this.x.getPost(url);
      if (post) return { ...post, memo, tags, imported_via: 'x_api' };
    }
    // XAPI未接続 or X以外
    return {
      external_post_id: `manual_${Date.now()}`,
      platform: parsed ? 'x' : 'manual',
      username: parsed?.username || null,
      display_name: null,
      text: '(本文未取得: 手動で貼り付けてください)',
      url,
      published_at: new Date().toISOString(),
      like_count: 0, repost_count: 0, reply_count: 0, quote_count: 0, follower_count: 0,
      has_media: false,
      memo: memo || null,
      tags: tags || [],
      imported_via: 'manual_url'
    };
  }

  importFromText({ text, url, username, platform, memo, tags }) {
    return {
      external_post_id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      platform: platform || 'manual',
      username: username || null,
      display_name: username || null,
      text: text || '',
      url: url || null,
      published_at: new Date().toISOString(),
      like_count: 0, repost_count: 0, reply_count: 0, quote_count: 0, follower_count: 0,
      has_media: false,
      memo: memo || null,
      tags: tags || [],
      imported_via: 'manual_text'
    };
  }
}
