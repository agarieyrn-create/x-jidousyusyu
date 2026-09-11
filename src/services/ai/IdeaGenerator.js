// IdeaGenerator: 投稿+分析+ユーザープロフィールから「自分向けアイデア3案」を生成
// コピー防止ルールを必ずプロンプトに含める。
// validate 失敗時は1度だけ再生成。それでもダメなら空を返す (呼び出し側はDBに保存しない)。

import { createAIProvider, safeParseJson } from './AIProvider.js';
import { validateIdeasOutput } from './validators.js';

function similarity(a, b) {
  // 単純な文字bigram Jaccard
  const toBi = s => new Set([...String(s || '')].map((_, i, arr) => arr.slice(i, i + 2).join('')).filter(x => x.length === 2));
  const A = toBi(a), B = toBi(b);
  const inter = new Set([...A].filter(x => B.has(x))).size;
  const union = new Set([...A, ...B]).size || 1;
  return inter / union;
}

function buildPrompt({ post, analysis, profile, schemaHint }) {
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

必ず3案。JSONのみで返してください。スキーマ: ${JSON.stringify(schemaHint)}`;
}

export async function generateIdeas({ post, analysis, profile }) {
  const provider = createAIProvider();
  const schemaHint = {
    ideas: [{
      title: 'string', objective: 'string', target: 'string', hook: 'string', angle: 'string',
      structure: 'string[]', key_points: 'string[]', personal_experience_needed: 'string[]', reference_patterns: 'string[]'
    }]
  };
  const prompt = buildPrompt({ post, analysis, profile, schemaHint });

  // --- try 1 ---
  let raw = null;
  try {
    raw = await provider.generateStructuredOutput(prompt, schemaHint);
  } catch { raw = null; }
  let validated = validateIdeasOutput(raw);

  if (!validated.ok) {
    // --- try 2 (1度だけ再生成) ---
    const retryPrompt = prompt + '\n\n※前回の出力はスキーマに合いませんでした。必ず有効なJSONのみを返してください。ideas は必ず配列で、各要素の personal_experience_needed は必ず埋めてください。';
    let raw2 = null;
    try {
      raw2 = await provider.generateStructuredOutput(retryPrompt, schemaHint);
      if (!raw2) {
        const textOut = await provider.generateText(retryPrompt);
        raw2 = safeParseJson(textOut);
      }
    } catch { raw2 = null; }
    validated = validateIdeasOutput(raw2);
  }

  if (!validated.ok) {
    return { ideas: [], error: 'AI生成に失敗しました', validation_errors: validated.errors };
  }

  // コピー防止フィルタ: 元投稿と類似度が高すぎるものを弾く
  const filtered = validated.value.ideas.filter(idea => {
    const combined = `${idea.title} ${idea.hook} ${idea.angle}`;
    return similarity(combined, post.text) < 0.55;
  });

  return { ideas: filtered.length >= 1 ? filtered : validated.value.ideas };
}
