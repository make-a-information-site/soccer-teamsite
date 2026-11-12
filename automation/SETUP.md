# 自動投稿・自動マッチングの設置手順(サイト運営者向け)

チーム管理者には GitHub もスプレッドシートも渡しません。管理者が触るのは LINE だけです。

    管理者 ──LINE──▶ Google Apps Script ──▶ スプレッドシート(台帳・非公開)
                            │  └──▶ GitHub に data/*.json をコミット ──▶ サイトに反映
    相手チーム ──登録フォーム──┘  └──▶ メール(受付・募集のお知らせ・結果)

## 1. スプレッドシートと Apps Script
1. 新しい Google スプレッドシートを作る(共有は運営者のみ)。
2. 拡張機能 → Apps Script を開き、`Code.gs` と `Logic.gs` の内容を貼る。
3. 関数 `setup` を一度実行(シート「予定・募集・チーム・申込」ができる)。
4. デプロイ → 新しいデプロイ → ウェブアプリ。実行ユーザー「自分」、アクセス「全員」。発行された `…/exec` のURLを控える。

## 2. GitHub トークン
Fine-grained personal access token を、このリポジトリのみ・`Contents: Read and write` のみで発行する。

## 3. LINE 公式アカウント
1. LINE Official Account を作り、Messaging API を有効化。チャネルアクセストークン(長期)を発行。
2. Webhook URL に `…/exec?k=<HOOK_KEY>` を設定し、Webhook をオン。応答メッセージ(自動応答)はオフ。

## 4. スクリプトプロパティ(プロジェクトの設定)
| キー | 値 |
|---|---|
| `HOOK_KEY` | 長いランダム文字列(Webhook URL の `k=` と同じ) |
| `LINE_TOKEN` | チャネルアクセストークン |
| `ADMIN_IDS` | 投稿を許可する LINE ユーザーID(カンマ区切り) |
| `GH_TOKEN` | 2 のトークン |
| `GH_REPO` | `make-a-information-site/soccer-teamsite` |
| `GH_BRANCH` | `main` |
| `SITE_URL` | 公開サイトのURL(末尾 `/` なし) |

管理者のユーザーIDは、本人に公式アカウントを友だち追加してもらい `ID` と送ってもらうと返信されます。それを `ADMIN_IDS` に追加します。

## 5. サイト側
`assets/config.js` の `formEndpoint` に `…/exec` のURL(`?k=` は付けない)を入れる。

## 知っておくこと
- Apps Script は LINE の署名ヘッダーを読めないため、なりすまし対策は「URLの合言葉(HOOK_KEY)+ユーザーIDの許可リスト」です。URLは他人に見せないでください。
- コードを直したら「デプロイを管理 → 編集 → 新バージョン」で更新します(URLは変わりません)。
- 無料枠の目安: メール 1日100通、LINE のプッシュ通知 月200通(申し込み通知のみ消費。返信は対象外)。
- `node automation/test.js` で文面の読み取りロジックをテストできます。
