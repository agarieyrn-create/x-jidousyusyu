// Main SPA controller
import { api } from './api.js';
import { renderDashboard } from './views/dashboard.js';
import { renderDiscover } from './views/discover.js';
import { renderLibrary } from './views/library.js';
import { renderIdeas } from './views/ideas.js';
import { renderWatch } from './views/watch.js';
import { renderSettings } from './views/settings.js';

const ROUTES = {
  dashboard: { title: 'Dashboard', render: renderDashboard },
  discover: { title: 'Discover', render: renderDiscover },
  library: { title: 'Research Library', render: renderLibrary },
  ideas: { title: 'Ideas', render: renderIdeas },
  watch: { title: 'Watch Accounts', render: renderWatch },
  settings: { title: 'Settings', render: renderSettings }
};

export const state = {
  status: null
};

function setActiveNav(route) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === route);
  });
  const t = ROUTES[route]?.title || '';
  document.getElementById('page-title').textContent = t;
}

async function navigate(route) {
  if (!ROUTES[route]) route = 'dashboard';
  setActiveNav(route);
  const view = document.getElementById('view');
  view.innerHTML = '<div class="panel">読み込み中...</div>';
  location.hash = `#/${route}`;
  try {
    await ROUTES[route].render(view);
  } catch (e) {
    view.innerHTML = `<div class="panel"><h2>エラー</h2><p>${escapeHtml(e.message)}</p></div>`;
  }
}

function currentRoute() {
  const h = (location.hash || '').replace(/^#\/?/, '');
  return h || 'dashboard';
}

document.addEventListener('click', e => {
  const nav = e.target.closest('.nav-item');
  if (nav) { e.preventDefault(); navigate(nav.dataset.route); return; }
  const close = e.target.closest('[data-close]');
  if (close) closeDrawer();
});
window.addEventListener('hashchange', () => navigate(currentRoute()));

// helpers -----------------------------
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}
export function setStatus(msg) {
  const el = document.getElementById('status-bar');
  if (!msg) { el.innerHTML = ''; return; }
  const parts = Array.isArray(msg) ? msg : [msg];
  el.innerHTML = parts.map(p => `<span class="chip">${escapeHtml(p)}</span>`).join('');
}
export function openDrawer(html) {
  const d = document.getElementById('drawer');
  const p = document.getElementById('drawer-panel');
  p.innerHTML = `<button class="close" data-close>×</button>${html}`;
  d.classList.remove('hidden');
  return p;
}
export function closeDrawer() { document.getElementById('drawer').classList.add('hidden'); }
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// href に入れてよいURLだけ返す (javascript: 等は '#')
export function safeUrl(u) {
  try {
    const x = new URL(String(u || ''), location.origin);
    return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : '#';
  } catch { return '#'; }
}
export function fmtNum(n) {
  if (n === null || n === undefined) return '-';
  n = Number(n);
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}
export function relativeTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return `${Math.floor(diff)}秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  return `${Math.floor(diff / 86400)}日前`;
}

// boot ---------------------------------
(async function boot() {
  try {
    state.status = await api.status();
    const badge = document.getElementById('mode-badge');
    if (state.status.demo_mode) {
      badge.textContent = 'DEMO MODE';
      badge.classList.remove('live');
    } else {
      badge.textContent = 'LIVE MODE';
      badge.classList.add('live');
    }
  } catch {}
  navigate(currentRoute());
})();
