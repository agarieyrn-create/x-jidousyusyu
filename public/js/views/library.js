import { api } from '../api.js';
import { escapeHtml, fmtNum, relativeTime, toast } from '../app.js';
import { postCardHTML } from './dashboard.js';
import { renderPostDrawer } from './post_drawer.js';

export async function renderLibrary(root) {
  root.innerHTML = `
    <div class="panel">
      <h2>Research Library</h2>
      <div class="subhead">保存した投稿を管理・絞り込みます。Hookタイプ・Topic・キーワードで検索できます。</div>
      <div class="flex-row gap-8" style="margin-bottom:12px;flex-wrap:wrap">
        <input id="lib-q" type="search" placeholder="キーワード / アカウント / Hook / Topic / タグ" style="max-width:360px">
        <button class="btn primary" id="btn-manual">＋ 投稿を追加</button>
        <button class="btn" id="btn-refresh">再読み込み</button>
      </div>
      <div id="library-list" class="grid-2"></div>
    </div>
    <div id="manual-panel"></div>
  `;
  document.getElementById('btn-manual').onclick = renderManualForm;
  document.getElementById('btn-refresh').onclick = load;
  document.getElementById('lib-q').oninput = filter;
  await load();
}

let allPosts = [];
async function load() {
  const r = await api.getPosts({ saved: '1' });
  allPosts = r.posts;
  filter();
}
function filter() {
  const q = (document.getElementById('lib-q').value || '').toLowerCase();
  const list = q ? allPosts.filter(p =>
    (p.text || '').toLowerCase().includes(q) ||
    (p.username || '').toLowerCase().includes(q) ||
    (p.source_keyword || '').toLowerCase().includes(q)
  ) : allPosts;
  const root = document.getElementById('library-list');
  root.innerHTML = list.length === 0
    ? '<div class="hint">まだ保存された投稿はありません。Discover 画面で気になる投稿の「保存する」を押してください。</div>'
    : list.map(postCardHTML).join('');
  root.querySelectorAll('.post-card').forEach(el => el.addEventListener('click', () => renderPostDrawer(el.dataset.id)));
}

function renderManualForm() {
  const panel = document.getElementById('manual-panel');
  panel.innerHTML = `
    <div class="panel" style="margin-top:16px">
      <h2>投稿を追加</h2>
      <div class="subhead">X URL があれば貼るだけ。X以外は本文を貼り付けてください (SNS規約回避のスクレイピングはしません)。</div>
      <div class="grid-2">
        <div>
          <h3>URL で追加</h3>
          <label class="field"><span>投稿URL</span><input id="mu-url" placeholder="https://x.com/username/status/..."></label>
          <label class="field"><span>メモ</span><input id="mu-memo"></label>
          <label class="field"><span>タグ (カンマ区切り)</span><input id="mu-tags"></label>
          <button class="btn primary" id="btn-mu">URLから登録</button>
        </div>
        <div>
          <h3>テキストで追加</h3>
          <label class="field"><span>本文</span><textarea id="mt-text"></textarea></label>
          <label class="field"><span>投稿者 (任意)</span><input id="mt-user"></label>
          <label class="field"><span>SNS (任意)</span><input id="mt-plat" placeholder="x / manual"></label>
          <label class="field"><span>URL (任意)</span><input id="mt-url"></label>
          <label class="field"><span>タグ (カンマ区切り)</span><input id="mt-tags"></label>
          <button class="btn primary" id="btn-mt">テキストから登録</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('btn-mu').onclick = async () => {
    try {
      await api.manualImport({
        type: 'url',
        url: document.getElementById('mu-url').value.trim(),
        memo: document.getElementById('mu-memo').value.trim(),
        tags: (document.getElementById('mu-tags').value || '').split(',').map(s => s.trim()).filter(Boolean)
      });
      toast('登録しました');
      panel.innerHTML = '';
      await load();
    } catch (e) { toast('登録失敗: ' + e.message); }
  };
  document.getElementById('btn-mt').onclick = async () => {
    try {
      await api.manualImport({
        type: 'text',
        text: document.getElementById('mt-text').value,
        username: document.getElementById('mt-user').value.trim() || undefined,
        platform: document.getElementById('mt-plat').value.trim() || undefined,
        url: document.getElementById('mt-url').value.trim() || undefined,
        tags: (document.getElementById('mt-tags').value || '').split(',').map(s => s.trim()).filter(Boolean)
      });
      toast('登録しました');
      panel.innerHTML = '';
      await load();
    } catch (e) { toast('登録失敗: ' + e.message); }
  };
}
