// 純粋ロジック(Google のサービスに触らない)。Code.gs から使う。
var TYPES = ['練習', '練習試合', '公式戦'];
var HELP = [
  '【かんたん入力】',
  '「メニュー」と送ると、ボタンで日付・時間・会場を選べます。',
  '',
  '【文字で送る場合】そのまま真似して送ってください',
  '',
  '■予定をのせる',
  '予定 12/13 9:00-11:00 ○○グラウンド',
  '(最後に 練習試合 / 公式戦 と書くと種類が変わります)',
  '',
  '■練習試合の相手を募集する',
  '募集 12/20 13:00-15:00 ○○グラウンド',
  '',
  '■今のっている内容を見る',
  '一覧',
  '',
  '■消す(一覧に出る記号を書く)',
  '削除 Y3'
].join('\n');

function pad2(n) { return ('0' + n).slice(-2); }
function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

// "12/13" → "2026-12-13"。過ぎた日付は翌年とみなす。不正なら null。
function resolveDate(md, now) {
  var m = /^(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})$/.exec(md || '');
  if (!m) return null;
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var y = m[1] ? +m[1] : today.getFullYear(), mo = +m[2], d = +m[3];
  var dt = new Date(y, mo - 1, d);
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  if (!m[1] && dt < today) dt = new Date(y + 1, mo - 1, d);
  return ymd(dt);
}

// "9:00-11:00" → {start:"09:00", end:"11:00"}。不正なら null。
function parseTime(t) {
  var m = /^(\d{1,2}):(\d{2})(?:-(\d{1,2}):(\d{2}))?$/.exec(t || '');
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  var r = { start: pad2(m[1]) + ':' + m[2], end: '' };
  if (m[3] !== undefined) {
    if (+m[3] > 23 || +m[4] > 59) return null;
    r.end = pad2(m[3]) + ':' + m[4];
    if (r.end <= r.start) return null;
  }
  return r;
}

// LINEの文面 → コマンド
function parseCommand(text, now) {
  var t = String(text || '').normalize('NFKC').replace(/[〜~ー―−–]/g, function (c) { return c === 'ー' ? c : '-'; })
    .replace(/(\d)時(\d{1,2})分?/g, '$1:$2').replace(/(\d)時/g, '$1:00').replace(/(\d{1,2})月(\d{1,2})日?/g, '$1/$2').trim();
  var k = t.split(/\s+/), head = k[0];
  if (head === '一覧') return { cmd: 'list' };
  if (/^(メニュー|menu)$/i.test(head) || ((head === '予定' || head === '募集') && k.length === 1)) return { cmd: 'menu' };
  if (/^(ヘルプ|使い方|help)$/i.test(head)) return { cmd: 'help' };
  if (/^id$/i.test(head)) return { cmd: 'id' };
  if (head === '削除') {
    var id = (k[1] || '').toUpperCase();
    return /^[YB]\d+$/.test(id) ? { cmd: 'delete', id: id } : { cmd: 'error', message: '「削除 Y3」のように、一覧に出る記号を書いてください。' };
  }
  if (head === '予定' || head === '募集') {
    var date = resolveDate(k[1], now), time = parseTime(k[2]), rest = k.slice(3);
    if (!date) return { cmd: 'error', message: '日付が読めませんでした。「12/13」のように書いてください。' };
    if (!time) return { cmd: 'error', message: '時間が読めませんでした。「9:00-11:00」のように書いてください。' };
    if (!rest.length) return { cmd: 'error', message: '会場名を書いてください。例:' + head + ' 12/13 9:00-11:00 ○○グラウンド' };
    var type = '練習';
    rest = rest.filter(function (w) { if (TYPES.indexOf(w) >= 0) { type = w; return false; } return true; });
    var o = { cmd: head === '予定' ? 'schedule' : 'slot', date: date, start: time.start, end: time.end, place: (rest[0] || '').slice(0, 40), note: rest.slice(1).join(' ').slice(0, 80) };
    if (!o.place) return { cmd: 'error', message: '会場名を書いてください。' };
    if (o.cmd === 'schedule') o.type = type;
    return o;
  }
  return { cmd: 'unknown' };
}

function dayLabel(dateStr) {
  var p = dateStr.split('-'), w = new Date(+p[0], p[1] - 1, +p[2]).getDay();
  return w === 6 ? '土曜' : w === 0 ? '日曜' : '平日夜';
}

// 新しい募集枠を知らせるチーム: 希望曜日が合う or 希望曜日なし
function teamsToNotify(teams, slot) {
  var day = dayLabel(slot.date);
  return teams.filter(function (t) { return t.email && (!t.days || String(t.days).indexOf(day) >= 0); });
}

// フォーム入力の検証・整形。不正なら null。
function cleanForm(d) {
  function s(v, n) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, n); }
  var o = { team: s(d.team, 50), area: s(d.area, 30), category: s(d.category, 20), level: s(d.level, 20), name: s(d.name, 30),
    email: s(d.email, 100).toLowerCase(), days: s(d.days, 40), slot: s(d.slot, 20).toUpperCase(), message: s(d.message, 500) };
  if (!o.team || !o.area || !o.category || !o.name || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(o.email)) return null;
  // 表計算ソフトの数式として解釈されないようにする
  Object.keys(o).forEach(function (k) { if (/^[=+\-@]/.test(o[k]) && k !== 'email') o[k] = "'" + o[k]; });
  return o;
}

function fmtRow(id, e) {
  var p = e.date.split('-');
  return id + ' ' + (+p[1]) + '/' + (+p[2]) + ' ' + e.start + (e.end ? '-' + e.end : '') + ' ' + e.place;
}

// ---------- ボタン入力(日付・時刻ピッカー) ----------
// 途中経過は postback の data に持たせるので、サーバー側に状態を持たなくてよい。
//   w1|種類                      → 日時ピッカーの結果(params.datetime)を受ける
//   w2|種類|日付|開始|終了        → 終了時刻が決まった
//   w2t|種類|日付|開始            → 終了時刻ピッカーの結果(params.time)を受ける
//   w3|種類|日付|開始|終了|会場   → 会場が決まった(登録)
var KINDS = ['練習', '練習試合', '公式戦', '募集'];
var DURATIONS = [[60, '1時間'], [90, '1時間半'], [120, '2時間'], [150, '2時間半'], [180, '3時間']];

function quick_(actions) { return { items: actions.slice(0, 13).map(function (a) { return { type: 'action', action: a }; }) }; }
function addMinutes(hhmm, min) {
  var p = hhmm.split(':'), t = +p[0] * 60 + +p[1] + min;
  return t >= 24 * 60 ? null : pad2(Math.floor(t / 60)) + ':' + pad2(t % 60);
}
function jpDate(date) { var p = date.split('-'), w = new Date(+p[0], p[1] - 1, +p[2]).getDay(); return (+p[1]) + '/' + (+p[2]) + '(' + '日月火水木金土'.charAt(w) + ')'; }
function kindLabel(kind) { return kind === '募集' ? '練習試合の相手を募集' : kind; }

function menuMessage(now) {
  var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  var init = ymd(tomorrow) + 'T09:00', min = ymd(now) + 'T00:00', max = (now.getFullYear() + 1) + '-12-31T23:59';
  function pick(label, kind) { return { type: 'datetimepicker', label: label, data: 'w1|' + kind, mode: 'datetime', initial: init, min: min, max: max }; }
  return { type: 'text', text: '何をのせますか?\n下のボタンを押すと、日付と開始時刻を選べます。',
    quickReply: quick_([pick('練習', '練習'), pick('練習試合', '練習試合'), pick('公式戦', '公式戦'), pick('相手を募集', '募集'),
      { type: 'message', label: '一覧を見る', text: '一覧' }, { type: 'message', label: '使い方', text: 'ヘルプ' }]) };
}

function wizardCommand(kind, date, start, end, place) {
  var o = { cmd: kind === '募集' ? 'slot' : 'schedule', date: date, start: start, end: end, place: String(place).replace(/[\r\n\t|]+/g, ' ').trim().slice(0, 40), note: '' };
  if (o.cmd === 'schedule') o.type = kind;
  return o;
}

// 戻り値: { message } 次の質問 / { message, pending } 会場の入力待ち / { create } 登録内容
function wizardStep(data, params, places) {
  var k = String(data || '').split('|'), step = k[0], kind = k[1], bad = { message: { type: 'text', text: 'もう一度「メニュー」と送って、最初からやり直してください。' } };
  if (KINDS.indexOf(kind) < 0) return bad;
  var date = k[2], start = k[3], end = k[4];
  if (step === 'w1') {
    var m = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}:\d{2})/.exec((params && params.datetime) || '');
    if (!m) return bad;
    date = m[1]; start = m[2];
    var acts = [];
    DURATIONS.forEach(function (d) {
      var e = addMinutes(start, d[0]);
      if (e) acts.push({ type: 'postback', label: d[1] + '(' + e + 'まで)', data: ['w2', kind, date, start, e].join('|'), displayText: e + 'まで' });
    });
    var pickEnd = { type: 'datetimepicker', label: '終了時刻を選ぶ', data: ['w2t', kind, date, start].join('|'), mode: 'time' }, guess = addMinutes(start, 120);
    if (guess) pickEnd.initial = guess;
    acts.push(pickEnd);
    return { message: { type: 'text', text: kindLabel(kind) + '\n' + jpDate(date) + ' ' + start + ' 開始\n\n何時までですか?', quickReply: quick_(acts) } };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(start || '')) return bad;
  if (step === 'w2t') {
    end = (params && params.time) || '';
    if (!/^\d{2}:\d{2}$/.test(end) || end <= start)
      return { message: { type: 'text', text: '終了時刻は、開始(' + start + ')より後にしてください。', quickReply: quick_([{ type: 'datetimepicker', label: '終了時刻を選び直す', data: ['w2t', kind, date, start].join('|'), mode: 'time' }]) } };
    step = 'w2';
  }
  if (!/^\d{2}:\d{2}$/.test(end || '') || end <= start) return bad;
  if (step === 'w2') {
    var base = ['w3', kind, date, start, end].join('|') + '|';
    var acts2 = (places || []).filter(function (p) { return p && (base + p).length <= 300; }).slice(0, 10)
      .map(function (p) { return { type: 'postback', label: p.slice(0, 20), data: base + p, displayText: p }; });
    var msg = { type: 'text', text: jpDate(date) + ' ' + start + '-' + end + '\n\n会場はどこですか?\n' + (acts2.length ? '下から選ぶか、' : '') + '会場名をそのまま送ってください。' };
    if (acts2.length) msg.quickReply = quick_(acts2);
    return { message: msg, pending: { kind: kind, date: date, start: start, end: end } };
  }
  if (step === 'w3') {
    var c = wizardCommand(kind, date, start, end, k.slice(5).join('|'));
    return c.place ? { create: c } : bad;
  }
  return bad;
}

// 最近使った会場(新しい順・重複なし)
function recentPlaces(rows, limit) {
  var seen = {}, out = [];
  rows.slice().reverse().forEach(function (r) { var p = String(r.place || '').trim(); if (p && !seen[p]) { seen[p] = 1; out.push(p); } });
  return out.slice(0, limit || 8);
}
