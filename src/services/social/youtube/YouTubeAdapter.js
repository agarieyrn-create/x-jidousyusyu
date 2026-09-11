// YouTubeAdapter: Phase 2 予定。ここでは同一インターフェースの雛形のみ。
export class YouTubeAdapter {
  constructor() {}
  isConfigured() { return false; }
  async search() { return { posts: [], mode: 'not_implemented' }; }
  async getPost() { return null; }
  normalize() { return null; }
}
