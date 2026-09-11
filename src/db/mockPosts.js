// 30+ mock SNS posts. Timings/followers/engagement are intentionally uneven
// so "likes-only" ranking and Trend Score ranking diverge.

function hoursAgo(h) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

export const MOCK_POSTS = [
  {
    external_post_id: 'demo_001',
    author_id: 'u_1001', username: 'ai_yamada', display_name: 'AI活用のヤマダ',
    text: 'ChatGPTを使い倒して1年。結局伸びたのは"仕事の型化"に使った人だけでした。プロンプトを覚えるより、自分の仕事の手順を分解する方が10倍効きます。',
    url: 'https://x.com/ai_yamada/status/demo_001',
    published_at: hoursAgo(6),
    like_count: 4820, repost_count: 612, reply_count: 88, quote_count: 41,
    follower_count: 42000, source_keyword: 'ChatGPT 仕事', has_media: false
  },
  {
    external_post_id: 'demo_002',
    author_id: 'u_2001', username: 'sme_ai', display_name: '中小企業AI導入ラボ',
    text: '【失敗談】社内にChatGPTを導入した初日、上司が「これで残業ゼロだな」と言い出しました。3ヶ月経った今、残業は逆に増えました。理由は3つあります。',
    url: 'https://x.com/sme_ai/status/demo_002',
    published_at: hoursAgo(20),
    like_count: 6210, repost_count: 980, reply_count: 145, quote_count: 78,
    follower_count: 128000, source_keyword: 'ChatGPT 仕事', has_media: false
  },
  {
    external_post_id: 'demo_003',
    author_id: 'u_1003', username: 'nocode_taro', display_name: 'ノーコードたろう',
    text: 'n8nで「Gmail→ChatGPT要約→Slack通知」を自作したら、朝のメール確認が15分→2分になりました。ノーコードで組めるので、非エンジニアでも十分再現できます。',
    url: 'https://x.com/nocode_taro/status/demo_003',
    published_at: hoursAgo(3),
    like_count: 1245, repost_count: 320, reply_count: 55, quote_count: 22,
    follower_count: 9800, source_keyword: 'n8n', has_media: true
  },
  {
    external_post_id: 'demo_004',
    author_id: 'u_1002', username: 'gyoumu_ai', display_name: '業務改善AIラボ',
    text: 'GASとChatGPTを組み合わせるだけで、月20時間の作業が消えました。使ったのは"シート内容を要約→自動で日報作成"というたった1つの仕組みです。',
    url: 'https://x.com/gyoumu_ai/status/demo_004',
    published_at: hoursAgo(30),
    like_count: 3210, repost_count: 410, reply_count: 60, quote_count: 30,
    follower_count: 18500, source_keyword: 'GAS AI', has_media: false
  },
  {
    external_post_id: 'demo_005',
    author_id: 'u_3001', username: 'ai_starter', display_name: 'AI初心者応援チャンネル',
    text: 'AI初心者が最初にやるべきこと、実は「プロンプト勉強」ではありません。自分の1日の作業を30分単位で書き出すことです。ここが7割です。',
    url: 'https://x.com/ai_starter/status/demo_005',
    published_at: hoursAgo(12),
    like_count: 2890, repost_count: 320, reply_count: 47, quote_count: 18,
    follower_count: 25000, source_keyword: 'AI 仕事術', has_media: false
  },
  {
    external_post_id: 'demo_006',
    author_id: 'u_4001', username: 'kigyoka_ai', display_name: '起業家のAI活用',
    text: '1人会社をやっていますが、最近は「経理・請求書・議事録・SNS下書き」までChatGPTに任せています。人を雇う前にAIを雇う、が今の正解だと思います。',
    url: 'https://x.com/kigyoka_ai/status/demo_006',
    published_at: hoursAgo(48),
    like_count: 5420, repost_count: 720, reply_count: 120, quote_count: 65,
    follower_count: 95000, source_keyword: 'AI 業務効率化', has_media: false
  },
  {
    external_post_id: 'demo_007',
    author_id: 'u_5001', username: 'promptmaster', display_name: 'プロンプト職人',
    text: '意外と知られていないですが、ChatGPTに「あなたは○○です」より「まず質問を返してください」と書く方が、精度が上がります。試しに1回やってみてください。',
    url: 'https://x.com/promptmaster/status/demo_007',
    published_at: hoursAgo(2),
    like_count: 980, repost_count: 210, reply_count: 30, quote_count: 15,
    follower_count: 12000, source_keyword: 'ChatGPT 仕事', has_media: false
  },
  {
    external_post_id: 'demo_008',
    author_id: 'u_6001', username: 'saas_review', display_name: 'AI SaaS Watch',
    text: '2026年、AIエージェントで実務に使えるのは結局3種類だけです。①メール自動処理②議事録要約③日報生成。派手なやつより、地味な繰り返し作業に効きます。',
    url: 'https://x.com/saas_review/status/demo_008',
    published_at: hoursAgo(72),
    like_count: 8120, repost_count: 1420, reply_count: 210, quote_count: 130,
    follower_count: 260000, source_keyword: 'AI エージェント', has_media: false
  },
  {
    external_post_id: 'demo_009',
    author_id: 'u_7001', username: 'freelance_ai', display_name: 'フリーランスAI活用',
    text: 'フリーランス4年目。AIを入れて一番変わったのは「返信の速さ」でした。1件30分の見積り返信が5分に。案件が2倍取れるようになりました。',
    url: 'https://x.com/freelance_ai/status/demo_009',
    published_at: hoursAgo(18),
    like_count: 2145, repost_count: 240, reply_count: 35, quote_count: 12,
    follower_count: 14000, source_keyword: 'AI 仕事術', has_media: false
  },
  {
    external_post_id: 'demo_010',
    author_id: 'u_8001', username: 'excel_ai', display_name: 'Excel×AI研究所',
    text: 'Excelで「A列の内容を英訳→B列に貼り付け」がChatGPT APIを使えばボタン1つで終わります。GASで実装、100行未満です。マニュアル公開しました。',
    url: 'https://x.com/excel_ai/status/demo_010',
    published_at: hoursAgo(4),
    like_count: 1650, repost_count: 380, reply_count: 42, quote_count: 20,
    follower_count: 22000, source_keyword: 'GAS AI', has_media: true
  },
  {
    external_post_id: 'demo_011',
    author_id: 'u_9001', username: 'startup_dev', display_name: 'スタートアップ開発ログ',
    text: '個人開発で作ったAIアプリが月10万円に。売れた理由は「機能」ではなく「特定の職種の1つの悩みだけを解決した」ことです。汎用ツールほど売れません。',
    url: 'https://x.com/startup_dev/status/demo_011',
    published_at: hoursAgo(24),
    like_count: 4210, repost_count: 520, reply_count: 88, quote_count: 45,
    follower_count: 68000, source_keyword: 'AIアプリ', has_media: false
  },
  {
    external_post_id: 'demo_012',
    author_id: 'u_1001', username: 'ai_yamada', display_name: 'AI活用のヤマダ',
    text: '毎朝ChatGPTに「今日のニュース3つ+それが自分の仕事に与える影響」を出してもらっています。5分で情報収集が終わります。プロンプトは固定でOK。',
    url: 'https://x.com/ai_yamada/status/demo_012',
    published_at: hoursAgo(10),
    like_count: 3120, repost_count: 410, reply_count: 55, quote_count: 24,
    follower_count: 42000, source_keyword: 'ChatGPT 仕事', has_media: false
  },
  {
    external_post_id: 'demo_013',
    author_id: 'u_10001', username: 'sales_ai', display_name: '営業のAI活用',
    text: '営業でAIを使う人が"意外とやってない"のが、商談後の議事録を「顧客が使う言葉」に整えることです。ここを直すと成約率が上がります。',
    url: 'https://x.com/sales_ai/status/demo_013',
    published_at: hoursAgo(36),
    like_count: 2890, repost_count: 260, reply_count: 40, quote_count: 18,
    follower_count: 33000, source_keyword: 'AI 仕事術', has_media: false
  },
  {
    external_post_id: 'demo_014',
    author_id: 'u_11001', username: 'nonengineer_ai', display_name: '非エンジニアのAI',
    text: '非エンジニアがAIアプリを作るのに一番向いているのはNotion+GAS+ChatGPTでした。ノーコードSaaSより早く動きます。作例5つ紹介します🧵',
    url: 'https://x.com/nonengineer_ai/status/demo_014',
    published_at: hoursAgo(8),
    like_count: 2410, repost_count: 480, reply_count: 65, quote_count: 30,
    follower_count: 18000, source_keyword: '非エンジニア AI', has_media: false
  },
  {
    external_post_id: 'demo_015',
    author_id: 'u_1002', username: 'gyoumu_ai', display_name: '業務改善AIラボ',
    text: '"AIで残業ゼロ"は嘘ですが、"AIで残業の理由が可視化"は本当でした。残業ログをChatGPTに読ませたら、原因は会議でも作業でもなく「意思決定待ち」でした。',
    url: 'https://x.com/gyoumu_ai/status/demo_015',
    published_at: hoursAgo(52),
    like_count: 4620, repost_count: 610, reply_count: 90, quote_count: 42,
    follower_count: 18500, source_keyword: 'AI 業務効率化', has_media: false
  },
  {
    external_post_id: 'demo_016',
    author_id: 'u_12001', username: 'writer_ai', display_name: 'AI×ライティング',
    text: 'AIに文章を書かせるのが下手な人の共通点は「最初から本文を書かせる」ことです。まず"読者の悩みリスト"を出させてください。ここで9割決まります。',
    url: 'https://x.com/writer_ai/status/demo_016',
    published_at: hoursAgo(5),
    like_count: 1520, repost_count: 220, reply_count: 30, quote_count: 12,
    follower_count: 15000, source_keyword: 'ChatGPT 仕事', has_media: false
  },
  {
    external_post_id: 'demo_017',
    author_id: 'u_13001', username: 'enterprise_ai', display_name: 'エンタープライズAI',
    text: '大企業でAIが定着しない理由TOP3。①現場が触れない②失敗が許されない③管理職が使わない。技術より組織の問題です。',
    url: 'https://x.com/enterprise_ai/status/demo_017',
    published_at: hoursAgo(60),
    like_count: 3980, repost_count: 520, reply_count: 78, quote_count: 35,
    follower_count: 88000, source_keyword: 'AI 業務効率化', has_media: false
  },
  {
    external_post_id: 'demo_018',
    author_id: 'u_1003', username: 'nocode_taro', display_name: 'ノーコードたろう',
    text: 'n8nは「AIの配管工事」だと思って触るとハマります。個々のAIは優秀でも、繋がないと業務にならない。この視点を持つと世界が変わります。',
    url: 'https://x.com/nocode_taro/status/demo_018',
    published_at: hoursAgo(14),
    like_count: 1820, repost_count: 260, reply_count: 40, quote_count: 22,
    follower_count: 9800, source_keyword: 'n8n', has_media: false
  },
  {
    external_post_id: 'demo_019',
    author_id: 'u_14001', username: 'career_ai', display_name: 'キャリアとAI',
    text: '20代のAI活用が上手い人は「まずAIに自分の悩みを話す」から始めています。作業効率化はあとから。順番が逆になっている人が多い。',
    url: 'https://x.com/career_ai/status/demo_019',
    published_at: hoursAgo(1),
    like_count: 420, repost_count: 95, reply_count: 12, quote_count: 6,
    follower_count: 8500, source_keyword: 'AI 仕事術', has_media: false
  },
  {
    external_post_id: 'demo_020',
    author_id: 'u_15001', username: 'design_ai', display_name: 'デザイナー×AI',
    text: 'デザイナーがAIに仕事を奪われるのではなく、"AIを使わないデザイナー"がAIを使うデザイナーに奪われる、が正確な表現です。',
    url: 'https://x.com/design_ai/status/demo_020',
    published_at: hoursAgo(28),
    like_count: 5210, repost_count: 810, reply_count: 130, quote_count: 68,
    follower_count: 145000, source_keyword: 'AI 仕事術', has_media: false
  },
  {
    external_post_id: 'demo_021',
    author_id: 'u_16001', username: 'gas_master', display_name: 'GAS職人',
    text: 'GAS+Gmail+ChatGPTで「毎日の問い合わせ自動一次返信」を作りました。コード60行。テンプレの人手対応が7割減。土曜の対応が消えました。',
    url: 'https://x.com/gas_master/status/demo_021',
    published_at: hoursAgo(9),
    like_count: 2210, repost_count: 380, reply_count: 55, quote_count: 25,
    follower_count: 27000, source_keyword: 'GAS AI', has_media: true
  },
  {
    external_post_id: 'demo_022',
    author_id: 'u_17001', username: 'ec_ai', display_name: 'EC×AI',
    text: 'ECでレビュー分析をAIにやらせるとき、感情ではなく「返品理由の言い換え表現」を抽出すると当たります。ここが売れる商品の設計書になります。',
    url: 'https://x.com/ec_ai/status/demo_022',
    published_at: hoursAgo(40),
    like_count: 1450, repost_count: 180, reply_count: 22, quote_count: 8,
    follower_count: 11000, source_keyword: 'AI 業務効率化', has_media: false
  },
  {
    external_post_id: 'demo_023',
    author_id: 'u_18001', username: 'edu_ai', display_name: '教育×AI',
    text: '塾でChatGPTを子どもに使わせたら、成績が上がった子と下がった子で「使い方の差」がはっきり出ました。答えを聞く子より、質問を作らせる子が伸びます。',
    url: 'https://x.com/edu_ai/status/demo_023',
    published_at: hoursAgo(80),
    like_count: 7210, repost_count: 1120, reply_count: 210, quote_count: 90,
    follower_count: 220000, source_keyword: 'ChatGPT 仕事', has_media: false
  },
  {
    external_post_id: 'demo_024',
    author_id: 'u_19001', username: 'hr_ai', display_name: '人事のAI活用',
    text: '採用面接の議事録をAIに要約させるとき、"応募者の言い回しを残す"設定にしておくのが超重要です。要約しすぎると人物像が消えます。',
    url: 'https://x.com/hr_ai/status/demo_024',
    published_at: hoursAgo(22),
    like_count: 890, repost_count: 130, reply_count: 20, quote_count: 8,
    follower_count: 16000, source_keyword: 'ChatGPT 仕事', has_media: false
  },
  {
    external_post_id: 'demo_025',
    author_id: 'u_20001', username: 'ai_agent_dev', display_name: 'AIエージェント開発',
    text: '"AIエージェント"を自作するのに、実は最初はLangChainもDifyも要りません。GAS+ChatGPT APIで十分。まずここで手触りを掴むのがオススメです。',
    url: 'https://x.com/ai_agent_dev/status/demo_025',
    published_at: hoursAgo(16),
    like_count: 3120, repost_count: 520, reply_count: 68, quote_count: 30,
    follower_count: 41000, source_keyword: 'AI エージェント', has_media: false
  },
  {
    external_post_id: 'demo_026',
    author_id: 'u_21001', username: 'marketing_ai', display_name: 'マーケAI活用',
    text: '広告文のABテスト、AIに任せるとほとんど当たりません。理由は"データが少なすぎる"から。AIに任せるのは仮説出しまで。判断は人がやるべきです。',
    url: 'https://x.com/marketing_ai/status/demo_026',
    published_at: hoursAgo(50),
    like_count: 2820, repost_count: 310, reply_count: 45, quote_count: 20,
    follower_count: 38000, source_keyword: 'AI 業務効率化', has_media: false
  },
  {
    external_post_id: 'demo_027',
    author_id: 'u_22001', username: 'ai_note', display_name: 'AIコラムnote',
    text: 'note月間PV1万→10万になった転機は「AIを使って書く」ではなく「AIに書けないことを書く」に切り替えたことでした。逆説的ですが本当の話。',
    url: 'https://x.com/ai_note/status/demo_027',
    published_at: hoursAgo(90),
    like_count: 6810, repost_count: 920, reply_count: 150, quote_count: 62,
    follower_count: 180000, source_keyword: 'AI 仕事術', has_media: false
  },
  {
    external_post_id: 'demo_028',
    author_id: 'u_23001', username: 'consult_ai', display_name: 'コンサル×AI',
    text: 'コンサル案件でAIを使うとき、"クライアント固有の言葉"を辞書化しておくと精度が段違いです。共通プロンプトより、辞書の方が10倍効きます。',
    url: 'https://x.com/consult_ai/status/demo_028',
    published_at: hoursAgo(11),
    like_count: 1720, repost_count: 240, reply_count: 32, quote_count: 15,
    follower_count: 24000, source_keyword: 'ChatGPT 仕事', has_media: false
  },
  {
    external_post_id: 'demo_029',
    author_id: 'u_1001', username: 'ai_yamada', display_name: 'AI活用のヤマダ',
    text: '結論: AI活用がうまい人は「AIに投げるタスクを紙に書き出せる」人です。頭の中で完結する仕事だけAIに投げても、精度は上がりません。',
    url: 'https://x.com/ai_yamada/status/demo_029',
    published_at: hoursAgo(26),
    like_count: 3810, repost_count: 460, reply_count: 62, quote_count: 28,
    follower_count: 42000, source_keyword: 'AI 業務効率化', has_media: false
  },
  {
    external_post_id: 'demo_030',
    author_id: 'u_24001', username: 'tools_ai', display_name: 'AIツール比較',
    text: 'AIエージェント系ツール、無料枠だけで実務に使える組み合わせを試しました。結果は「n8n(無料)+ChatGPT API+Notion」で9割足ります。',
    url: 'https://x.com/tools_ai/status/demo_030',
    published_at: hoursAgo(7),
    like_count: 2450, repost_count: 420, reply_count: 58, quote_count: 26,
    follower_count: 31000, source_keyword: 'AI エージェント', has_media: false
  },
  {
    external_post_id: 'demo_031',
    author_id: 'u_25001', username: 'small_biz_ai', display_name: '個人事業のAI',
    text: '個人事業主でChatGPTを月$20払ってる人が最初にやるべきは「経費・確定申告フォルダの命名ルール」をAIに整理させることです。地味に効きます。',
    url: 'https://x.com/small_biz_ai/status/demo_031',
    published_at: hoursAgo(35),
    like_count: 1320, repost_count: 160, reply_count: 24, quote_count: 10,
    follower_count: 13500, source_keyword: 'AI 業務効率化', has_media: false
  },
  {
    external_post_id: 'demo_032',
    author_id: 'u_26001', username: 'ai_myth', display_name: 'AIの誤解',
    text: '"AIに聞けば全部わかる"は最大の誤解です。AIは"あなたが言語化できたことしか"答えられません。だから最初にやるのは"問いの分解"です。',
    url: 'https://x.com/ai_myth/status/demo_032',
    published_at: hoursAgo(15),
    like_count: 5920, repost_count: 780, reply_count: 110, quote_count: 55,
    follower_count: 95000, source_keyword: 'AI 仕事術', has_media: false
  }
];
