// KeywordGenerator: プロフィールからリサーチキーワード候補を生成
// 実API未接続でも動作するよう決定論ルールで生成 (LLMがある場合はそちらに委譲)

import { createAIProvider, safeParseJson } from './AIProvider.js';

const DEFAULT_MODIFIERS = ['仕事', '業務効率化', '自動化', '仕事術', '事例', '初心者', 'やり方', 'コツ', '失敗', '使い方'];

export async function generateKeywords({ mainTopic, subTopics = [], targetAudience }) {
  const provider = createAIProvider();
  const seed = new Set();

  if (mainTopic) {
    seed.add(mainTopic);
    for (const mod of DEFAULT_MODIFIERS) seed.add(`${mainTopic} ${mod}`);
  }
  for (const s of subTopics) {
    if (!s) continue;
    seed.add(s);
    for (const mod of DEFAULT_MODIFIERS.slice(0, 5)) seed.add(`${s} ${mod}`);
  }

  const local = Array.from(seed).slice(0, 20);

  if (!provider.isMock) {
    try {
      const raw = await provider.generateText(
        `以下の発信者プロフィールに合うSNSリサーチキーワードを日本語で15〜20個、JSON配列で返してください。
main_topic: ${mainTopic}
sub_topics: ${subTopics.join(', ')}
target: ${targetAudience || ''}
形式: ["キーワード1","キーワード2"]`
      );
      const parsed = safeParseJson(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { keywords: parsed.map(String), source: 'ai' };
      }
    } catch {}
  }
  return { keywords: local, source: 'ai' };
}
