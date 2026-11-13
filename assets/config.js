// サイト設定(管理者がここだけ編集すれば動きます)
window.SITE_CONFIG = {
  teamName: "船橋パレタ",
  area: "千葉県船橋市",
  // フォーム送信先。automation/ の Google Apps Script をデプロイしたURL(…/exec)。空なら下のメールにフォールバック。
  formEndpoint: "https://script.google.com/macros/s/AKfycbyRn6qr0F4jxolYNwIffZbMawLh91u_8YWupVYO3_mkl8EYVqbA0HCOcncHDTxczrjm/exec",
  // 連絡用メール(チーム共用アドレス推奨。個人アドレスは載せない)。空なら「受付準備中」と表示。
  contactEmail: ""
};
