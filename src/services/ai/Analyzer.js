// Analyzer: 単一投稿の AI 分析ロジック
import { createAIProvider, safeParseJson } from './AIProvider.js';
import { validateAnalysisOutput } from './validators.js';

const ANALYSIS_SCHEMA = {
  summary: 'string',
  topic: 'string',
  target_audience: 'string',
  hook_type: 'string',
  hook: 'string',
  problem: 'string',
  promise: 'string',
  content_structure: 'string[]',
  cta_type: 'string',
  cta: 'string',
  emotion: 'string[]',
  novelty: 'string',
  why_it_may_have_worked: 'string[]',
  reusable_patterns: 'string[]',
  avoid_copying: 'string[]',
  adaptation_direction: 'string[]'
};

function buildPrompt(post) {
  return `# ANALYZE_POST
あなたはSNS投稿の構造解析エキスパートです。
"なぜ伸びたか"は事実として断定せず、必ず"仮説"として扱ってください。
以下の投稿について、指定JSONスキーマの形式で分析結果のみを返してください。

POST_TEXT:
${post.text || ''}

POST_META:
platform: ${post.platform}
likes: ${post.like_count}
reposts: ${post.repost_count}
replies: ${post.reply_count}
follower_count: ${post.follower_count}

制約:
- 元投稿の言い換えではなく"型"を抽出する
- 固有名詞をそのまま再利用しない
- ユーザーが応用できる形の"再利用可能な型"を必ず含める
`;
}

/**
 * @param {object} post
 * @returns {Promise<object|null>} DB保存可能な形にvalidate済みの分析JSON。
 *   validation失敗が2回続いたら null を返す (呼び出し側は保存せずエラー応答)。
 */
export async function analyzePost(post) {
  const provider = createAIProvider();
  const prompt = buildPrompt(post);

  // --- try 1 ---
  let raw = null;
  try {
    raw = await provider.generateStructuredOutput(prompt, ANALYSIS_SCHEMA);
  } catch (e) {
    raw = null;
  }
  let validated = validateAnalysisOutput(raw);
  if (validated.ok) {
    return finalize(validated.value, provider);
  }

  // --- try 2 (1度だけ再生成) ---
  const retryPrompt = prompt +
    '\n\n※前回の出力はスキーマに合いませんでした。必ず有効なJSONオブジェクトのみを返してください。\n' +
    `※各配列フィールド (${['content_structure','emotion','why_it_may_have_worked','reusable_patterns','avoid_copying','adaptation_direction'].join(', ')}) は必ず文字列の配列にしてください。`;
  let raw2 = null;
  try {
    raw2 = await provider.generateStructuredOutput(retryPrompt, ANALYSIS_SCHEMA);
    if (!raw2 || typeof raw2 !== 'object') {
      const textOut = await provider.generateText(retryPrompt);
      raw2 = safeParseJson(textOut);
    }
  } catch {
    raw2 = null;
  }
  const validated2 = validateAnalysisOutput(raw2);
  if (validated2.ok) {
    return finalize(validated2.value, provider);
  }

  // 2連続失敗 → null (呼び出し側で 500 返却)
  return null;
}

function finalize(value, provider) {
  return {
    ...value,
    model: value.model || (provider.isMock ? 'mock-analyzer-v1' : (process.env.AI_MODEL || 'unknown')),
    prompt_version: value.prompt_version || 'v1'
  };
}
