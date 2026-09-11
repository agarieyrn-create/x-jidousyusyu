import { api } from '../api.js';
import { escapeHtml, fmtNum, toast, openDrawer } from '../app.js';
import { postCardHTML } from './dashboard.js';
import { renderPostDrawer } from './post_drawer.js';

export async function renderWatch(root) {
  root.innerHTML = `
    <div class="panel">
      <h2>Watch Accounts</h2>
      <div class="subhead">競合・参考アカウントを登録し、投稿パターンをまとめて分析します。</div>
      <div class="grid-3" style="align-items:end;gap:10px">
        <label class="field"><span>username</span><input id="wa-user" placeholder="@username"></label>
        <label class="field"><span>表示名 (任意)</span><input id="wa-name"></label>
        <label class="field"><span>タグ (カンマ区切り)</span><input id="wa-tags" placeholder="AI発信, 競合"></label>
      </div>
      <div class="grid-3" style="align-items:end;gap:10px">
        <label class="field"><span>フォロワー数 (任意)</span><input id="wa-followers" type="number"></label>
        <label class="field"><span>メモ</span><input id="wa-memo"></label>
        <div><button class="btn primary" id="wa-add">登録</button></div>
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <h2>登録済みアカウント</h2>
      <div id="wa-list"></div>
    </div>
  `;
  document.getElementById('wa-add').onclick = async () => {
    try {
      await api.addWatchAccount({
        platform: 'x',
        username: document.getElementById('wa-user').value.trim(),
        display_name: document.getElementById('wa-name').value.trim(),
        followers: Number(document.getElementById('wa-followers').value) || 0,
        memo: document.getElementById('wa-memo').value.trim(),
        tags: (document.getElementById('wa-tags').value || '').split(',').map(s => s.trim()).filter(Boolean)
      });
      toast('登録しました');
      await load();
    } catch (e) { toast('登録失敗: ' + e.message); }
  };
  await load();
}

async function load() {
  const r = await api.getWatchAccounts();
  const box = document.getElementById('wa-list');
  if (r.accounts.length === 0) { box.innerHTML = '<div class="hint">まだ登録されていません</div>'; return; }
  box.innerHTML = `<table class="tbl"><thead><tr><th>アカウント</th><th>表示名</th><th class="num">フォロワー</th><th>タグ</th><th>メモ</th><th></th></tr></thead><tbody>
    ${r.accounts.map(a => `
      <tr>
        <td>@${escapeHtml(a.username)}</td>
        <td>${escapeHtml(a.display_name || '')}</td>
        <td class="num">${fmtNum(a.followers)}</td>
        <td>${(a.tags||[]).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</td>
        <td>${escapeHtml(a.memo || '')}</td>
        <td class="num">
          <button class="btn sm" data-analyze="${a.id}">分析</button>
          <button class="btn sm danger" data-del="${a.id}">削除</button>
        </td>
      </tr>
    `).join('')}
  </tbody></table>`;
  box.querySelectorAll('[data-del]').forEach(el => el.onclick = async () => {
    if (!confirm('削除しますか?')) return;
    await api.deleteWatchAccount(el.dataset.del);
    toast('削除しました');
    load();
  });
  box.querySelectorAll('[data-analyze]').forEach(el => el.onclick = () => renderAnalysis(el.dataset.analyze));
}

async function renderAnalysis(id) {
  const panel = openDrawer('<div>アカウント分析を集計中…</div>');
  const r = await api.getWatchAnalysis(id);
  if (!r.stats) {
    panel.innerHTML = `<button class="close" data-close>×</button>
      <h2>@${escapeHtml(r.account.username)}</h2>
      <div class="hint">直近7日でこのアカウントの取得済み投稿がありません。Discover でこのユーザー名を検索してみてください。</div>`;
    return;
  }
  const kpi = (l, v, s='') => `<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`;
  const chips = arr => (arr||[]).slice(0,6).map(x => `<span class="tag">${escapeHtml(x.key)} · ${x.count}</span>`).join('') || '<span class="hint">まだ分析済み投稿がありません</span>';
  panel.innerHTML = `
    <button class="close" data-close>×</button>
    <h2>@${escapeHtml(r.account.username)} の投稿パターン (直近7日)</h2>
    <div class="grid-4">
      ${kpi('投稿数', r.stats.count)}
      ${kpi('平均いいね', fmtNum(r.stats.avg_likes))}
      ${kpi('平均RP', fmtNum(r.stats.avg_reposts))}
      ${kpi('平均Trend', r.stats.avg_trend_score.toFixed(1))}
    </div>
    <div class="section-block"><h4>よく使う Hook</h4>${chips(r.stats.hooks)}</div>
    <div class="section-block"><h4>よく扱う Topic</h4>${chips(r.stats.topics)}</div>
    <div class="section-block"><h4>CTA 傾向</h4>${chips(r.stats.ctas)}</div>
    <h2 style="margin-top:20px">上位投稿</h2>
    <div class="grid-2" id="wa-top">${r.posts.map(postCardHTML).join('')}</div>
  `;
  panel.querySelectorAll('.post-card').forEach(el => el.addEventListener('click', () => renderPostDrawer(el.dataset.id)));
}
