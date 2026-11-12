# 船橋パレタ チームサイト

ビルド不要の静的サイトです。GitHub Pages(Settings → Pages → Deploy from a branch → `main` / root)でそのまま公開できます。

## 更新のしかた

通常は **LINE から自動更新** します(`data/*.json` は自動で書き換わるので手で編集しません)。

- チーム管理者向け: [automation/管理者向け使い方.md](automation/管理者向け使い方.md)
- 設置手順(運営者向け): [automation/SETUP.md](automation/SETUP.md)

自動化を設置するまでは、`data/schedule.json` / `data/matches.json` を手で編集しても動きます。
登録フォームは `assets/config.js` の `formEndpoint` を設定するまで「受付準備中」になります。

## デザインの方針

トップページ(`index.html` + `assets/home.css`)だけ見せるデザイン。予定表・練習試合・登録は、読みやすさ優先の地味な実務ページ(`assets/style.css`)。

## 個人情報の方針

- 収集は チーム名・エリア・代表者の呼び名・連絡用メール のみ。電話番号・住所・名簿は集めない。
- 登録チームはサイトに公開しない。登録情報は非公開のスプレッドシートにのみ保存し、このリポジトリにはコミットしない。
- 選手の氏名・顔写真は本人同意なしに載せない。

## ローカル確認

    python3 -m http.server 8000
