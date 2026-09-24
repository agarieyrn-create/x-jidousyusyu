# Content Research Radar

SNS（まずはX）の競合・同ジャンル投稿から「なぜ伸びたか」を仮説として抽出し、
あなた自身の発信アイデアに変換するリサーチAIツールのMVPです。

> 本サービスは"競合投稿コピーツール"ではありません。
> 元投稿から成功パターンを抽象化し、あなたの経験・視点を組み合わせた
> オリジナルコンテンツを設計する伴走者です。

---

## 1. 現在のフェーズ

**Single User Demo Mode** — 認証・ログイン画面は未実装で、
サーバー起動時にシードされる単一 `Demo Workspace` に対して直接動作します。
将来 **Authentication + Multi Workspace / Multi User** へ拡張することを想定し、
DBスキーマ・APIエンドポイントは既に `workspace_id` でスコープ分離されており、
別workspaceのIDでは投稿/アイデア/キーワード/Watch Account を
**取得・更新・削除いずれもできない** (Integration Test で保証)。

## 2. できること (MVP実装状況)

### 実装済み

| # | 機能 | 状態 |
|---|---|---|
| 1 | 発信プロフィール登録 (ジャンル/ターゲット/目的/スタイル) | ✅ |
| 2 | AIキーワード自動生成 (追加/編集/削除/ON-OFF) | ✅ |
| 3 | DEMO検索 (32件のモック投稿, フィルタ/並び替え) | ✅ |
| 4 | X検索 (X_BEARER_TOKEN 設定時に自動でLIVE MODE) | ✅ |
| 5 | Trend Score (velocity + relative engagement) 独自指標 | ✅ |
| 6 | 投稿保存 / Research Library | ✅ |
| 7 | 投稿AI分析 (Hook / Structure / 成功要因の仮説 / 再利用可能な型) | ✅ |
| 8 | 「自分向けに変換」= アイデア生成 (経験を入れる場所を必ず提示 + コピー防止フィルタ) | ✅ |
| 9 | アイデアDB (Inbox/採用候補/採用/作成中/投稿済み/保留) | ✅ |
| 10 | Watch Accounts + アカウント分析 (直近7日/Hook/Topic/CTA傾向) | ✅ |
| 11 | 手動URL登録 / テキスト登録 | ✅ |
| 12 | Dashboard (今日のリサーチ/注目投稿/Hook・Topic傾向) | ✅ |
| 13 | CSV / JSON / Content Brief JSON 出力 | ✅ |
| 14 | Settings で X API / AI Provider 接続状態表示 | ✅ |
| 15 | AIレスポンスのruntime validation + 1回リトライ (要件を満たさない出力はDB保存しない) | ✅ |
| 16 | 全ID指定APIにworkspace_id所有権チェック | ✅ |
| 17 | Unit + Integration + Workspace分離 + LIVE MODE(fetchモック) + DB移行テスト | ✅ (48 tests passing) |
| 18 | X投稿の再取得時に公開指標を更新 (UPSERT) / LIVE検索でも期間指定を適用 | ✅ |
| 19 | アイデアは必ず3案 (コピー類似案・近似重複案は不採用、不足時は1回だけ再生成) | ✅ |

### 未実装 (将来対応)

| # | 機能 | メモ |
|---|---|---|
| A | ユーザー登録 / ログイン / 本格認証 | 現在は seed 済み単一ユーザーで動作。DBスキーマ (`users`, `workspaces`) は準備済み |
| B | マルチワークスペース UI | サーバーAPIは既にworkspace_idスコープ対応済み。UI側の切替は未実装 |
| C | YouTube / note / Threads / Instagram | `YouTubeAdapter.js` は雛形のみ、実装は未着手 |
| D | 課金 / Stripe | 未実装 |
| E | Daily Research / Trend Alert (cron) | 未実装 |

---

## 3. 起動方法

### 必要環境
- Node.js 18+ (推奨 20+)
- `better-sqlite3` がネイティブビルドされるため `python3` / `make` / `g++` が必要な環境あり

### 手順
```bash
cd content-research-radar
npm install
npm start
# → http://localhost:3000 (PORT で変更可)
```

初回起動時に SQLite DB (`data/radar.sqlite`) が自動作成され、
デモ用のユーザー / ワークスペース / プロフィール / キーワード / 30+件のモック投稿がシードされます。

### テスト
```bash
npm test
```

---

## 4. 環境変数

すべて未設定でも起動可能 (自動で **DEMO MODE**)。

| 環境変数 | 用途 | 例 |
|---|---|---|
| `PORT` | HTTP ポート | `3000` |
| `APP_ENV` | 環境識別 | `development` / `production` |
| `DB_PATH` | SQLite ファイルパス | `./data/radar.sqlite` |
| `X_BEARER_TOKEN` | X API v2 recent search 用 Bearer Token | `AAAA...` |
| `AI_PROVIDER` | LLM プロバイダ | `openai` (現状) |
| `AI_API_KEY` | LLM の API Key | `sk-...` |
| `AI_MODEL` | LLM モデル | `gpt-4o-mini` |

- `X_BEARER_TOKEN` 未設定 → 検索は保存済み Mock を対象に動作
- `AI_API_KEY` 未設定 → `MockAIProvider` を使用 (Analyzer / IdeaGenerator が擬似応答)
- どちらか未設定なら UI 左下バッジは `DEMO MODE`

---

## 5. X API 接続方法

1. X Developer Portal でプロジェクトを作成し、`Bearer Token` を取得
2. 環境変数 `X_BEARER_TOKEN` にセットして再起動
3. Settings 画面で `X API: 接続済み` になれば OK
4. Discover 画面の「検索実行」で X の live 検索が行われ、DB へ保存されます

呼び出しは `GET /2/tweets/search/recent` に対して以下:
- `tweet.fields=created_at,public_metrics,author_id,lang,entities,attachments`
- `expansions=author_id`
- `user.fields=username,name,public_metrics`
- `max_results` は 20 (perKeyword) / キーワード最大5個 に制限 (レート/コスト対策)

APIキーは **絶対にブラウザに公開されません**。サーバー側のみで使用します。

### 「最低いいね数 / 最低リポスト数」 の扱い (重要)

X API v2 Recent Search では `min_faves:` / `min_retweets:` 演算子は
Essential/Basic tier では非対応であり、クエリに含めるとエラー・
または無視される場合があります。

このため本アプリでは、UIの「最低いいね数」「最低リポスト数」設定は:

```
X APIで投稿取得
  ↓ normalize
  ↓ public_metrics (like_count, retweet_count) 取得
  ↓ アプリ側で minLikes / minReposts フィルタ (XQueryBuilder.applyEngagementFilter)
```

というフローで **取得後にアプリ側で** フィルタリングされます。
X API のクエリ文字列自体には min_faves / min_retweets は入りません。

### X API エラー時の挙動

X APIから 400/401/403/429/500系 が返った場合、
Bearer Token やレスポンスbody を返り値に含めず、
ユーザー向けの日本語エラーメッセージだけを返します。
例:
- 429 → 「X APIの利用上限に達しました。時間をおいて再度お試しください。」
- 401 → 「X APIの認証に失敗しました。Bearer Tokenの設定を確認してください。」
- 500系 → 「X API側で一時的な障害が発生している可能性があります…」

---

## 6. DEMO MODE (最重要)

外部APIが1つも接続されていなくても、以下の一連の操作が完結します:

```
Dashboard → Discover → 投稿発見 → AI分析 → 「自分向けに変換」
→ アイデア3案生成 → Ideas に保存 → CSV / JSON / Content Brief 出力
```

- モックデータは `src/db/mockPosts.js` に 32件 (フォロワー/いいね/経過時間がバラバラなので、
  「いいね順」と「Trend Score順」で結果が変わることを目視で確認できます)
- MockAIProvider (`src/services/ai/MockAIProvider.js`) がAI応答を擬似生成し、
  Analyzer / IdeaGenerator が LLM 未接続でも動きます

---

## 7. DB 構造 (SQLite)

`src/db/schema.js` を参照。主要テーブル:

- `users` / `workspaces` (将来のマルチクライアント対応の器)
- `profiles` (発信ジャンル・ターゲット・目的・スタイル・除外テーマ)
- `research_keywords` (キーワード ON/OFF・AI/user ソース)
- `watch_accounts` (競合/参考アカウント + タグ)
- `research_posts` (投稿本体 + Trend Score + 保存フラグ, `UNIQUE(workspace_id, platform, external_post_id)`)
  - 同じX投稿でもworkspaceごとに独立した行を持つ。再取得時は `ON CONFLICT ... DO UPDATE` で公開指標を更新し、`id / is_saved / created_at` は保持
  - 旧スキーマ `UNIQUE(platform, external_post_id)` のDBは起動時に自動移行 (データ保持)
- `analyses` (Hook/Structure/CTA/why_it_may_have_worked/reusable_patterns など JSON配列で保持)
- `ideas` (生成された自分向けアイデア + status/tags)

すべての操作は `workspace_id` でスコープされます。

---

## 8. ディレクトリ構造

```
src/
  server.js                # Hono エントリ (SPA fallback + static + /api)
  api/routes.js            # REST API (Hono)
  db/
    index.js               # SQLite 初期化
    schema.js              # スキーマ定義
    seed.js                # 起動時シード (ユーザー/プロフィール/Mock投稿)
    mockPosts.js           # 32件のデモ投稿
  services/
    social/
      x/
        XAdapter.js        # X API v2 recent search 実装
        XQueryBuilder.js   # 検索クエリ組み立て
        XUrlParser.js      # X URL から Post ID を抽出
      youtube/
        YouTubeAdapter.js  # Phase 2 予定の雛形
      manual/
        ManualAdapter.js   # URL / テキスト手動登録
    ai/
      AIProvider.js        # 差し替え可能な AI 抽象 (OpenAI / Mock)
      MockAIProvider.js    # DEMO MODE 用の擬似応答
      Analyzer.js          # 投稿AI分析
      KeywordGenerator.js  # リサーチキーワード生成
      IdeaGenerator.js     # 「自分向けに変換」アイデア生成 + コピー防止
    scoring/
      TrendScore.js        # velocity + relEng の独自スコア
    export/
      CsvExporter.js       # ideas.csv
      JsonExporter.js      # ideas.json / content brief
public/
  index.html
  css/app.css
  js/
    app.js                 # SPA ルーター
    api.js                 # フロントエンド API クライアント
    views/*.js             # dashboard / discover / library / ideas / watch / settings / post_drawer
tests/
  unit.test.js             # X Query / URL / Trend Score / Mock AI / Export
data/                      # SQLite (git 管理外)
```

---

## 9. API 一覧

すべて `/api/` プレフィックス。UI から直接叩けます。

```
GET    /api/status
GET    /api/profile
PUT    /api/profile
GET    /api/keywords
POST   /api/keywords                # { keywords:[...], source:'user' } or { regenerate:true }
PUT    /api/keywords/:id
DELETE /api/keywords/:id
POST   /api/research/search
GET    /api/posts?saved=1&sort=trend_score
GET    /api/posts/:id
POST   /api/posts/:id/save
POST   /api/posts/:id/analyze
POST   /api/posts/analyze-top       # { limit: 5|10|20 }
GET    /api/watch-accounts
POST   /api/watch-accounts
DELETE /api/watch-accounts/:id
GET    /api/watch-accounts/:id/analysis
POST   /api/manual-import           # { type:'url'|'text', ... }
POST   /api/ideas/generate          # { post_id }
GET    /api/ideas?status=Inbox
PUT    /api/ideas/:id
GET    /api/ideas/:id/brief         # Content Brief JSON
GET    /api/export/ideas.csv
GET    /api/export/ideas.json
GET    /api/dashboard
```

---

## 10. Cloudflare 公開方法 (将来的)

現在は Node.js (`@hono/node-server` + `better-sqlite3`) 構成です。
Cloudflare Workers / Pages に載せる場合の推奨は:

1. **DB を D1 に置換**: `better-sqlite3` を Cloudflare D1 用のクエリラッパへ差し替え
   (テーブル定義 `src/db/schema.js` はほぼそのまま流用可能)
2. **静的ファイルは Pages** に、`src/api/routes.js` はそのまま Hono で `wrangler` にデプロイ
3. **X API / OpenAI API の呼び出し**は `fetch` ベースなので Workers 互換
4. `Database` import 部分を `env.DB` に置換するアダプタを `src/db/index.js` に追加すれば
   Workers/Node.js の両対応にできます

現段階では Node.js サーバとして `PORT=3000 npm start` するのが最速です。

---

## 11. 将来拡張

- **Phase 2**: YouTube / note / Threads / Instagram / Daily Research / Trend Alert
- **Phase 3**: 複数クライアント (workspace_id は既に用意済み) / SNS運用代行モード / チーム機能
- **Phase 4**: Research → Idea → Create → Publish → Analyze → Improve ループ完成

追加時のポイント:
- 新しい SNS は `src/services/social/<platform>/<Platform>Adapter.js` に `search()` / `getPost()` / `normalize()` を実装
- LLM 差し替えは `AIProvider.js` に新 provider を追加
- Trend Score の重みは `src/services/scoring/TrendScore.js` (velocity 60% / relEng 40%) を調整

---

## 12. 既知の制約
- AIサービス (OpenAI) の 401/403/429 は再生成リトライせず、日本語メッセージで即エラーを返す (APIキー・レスポンスbodyは返さない)

- **認証は未実装** (Single User Demo Mode)。マルチユーザー対応は将来対応
- X API 側のレート制限 / 検索対象範囲 (recent search は直近7日) は API 側の仕様に依存
- 手動登録で X 以外の SNS 本文は自動取得しません (規約回避スクレイピングは意図的に非実装)
- MockAIProvider は決定論的な擬似応答であり、本格的な分析は `AI_API_KEY` を設定して LLM 経由で行ってください
- SQLite (`better-sqlite3`) を使用しているためサーバー再起動をまたいでもデータは残ります
- AIレスポンスが validation を2回連続で満たさない場合、その分析/アイデアは **DBに保存されず**、
  APIは 500 と日本語エラーメッセージを返します (壊れたデータでDBを汚さないため)
