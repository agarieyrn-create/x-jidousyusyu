// Frontend API client
async function req(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (!res.ok) {
    let msg;
    try { msg = (await res.json()).error || res.statusText; } catch { msg = res.statusText; }
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

export const api = {
  status: () => req('/status'),
  getProfile: () => req('/profile'),
  saveProfile: (p) => req('/profile', { method: 'PUT', body: JSON.stringify(p) }),
  getKeywords: () => req('/keywords'),
  addKeywords: (kws, source='user') => req('/keywords', { method: 'POST', body: JSON.stringify({ keywords: kws, source }) }),
  regenerateKeywords: () => req('/keywords', { method: 'POST', body: JSON.stringify({ regenerate: true }) }),
  updateKeyword: (id, patch) => req(`/keywords/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteKeyword: (id) => req(`/keywords/${id}`, { method: 'DELETE' }),

  search: (body) => req('/research/search', { method: 'POST', body: JSON.stringify(body) }),

  getPosts: (params={}) => {
    const q = new URLSearchParams(params).toString();
    return req(`/posts${q ? '?' + q : ''}`);
  },
  getPost: (id) => req(`/posts/${id}`),
  savePost: (id, saved) => req(`/posts/${id}/save`, { method: 'POST', body: JSON.stringify({ saved }) }),
  analyzePost: (id) => req(`/posts/${id}/analyze`, { method: 'POST', body: '{}' }),
  analyzeTop: (limit) => req(`/posts/analyze-top`, { method: 'POST', body: JSON.stringify({ limit }) }),

  getWatchAccounts: () => req('/watch-accounts'),
  addWatchAccount: (body) => req('/watch-accounts', { method: 'POST', body: JSON.stringify(body) }),
  deleteWatchAccount: (id) => req(`/watch-accounts/${id}`, { method: 'DELETE' }),
  getWatchAnalysis: (id) => req(`/watch-accounts/${id}/analysis`),

  manualImport: (body) => req('/manual-import', { method: 'POST', body: JSON.stringify(body) }),

  generateIdeas: (postId) => req('/ideas/generate', { method: 'POST', body: JSON.stringify({ post_id: postId }) }),
  getIdeas: (status) => req(`/ideas${status ? '?status=' + encodeURIComponent(status) : ''}`),
  updateIdea: (id, patch) => req(`/ideas/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  getBrief: (id) => req(`/ideas/${id}/brief`),

  dashboard: () => req('/dashboard'),
};
