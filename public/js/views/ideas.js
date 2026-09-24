import { api } from '../api.js';
import { escapeHtml, toast } from '../app.js';

const STATUSES = ['Inbox','採用候補','採用','作成中','投稿済み','保留'];

export async function renderIdeas(root) {
  root.innerHTML = `
    <div class="panel">
      <div class="flex-row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <h2 style="margin-bottom:4px">Ideas</h2>
          <div class="subhead">投稿AI分析から生成された"自分向けアイデア"を管理します。ステータス管理・タグ・エクスポートが可能です。</div>
        </div>
        <div class="flex-row gap-8">
          <select id="idea-filter" class="status-select">
            <option value="">すべて</option>
            ${STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
          <a class="btn" href="/api/export/ideas.csv" target="_blank">CSV出力</a>
          <a class="btn" href="/api/export/ideas.json" target="_blank">JSON出力</a>
        </div>
      </div>
      <div id="ideas-list" style="margin-top:16px"></div>
    </div>
  `;
  document.getElementById('idea-filter').onchange = load;
  await load();
}

async function load() {
  const status = document.getElementById('idea-filter').value;
  const r = await api.getIdeas(status || undefined);
  const list = document.getElementById('ideas-list');
  if (r.ideas.length === 0) {
    list.innerHTML = '<div class="hint">まだアイデアがありません。Discover 画面で投稿を分析し、「自分向けに変換」してください。</div>';
    return;
  }
  list.innerHTML = r.ideas.map(ideaCard).join('');
  list.querySelectorAll('[data-status-sel]').forEach(el => {
    el.onchange = async () => {
      try { await api.updateIdea(el.dataset.statusSel, { status: el.value }); toast('ステータスを更新しました'); }
      catch (e) { toast('更新失敗: ' + e.message); }
    };
  });
  list.querySelectorAll('[data-copy-brief]').forEach(el => {
    el.onclick = async () => {
      let b;
      try { b = await api.getBrief(el.dataset.copyBrief); } catch (e) { toast('取得失敗: ' + e.message); return; }
      const txt = `# Content Brief\n${JSON.stringify(b, null, 2)}`;
      try { await navigator.clipboard.writeText(txt); toast('プロンプト用JSONをコピーしました'); }
      catch { toast('コピーに失敗しました。手動で選択してください'); }
    };
  });
  list.querySelectorAll('[data-view-brief]').forEach(el => {
    el.onclick = async () => {
      let b;
      try { b = await api.getBrief(el.dataset.viewBrief); } catch (e) { toast('取得失敗: ' + e.message); return; }
      const pre = document.getElementById(`brief-${el.dataset.viewBrief}`);
      pre.textContent = JSON.stringify(b, null, 2);
      pre.classList.toggle('hidden');
    };
  });
}

function ideaCard(i) {
  return `
    <div class="idea-card">
      <div class="flex-row" style="justify-content:space-between;align-items:flex-start;gap:12px">
        <div>
          <div class="idea-meta">狙い: ${escapeHtml(i.objective || '-')} / ターゲット: ${escapeHtml(i.target || '-')}</div>
          <h3>${escapeHtml(i.title || '')}</h3>
        </div>
        <select class="status-select" data-status-sel="${i.id}">
          ${STATUSES.map(s => `<option value="${s}" ${s === i.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="idea-hook"><b>Hook:</b> ${escapeHtml(i.hook || '')}</div>
      <div><b>切り口:</b> ${escapeHtml(i.angle || '')}</div>
      <div style="margin-top:6px"><b>構成:</b><ol>${(i.structure||[]).map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol></div>
      <div class="exp-needed">
        <b>あなた自身の経験を入れる場所:</b>
        <ul>${(i.personal_experience_needed||[]).map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
      </div>
      <div class="flex-row gap-8" style="margin-top:10px">
        <button class="btn sm" data-view-brief="${i.id}">Content Brief を表示</button>
        <button class="btn sm primary" data-copy-brief="${i.id}">プロンプトとしてコピー</button>
      </div>
      <pre id="brief-${i.id}" class="hidden" style="margin-top:8px;background:#f6f7fb;padding:10px;border-radius:8px;font-size:12px;overflow-x:auto;"></pre>
    </div>
  `;
}
