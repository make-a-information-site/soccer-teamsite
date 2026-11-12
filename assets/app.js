(function () {
  var C = window.SITE_CONFIG || {};
  var NAV = [["index.html", "ホーム"], ["schedule.html", "予定表"], ["matching.html", "練習試合"], ["register.html", "チーム登録"]];
  var here = location.pathname.split("/").pop() || "index.html";

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  window.el = el;

  // 共通ヘッダー・フッター
  var nav = el("nav", { "aria-label": "メインメニュー" }, NAV.map(function (n) {
    var a = el("a", { href: n[0], text: n[1] });
    if (n[0] === here) a.setAttribute("aria-current", "page");
    return a;
  }));
  var header = el("header", { class: "site" }, [el("div", { class: "wrap" }, [
    el("a", { class: "brand", href: "index.html", text: "⚽ " + (C.teamName || "") }), nav])]);
  document.body.prepend(header, el("div", { class: "stripe" }));
  document.body.append(el("footer", { class: "site" }, [el("div", { class: "wrap" }, [
    el("a", { href: "privacy.html", text: "個人情報の取り扱い" }),
    el("a", { href: "register.html", text: "チーム登録" }),
    el("div", { text: "© " + new Date().getFullYear() + " " + (C.teamName || "") })])]));

  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  function parse(d) { var p = String(d).split("-"); return new Date(+p[0], p[1] - 1, +p[2]); }
  function today() { var t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
  function time(e) { return e.start ? e.start + (e.end ? "〜" + e.end : "") : ""; }
  function dateBox(e) {
    var d = parse(e.date);
    return el("div", { class: "date" }, [document.createTextNode((d.getMonth() + 1) + "/" + d.getDate() + "(" + WD[d.getDay()] + ")"),
      el("small", { text: time(e) })]);
  }
  function load(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function upcoming(list) {
    var t = today();
    return list.filter(function (e) { return parse(e.date) >= t; })
      .sort(function (a, b) { return (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")); });
  }
  function fail(box) { box.replaceChildren(el("div", { class: "empty", text: "データを読み込めませんでした。時間をおいて再度お試しください。" })); }

  // 予定表: <div data-schedule data-limit="3">
  var TYPE_CLASS = { "練習試合": "match", "公式戦": "official" };
  document.querySelectorAll("[data-schedule]").forEach(function (box) {
    load("data/schedule.json").then(function (list) {
      var items = upcoming(list), limit = +box.dataset.limit || 0, month = "";
      if (limit) items = items.slice(0, limit);
      box.replaceChildren();
      if (!items.length) return box.append(el("div", { class: "empty", text: "現在、公開中の予定はありません。" }));
      items.forEach(function (e) {
        var d = parse(e.date), m = d.getFullYear() + "年" + (d.getMonth() + 1) + "月";
        if (!limit && m !== month) { month = m; box.append(el("div", { class: "month", text: m })); }
        box.append(el("div", { class: "item" }, [dateBox(e),
          el("div", { class: "body" }, [
            el("strong", {}, [el("span", { class: "tag " + (TYPE_CLASS[e.type] || ""), text: e.type || "練習" }), document.createTextNode(e.title || "")]),
            el("span", { text: [e.place, e.note].filter(Boolean).join(" / ") })])]));
      });
    }).catch(function () { fail(box); });
  });

  // 練習試合の募集枠: <div data-matches>
  document.querySelectorAll("[data-matches]").forEach(function (box) {
    load("data/matches.json").then(function (list) {
      var items = upcoming(list), limit = +box.dataset.limit || 0;
      if (limit) items = items.filter(function (e) { return e.status === "募集中"; }).slice(0, limit);
      box.replaceChildren();
      if (!items.length) return box.append(el("div", { class: "empty", text: "現在、募集中の枠はありません。チーム登録をしていただくと、枠が出た際にご連絡します。" }));
      items.forEach(function (e) {
        var open = e.status === "募集中";
        var label = e.date + " " + time(e) + " " + (e.place || "");
        box.append(el("div", { class: "item" }, [dateBox(e),
          el("div", { class: "body" }, [
            el("strong", {}, [el("span", { class: "tag " + (open ? "match" : "closed"), text: e.status || "募集中" }), document.createTextNode(e.place || "")]),
            el("span", { text: [e.format, e.level, e.note].filter(Boolean).join(" / ") })]),
          open ? el("a", { class: "btn small", href: "register.html?slot=" + encodeURIComponent(e.id || "") + "&match=" + encodeURIComponent(label), text: "申し込む" }) : null]));
      });
    }).catch(function () { fail(box); });
  });

  // チーム登録フォーム
  var form = document.getElementById("register-form");
  if (form) {
    var result = document.getElementById("result"), btn = form.querySelector("button[type=submit]");
    var m = new URLSearchParams(location.search).get("match");
    if (m) form.elements.match.value = m.slice(0, 100);
    form.elements.slot.value = (new URLSearchParams(location.search).get("slot") || "").slice(0, 20);
    if (!C.formEndpoint && !C.contactEmail) {
      btn.disabled = true;
      result.className = "ng";
      result.textContent = "ただいま受付準備中です。";
    }
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (form.elements.website.value) return; // ボット対策(ハニーポット)
      var data = {};
      new FormData(form).forEach(function (v, k) { if (k !== "website" && k !== "agree") data[k] = data[k] ? data[k] + "、" + v : v; });
      if (C.formEndpoint) {
        btn.disabled = true; result.className = ""; result.textContent = "送信中…";
        fetch(C.formEndpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(data) })
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(function (j) { if (!j.ok) throw new Error("ng"); form.reset(); result.className = "ok"; result.textContent = "送信しました。確認メールをお送りします。"; })
          .catch(function () { result.className = "ng"; result.textContent = "送信に失敗しました。時間をおいて再度お試しください。"; })
          .finally(function () { btn.disabled = false; });
      } else {
        var LABEL = { team: "チーム名", area: "活動エリア", category: "カテゴリ", level: "レベル感", name: "代表者の呼び名", email: "連絡用メール", days: "希望曜日", match: "希望枠", message: "メッセージ" };
        var body = Object.keys(data).map(function (k) { return (LABEL[k] || k) + ": " + data[k]; }).join("\n");
        location.href = "mailto:" + C.contactEmail + "?subject=" + encodeURIComponent("【チーム登録】" + data.team) + "&body=" + encodeURIComponent(body);
        result.className = "ok"; result.textContent = "メールアプリが開きます。そのまま送信してください。";
      }
    });
  }
})();
