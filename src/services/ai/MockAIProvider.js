// MockAIProvider: DEMO MODE 用。決定論的にそれっぽい分析結果を返す。
// 実LLMが未設定でも UX を完成させるための擬似応答生成。

const HOOK_TYPES = ['問題提起', '常識否定', '数字', '失敗談', '実績', 'ニュース', '意外性', '質問', 'Before/After', '知らないと損'];
const EMOTIONS = ['共感', '驚き', '焦り', '納得', '希望', '発見'];

function pickBy(str, arr) {
  const h = hash(str);
  return arr[h % arr.length];
}
function hash(s) {
  let h = 0;
  for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function detectHook(text) {
  if (!text) return { type: '意外性', hook: '' };
  const t = text.trim();
  const firstLine = t.split(/[\n。！!？?]/)[0].slice(0, 60);
  if (/[0-9０-９]/.test(firstLine)) return { type: '数字', hook: firstLine };
  if (/失敗|しくじり|やらかし/.test(firstLine)) return { type: '失敗談', hook: firstLine };
  if (/嘘|誤解|実は|意外/.test(firstLine)) return { type: '常識否定', hook: firstLine };
  if (/知らない|損/.test(firstLine)) return { type: '知らないと損', hook: firstLine };
  if (/[?？]$/.test(firstLine)) return { type: '質問', hook: firstLine };
  if (/結論|コツ|方法/.test(firstLine)) return { type: '問題提起', hook: firstLine };
  return { type: '問題提起', hook: firstLine };
}

function detectCta(text) {
  if (!text) return { type: 'なし', cta: '' };
  if (/公開|マニュアル|note|リンク|URL|プロフ/.test(text)) return { type: 'リンク誘導', cta: '詳細/マニュアルへ誘導' };
  if (/試して|やって/.test(text)) return { type: '行動促し', cta: '実際に試すよう促す' };
  if (/🧵|続く|続きます/.test(text)) return { type: 'スレッド続き', cta: 'スレッド展開' };
  return { type: '示唆のみ', cta: '直接的な誘導はなし' };
}

export class MockAIProvider {
  isMock = true;

  async generateText(prompt) {
    return `【MOCK出力】\n${prompt.slice(0, 80)}...`;
  }

  async generateStructuredOutput(prompt, schemaHint) {
    // 単純にpromptからJSONを組み立てる (post分析 or idea生成の2種類を判定)
    if (/IDEA_GENERATION/i.test(prompt)) return this.generateIdea(prompt);
    if (/ANALYZE_POST/i.test(prompt)) return this.generateAnalysis(prompt);
    return {};
  }

  generateAnalysis(prompt) {
    const textMatch = prompt.match(/POST_TEXT:([\s\S]*?)(?:POST_META|$)/);
    const text = textMatch ? textMatch[1].trim() : '';
    const hook = detectHook(text);
    const cta = detectCta(text);
    const topic = pickBy(text, [
      'AI × 業務効率化', 'ChatGPT活用', 'AIエージェント',
      'ノーコード自動化', '非エンジニア向けAI', 'AI×キャリア'
    ]);
    return {
      summary: text.slice(0, 100).replace(/\s+/g, ' ') + (text.length > 100 ? '…' : ''),
      topic,
      target_audience: pickBy(text + '_ta', [
        'AIをこれから業務に取り入れたい会社員',
        'AIツールを試したが定着していない個人事業主',
        '非エンジニアでAI自動化を作りたい人',
        'AIで残業削減したい管理職'
      ]),
      hook_type: hook.type,
      hook: hook.hook,
      problem: '既にAIツールを使っているが、成果に繋がっていない状態',
      promise: '具体的な"型"や順序を知れば再現できる、という提示',
      content_structure: [
        '共感 or 意外な事実',
        '原因の指摘',
        '具体的な手順/事例',
        '示唆で締め'
      ],
      cta_type: cta.type,
      cta: cta.cta,
      emotion: [pickBy(text + '_e1', EMOTIONS), pickBy(text + '_e2', EMOTIONS)],
      novelty: 'ありがちなノウハウを"逆説"や"順序"で切り直している点',
      why_it_may_have_worked: [
        '冒頭で読者の期待値を裏切っている(仮説)',
        '数値または具体事例で説得力を持たせている(仮説)',
        '読者が自分の状況に置き換えやすい主語で書かれている(仮説)'
      ],
      reusable_patterns: [
        '「A ではなく B」の逆説フレーム',
        '"3つの理由/3つの型"のような列挙数字',
        '"最初にやるべきは○○"型の断定Hook'
      ],
      avoid_copying: [
        '固有名(この投稿の会社名/ツール名)をそのまま流用しない',
        '同じ言い回しの文構造をコピーしない'
      ],
      adaptation_direction: [
        'このパターンを、あなたのジャンル「AI活用・業務効率化」向けに、"読者の1日の業務"を主語にして書き換える',
        '数字は自分の実データに置き換える',
        '結論を"あなた自身の失敗や試行錯誤"の言葉で締める'
      ],
      model: 'mock-analyzer-v1',
      prompt_version: 'v1'
    };
  }

  generateIdea(prompt) {
    const textMatch = prompt.match(/POST_TEXT:([\s\S]*?)(?:USER_PROFILE|$)/);
    const text = textMatch ? textMatch[1].trim().slice(0, 60) : '';
    const seed = hash(text);
    const base = [
      {
        title: 'AIを使っているのに残業が減らない人に共通する3つのこと',
        objective: '認知獲得 + note誘導',
        target: 'AIを試したが業務に定着していない会社員',
        hook: '「AIで残業ゼロ」は嘘です。でも"残業の理由の可視化"はガチで効きます。',
        angle: '"AIを使うか使わないか"ではなく"AIに投げるタスクを言語化できるか"に切り分ける視点',
        structure: ['読者の期待値をずらすHook', '"共通点は3つ"と宣言', '3つを短く提示', '1つずつ実例', '自分の体験からの示唆', 'note誘導CTA'],
        key_points: [
          'AI活用の成果は"タスクの言語化能力"に依存する',
          '同じツールでも成果は使う人の準備で決まる',
          'まず"AIに投げる仕事の棚卸し"から始める'
        ],
        personal_experience_needed: [
          'あなたが実際にAIで削減できた業務時間(具体数値)',
          '導入初日にうまくいかなかった失敗エピソード',
          'クライアント or 同僚の反応で印象的だったもの'
        ],
        reference_patterns: ['「A ではなく B」の逆説', '"3つ列挙"の型', '失敗談→示唆で締める']
      },
      {
        title: '非エンジニアがAIエージェントを"自作"するときに最初にやるべき1つのこと',
        objective: 'フォロワー増加',
        target: '非エンジニアで自動化ツールを作りたい人',
        hook: '実はLangChainもDifyも要りません。最初にやるべきは"1つの業務の紙分解"です。',
        angle: 'ツール選定より"業務の言語化"が9割という切り口',
        structure: ['意外性Hook', '一般論の否定', '正解の提示', '手順を短く', '実例', '行動促しCTA'],
        key_points: [
          'エージェント自作はツール選定ゲームではない',
          '紙で業務フローを書けない業務はAI化しても失敗する',
          'まず1業務、30分単位の分解から始める'
        ],
        personal_experience_needed: [
          '自分が最初に自動化した1業務の元フロー',
          'その業務が「AIに向いていた/向いてなかった」判断基準',
          '所要時間のBefore/After'
        ],
        reference_patterns: ['"最初にやるべきは○○"の断定Hook', '"実は要らない"型の常識否定']
      },
      {
        title: 'ChatGPTに"仕事を丸投げ"して失敗する人がハマる、たった1つの手順ミス',
        objective: 'ブランディング',
        target: 'ChatGPT課金勢だが業務改善が進まない層',
        hook: 'ChatGPTがうまく使えない人の共通点は「本文から書かせている」ことです。',
        angle: '本文生成の前に"読者の悩み分解"を挟むという工程順の話',
        structure: ['断定Hook', '共感パート', '正しい順序を提示', '実演', '示唆で締め'],
        key_points: [
          'AI活用は工程順で決まる',
          '"AIが下手"より"投げ方が下手"の方が多い',
          '前工程を丁寧にやるとAI精度は跳ねる'
        ],
        personal_experience_needed: [
          'あなたが工程を変えて精度が上がった実例',
          'ダメだった頃のプロンプトと今のプロンプトの違い',
          '結果として時短できた時間'
        ],
        reference_patterns: ['共通点=1つに絞る型', '"手順ミス"を主語にする書き方']
      }
    ];
    // Rotate seed
    return { ideas: [base[seed % 3], base[(seed + 1) % 3], base[(seed + 2) % 3]] };
  }
}
