// AIレスポンスの runtime validator。
// Zodは導入せず、依存を増やさないため軽量に自前で書く。
// 目的: LLMからのJSONを DB に保存する前に必ずここを通すこと。

function isString(v) { return typeof v === 'string'; }
function isStringArray(v) { return Array.isArray(v) && v.every(x => typeof x === 'string'); }

/**
 * Analyzer.js が返す分析JSONを検証する。
 * 全 string / string[] フィールドの型を保証する。
 * 欠落値は空文字/空配列に補正して返す (ここで補正することで DB.insert が落ちない)。
 * @returns {{ok:boolean, value?:object, errors?:string[]}}
 */
export function validateAnalysisOutput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['analysis is not an object'] };
  }
  const stringFields = ['summary', 'topic', 'target_audience', 'hook_type', 'hook',
    'problem', 'promise', 'cta_type', 'cta', 'novelty'];
  const arrayFields = ['content_structure', 'emotion',
    'why_it_may_have_worked', 'reusable_patterns', 'avoid_copying', 'adaptation_direction'];

  const errors = [];
  const out = {};
  for (const f of stringFields) {
    if (raw[f] === undefined || raw[f] === null) { out[f] = ''; continue; }
    if (!isString(raw[f])) { errors.push(`${f} must be string`); continue; }
    out[f] = raw[f];
  }
  for (const f of arrayFields) {
    if (raw[f] === undefined || raw[f] === null) { out[f] = []; continue; }
    if (Array.isArray(raw[f])) {
      // 全要素stringに強制
      if (!raw[f].every(x => typeof x === 'string')) {
        // string以外の要素は String() 化して救済 (完全に落とさない)
        out[f] = raw[f].map(x => (typeof x === 'string') ? x : String(x));
      } else {
        out[f] = raw[f];
      }
    } else if (typeof raw[f] === 'string') {
      // 単一の文字列で来た場合は 1要素配列にする
      out[f] = [raw[f]];
    } else {
      errors.push(`${f} must be string[]`);
    }
  }
  // 最低限: summary が空・reusable_patterns が空すぎるものは失敗扱いにする
  if (!out.summary || out.reusable_patterns.length === 0) {
    errors.push('summary / reusable_patterns are required');
  }
  if (errors.length > 0) return { ok: false, errors };
  // オプショナル passthrough (model / prompt_version)
  if (isString(raw.model)) out.model = raw.model;
  if (isString(raw.prompt_version)) out.prompt_version = raw.prompt_version;
  return { ok: true, value: out };
}

/**
 * IdeaGenerator.js が返すアイデア群JSONを検証する。
 * ideas は必須 array、各要素の必須フィールド型もチェックする。
 * @returns {{ok:boolean, value?:{ideas:Array<object>}, errors?:string[]}}
 */
export function validateIdeasOutput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['ideas payload is not an object'] };
  }
  if (!Array.isArray(raw.ideas)) return { ok: false, errors: ['ideas must be an array'] };
  if (raw.ideas.length === 0) return { ok: false, errors: ['ideas must not be empty'] };

  const stringFields = ['title', 'objective', 'target', 'hook', 'angle'];
  const arrayFields = ['structure', 'key_points', 'personal_experience_needed', 'reference_patterns'];

  const errors = [];
  const cleanedIdeas = [];
  raw.ideas.forEach((idea, i) => {
    if (!idea || typeof idea !== 'object' || Array.isArray(idea)) {
      errors.push(`ideas[${i}] must be object`);
      return;
    }
    const o = {};
    for (const f of stringFields) {
      if (idea[f] === undefined || idea[f] === null) { o[f] = ''; continue; }
      if (!isString(idea[f])) { errors.push(`ideas[${i}].${f} must be string`); continue; }
      o[f] = idea[f];
    }
    for (const f of arrayFields) {
      if (idea[f] === undefined || idea[f] === null) { o[f] = []; continue; }
      if (Array.isArray(idea[f])) {
        o[f] = idea[f].map(x => (typeof x === 'string') ? x : String(x));
      } else if (typeof idea[f] === 'string') {
        o[f] = [idea[f]];
      } else {
        errors.push(`ideas[${i}].${f} must be string[]`);
      }
    }
    // 必須: title と personal_experience_needed(空でない) は最低限
    if (!o.title) errors.push(`ideas[${i}].title is required`);
    if (!Array.isArray(o.personal_experience_needed) || o.personal_experience_needed.length === 0) {
      errors.push(`ideas[${i}].personal_experience_needed must be non-empty`);
    }
    cleanedIdeas.push(o);
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { ideas: cleanedIdeas } };
}
