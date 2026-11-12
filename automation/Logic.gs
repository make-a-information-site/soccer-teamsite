// 純粋ロジック(Google のサービスに触らない)。Code.gs から使う。
var TYPES = ['練習', '練習試合', '公式戦'];
var HELP = [
  '【使い方】そのまま真似して送ってください',
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
