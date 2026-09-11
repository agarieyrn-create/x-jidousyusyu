import { api } from '../api.js';
import { state, toast, escapeHtml } from '../app.js';

export async function renderSettings(root) {
  const status = state.status || await api.status();
  const { profile } = await api.getProfile();
  const kws = (await api.getKeywords()).keywords;
  const p = profile || {};

  root.innerHTML = `
    <div class="panel">
      <h2>接続状態</h2>
      <div class="grid-2">
        <div>
          <h3>X API</h3>
          <div>
            ${status.integrations.x_api === 'connected'
              ? '<span class="chip ok">接続済み</span>'
              : '<span class="chip">未接続 · DEMO MODE</span>'}
          </div>
          <div class="hint" style="margin-top:6px">環境変数 <code>X_BEARER_TOKEN</code> を設定するとライブ検索が有効になります。</div>
        </div>
        <div>
          <h3>AI Provider</h3>
          <div>${status.integrations.ai !== 'mock' ? '<span class="chip ok">'+escapeHtml(status.integrations.ai)+'</span>' : '<span class="chip">Mock (DEMO)</span>'}</div>
          <div class="hint" style="margin-top:6px">環境変数 <code>AI_PROVIDER</code> / <code>AI_API_KEY</code> / <code>AI_MODEL</code> を設定するとLLM分析が有効になります。</div>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <h2>発信プロフィール</h2>
      <div class="grid-2">
        <label class="field"><span>発信ジャンル (main topic)</span>
          <input id="p-main" value="${escapeHtml(p.main_topic || '')}"></label>
        <label class="field"><span>サブジャンル (カンマ区切り)</span>
          <input id="p-sub" value="${escapeHtml((p.sub_topics||[]).join(', '))}"></label>
      </div>
      <label class="field"><span>ターゲット</span>
        <textarea id="p-target">${escapeHtml(p.target_audience || '')}</textarea></label>
      <label class="field"><span>発信目的 (カンマ区切り)</span>
        <input id="p-obj" value="${escapeHtml((p.objectives||[]).join(', '))}" placeholder="認知獲得, フォロワー増加, note誘導"></label>
      <label class="field"><span>発信スタイル</span>
        <textarea id="p-style">${escapeHtml(p.writing_style || '')}</textarea></label>
      <label class="field"><span>除外テーマ (カンマ区切り)</span>
        <input id="p-ex" value="${escapeHtml((p.excluded_topics||[]).join(', '))}"></label>
      <div style="text-align:right"><button class="btn primary" id="p-save">プロフィールを保存</button></div>
    </div>

    <div class="panel" style="margin-top:16px">
      <h2>リサーチキーワード</h2>
      <div class="subhead">AI生成候補は追加・編集・削除・ON/OFFできます。勝手には確定されません。</div>
      <div class="flex-row gap-8" style="margin-bottom:12px;flex-wrap:wrap">
        <input id="kw-input" type="text" placeholder="キーワードを入力" style="max-width:280px">
        <button class="btn primary" id="kw-add">追加</button>
        <button class="btn warn" id="kw-regen">AIで候補を再生成</button>
      </div>
      <div id="kw-list"></div>
      <div id="kw-suggest" class="hidden" style="margin-top:12px"></div>
    </div>
  `;

  renderKeywords(kws);

  document.getElementById('p-save').onclick = async () => {
    try {
      await api.saveProfile({
        main_topic: document.getElementById('p-main').value.trim(),
        sub_topics: split(document.getElementById('p-sub').value),
        target_audience: document.getElementById('p-target').value.trim(),
        objectives: split(document.getElementById('p-obj').value),
        writing_style: document.getElementById('p-style').value.trim(),
        excluded_topics: split(document.getElementById('p-ex').value)
      });
      toast('プロフィールを保存しました');
    } catch (e) { toast('保存失敗: ' + e.message); }
  };

  document.getElementById('kw-add').onclick = async () => {
    const v = document.getElementById('kw-input').value.trim();
    if (!v) return;
    await api.addKeywords([v]);
    document.getElementById('kw-input').value = '';
    const list = (await api.getKeywords()).keywords;
    renderKeywords(list);
  };

  document.getElementById('kw-regen').onclick = async () => {
    const box = document.getElementById('kw-suggest');
    box.classList.remove('hidden');
    box.innerHTML = '<div class="hint">AIキーワード候補を生成しています…</div>';
    try {
      const r = await api.regenerateKeywords();
      box.innerHTML = `
        <h3>AI提案キーワード</h3>
        <div class="subhead">追加したいものだけチェックして「追加」を押してください。</div>
        <div class="flex-row gap-8" style="flex-wrap:wrap">
          ${r.suggestions.map((k, i) => `<label class="field inline"><input type="checkbox" data-sg="${escapeHtml(k)}" checked><span>${escapeHtml(k)}</span></label>`).join('')}
        </div>
        <div style="margin-top:10px"><button class="btn primary" id="kw-add-sg">選択した候補を追加</button></div>
      `;
      document.getElementById('kw-add-sg').onclick = async () => {
        const picks = [...box.querySelectorAll('input[type=checkbox]:checked')].map(el => el.dataset.sg);
        if (!picks.length) return;
        await api.addKeywords(picks, 'ai');
        toast(`${picks.length}件を追加しました`);
        box.classList.add('hidden');
        const list = (await api.getKeywords()).keywords;
        renderKeywords(list);
      };
    } catch (e) { box.innerHTML = `<div class="hint">失敗: ${escapeHtml(e.message)}</div>`; }
  };
}

function split(s) { return (s || '').split(/[,、]/).map(x => x.trim()).filter(Boolean); }

function renderKeywords(kws) {
  const box = document.getElementById('kw-list');
  if (!kws.length) { box.innerHTML = '<div class="hint">キーワードがありません</div>'; return; }
  box.innerHTML = `<table class="tbl"><thead><tr><th>キーワード</th><th>ソース</th><th>有効</th><th></th></tr></thead><tbody>
    ${kws.map(k => `<tr>
      <td>${escapeHtml(k.keyword)}</td>
      <td><span class="chip">${escapeHtml(k.source)}</span></td>
      <td><input type="checkbox" ${k.is_active ? 'checked' : ''} data-toggle="${k.id}"></td>
      <td class="num"><button class="btn sm danger" data-del="${k.id}">削除</button></td>
    </tr>`).join('')}
  </tbody></table>`;
  box.querySelectorAll('[data-toggle]').forEach(el => el.onchange = async () => {
    await api.updateKeyword(el.dataset.toggle, { is_active: el.checked });
  });
  box.querySelectorAll('[data-del]').forEach(el => el.onclick = async () => {
    await api.deleteKeyword(el.dataset.del);
    const kws = (await api.getKeywords()).keywords;
    renderKeywords(kws);
  });
}
