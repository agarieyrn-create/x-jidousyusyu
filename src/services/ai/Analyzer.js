// Analyzer: 単一投稿の AI 分析ロジック
import { createAIProvider, safeParseJson } from './AIProvider.js';

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

export async function analyzePost(post) {
  const provider = createAIProvider();
  const prompt = `# ANALYZE_POST
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

  let parsed;
  try {
    parsed = await provider.generateStructuredOutput(prompt, ANALYSIS_SCHEMA);
  } catch (e) {
    parsed = null;
  }

  if (!parsed || typeof parsed !== 'object') {
    // 1回だけ自動修復トライ
    try {
      const raw = await provider.generateText(prompt + '\n\n※出力はJSONオブジェクトのみ');
      parsed = safeParseJson(raw);
    } catch {}
  }
  if (!parsed) return null;

  // Guarantee array fields exist
  const arrayFields = ['content_structure','emotion','why_it_may_have_worked','reusable_patterns','avoid_copying','adaptation_direction'];
  for (const f of arrayFields) if (!Array.isArray(parsed[f])) parsed[f] = parsed[f] ? [String(parsed[f])] : [];

  parsed.model = parsed.model || (provider.isMock ? 'mock-analyzer-v1' : (process.env.AI_MODEL || 'unknown'));
  parsed.prompt_version = 'v1';
  return parsed;
}
