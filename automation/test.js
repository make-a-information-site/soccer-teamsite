// node automation/test.js  — Logic.gs の動作確認
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname + '/Logic.gs', 'utf8'), ctx);
const now = new Date(2026, 10, 12), eq = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
const pc = t => ctx.parseCommand(t, now);
eq(pc('予定 12/13 9:00-11:00 高瀬下水処理場グラウンド'), { cmd: 'schedule', date: '2026-12-13', start: '09:00', end: '11:00', place: '高瀬下水処理場グラウンド', note: '', type: '練習' });
eq(pc('予定 12月13日 9時〜11時 Aグラウンド 公式戦 雨天中止'), { cmd: 'schedule', date: '2026-12-13', start: '09:00', end: '11:00', place: 'Aグラウンド', note: '雨天中止', type: '公式戦' });
eq(pc('募集 1/10 13:00~15:00 Bコート'), { cmd: 'slot', date: '2027-01-10', start: '13:00', end: '15:00', place: 'Bコート', note: '' });
eq(pc('募集 12/20 13時30分-15時 サッカーセンター').start, '13:30');
eq(pc('募集 12/20 13:00-15:00 サッカーセンター').place, 'サッカーセンター');
eq(pc('予定 13/40 9:00 A').cmd, 'error'); eq(pc('予定 2/30 9:00 A').cmd, 'error');
eq(pc('予定 12/13 25:00 A').cmd, 'error'); eq(pc('予定 12/13 11:00-9:00 A').cmd, 'error'); eq(pc('予定 12/13 9:00').cmd, 'error');
eq(pc('削除 y3'), { cmd: 'delete', id: 'Y3' }); eq(pc('削除 3').cmd, 'error');
eq(pc('一覧').cmd, 'list'); eq(pc('ID').cmd, 'id'); eq(pc('こんにちは').cmd, 'unknown');
eq(ctx.dayLabel('2026-12-13'), '日曜'); eq(ctx.dayLabel('2026-12-12'), '土曜'); eq(ctx.dayLabel('2026-12-14'), '平日夜');
eq(ctx.teamsToNotify([{ email: 'a@x.jp', days: '土曜、日曜' }, { email: 'b@x.jp', days: '土曜' }, { email: 'c@x.jp', days: '' }], { date: '2026-12-13' }).map(t => t.email), ['a@x.jp', 'c@x.jp']);
const ok = { team: 'FC テスト', area: '市川市', category: '社会人', name: 'たろう', email: 'T@Example.com', slot: 'b1' };
eq(ctx.cleanForm(ok).email, 't@example.com'); eq(ctx.cleanForm(ok).slot, 'B1');
eq(ctx.cleanForm({ ...ok, email: 'x' }), null); eq(ctx.cleanForm({ ...ok, team: '' }), null);
eq(ctx.cleanForm({ ...ok, email: 'a@b.jp,evil@x.jp' }), null);
eq(ctx.cleanForm({ ...ok, team: '=HYPERLINK("x")' }).team, '\'=HYPERLINK("x")');
console.log('all tests passed');

// ---- ボタン入力 ----
const menu = ctx.menuMessage(now);
eq(menu.quickReply.items.length, 6); eq(menu.quickReply.items[0].action.initial, '2026-11-13T09:00'); eq(menu.quickReply.items[3].action.data, 'w1|募集');
let s1 = ctx.wizardStep('w1|練習', { datetime: '2026-12-13T09:00' }, []);
eq(s1.message.quickReply.items.length, 6); eq(s1.message.quickReply.items[2].action.data, 'w2|練習|2026-12-13|09:00|11:00');
eq(ctx.wizardStep('w1|練習', { datetime: '2026-12-13T22:30' }, []).message.quickReply.items.map(i => i.action.label), ['1時間(23:30まで)', '終了時刻を選ぶ']);
let s2 = ctx.wizardStep('w2|練習|2026-12-13|09:00|11:00', null, ['Aグラウンド', 'B|x']);
eq(s2.pending, { kind: '練習', date: '2026-12-13', start: '09:00', end: '11:00' }); eq(s2.message.quickReply.items[0].action.data, 'w3|練習|2026-12-13|09:00|11:00|Aグラウンド');
assert(!ctx.wizardStep('w2|練習|2026-12-13|09:00|11:00', null, []).message.quickReply);
eq(ctx.wizardStep('w2t|募集|2026-12-13|09:00', { time: '12:15' }, []).pending.end, '12:15');
assert(!ctx.wizardStep('w2t|募集|2026-12-13|09:00', { time: '08:00' }, []).pending);
eq(ctx.wizardStep('w3|公式戦|2026-12-13|09:00|11:00|Aグラウンド').create, { cmd: 'schedule', date: '2026-12-13', start: '09:00', end: '11:00', place: 'Aグラウンド', note: '', type: '公式戦' });
eq(ctx.wizardStep('w3|募集|2026-12-13|09:00|11:00|B').create.cmd, 'slot');
for (const bad of ['w3|x|2026-12-13|09:00|11:00|A', 'w3|練習|2026-12-13|09:00|08:00|A', 'w3|練習|2026-12-13|09:00|11:00|', 'zz', 'w1|練習']) assert(ctx.wizardStep(bad, {}, []).message, bad);
eq(ctx.recentPlaces([{ place: 'A' }, { place: 'B' }, { place: 'A' }, { place: '' }]), ['A', 'B']);
eq(pc('メニュー').cmd, 'menu'); eq(pc('予定').cmd, 'menu'); eq(pc('募集').cmd, 'menu'); eq(pc('予定 12/13 9:00 A').cmd, 'schedule');
// LINE の制限: ラベル20文字、data 300文字、クイックリプライ13件
const long = 'あ'.repeat(40), all = [menu, s1.message, ctx.wizardStep('w2|練習|2026-12-13|09:00|11:00', null, Array.from({ length: 20 }, (_, i) => long + i)).message];
for (const m of all) { assert(m.quickReply.items.length <= 13); for (const i of m.quickReply.items) { assert(i.action.label.length <= 20, i.action.label); assert((i.action.data || '').length <= 300); } }
console.log('wizard tests passed');
