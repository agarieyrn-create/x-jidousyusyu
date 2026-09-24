// IdeaGenerator: 投稿+分析+ユーザープロフィールから「自分向けアイデア3案」を生成
//
// 契約 (2回目の修正 2026-09-11):
//  - 最終返却の ideas は必ず3件以上 (IDEAS_MIN_COUNT)。
//  - 元投稿とのコピー類似度が閾値 (COPY_SIM_THRESHOLD) 以上の案は必ず不採用。
//    「全部NGなら fallback で復活させる」動作は禁止する。
//  - 類似度フィルタ後に3件に満たなければ、1度だけ追加再生成して補完する。
//  - それでも3件揃わなければ ideas:[] で返し、呼び出し側は DB 保存せず 500 応答。

import { createAIProvider, safeParseJson } from './AIProvider.js';
import { validateIdeasOutput, IDEAS_MIN_COUNT } from './validators.js';

const COPY_SIM_THRESHOLD = 0.55;
// アイデア同士の近似重複判定 (hookだけ違う・言い回し違いの同一案を弾く)
const IDEA_DUP_THRESHOLD = 0.6;

function similarity(a, b) {
  // 単純な文字bigram Jaccard
  const toBi = s => new Set([...String(s || '')].map((_, i, arr) => arr.slice(i, i + 2).join('')).filter(x => x.length === 2));
  const A = toBi(a), B = toBi(b);
  const inter = new Set([...A].filter(x => B.has(x))).size;
  const union = new Set([...A, ...B]).size || 1;
  return inter / union;
}

function isTooSimilar(idea, postText) {
  const combined = `${idea.title || ''} ${idea.hook || ''} ${idea.angle || ''}`;
  return similarity(combined, postText) >= COPY_SIM_THRESHOLD;
}

function ideaText(idea) {
  return `${idea.title || ''} ${idea.hook || ''}`;
}

// 既に採用済みの案と、完全一致または近似(類似度>=IDEA_DUP_THRESHOLD)なら重複
export function isDuplicateIdea(idea, accepted) {
  const t = ideaText(idea).trim();
  return accepted.some(a => {
    const u = ideaText(a).trim();
    return t === u || similarity(t, u) >= IDEA_DUP_THRESHOLD;
  });
}

function buildPrompt({ post, analysis, profile, schemaHint, extraNote }) {
  return `# IDEA_GENERATION
あなたはSNSコンテンツ設計の伴走者です。目的は「元投稿のコピー」ではなく、
"成功パターンを抽象化し、ユーザーのジャンル向けに変換した新規アイデア"を作ることです。

厳守ルール:
- 元投稿の言い回しをそのまま流用してはならない
- 固有名詞をそのまま流用してはならない
- 元投稿と近すぎる文構造は避ける
- 抽象化した"型"を使い、ユーザー独自の経験を必ず埋める設計にする
- 新しい視点/切り口を最低1つ加える
- 各アイデアには "personal_experience_needed" を必ず埋める

POST_TEXT:
${post.text || ''}

POST_META: platform=${post.platform} likes=${post.like_count} reposts=${post.repost_count}

ANALYSIS: ${JSON.stringify(analysis || {}, null, 2)}

USER_PROFILE:
main_topic: ${profile?.main_topic || ''}
sub_topics: ${(profile?.sub_topics || []).join(', ')}
target: ${profile?.target_audience || ''}
objectives: ${(profile?.objectives || []).join(', ')}
writing_style: ${profile?.writing_style || ''}
excluded_topics: ${(profile?.excluded_topics || []).join(', ')}
${extraNote ? '\n' + extraNote + '\n' : ''}
必ず${IDEAS_MIN_COUNT}案以上。JSONのみで返してください。スキーマ: ${JSON.stringify(schemaHint)}`;
}

async function requestIdeas(provider, prompt, schemaHint) {
  let raw = null;
  try {
    raw = await provider.generateStructuredOutput(prompt, schemaHint);
  } catch (e) { if (e?.fatal) throw e; raw = null; }
  if (!raw) {
    try {
      const textOut = await provider.generateText(prompt);
      raw = safeParseJson(textOut);
    } catch (e) { if (e?.fatal) throw e; raw = null; }
  }
  return raw;
}

export { similarity };

export async function generateIdeas({ post, analysis, profile }) {
  const provider = createAIProvider();
  const schemaHint = {
    ideas: [{
      title: 'string', objective: 'string', target: 'string', hook: 'string', angle: 'string',
      structure: 'string[]', key_points: 'string[]', personal_experience_needed: 'string[]', reference_patterns: 'string[]'
    }]
  };

  // --- 1回目: 通常生成 ---
  const prompt1 = buildPrompt({ post, analysis, profile, schemaHint });
  const raw1 = await requestIdeas(provider, prompt1, schemaHint);
  const validated1 = validateIdeasOutput(raw1);

  let acceptedIdeas = [];
  if (validated1.ok) {
    for (const idea of validated1.value.ideas) {
      if (isTooSimilar(idea, post.text)) continue;   // コピー類似度NG → 必ず不採用 (fallback復活しない)
      if (isDuplicateIdea(idea, acceptedIdeas)) continue;
      acceptedIdeas.push(idea);
    }
  }

  // --- 3件に満たなければ 1度だけ追加再生成 ---
  if (acceptedIdeas.length < IDEAS_MIN_COUNT) {
    const need = IDEAS_MIN_COUNT - acceptedIdeas.length;
    const extraNote = `※前回の出力は使えませんでした。以下のいずれかに該当した可能性があります:
- スキーマに合っていない
- 元投稿と表現が近すぎる (bigram類似度 >= ${COPY_SIM_THRESHOLD})
- ${IDEAS_MIN_COUNT}案未満だった
必ず${IDEAS_MIN_COUNT}案以上、"元投稿とは異なる表現・切り口"で返してください。
以下の hook はすでに採用済みなので絶対に重複させないでください:
${acceptedIdeas.map((i, k) => `${k + 1}. ${i.hook}`).join('\n') || '(なし)'}
今回は特に、これらとは異なる ${need} 案以上を出してください。`;
    const prompt2 = buildPrompt({ post, analysis, profile, schemaHint, extraNote });
    const raw2 = await requestIdeas(provider, prompt2, schemaHint);
    const validated2 = validateIdeasOutput(raw2);
    if (validated2.ok) {
      for (const idea of validated2.value.ideas) {
        if (isTooSimilar(idea, post.text)) continue;
        if (isDuplicateIdea(idea, acceptedIdeas)) continue;
        acceptedIdeas.push(idea);
        if (acceptedIdeas.length >= IDEAS_MIN_COUNT) break;
      }
    }
  }

  if (acceptedIdeas.length < IDEAS_MIN_COUNT) {
    // 3案に満たなければ「中途半端に保存させない」。呼び出し側は500応答へ。
    return {
      ideas: [],
      error: `アイデア生成に失敗しました (${IDEAS_MIN_COUNT}案を確保できず、${acceptedIdeas.length}案に留まりました)`
    };
  }

  return { ideas: acceptedIdeas.slice(0, Math.max(IDEAS_MIN_COUNT, acceptedIdeas.length)) };
}
