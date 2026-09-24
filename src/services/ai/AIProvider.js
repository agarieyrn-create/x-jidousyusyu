// AIProvider: LLMプロバイダの差し替え可能な抽象。
// 未設定なら MockAIProvider を返し、DEMO MODE として動作する。

import { MockAIProvider } from './MockAIProvider.js';

/**
 * AIプロバイダのHTTPエラー。message はユーザー向け日本語で、APIキー/レスポンスbodyは含めない。
 * fatal=true (認証・権限・上限) の場合、呼び出し側は再生成リトライをしない。
 */
export class AIProviderError extends Error {
  constructor(status) {
    const s = Number(status);
    let code = 'unknown', message = `AIサービスでエラーが発生しました (status ${s || 'unknown'})。時間をおいて再度お試しください。`, fatal = false;
    if (s === 400) { code = 'bad_request'; message = 'AIサービスへのリクエストが不正です。'; }
    else if (s === 401) { code = 'unauthorized'; message = 'AIサービスの認証に失敗しました。AI_API_KEYの設定を確認してください。'; fatal = true; }
    else if (s === 403) { code = 'forbidden'; message = 'AIサービスへのアクセス権限がありません。プラン/権限を確認してください。'; fatal = true; }
    else if (s === 429) { code = 'rate_limited'; message = 'AIサービスの利用上限に達しました。時間をおいて再度お試しください。'; fatal = true; }
    else if (s >= 500 && s < 600) { code = 'server_error'; message = 'AIサービス側で一時的な障害が発生している可能性があります。しばらく待って再度お試しください。'; }
    else if (!s) { code = 'network_error'; message = 'AIサービスへの接続に失敗しました。ネットワーク状態を確認してください。'; }
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    this.status = s || null;
    this.fatal = fatal;
  }
}

class OpenAIProvider {
  constructor({ apiKey, model }) {
    this.apiKey = apiKey;
    this.model = model || 'gpt-4o-mini';
  }
  async generateText(prompt, opts = {}) {
    let res;
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: opts.temperature ?? 0.7
        })
      });
    } catch {
      throw new AIProviderError(0);
    }
    if (!res.ok) throw new AIProviderError(res.status);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }
  async generateStructuredOutput(prompt, schemaHint, opts = {}) {
    const raw = await this.generateText(
      `${prompt}\n\n必ず有効なJSONのみを返してください。スキーマ: ${JSON.stringify(schemaHint)}`,
      { temperature: opts.temperature ?? 0.4 }
    );
    return safeParseJson(raw);
  }
}

export function safeParseJson(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  // Try to extract JSON block
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

export function createAIProvider() {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  const key = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  if (provider === 'openai' && key) return new OpenAIProvider({ apiKey: key, model });
  return new MockAIProvider();
}
