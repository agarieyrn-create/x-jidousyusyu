import { api } from '../api.js';
import { escapeHtml, fmtNum, relativeTime, openDrawer } from '../app.js';
import { renderPostDrawer } from './post_drawer.js';

export async function renderDashboard(root) {
  const data = await api.dashboard();
  root.innerHTML = `
    <div class="grid-4">
      <div class="kpi"><div class="label">今日のリサーチ</div><div class="value">${data.today_count}</div><div class="sub">取得件数</div></div>
      <div class="kpi"><div class="label">Ideas: Inbox</div><div class="value">${data.idea_counts.Inbox || 0}</div><div class="sub">未処理</div></div>
      <div class="kpi"><div class="label">採用候補</div><div class="value">${data.idea_counts['採用候補'] || 0}</div><div class="sub">検討中</div></div>
      <div class="kpi"><div class="label">採用</div><div class="value">${data.idea_counts['採用'] || 0}</div><div class="sub">投稿予定/済</div></div>
    </div>

    <div class="panel" style="margin-top:16px">
      <h2>注目投稿 (Trend Score上位)</h2>
      <div class="subhead">Content Research Radar 独自指標。単純ないいね数ではありません。</div>
      <div id="top-posts" class="grid-2"></div>
    </div>

    <div class="grid-2" style="margin-top:16px">
      <div class="panel">
        <h2>最近保存した投稿</h2>
        <div id="recent-saved">${data.recent_saved.length === 0 ? '<div class="hint">まだ保存された投稿はありません</div>' : ''}</div>
      </div>
      <div class="panel">
        <h2>傾向</h2>
        <h3>Hook (保存済み投稿)</h3>
        <div>${renderChips(data.hooks)}</div>
        <h3 style="margin-top:14px">Topic (保存済み投稿)</h3>
        <div>${renderChips(data.topics)}</div>
        <div class="hint" style="margin-top:12px">保存した投稿を AI 分析するほど、あなたが反応する型が見えてきます。</div>
      </div>
    </div>
  `;

  const container = document.getElementById('top-posts');
  container.innerHTML = data.top_posts.map(postCardHTML).join('') || '<div class="hint">まだ投稿がありません</div>';
  container.querySelectorAll('.post-card').forEach(el => {
    el.addEventListener('click', () => renderPostDrawer(el.dataset.id));
  });

  const rs = document.getElementById('recent-saved');
  if (data.recent_saved.length) {
    rs.innerHTML = data.recent_saved.map(p => `
      <div class="post-card" data-id="${p.id}" style="margin-bottom:10px">
        <div class="post-head"><span class="post-user"><b>@${escapeHtml(p.username || '?')}</b> · ${relativeTime(p.published_at)}</span>
        <span class="trend">Trend ${Number(p.trend_score || 0).toFixed(1)}</span></div>
        <div class="post-text">${escapeHtml((p.text || '').slice(0, 120))}${(p.text||'').length > 120 ? '…' : ''}</div>
      </div>`).join('');
    rs.querySelectorAll('.post-card').forEach(el => el.addEventListener('click', () => renderPostDrawer(el.dataset.id)));
  }
}

function renderChips(items) {
  if (!items || items.length === 0) return '<div class="hint">まだデータがありません</div>';
  return items.slice(0, 8).map(i => `<span class="tag">${escapeHtml(i.key)} · ${i.count}</span>`).join('');
}

export function postCardHTML(p) {
  const score = Number(p.trend_score) || 0;
  const flags = [];
  if (p.has_analysis) flags.push('<span class="chip ok">AI分析済</span>');
  if (p.is_saved) flags.push('<span class="chip saved">保存済</span>');
  return `
    <div class="post-card" data-id="${p.id}">
      <div class="post-head">
        <span class="post-user"><b>${escapeHtml(p.display_name || p.username || '?')}</b> @${escapeHtml(p.username || '?')} · ${relativeTime(p.published_at)}</span>
        <span class="trend">
          <span class="bar"><span class="bar-fill" style="width:${Math.min(100, score)}%"></span></span>
          ${score.toFixed(1)}
        </span>
      </div>
      <div class="post-text">${escapeHtml((p.text || '').slice(0, 180))}${(p.text||'').length > 180 ? '…' : ''}</div>
      <div class="post-metrics">
        <span><b>${fmtNum(p.like_count)}</b>いいね</span>
        <span><b>${fmtNum(p.repost_count)}</b>RP</span>
        <span><b>${fmtNum(p.reply_count)}</b>返信</span>
        <span><b>${fmtNum(p.quote_count)}</b>引用</span>
      </div>
      ${flags.length ? `<div class="post-flags">${flags.join('')}</div>` : ''}
    </div>
  `;
}
