import { api } from '../api.js';
import { toast, setStatus, escapeHtml } from '../app.js';
import { postCardHTML } from './dashboard.js';
import { renderPostDrawer } from './post_drawer.js';

let cachedPosts = [];
let sortKey = 'trend_score';
let filterKey = 'all';

export async function renderDiscover(root) {
  const keywords = (await api.getKeywords()).keywords;
  const activeKw = keywords.filter(k => k.is_active).map(k => k.keyword);

  root.innerHTML = `
    <div class="panel">
      <h2>検索条件</h2>
      <div class="grid-3">
        <label class="field">
          <span>キーワード (改行区切り, 5個まで)</span>
          <textarea id="f-keywords" placeholder="ChatGPT 仕事&#10;AI 業務効率化">${activeKw.slice(0,5).join('\n')}</textarea>
        </label>
        <div>
          <label class="field">
            <span>期間 (直近N日)</span>
            <input id="f-days" type="number" value="7" min="1" max="30">
          </label>
          <label class="field">
            <span>言語</span>
            <select id="f-lang"><option value="ja" selected>日本語</option><option value="en">英語</option></select>
          </label>
        </div>
        <div>
          <label class="field">
            <span>最低いいね</span>
            <input id="f-minlikes" type="number" value="0" min="0">
          </label>
          <label class="field">
            <span>最低リポスト</span>
            <input id="f-minrp" type="number" value="0" min="0">
          </label>
        </div>
      </div>
      <div class="grid-3">
        <label class="field">
          <span>特定アカウント (任意)</span>
          <input id="f-user" type="text" placeholder="@username">
        </label>
        <label class="field">
          <span>除外キーワード (カンマ区切り)</span>
          <input id="f-exclude" type="text" placeholder="宣伝, PR">
        </label>
        <div>
          <label class="field inline"><input id="f-noreposts" type="checkbox" checked><span>リポスト除外</span></label>
          <label class="field inline"><input id="f-noreplies" type="checkbox"><span>返信除外</span></label>
        </div>
      </div>
      <div class="flex-row" style="justify-content:flex-end;gap:8px">
        <button class="btn" id="btn-clear">クリア</button>
        <button class="btn primary" id="btn-search">検索実行</button>
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <div class="flex-row" style="justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div class="flex-row gap-8">
          <select id="sort" class="status-select">
            <option value="trend_score">Trend Score順</option>
            <option value="like_count">いいね順</option>
            <option value="repost_count">リポスト順</option>
            <option value="reply_count">返信順</option>
            <option value="published_at">新しい順</option>
          </select>
          <select id="filter" class="status-select">
            <option value="all">すべて</option>
            <option value="analyzed">AI分析済み</option>
            <option value="unanalyzed">未分析</option>
            <option value="saved">保存済み</option>
            <option value="unsaved">未保存</option>
          </select>
        </div>
        <div class="flex-row gap-8">
          <select id="top-count" class="status-select">
            <option value="5">上位5件</option>
            <option value="10" selected>上位10件</option>
            <option value="20">上位20件</option>
          </select>
          <button class="btn warn" id="btn-analyze-top">上位をAI分析</button>
        </div>
      </div>
      <div id="post-list" style="margin-top:16px" class="grid-2"></div>
    </div>
  `;

  document.getElementById('btn-clear').onclick = () => { document.getElementById('f-keywords').value=''; };
  document.getElementById('btn-search').onclick = doSearch;
  document.getElementById('sort').onchange = e => { sortKey = e.target.value; renderList(); };
  document.getElementById('filter').onchange = e => { filterKey = e.target.value; renderList(); };
  document.getElementById('btn-analyze-top').onclick = async () => {
    const limit = Number(document.getElementById('top-count').value);
    setStatus([`上位${limit}件をAI分析しています…`]);
    try {
      const r = await api.analyzeTop(limit);
      toast(`${r.analyzed}件をAI分析しました`);
      setStatus([`AI分析完了: ${r.analyzed}件`]);
      await doSearch(true);
    } catch (e) {
      toast('AI分析に失敗しました: ' + e.message);
      setStatus([`AI分析に失敗: ${e.message}`]);
    }
  };

  await doSearch(true);
}

async function doSearch(reuseKeywords=false) {
  const kwText = document.getElementById('f-keywords').value.trim();
  const keywords = kwText ? kwText.split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0,5) : [];
  const body = {
    keywords,
    days: Number(document.getElementById('f-days').value) || 7,
    minLikes: Number(document.getElementById('f-minlikes').value) || 0,
    minReposts: Number(document.getElementById('f-minrp').value) || 0,
    language: document.getElementById('f-lang').value,
    fromUsername: document.getElementById('f-user').value.trim() || undefined,
    excludeKeywords: (document.getElementById('f-exclude').value || '').split(',').map(s => s.trim()).filter(Boolean),
    excludeReposts: document.getElementById('f-noreposts').checked,
    excludeReplies: document.getElementById('f-noreplies').checked
  };
  setStatus(['検索を実行しています…']);
  try {
    const r = await api.search(body);
    setStatus(r.status || []);
    cachedPosts = r.posts;
    renderList();
  } catch (e) {
    setStatus([`検索エラー: ${e.message}`]);
    toast('検索エラー: ' + e.message);
  }
}

function renderList() {
  let list = [...cachedPosts];
  // filter
  if (filterKey === 'analyzed') list = list.filter(p => p.has_analysis);
  else if (filterKey === 'unanalyzed') list = list.filter(p => !p.has_analysis);
  else if (filterKey === 'saved') list = list.filter(p => p.is_saved);
  else if (filterKey === 'unsaved') list = list.filter(p => !p.is_saved);
  // sort
  const dir = sortKey === 'published_at' ? -1 : -1;
  list.sort((a, b) => {
    if (sortKey === 'published_at') return new Date(b.published_at) - new Date(a.published_at);
    return (b[sortKey] || 0) - (a[sortKey] || 0);
  });

  const root = document.getElementById('post-list');
  root.innerHTML = list.length === 0
    ? '<div class="hint">該当する投稿がありません。検索条件を緩めるか、キーワードを追加してください。</div>'
    : list.map(postCardHTML).join('');
  root.querySelectorAll('.post-card').forEach(el => {
    el.addEventListener('click', () => renderPostDrawer(el.dataset.id));
  });
}
