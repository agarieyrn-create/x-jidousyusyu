// AIProvider: LLMプロバイダの差し替え可能な抽象。
// 未設定なら MockAIProvider を返し、DEMO MODE として動作する。

import { MockAIProvider } from './MockAIProvider.js';

class OpenAIProvider {
  constructor({ apiKey, model }) {
    this.apiKey = apiKey;
    this.model = model || 'gpt-4o-mini';
  }
  async generateText(prompt, opts = {}) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: opts.temperature ?? 0.7
      })
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
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
