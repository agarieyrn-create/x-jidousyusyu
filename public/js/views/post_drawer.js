import { api } from '../api.js';
import { openDrawer, escapeHtml, fmtNum, relativeTime, toast, closeDrawer } from '../app.js';

export async function renderPostDrawer(postId) {
  const panel = openDrawer('<div>読み込み中…</div>');
  const { post, analysis } = await api.getPost(postId);
  panel.innerHTML = `
    <button class="close" data-close>×</button>
    <div class="drawer-sections">
      <div>
        <h2>元投稿</h2>
        <div class="post-user"><b>${escapeHtml(post.display_name || post.username || '?')}</b> @${escapeHtml(post.username || '?')}</div>
        <div class="hint">${relativeTime(post.published_at)} · <a href="${post.url}" target="_blank" rel="noopener">元投稿を開く ↗</a></div>
        <div class="post-text" style="margin-top:12px;white-space:pre-wrap;font-size:14px;line-height:1.6">${escapeHtml(post.text || '')}</div>
        <div class="post-metrics" style="margin-top:12px">
          <span><b>${fmtNum(post.like_count)}</b>いいね</span>
          <span><b>${fmtNum(post.repost_count)}</b>RP</span>
          <span><b>${fmtNum(post.reply_count)}</b>返信</span>
          <span><b>${fmtNum(post.quote_count)}</b>引用</span>
          <span><b>${fmtNum(post.follower_count)}</b>followers</span>
        </div>
        <div style="margin-top:10px"><span class="trend">Trend Score ${Number(post.trend_score||0).toFixed(1)}</span></div>
        <div class="flex-row" style="margin-top:16px;gap:8px">
          <button class="btn ${post.is_saved ? '' : 'primary'}" id="btn-save">${post.is_saved ? '保存済み ✓' : '保存する'}</button>
          <button class="btn warn" id="btn-analyze">${analysis ? 'AI分析を再表示' : 'AI分析する'}</button>
          <button class="btn primary" id="btn-generate">自分向けに変換 →</button>
        </div>
        <div id="post-status" class="hint" style="margin-top:12px"></div>
      </div>
      <div id="analysis-side">
        <h2>AI分析</h2>
        <div class="hint">Content Research Radar は"伸びた理由"を仮説として提示します。</div>
        <div id="analysis-body" style="margin-top:12px">${analysis ? analysisHTML(analysis) : '<div class="hint">まだAI分析されていません。「AI分析する」を押すと構造・成功要因の仮説・再利用可能な型を抽出します。</div>'}</div>
      </div>
    </div>
    <div id="ideas-out" style="margin-top:24px"></div>
  `;

  document.getElementById('btn-save').onclick = async () => {
    const newSaved = !post.is_saved;
    await api.savePost(postId, newSaved);
    toast(newSaved ? '保存しました' : '保存を解除しました');
    renderPostDrawer(postId);
  };
  document.getElementById('btn-analyze').onclick = async () => {
    const statusEl = document.getElementById('post-status');
    statusEl.textContent = 'AI分析中…';
    try {
      const r = await api.analyzePost(postId);
      document.getElementById('analysis-body').innerHTML = analysisHTML(r.analysis);
      statusEl.textContent = r.cached ? 'キャッシュから表示しました' : 'AI分析完了';
    } catch (e) {
      statusEl.textContent = `AI分析に失敗しました: ${e.message}`;
    }
  };
  document.getElementById('btn-generate').onclick = async () => {
    const out = document.getElementById('ideas-out');
    out.innerHTML = '<div class="hint">「自分向け」アイデアを生成しています…</div>';
    try {
      const r = await api.generateIdeas(postId);
      out.innerHTML = ideasHTML(r.ideas);
      toast(`${r.ideas.length}案のアイデアを保存しました`);
    } catch (e) {
      out.innerHTML = `<div class="hint">アイデア生成失敗: ${escapeHtml(e.message)}</div>`;
    }
  };
}

function analysisHTML(a) {
  return `
    <div class="section-block"><h4>投稿概要</h4><div>${escapeHtml(a.summary || '')}</div></div>
    <div class="section-block"><h4>Topic</h4><div>${escapeHtml(a.topic || '')}</div></div>
    <div class="section-block"><h4>Target</h4><div>${escapeHtml(a.target_audience || '')}</div></div>
    <div class="section-block"><h4>Hook (${escapeHtml(a.hook_type || '')})</h4><div>${escapeHtml(a.hook || '')}</div></div>
    <div class="section-block"><h4>Problem</h4><div>${escapeHtml(a.problem || '')}</div></div>
    <div class="section-block"><h4>Promise</h4><div>${escapeHtml(a.promise || '')}</div></div>
    <div class="section-block"><h4>Structure</h4><ul>${(a.content_structure||[]).map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
    <div class="section-block"><h4>CTA (${escapeHtml(a.cta_type || '')})</h4><div>${escapeHtml(a.cta || '')}</div></div>
    <div class="section-block"><h4>感情</h4><div>${(a.emotion||[]).map(x => `<span class="tag">${escapeHtml(x)}</span>`).join('')}</div></div>
    <div class="section-block"><h4>成功要因の仮説</h4><ul>${(a.why_it_may_have_worked||[]).map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
    <div class="section-block"><h4>再利用可能な型</h4><ul>${(a.reusable_patterns||[]).map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
    <div class="section-block"><h4>真似しない方がいい部分</h4><ul>${(a.avoid_copying||[]).map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
    <div class="section-block"><h4>自分の発信への応用方法</h4><ul>${(a.adaptation_direction||[]).map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
  `;
}

function ideasHTML(ideas) {
  if (!ideas || ideas.length === 0) return '<div class="hint">生成に失敗しました。もう一度お試しください。</div>';
  return `<h2 style="margin-top:0">生成されたアイデア (${ideas.length}案)</h2>` + ideas.map(i => `
    <div class="idea-card">
      <div class="idea-meta">狙い: ${escapeHtml(i.objective || '-')} / ターゲット: ${escapeHtml(i.target || '-')}</div>
      <h3>${escapeHtml(i.title || '')}</h3>
      <div class="idea-hook"><b>Hook:</b> ${escapeHtml(i.hook || '')}</div>
      <div><b>切り口:</b> ${escapeHtml(i.angle || '')}</div>
      <div style="margin-top:8px"><b>構成:</b><ol>${(i.structure||[]).map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol></div>
      <div class="exp-needed">
        <b>あなた自身の経験を入れる場所:</b>
        <ul>${(i.personal_experience_needed||[]).map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
      </div>
      <div class="hint" style="margin-top:8px">Ideas 画面 (Inbox) に保存されました</div>
    </div>
  `).join('');
}
