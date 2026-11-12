/**
 * 船橋パレタ 自動投稿・自動マッチング(Google Apps Script / スプレッドシートに紐づけて使う)
 *
 * スクリプトプロパティ:
 *   HOOK_KEY    LINE Webhook URL に付ける合言葉(長いランダム文字列)
 *   LINE_TOKEN  LINE チャネルアクセストークン
 *   ADMIN_IDS   投稿を許可する LINE ユーザーID(カンマ区切り)
 *   GH_TOKEN    GitHub fine-grained トークン(対象リポジトリの Contents: Read and write のみ)
 *   GH_REPO     例: make-a-information-site/soccer-teamsite
 *   GH_BRANCH   例: main
 *   SITE_URL    公開サイトのURL(末尾スラッシュなし)
 */
var VERSION = 6;   // コードを更新したら増やす。check が「公開中の版」と照合する
var P = PropertiesService.getScriptProperties();
var SHEETS = {
  '予定': ['id', 'date', 'start', 'end', 'type', 'title', 'place', 'note'],
  '募集': ['id', 'date', 'start', 'end', 'place', 'format', 'level', 'status', 'note'],
  'チーム': ['email', 'team', 'area', 'category', 'level', 'name', 'days', 'updated'],
  '申込': ['id', 'slot', 'email', 'team', 'status', 'created']
};

function setup() { Object.keys(SHEETS).forEach(sheet_); console.log('準備できました。台帳: ' + ss_().getUrl()); }

// 設定の点検。エディタで check を選んで実行し、下の「実行ログ」を見る。秘密の値は表示しない。
function check() {
  var out = [], get = function (k) { return (P.getProperty(k) || ''); };
  ['HOOK_KEY', 'LINE_TOKEN', 'ADMIN_IDS', 'GH_TOKEN', 'GH_REPO', 'GH_BRANCH', 'SITE_URL'].forEach(function (k) {
    var v = get(k);
    out.push((v ? (v !== v.trim() ? '△ 前後に空白あり' : '○ 設定あり') : '× 未設定') + '  ' + k + (v ? '(' + v.length + '文字)' : ''));
  });
  if (get('LINE_TOKEN').length < 100) out.push('× LINE_TOKEN が短すぎます。チャネルシークレットではなく「チャネルアクセストークン(長期)」を入れてください');
  out.push((admins_().length ? '○' : '×') + ' 管理者として読み取れたID: ' + admins_().length + ' 件(' + admins_().map(function (id) { return id.slice(0, 5) + '…'; }).join('、') + ')');
  if (get('ADMIN_IDS').replace(/U[0-9a-f]{32}/g, '').replace(/[\s,、,]/g, '')) out.push('△ ADMIN_IDS に、IDとして読み取れない文字が混ざっています(IDの写し間違いの可能性)');
  var h = { headers: { Authorization: 'Bearer ' + get('LINE_TOKEN').trim() }, muteHttpExceptions: true };
  var r = UrlFetchApp.fetch('https://api.line.me/v2/bot/info', h);
  out.push((r.getResponseCode() === 200 ? '○ LINE_TOKEN は有効: ' + JSON.parse(r.getContentText()).displayName : '× LINE_TOKEN が無効(' + r.getResponseCode() + ')'));
  r = UrlFetchApp.fetch('https://api.line.me/v2/bot/channel/webhook/endpoint', h);
  if (r.getResponseCode() === 200) {
    var w = JSON.parse(r.getContentText()), url = String(w.endpoint || '');
    out.push((w.active ? '○ Webhook の利用: オン' : '× Webhook の利用がオフです'));
    out.push((/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec\?k=/.test(url) ? '○' : '×') + ' Webhook URL の形: ' + url.replace(/\?k=.*/, '?k=…'));
    out.push((url.split('?k=')[1] === get('HOOK_KEY') ? '○ URL の ?k= と HOOK_KEY が一致' : '× URL の ?k= と HOOK_KEY が一致しません'));
    // LINE が実際に呼ぶ URL を、外部から(ログインなしで)呼んでみる
    var g = UrlFetchApp.fetch(url.split('?')[0], { muteHttpExceptions: true }), pub = null;
    try { pub = JSON.parse(g.getContentText()); } catch (err) {}
    if (pub && pub.version === VERSION) out.push('○ 公開中のコードは最新(版 ' + VERSION + ')');
    else if (pub) out.push('× 公開中のコードが古い版です。「デプロイを管理」→ 鉛筆 →「新バージョン」でデプロイし直してください');
    else if (/accounts\.google\.com|ServiceLogin|signin/i.test(g.getContentText()) || g.getResponseCode() === 401 || g.getResponseCode() === 403) out.push('× 外部から呼べません。デプロイの「アクセスできるユーザー」を「全員」にしてください');
    else out.push('× この URL のデプロイは古いコードのままです(' + g.getResponseCode() + ')。「デプロイを管理」でこの URL のデプロイを選び、鉛筆 →「新バージョン」でデプロイし直してください');
    if (pub && pub.version === VERSION) {
      var t = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ events: [] }), muteHttpExceptions: true });
      out.push(/"ok":true/.test(t.getContentText()) ? '○ Webhook の受信テスト: 成功' : '× Webhook の受信テスト: 失敗(' + t.getResponseCode() + ')');
    }
  } else out.push('× Webhook URL が未設定、または取得できません(' + r.getResponseCode() + ')');
  r = UrlFetchApp.fetch('https://api.github.com/repos/' + get('GH_REPO').trim(), { headers: { Authorization: 'Bearer ' + get('GH_TOKEN').trim(), Accept: 'application/vnd.github+json' }, muteHttpExceptions: true });
  if (r.getResponseCode() === 200) { var perm = JSON.parse(r.getContentText()).permissions || {}; out.push(perm.push ? '○ GitHub: 書き込みできます' : '× GitHub: 読めますが書き込み権限がありません(Contents: Read and write が必要)'); }
  else out.push('× GitHub に接続できません(' + r.getResponseCode() + ')。GH_TOKEN / GH_REPO、または組織での承認待ちを確認');
  console.log(out.join('\n'));
}

// 台帳のスプレッドシート。シートに紐づかない単独のスクリプトでも動くよう、無ければ自動で作って ID を覚える。
function ss_() {
  var a = SpreadsheetApp.getActive(); if (a) return a;
  var id = P.getProperty('SHEET_ID'); if (id) return SpreadsheetApp.openById(id);
  var n = SpreadsheetApp.create('船橋パレタ 台帳'); P.setProperty('SHEET_ID', n.getId());
  console.log('台帳のスプレッドシートを作成しました: ' + n.getUrl());
  return n;
}
function sheet_(name) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(SHEETS[name]); sh.setFrozenRows(1); sh.getRange('A:Z').setNumberFormat('@'); }
  return sh;
}
function rows_(name) {
  var v = sheet_(name).getDataRange().getDisplayValues(), h = SHEETS[name];
  return v.slice(1).map(function (r, i) { var o = { _row: i + 2 }; h.forEach(function (k, j) { o[k] = r[j] || ''; });
    ['start', 'end'].forEach(function (k) { if (/^\d:\d\d$/.test(o[k] || '')) o[k] = '0' + o[k]; });   // シートが 09:00 を 9:00 と表示しても揃える
    return o; });
}
function append_(name, o) { sheet_(name).appendRow(SHEETS[name].map(function (k) { return o[k] == null ? '' : o[k]; })); }
function setCell_(name, row, key, val) { sheet_(name).getRange(row, SHEETS[name].indexOf(key) + 1).setValue(val); }
function nextId_(name, prefix) {
  var max = 0; rows_(name).forEach(function (r) { var n = +String(r.id).replace(/\D/g, ''); if (n > max) max = n; });
  return prefix + (max + 1);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
// 区切りが全角カンマ・空白・改行でも拾えるよう、U+英数字32文字の並びをすべて取り出す
function admins_() { return (P.getProperty('ADMIN_IDS') || '').match(/U[0-9a-f]{32}/g) || []; }

// ---------- 入口 ----------
function doGet() { return json_({ ok: true, version: VERSION }); }
function doPost(e) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.events) {                       // LINE から
      if (!P.getProperty('HOOK_KEY') || e.parameter.k !== P.getProperty('HOOK_KEY')) { console.error('Webhook URL の ?k= と HOOK_KEY が一致しません'); return json_({ ok: false }); }
      body.events.forEach(lineEvent_);
      return json_({ ok: true });
    }
    return json_({ ok: formSubmit_(body) });  // サイトのフォームから
  } catch (err) {
    console.error(err);
    return json_({ ok: false });
  } finally { lock.releaseLock(); }
}

// ---------- LINE ----------
function lineEvent_(ev) {
  var uid = ev.source && ev.source.userId, isAdmin = admins_().indexOf(uid) >= 0;
  if (ev.type === 'postback' && isAdmin) return reply_(ev.replyToken, decide_(ev.postback.data));
  if (ev.type !== 'message' || ev.message.type !== 'text') return;
  var c = parseCommand(ev.message.text, new Date());
  if (c.cmd === 'id') return reply_(ev.replyToken, 'あなたのID:\n' + uid + '\nこれをサイト運営者に伝えてください。');
  if (!isAdmin) return reply_(ev.replyToken, 'このアカウントは、登録された管理者だけが投稿できます。\n管理者の方は「ID」と送り、返ってきたIDをサイト運営者に伝えてください。');
  var msg;
  try { msg = command_(c); } catch (err) { console.error(err); msg = 'うまくいきませんでした。この文面をサイト運営者に伝えてください。\n\n' + String(err && err.message || err).slice(0, 300); }
  reply_(ev.replyToken, msg);
}

function command_(c) {
  var msg;
  if (c.cmd === 'schedule') {
    c.id = nextId_('予定', 'Y'); c.title = c.type === '練習' ? '通常練習' : c.type;
    append_('予定', c); publish_();
    msg = '予定をのせました✅\n' + fmtRow(c.id, c) + '(' + c.type + ')\n\n取り消すときは「削除 ' + c.id + '」';
  } else if (c.cmd === 'slot') {
    c.id = nextId_('募集', 'B'); c.status = '募集中'; c.format = '11人制';
    append_('募集', c); publish_();
    var n = notifyTeams_(c);
    msg = '募集をのせました✅\n' + fmtRow(c.id, c) + '\n登録チーム ' + n + ' 件にメールでお知らせしました。\n\n取り消すときは「削除 ' + c.id + '」';
  } else if (c.cmd === 'list') {
    var today = ymd(new Date()), f = function (r) { return r.date >= today; };
    var a = rows_('予定').filter(f).map(function (r) { return fmtRow(r.id, r); });
    var b = rows_('募集').filter(f).map(function (r) { return fmtRow(r.id, r) + '【' + r.status + '】'; });
    msg = '■予定\n' + (a.join('\n') || 'なし') + '\n\n■募集\n' + (b.join('\n') || 'なし');
  } else if (c.cmd === 'delete') {
    var name = c.id.charAt(0) === 'Y' ? '予定' : '募集';
    var hit = rows_(name).filter(function (r) { return r.id === c.id; })[0];
    if (hit) { sheet_(name).deleteRow(hit._row); publish_(); msg = c.id + ' を消しました。'; }
    else msg = c.id + ' が見つかりません。「一覧」で確認してください。';
  } else if (c.cmd === 'error') msg = c.message;
  else msg = HELP;
  return msg;
}

function line_(path, payload) {
  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/' + path, { method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + P.getProperty('LINE_TOKEN') }, payload: JSON.stringify(payload), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) console.error('LINE への送信に失敗: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
}
function reply_(token, text) { if (text) line_('reply', { replyToken: token, messages: [{ type: 'text', text: text.slice(0, 4900) }] }); }

// ---------- フォーム(チーム登録・申し込み) ----------
function formSubmit_(raw) {
  var d = cleanForm(raw || {}); if (!d) return false;
  var teams = rows_('チーム'), old = teams.filter(function (t) { return t.email === d.email; })[0];
  d.updated = ymd(new Date());
  if (old) SHEETS['チーム'].forEach(function (k) { setCell_('チーム', old._row, k, d[k]); }); else append_('チーム', d);

  var slot = d.slot && rows_('募集').filter(function (s) { return s.id === d.slot && s.status === '募集中'; })[0];
  var dup = slot && rows_('申込').some(function (a) { return a.slot === slot.id && a.email === d.email && a.status === '確認中'; });
  if (slot && !dup) {
    var id = nextId_('申込', 'A');
    append_('申込', { id: id, slot: slot.id, email: d.email, team: d.team, status: '確認中', created: d.updated });
    var text = '練習試合の申し込みが来ました\n' + fmtRow('', slot).trim() + '\nチーム:' + d.team + '(' + d.area + ' / ' + d.category + (d.level ? ' / ' + d.level : '') + ')';
    admins_().forEach(function (to) {
      line_('push', { to: to, messages: [{ type: 'template', altText: text, template: { type: 'confirm', text: text.slice(0, 240),
        actions: [{ type: 'postback', label: '受ける', data: 'ok:' + id, displayText: '受ける' }, { type: 'postback', label: '見送る', data: 'ng:' + id, displayText: '見送る' }] } }] });
    });
  }
  mail_(d.email, '受け付けました', d.team + ' 様\n\n' + (slot ? '練習試合の申し込みを受け付けました。担当者が確認し、結果をメールでお知らせします。\n' + fmtRow('', slot).trim()
    : 'チーム登録を受け付けました。新しい募集枠が出た際にメールでお知らせします。') + '\n\n登録の削除をご希望の場合は、このメールにその旨をご返信ください。');
  return true;
}

// 管理者が「受ける / 見送る」を押したとき
function decide_(data) {
  var m = /^(ok|ng):(A\d+)$/.exec(data || ''); if (!m) return '';
  var apps = rows_('申込'), app = apps.filter(function (a) { return a.id === m[2]; })[0];
  if (!app || app.status !== '確認中') return 'この申し込みは処理済みです。';
  var slot = rows_('募集').filter(function (s) { return s.id === app.slot; })[0];
  var when = slot ? fmtRow('', slot).trim() : '';
  if (m[1] === 'ng' || !slot || slot.status !== '募集中') {
    setCell_('申込', app._row, 'status', '見送り');
    mail_(app.email, '練習試合のお申し込みについて', app.team + ' 様\n\n今回は日程の都合によりお受けできませんでした。\n' + when + '\nまたの機会にぜひお願いいたします。');
    return app.team + ' を見送りにしました(先方にメール済み)。';
  }
  setCell_('申込', app._row, 'status', '決定');
  setCell_('募集', slot._row, 'status', '決定');
  append_('予定', { id: nextId_('予定', 'Y'), date: slot.date, start: slot.start, end: slot.end, type: '練習試合', title: '練習試合', place: slot.place, note: '' });
  mail_(app.email, '練習試合が決定しました', app.team + ' 様\n\n以下の練習試合が決定しました。\n' + when + '\n\n当日の詳細は、このメールへの返信でご相談ください。');
  apps.forEach(function (a) {              // 同じ枠のほかの申し込みは見送り
    if (a.slot === slot.id && a.id !== app.id && a.status === '確認中') {
      setCell_('申込', a._row, 'status', '見送り');
      mail_(a.email, '練習試合のお申し込みについて', a.team + ' 様\n\n先に他チームとの対戦が決まりました。\n' + when + '\nまたの機会にぜひお願いいたします。');
    }
  });
  publish_();
  return app.team + ' との練習試合を決定にしました✅\n予定表にものせ、先方にメールしました。';
}

function notifyTeams_(slot) {
  var list = teamsToNotify(rows_('チーム'), slot).slice(0, 80);   // 無料枠のメール上限(1日100通)に配慮
  var url = (P.getProperty('SITE_URL') || '') + '/matching.html';
  list.forEach(function (t) {
    mail_(t.email, '練習試合の募集枠が出ました', t.team + ' 様\n\n新しい募集枠です。\n' + fmtRow('', slot).trim() + '\n\nお申し込みはこちら:\n' + url + '\n\n配信停止をご希望の場合は、このメールにその旨をご返信ください。');
  });
  return list.length;
}
function mail_(to, subject, body) {
  try { MailApp.sendEmail({ to: to, subject: '【船橋パレタ】' + subject, body: body, name: '船橋パレタ' }); } catch (err) { console.error(err); }
}

// ---------- サイトへ反映(GitHub に JSON をコミット) ----------
function publish_() {
  var today = ymd(new Date()), keep = function (r) { return r.date >= today; }, strip = function (r) { var o = {}; Object.keys(r).forEach(function (k) { if (k !== '_row') o[k] = r[k]; }); return o; };
  put_('data/schedule.json', rows_('予定').filter(keep).map(strip));
  put_('data/matches.json', rows_('募集').filter(keep).map(strip));
}
function put_(path, data) {
  var api = 'https://api.github.com/repos/' + P.getProperty('GH_REPO') + '/contents/' + path, branch = P.getProperty('GH_BRANCH') || 'main';
  var headers = { Authorization: 'Bearer ' + P.getProperty('GH_TOKEN'), Accept: 'application/vnd.github+json' };
  var content = Utilities.base64Encode(JSON.stringify(data, null, 2) + '\n', Utilities.Charset.UTF_8);
  var cur = UrlFetchApp.fetch(api + '?ref=' + encodeURIComponent(branch), { headers: headers, muteHttpExceptions: true }), sha;
  if (cur.getResponseCode() === 200) {
    var j = JSON.parse(cur.getContentText()); sha = j.sha;
    if (String(j.content).replace(/\s/g, '') === content) return;   // 変更なし
  }
  var res = UrlFetchApp.fetch(api, { method: 'put', headers: headers, contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ message: 'サイト更新: ' + path, content: content, branch: branch, sha: sha }) });
  if (res.getResponseCode() >= 300) throw new Error('サイトへの反映に失敗(GitHub ' + res.getResponseCode() + ')。' +
    (res.getResponseCode() === 403 || res.getResponseCode() === 404 ? 'GH_TOKEN の権限が「Contents: Read and write」になっているか、対象リポジトリが soccer-teamsite か、組織で承認待ちになっていないかを確認してください。' : '') + res.getContentText().slice(0, 120));
}
