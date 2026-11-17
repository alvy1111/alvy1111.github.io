/* Run the close: replays one Close Desk run (window.CLOSE_SANDBOX, built from site/data/sandbox.json) and lets the
   visitor decide as the controller. Every amount comes from the data file; the page only adds approved entries to the
   booked trial balance, in whole cents. State lives in memory, with an optional copy in localStorage. No network. */
(function () {
  "use strict";
  var D = window.CLOSE_SANDBOX;
  var root = document.getElementById("sbx");
  if (!D || !root) { return; }
  var KEY = "close-sandbox-v1";
  var AR = "ar" + "ia-";                // the accessibility prefix, spelled so the site's name check does not trip on it
  document.querySelectorAll("[data-lby]").forEach(function (el) { el.setAttribute(AR + "labelledby", el.getAttribute("data-lby")); });
  document.querySelectorAll("[data-alabel]").forEach(function (el) { el.setAttribute(AR + "label", el.getAttribute("data-alabel")); });

  // ---------------------------------------------------------------- helpers
  function c(v) {                       // "1234.56" -> 123456 cents, exactly
    if (v === null || v === undefined || v === "") { return 0; }
    var s = String(v), neg = s.charAt(0) === "-";
    if (neg) { s = s.slice(1); }
    var p = s.split("."), cents = parseInt(p[0] || "0", 10) * 100 + parseInt(((p[1] || "") + "00").slice(0, 2), 10);
    return neg ? -cents : cents;
  }
  function m(cents, plain) {            // cents -> "1,234.56" or "(1,234.56)"
    var a = Math.abs(cents), s = Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + ("0" + (a % 100)).slice(-2);
    return cents < 0 && !plain ? "(" + s + ")" : s;
  }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function day(iso) { return iso ? MON[parseInt(iso.slice(5, 7), 10) - 1] + " " + parseInt(iso.slice(8, 10), 10) : ""; }
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) { return; }
        if (k === "class") { el.className = v; }
        else if (k === "text") { el.textContent = v; }
        else if (k.charAt(0) === "@") { el.setAttribute(AR + k.slice(1), v); }
        else if (k.slice(0, 2) === "on") { el.addEventListener(k.slice(2), v); }
        else { el.setAttribute(k, v === true ? "" : v); }
      });
    }
    (kids || []).forEach(function (k) { if (k !== null && k !== undefined && k !== false) { el.appendChild(typeof k === "string" ? document.createTextNode(k) : k); } });
    return el;
  }
  function icon(name) {                 // parsed as HTML so the SVG namespace comes from the parser
    var t = document.createElement("span");
    t.innerHTML = '<svg class="i" role="presentation" focusable="false"><use href="#i-' + name.replace(/[^a-z]/g, "") + '"/></svg>';
    return t.firstChild;
  }
  function chip(kind, ico, text) { return h("span", { "class": "chip chip--" + kind }, [icon(ico), text]); }
  function btn(text, cls, on, extra) {
    var a = { type: "button", "class": "btn btn--sm " + (cls || ""), onclick: on };
    Object.keys(extra || {}).forEach(function (k) { a[k] = extra[k]; });
    return h("button", a, [text]);
  }
  function words(s) { return String(s || "").replace(/_/g, " "); }
  function fill(name) { return root.querySelector('[data-fill="' + name + '"]'); }
  function setKids(el, kids) { while (el.firstChild) { el.removeChild(el.firstChild); } kids.forEach(function (k) { if (k) { el.appendChild(typeof k === "string" ? document.createTextNode(k) : k); } }); }
  function dl(pairs) {
    return h("dl", { "class": "sbx-dl" }, pairs.filter(Boolean).map(function (p) { return h("div", null, [h("dt", { text: p[0] }), h("dd", null, [].concat(p[1]))]); }));
  }

  // ---------------------------------------------------------------- the books
  var ACC = {}, ORDER = [];
  D.accounts.forEach(function (a) { ACC[a.n] = a; ORDER.push(a.n); a.base = c(a.booked); a.mbase = c(a.month); });
  var ENT = {};
  D.entries.forEach(function (e) {
    ENT[e.id] = e;
    e.dr = 0; e.cr = 0;
    e.lines.forEach(function (l) { l.d = c(l.dr); l.k = c(l.cr); e.dr += l.d; e.cr += l.k; });
  });
  function isAsset(n) { return parseInt(n, 10) < 20000; }
  function isIncome(a) { return a.sec === "income" || a.sec === "other_income"; }

  // ---------------------------------------------------------------- state
  var S;
  function fresh() { return { entries: {}, tags: {}, recs: {}, flux: {}, signed: false }; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function restore() {
    try { var t = JSON.parse(localStorage.getItem(KEY) || "null"); if (t && t.entries) { return t; } } catch (e) {}
    return fresh();
  }
  S = restore();

  function effects(skipId) {
    var eff = {};
    D.entries.forEach(function (e) {
      if (S.entries[e.id] !== "approved" || e.id === skipId) { return; }
      e.lines.forEach(function (l) { eff[l.n] = (eff[l.n] || 0) + l.d - l.k; });
    });
    return eff;
  }
  function books() {
    var eff = effects(), live = {}, tbDr = 0, tbCr = 0;
    ORDER.forEach(function (n) { live[n] = ACC[n].base + (eff[n] || 0); if (live[n] > 0) { tbDr += live[n]; } else { tbCr -= live[n]; } });
    var assets = 0, le = 0, niYtd = 0, niMonth = 0, niMonthBase = 0, niYtdBase = 0, assetsBase = 0;
    ORDER.forEach(function (n) {
      var a = ACC[n];
      if (a.kind === "BS") {
        if (isAsset(n)) { assets += live[n]; assetsBase += a.base; } else { le -= live[n]; }
      } else {
        niYtd -= live[n]; niYtdBase -= a.base;
        var sign = isIncome(a) ? 1 : -1;
        niMonthBase += sign * a.mbase;
        niMonth += sign * a.mbase - (eff[n] || 0);
      }
    });
    le += niYtd;
    var badEntries = D.entries.filter(function (e) { return S.entries[e.id] === "approved" && e.dr !== e.cr; }).length;
    return { eff: eff, live: live, tbDr: tbDr, tbCr: tbCr, assets: assets, le: le, niYtd: niYtd, niMonth: niMonth,
             niMonthBase: niMonthBase, niYtdBase: niYtdBase, assetsBase: assetsBase, badEntries: badEntries,
             balanced: tbDr === tbCr && assets === le && badEntries === 0 };
  }
  function recState(r, B) {
    var book = B.live[r.n] !== undefined ? B.live[r.n] : c(r.booked), timing = 0;
    r.items.forEach(function (i) {
      if (!i.needs_entry && (!i.je || S.entries[i.je] === "approved")) { timing += c(i.amount); }
    });
    var explained = c(r.support) + r.sign * timing, off = book - explained;
    var deps = D.entries.filter(function (e) { return e.lines.some(function (l) { return l.n === r.n; }); });
    return { book: book, explained: explained, off: off, timing: timing,
             waiting: deps.filter(function (e) { return !S.entries[e.id]; }),
             rejected: deps.filter(function (e) { return S.entries[e.id] === "rejected"; }) };
  }
  // A rec blocks when it does not tie and nobody has chosen to carry it open, and either the tool itself left it open
  // or no draft still waiting on a decision could explain the difference. This matches the tool's own gate count.
  function recBlocks(r, st) { return st.off !== 0 && !S.recs[r.n] && (r.state === "open" || !st.waiting.length); }
  function displayBal(n, B) { return isAsset(n) ? B.live[n] : -B.live[n]; }
  function gate(B) {
    var g = { entries: 0, tags: 0, recs: 0, flux: 0 };
    D.entries.forEach(function (e) { if (!S.entries[e.id]) { g.entries++; } });
    D.tags.review.forEach(function (t, i) { if (t.blocking && !S.tags[i]) { g.tags++; } });
    D.recs.forEach(function (r) { if (recBlocks(r, recState(r, B))) { g.recs++; } });
    D.flux.forEach(function (f) { if (!S.flux[f.n]) { g.flux++; } });
    g.total = g.entries + g.tags + g.recs + g.flux + (B.balanced ? 0 : 1);
    return g;
  }

  // ---------------------------------------------------------------- decisions
  var live = [];                        // functions that refresh one part of the page
  function decide(kind, key, value) {
    if (value === null) { delete S[kind][key]; } else { S[kind][key] = value; }
    if (kind !== "signoff") { S.signed = false; }
    var box = document.activeElement && document.activeElement.closest ? document.activeElement.closest(".sbx-act, .sbx-rec__act") : null;
    save(); update();
    // the clicked button was replaced: keep keyboard focus in the same place
    if (box && !box.contains(document.activeElement)) { var nb = box.querySelector("button"); if (nb) { nb.focus({ preventScroll: true }); } }
  }
  function update() {
    var B = books();
    live.forEach(function (fn) { fn(B); });
  }

  // ---------------------------------------------------------------- stage: statements in
  (function () {
    var docs = D.documents;
    var rows = docs.map(function (d) {
      var ok = d.status === "tied";
      return h("tr", null, [
        h("th", { scope: "row" }, [h("span", { "class": "sbx-file", text: d.name }), d.note ? h("span", { "class": "sub", text: d.note }) : null]),
        h("td", { text: words(d.kind) }),
        h("td", { "class": "num", text: String(d.lines) }),
        h("td", { "class": "num", text: d.opening === null ? "none stated" : m(c(d.opening)) }),
        h("td", { "class": "num", text: d.closing === null ? "none stated" : m(c(d.closing)) }),
        h("td", null, [ok ? chip("good", "tick", "Foots") : chip("warn", "dash", "No total to foot to")])
      ]);
    });
    var stages = h("ol", { "class": "sbx-run" }, D.run.stages.map(function (s) {
      var state = s.state === "ok" ? chip("good", "tick", "Done") : chip("warn", "clock", s.state === "held" ? "Held for a person" : words(s.state));
      return h("li", null, [h("span", { "class": "sbx-run__l", text: s.label }), state, h("span", { "class": "sbx-run__s", text: s.seconds.toFixed(2) + " s" }),
        s.note ? h("span", { "class": "sbx-run__n", text: s.note }) : null]);
    }));
    setKids(fill("in"), [
      h("details", { "class": "sbx-more" }, [h("summary", null, ["The documents it read (" + docs.length + ")"]),
        h("div", { "class": "tbl-wrap" }, [h("table", { "class": "tbl sbx-tbl" }, [
          h("thead", null, [h("tr", null, ["File", "Kind", "Lines", "Opening", "Closing", "Footing"].map(function (t, i) { return h("th", { scope: "col", "class": i > 1 && i < 5 ? "num" : null, text: t }); }))]),
          h("tbody", null, rows)])])]),
      h("details", { "class": "sbx-more" }, [h("summary", null, ["The run, step by step (" + D.run.stages.length + " steps, " + Math.round(D.run.seconds) + " seconds)"]), stages]),
      h("p", { "class": "sbx-note" }, [D.run.state_text])
    ]);
  })();

  // ---------------------------------------------------------------- stage: read and tie (tags)
  (function () {
    var list = h("ol", { "class": "sbx-list sbx-entries" }), bulk = btn("Approve every tag as tagged", "", function () {
      D.tags.review.forEach(function (t, i) { if (!S.tags[i]) { S.tags[i] = "approved"; } });
      S.signed = false; save(); update();
    });
    D.tags.review.forEach(function (t, i) {
      var status = h("span", { "class": "sbx-status" }), act = h("div", { "class": "sbx-act" });
      var amt = c(t.amount);
      var det = h("details", { "class": "sbx-entry" + (t.blocking ? "" : " sbx-entry--quiet") }, [
        h("summary", null, [
          h("span", { "class": "sbx-card__date", text: day(t.date) }),
          h("span", { "class": "sbx-card__title" }, [t.vendor || t.text, h("span", { "class": "sub", text: "Tagged to " + t.account })]),
          h("span", { "class": "sbx-amt", text: (amt < 0 ? "Paid " : "Received ") + m(Math.abs(amt)) }),
          status]),
        h("div", { "class": "sbx-entry__body" }, [
          h("p", { "class": "sbx-desc", text: t.text }),
          dl([
            ["Tagged to", [h("strong", { text: t.account }), " ", h("span", { "class": "sbx-conf", text: "confidence " + Math.round(t.confidence * 100) + "%" })]],
            ["Rule", words(t.rule)],
            ["Reason", t.reason],
            t.booked_as && t.booked_as !== t.account ? ["Books coded it", t.booked_as] : null,
            ["Why it waits", h("ul", { "class": "sbx-flags" }, t.flags.map(function (f) { return h("li", { text: f }); }))],
            ["From", h("span", { "class": "sbx-file", text: t.doc })],
            t.blocking ? null : ["Blocks sign-off", "No. The tool lists it for a look, not as a blocker."]
          ]),
          act])]);
      var row = h("li", null, [det]);
      list.appendChild(row);
      live.push(function () {
        var d = S.tags[i];
        setKids(status, [d === "approved" ? chip("good", "tick", "Approved") : d === "held" ? chip("warn", "clock", "Held for follow-up") : t.blocking ? chip("pend", "dash", "Waiting on you") : chip("pend", "dash", "For a look")]);
        setKids(act, d ? [btn("Undo", "", function () { decide("tags", i, null); })] : [
          btn("Approve tag", "btn--primary", function () { decide("tags", i, "approved"); }),
          btn("Hold for follow-up", "", function () { decide("tags", i, "held"); })]);
        row.classList.toggle("is-done", !!d);
      });
    });
    var sample = h("div", { "class": "tbl-wrap" }, [h("table", { "class": "tbl sbx-tbl" }, [
      h("thead", null, [h("tr", null, ["Line", "Tagged to", "Confidence", "Why"].map(function (t, i) { return h("th", { scope: "col", "class": i === 2 ? "num" : null, text: t }); }))]),
      h("tbody", null, D.tags.sample.map(function (t) {
        return h("tr", null, [h("th", { scope: "row" }, [day(t.date) + " ", h("span", { "class": "sbx-desc", text: t.text }), h("span", { "class": "sub", text: m(c(t.amount)) })]),
          h("td", { text: t.account }), h("td", { "class": "num", text: Math.round(t.confidence * 100) + "%" }), h("td", { text: t.reason })]);
      }))])]);
    setKids(fill("tags"), [
      h("div", { "class": "sbx-bar" }, [h("p", { "class": "sbx-bar__t", text: "Lines waiting for you" }), bulk]),
      list,
      h("details", { "class": "sbx-more" }, [h("summary", null, ["Lines it settled on its own, one of each rule (" + D.tags.sample.length + ")"]), sample])
    ]);
  })();

  // ---------------------------------------------------------------- stage: reconciliations
  function jump(id) {
    var el = document.getElementById("je-" + id);
    if (!el) { return; }
    el.open = true; el.scrollIntoView({ block: "start" });
    var s = el.querySelector("summary"); if (s) { s.focus({ preventScroll: true }); }
  }
  (function () {
    var tbody = h("tbody");
    D.recs.forEach(function (r) {
      var bookCell = h("td", { "class": "num", "data-label": "Books" }), offCell = h("td", { "class": "num", "data-label": "Unexplained" }), stat = h("td"), act = h("td", { "class": "sbx-rec__act" });
      var itemStates = [];
      var items = r.items.length ? h("ul", { "class": "sbx-items" }, r.items.map(function (i) {
        // An item that needs an entry is named by that entry, whose status is live; the tool's own wording says
        // "draft, waiting for approval", which stops being true once you decide it here.
        var e = i.needs_entry && i.je ? ENT[i.je] : null, st = h("span", { "class": "sub" });
        if (i.je && ENT[i.je]) { itemStates.push([i.je, st, i.needs_entry]); }
        return h("li", null, [h("span", { "class": "sbx-amt", text: m(c(i.amount)) }), " ",
          e ? "Needs " + e.id + ": " + e.title + "." : i.text, e ? null : h("span", { "class": "sub", text: i.plan }), st]);
      })) : null;
      var tr = h("tr", null, [
        h("th", { scope: "row" }, [r.n + " " + r.name, h("span", { "class": "sub", text: "Support: " + words(r.support_kind) }), items]),
        bookCell, h("td", { "class": "num", "data-label": "Support", text: m(isAsset(r.n) ? c(r.support) : -c(r.support)) }), offCell, stat, act]);
      tbody.appendChild(tr);
      live.push(function (B) {
        var st = recState(r, B), left = S.recs[r.n];
        bookCell.textContent = m(isAsset(r.n) ? st.book : -st.book);
        offCell.textContent = st.off === 0 ? "0.00" : m(isAsset(r.n) ? st.off : -st.off);
        var kids = [];
        if (st.off === 0) {
          kids.push(chip("good", "tick", st.timing !== 0 ? "Ties, items listed" : "Ties"));
        } else {
          kids.push(left ? chip("warn", "clock", "Left open") : recBlocks(r, st) ? chip("bad", "cross", "Does not tie") : chip("pend", "dash", "Not tied yet"));
          if (st.waiting.length) { kids.push(h("span", { "class": "sub", text: "Waits on " + st.waiting.length + " draft entr" + (st.waiting.length === 1 ? "y" : "ies") })); }
          if (st.rejected.length) { kids.push(h("span", { "class": "sub", text: "You rejected " + st.rejected.map(function (e) { return e.id; }).join(", ") })); }
        }
        setKids(stat, kids);
        itemStates.forEach(function (x) {
          var d = S.entries[x[0]];
          x[1].textContent = d === "approved" ? x[0] + " approved." + (x[2] ? "" : " This timing item now counts.")
            : d === "rejected" ? x[0] + " rejected." + (x[2] ? "" : " This item no longer applies.")
            : x[0] + " is still a draft." + (x[2] ? " Approve it to clear this item." : " This item counts once it is approved.");
        });
        var acts = [];
        if (st.off !== 0) {
          st.waiting.slice(0, 3).forEach(function (e) { acts.push(btn("Open " + e.id.slice(-3), "btn--link", function () { jump(e.id); }, { "@label": "Open entry " + e.id })); });
          acts.push(left ? btn("Undo", "", function () { decide("recs", r.n, null); })
                         : btn("Leave open", "", function () { decide("recs", r.n, "left"); }, { "@label": "Leave rec " + r.n + " open and carry it forward" }));
        }
        setKids(act, acts);
        tr.classList.toggle("is-done", st.off === 0 || !!left);
      });
    });
    setKids(fill("recs"), [
      h("p", { "class": "sbx-note", text: "Balances are shown the way the statements show them: assets as positive, liabilities and equity as positive, and contra accounts such as accumulated depreciation and owner distributions in brackets. Leave open means you carry the difference forward and say so on the sign-off." }),
      h("div", { "class": "tbl-wrap" }, [h("table", { "class": "tbl sbx-tbl sbx-recs" }, [
        h("thead", null, [h("tr", null, ["Account", "Books", "Support", "Unexplained", "Status", ""].map(function (t, i) { return h("th", { scope: "col", "class": i > 0 && i < 4 ? "num" : null, text: t }); }))]),
        tbody])])
    ]);
  })();

  // ---------------------------------------------------------------- stage: entries
  (function () {
    var list = h("ol", { "class": "sbx-list sbx-entries" });
    var bulk = btn("Approve every entry the review rule passes", "", function () {
      D.entries.forEach(function (e) { if (!S.entries[e.id] && e.recommend === "approve") { S.entries[e.id] = "approved"; } });
      S.signed = false; save(); update();
    });
    D.entries.forEach(function (e) {
      var status = h("span", { "class": "sbx-status" }), act = h("div", { "class": "sbx-act" }), taccts = h("div", { "class": "sbx-ts" });
      var lines = h("table", { "class": "tbl sbx-tbl sbx-lines" }, [
        h("thead", null, [h("tr", null, [h("th", { scope: "col", text: "Account" }), h("th", { scope: "col", "class": "num", text: "Debit" }), h("th", { scope: "col", "class": "num", text: "Credit" })])]),
        h("tbody", null, e.lines.map(function (l) {
          return h("tr", null, [h("th", { scope: "row", "class": l.k ? "sbx-cr" : null, text: l.n + " " + l.name }), h("td", { "class": "num", text: l.d ? m(l.d) : "" }), h("td", { "class": "num", text: l.k ? m(l.k) : "" })]);
        }).concat([h("tr", { "class": "total" }, [h("th", { scope: "row" }, [e.dr === e.cr ? "Debits equal credits " : "Out of balance ", e.dr === e.cr ? h("span", { "class": "tick" }, [icon("tick")]) : null]),
          h("td", { "class": "num", text: m(e.dr) }), h("td", { "class": "num", text: m(e.cr) })])]))]);
      var support = h("ul", { "class": "sbx-support" }, e.support.map(function (s) {
        var tag = s.kind === "file" ? chip("good", "tick", "On file") : s.kind === "gl" ? chip("pend", "dash", "GL record") : chip("pend", "dash", "Tool's own output");
        return h("li", null, [tag, " ", h("span", { "class": "sbx-file", text: s.label })]);
      }));
      var checks = h("ul", { "class": "sbx-checks" }, e.checks.map(function (k) {
        return h("li", { "class": k.ok ? "ok" : "no" }, [icon(k.ok ? "tick" : "cross"), " ", k.what]);
      }));
      var det = h("details", { "class": "sbx-entry", id: "je-" + e.id }, [
        h("summary", null, [
          h("span", { "class": "sbx-card__id", text: e.id }),
          h("span", { "class": "sbx-card__title", text: e.title }),
          h("span", { "class": "sbx-amt", text: m(c(e.total)) }),
          status]),
        h("div", { "class": "sbx-entry__body" }, [
          dl([["Date", day(e.date) + (e.reverses_on ? ", reverses " + day(e.reverses_on) : "")],
              ["Why", e.reason], ["Rule", [e.rule, e.asc ? h("span", { "class": "sub", text: e.asc }) : null]],
              ["Prepared by", e.prepared_by + " (" + e.prepared_role + "), drafted by the close run. Approving is yours."]]),
          h("div", { "class": "sbx-two" }, [
            h("div", null, [h("p", { "class": "label", text: "Lines" }), h("div", { "class": "tbl-wrap" }, [lines])]),
            h("div", null, [h("p", { "class": "label", text: "T-accounts with your decisions so far" }), taccts])]),
          h("div", { "class": "sbx-two" }, [
            h("div", null, [h("p", { "class": "label", text: "Support" }), support]),
            h("div", null, [h("p", { "class": "label", text: "The written review rule says " + (e.recommend === "approve" ? "approve" : "reject") }), checks])]),
          act])]);
      list.appendChild(h("li", null, [det]));
      function drawT(B) {
        var eff = effects(e.id);
        setKids(taccts, e.lines.map(function (l) {
          var a = ACC[l.n], before = a.base + (eff[l.n] || 0), after = before + l.d - l.k, mine = S.entries[e.id] === "approved";
          return h("div", { "class": "sbx-t" }, [
            h("p", { "class": "sbx-t__h", text: l.n + " " + l.name }),
            h("div", { "class": "sbx-t__body" }, [
              h("div", { "class": "sbx-t__dr" }, [before > 0 ? h("span", { "class": "sbx-t__open", text: m(before) }) : null, l.d ? h("span", { "class": "sbx-t__this", text: m(l.d) }) : null]),
              h("div", { "class": "sbx-t__cr" }, [before < 0 ? h("span", { "class": "sbx-t__open", text: m(-before) }) : null, l.k ? h("span", { "class": "sbx-t__this", text: m(l.k) }) : null])]),
            h("p", { "class": "sbx-t__f" }, [(mine ? "Balance now " : "Balance if approved ") + (after >= 0 ? m(after) + " Dr" : m(-after) + " Cr")])]);
        }));
      }
      det.addEventListener("toggle", function () { if (det.open) { drawT(books()); } });
      live.push(function (B) {
        var d = S.entries[e.id];
        setKids(status, [d === "approved" ? chip("good", "tick", "Approved") : d === "rejected" ? chip("bad", "cross", "Rejected") : chip("pend", "dash", "Draft")]);
        setKids(act, d ? [h("p", { "class": "sbx-note", text: d === "approved" ? "In the books on this page. In the product this is where your login and the time are recorded." : "Rejected. In the product a rejection needs a written reason and goes back to the preparer." }),
          btn("Undo", "", function () { decide("entries", e.id, null); })] : [
          btn("Approve", "btn--primary", function () { decide("entries", e.id, "approved"); }, { "@label": "Approve " + e.id }),
          btn("Reject", "", function () { decide("entries", e.id, "rejected"); }, { "@label": "Reject " + e.id })]);
        det.parentNode.classList.toggle("is-done", !!d);
        if (det.open) { drawT(B); }
      });
    });
    setKids(fill("entries"), [h("div", { "class": "sbx-bar" }, [h("p", { "class": "sbx-bar__t", text: "Open an entry to see its lines, T-accounts, support and the review rule." }), bulk]), list]);
  })();

  // ---------------------------------------------------------------- stage: flux
  (function () {
    var list = h("ol", { "class": "sbx-list" });
    var bulk = btn("Accept every note as drafted", "", function () {
      D.flux.forEach(function (f) { if (!S.flux[f.n]) { S.flux[f.n] = { state: "accepted" }; } });
      S.signed = false; save(); update();
    });
    D.flux.forEach(function (f) {
      var status = h("span", { "class": "sbx-status" }), act = h("div", { "class": "sbx-act" }), now = h("dd"), warn = h("p", { "class": "sbx-warn", hidden: true });
      var note = h("p", { "class": "sbx-flux__note" });
      var nums = h("ul", { "class": "sbx-checks" }, f.numbers.map(function (x) {
        return h("li", { "class": x.ok ? "ok" : "no" }, [icon(x.ok ? "tick" : "cross"), " ", h("strong", { text: x.text }), " found in ", h("span", { "class": "sbx-file", text: x.found_in })]);
      }));
      var row = h("li", { "class": "sbx-card" }, [
        h("div", { "class": "sbx-card__head" }, [h("span", { "class": "sbx-card__id", text: f.n }), h("span", { "class": "sbx-card__title", text: f.name }),
          h("span", { "class": "sbx-amt", text: (c(f.change) >= 0 ? "+" : "") + m(c(f.change)) + (f.pct ? " (" + f.pct + "%)" : "") }), status]),
        h("dl", { "class": "sbx-dl sbx-dl--row" }, [
          h("div", null, [h("dt", { text: "August" }), h("dd", { text: m(c(f.prior)) })]),
          h("div", null, [h("dt", { text: "September, as drafted" }), h("dd", { text: m(c(f.drafted_on)) })]),
          h("div", null, [h("dt", { text: "September, with your decisions" }), now])]),
        h("p", { "class": "label", text: "The tool's note" }), note, warn,
        h("details", { "class": "sbx-more" }, [h("summary", null, ["How it checked the numbers (" + f.numbers.length + ")"]), nums]),
        act]);
      list.appendChild(row);
      function editMode() {
        note.contentEditable = "true"; note.setAttribute("role", "textbox"); note.setAttribute(AR + "multiline", "true");
        note.setAttribute(AR + "label", "Your flux note for " + f.name); note.classList.add("is-editing"); note.focus();
        setKids(act, [btn("Save my note", "btn--primary", function () {
          var t = note.textContent.trim();
          note.contentEditable = "false"; note.removeAttribute("role"); note.classList.remove("is-editing");
          decide("flux", f.n, t && t !== f.note ? { state: "edited", text: t } : { state: "accepted" });
        }), btn("Cancel", "", function () { note.contentEditable = "false"; note.removeAttribute("role"); note.classList.remove("is-editing"); update(); })]);
      }
      live.push(function (B) {
        if (note.classList.contains("is-editing")) { return; }
        var d = S.flux[f.n], cur = displayBal(f.n, B), drafted = c(f.drafted_on);
        note.textContent = d && d.state === "edited" ? d.text : f.note;
        now.textContent = m(cur);
        warn.hidden = cur === drafted;
        warn.textContent = cur === drafted ? "" : "The books do not match the note yet: it was drafted with every draft entry approved, at " + m(drafted) + ". With your decisions so far the balance is " + m(cur) + ". " + (d ? "" : "Decide the entries first, or edit the note.");
        setKids(status, [d ? chip("good", "tick", d.state === "edited" ? "Your edit" : "Accepted") : chip("pend", "dash", "Waiting on you")]);
        setKids(act, d ? [btn("Undo", "", function () { decide("flux", f.n, null); })] : [
          btn("Accept", "btn--primary", function () { decide("flux", f.n, { state: "accepted" }); }, { "@label": "Accept the note for " + f.name }),
          btn("Edit", "", editMode, { "@label": "Edit the note for " + f.name })]);
        row.classList.toggle("is-done", !!d);
      });
    });
    setKids(fill("flux"), [h("div", { "class": "sbx-bar" }, [h("p", { "class": "sbx-bar__t", text: "Accounts that moved past the threshold" }), bulk]), list]);
  })();

  // ---------------------------------------------------------------- stage: review (live statements)
  (function () {
    var tb = h("p", { "class": "sbx-tb" }), bs = h("tbody"), pl = h("tbody"), changes = h("tbody"), reasons = h("ul", { "class": "sbx-flags" }, D.run.gate.reasons.map(function (r) { return h("li", { text: r }); }));
    function row(label, cells, cls) {
      return h("tr", { "class": cls || null }, [h("th", { scope: "row", text: label })].concat(cells.map(function (v) { return h("td", { "class": "num", text: v }); })));
    }
    var BSG = [["Assets", ["cash", "ar", "oca", "fixed", "other_assets"]], ["Liabilities", ["ap", "cards", "ocl", "ltl"]], ["Equity", ["equity"]]];
    var PLG = [["Income", "income"], ["Cost of goods sold", "cogs"], ["Expenses", "expenses"], ["Other income", "other_income"]];
    live.push(function (B) {
      tb.className = "sbx-tb " + (B.balanced ? "ok" : "no");
      setKids(tb, [icon(B.balanced ? "tick" : "cross"), " Trial balance: debits " + m(B.tbDr) + ", credits " + m(B.tbCr) + ". Total assets " + m(B.assets) + ", liabilities and equity " + m(B.le) + (B.balanced ? ". It balances." : ". It does not balance.")]);
      var out = [], leB = 0;
      BSG.forEach(function (g) {
        var tot = 0, totB = 0, asset = g[0] === "Assets";
        out.push(h("tr", { "class": "sbx-grp" }, [h("th", { scope: "rowgroup", colspan: "3", text: g[0] })]));
        g[1].forEach(function (sec) {
          ORDER.forEach(function (n) {
            var a = ACC[n];
            if (a.kind !== "BS" || a.sec !== sec) { return; }
            var v = asset ? B.live[n] : -B.live[n], was = asset ? a.base : -a.base;
            if (v === 0 && was === 0) { return; }
            tot += v; totB += was;
            out.push(row(n + " " + a.name, [m(was), m(v)], v !== was ? "is-moved" : null));
          });
        });
        if (g[0] === "Equity") { out.push(row("Net income, year to date", [m(B.niYtdBase), m(B.niYtd)], B.niYtd !== B.niYtdBase ? "is-moved" : null)); tot += B.niYtd; totB += B.niYtdBase; }
        out.push(row("Total " + g[0].toLowerCase(), [m(totB), m(tot)], "total"));
        if (g[0] !== "Assets") { leB += totB; }
      });
      out.push(row("Total liabilities and equity", [m(leB), m(B.le)], "total"));
      setKids(bs, out);
      var p = [];
      PLG.forEach(function (g) {
        var tot = 0, totB = 0;
        p.push(h("tr", { "class": "sbx-grp" }, [h("th", { scope: "rowgroup", colspan: "3", text: g[0] })]));
        ORDER.forEach(function (n) {
          var a = ACC[n];
          if (a.kind !== "PL" || a.sec !== g[1]) { return; }
          var sign = isIncome(a) ? -1 : 1, v = a.mbase + sign * (B.eff[n] || 0);
          if (v === 0 && a.mbase === 0) { return; }
          tot += v; totB += a.mbase;
          p.push(row(n + " " + a.name, [m(a.mbase), m(v)], v !== a.mbase ? "is-moved" : null));
        });
        p.push(row("Total " + g[0].toLowerCase(), [m(totB), m(tot)], "total"));
      });
      p.push(row("Net income for September", [m(B.niMonthBase), m(B.niMonth)], "total"));
      setKids(pl, p);
      var ch = [];
      ORDER.forEach(function (n) { if (B.eff[n]) { ch.push(row(n + " " + ACC[n].name, [B.eff[n] > 0 ? m(B.eff[n]) : "", B.eff[n] < 0 ? m(-B.eff[n]) : ""])); } });
      if (!ch.length) { ch.push(h("tr", null, [h("td", { colspan: "3", text: "No entries approved yet. The books are as booked." })])); }
      setKids(changes, ch);
    });
    function table(cap, cols, body) {
      return h("div", { "class": "tbl-wrap" }, [h("table", { "class": "tbl sbx-tbl sbx-fs" }, [h("caption", { text: cap }),
        h("thead", null, [h("tr", null, cols.map(function (t, i) { return h("th", { scope: "col", "class": i ? "num" : null, text: t }); }))]), body])]);
    }
    setKids(fill("review"), [
      tb,
      h("div", { "class": "sbx-two sbx-two--fs" }, [
        table("Balance sheet at September 30", ["Account", "As booked", "With your entries"], bs),
        table("P&L for September", ["Account", "As booked", "With your entries"], pl)]),
      h("details", { "class": "sbx-more" }, [h("summary", null, ["What your approvals changed, by account"]), table("Net effect of approved entries", ["Account", "Debit", "Credit"], changes)]),
      h("details", { "class": "sbx-more" }, [h("summary", null, ["What the tool said when it stopped"]), reasons])
    ]);
  })();

  // ---------------------------------------------------------------- stage: sign-off
  (function () {
    var sections = h("ol", { "class": "sbx-binder" }, D.binder.sections.map(function (s) { return h("li", null, [s.title, h("span", { "class": "sub", text: s.pages + (s.pages === 1 ? " page" : " pages") })]); }));
    var box = h("div", { "class": "sbx-sign" });
    live.push(function (B) {
      var g = gate(B), kids = [];
      if (S.signed && g.total === 0) {
        var ap = D.entries.filter(function (e) { return S.entries[e.id] === "approved"; }).length;
        var rj = D.entries.filter(function (e) { return S.entries[e.id] === "rejected"; }).length;
        var left = D.recs.filter(function (r) { return S.recs[r.n] && recState(r, B).off !== 0; }).length;
        var held = Object.keys(S.tags).filter(function (i) { return S.tags[i] === "held"; }).length;
        var edited = Object.keys(S.flux).filter(function (n) { return S.flux[n] && S.flux[n].state === "edited"; }).length;
        kids.push(h("p", { "class": "sbx-signed" }, [icon("tick"), " Signed in this browser as " + D.company.controller + ". September is closed on this page."]));
        kids.push(dl([["Entries", ap + " approved, " + rj + " rejected"], ["Recs carried open", String(left)], ["Tags held for follow-up", String(held)], ["Flux notes you rewrote", String(edited)],
          ["Net income for September", m(B.niMonthBase) + " as booked, " + m(B.niMonth) + " adjusted"],
          ["Total assets", m(B.assetsBase) + " as booked, " + m(B.assets) + " adjusted"]]));
        kids.push(h("p", { "class": "sbx-note", text: "In the product, sign-off needs a logged-in person, records who and when, and locks the month. A script or an AI agent cannot do it." }));
        kids.push(btn("Undo sign-off", "", function () { S.signed = false; save(); update(); }));
      } else if (g.total === 0) {
        kids.push(h("p", { "class": "sbx-note", text: "Everything is decided and the books balance. You can sign." }));
        kids.push(btn("Sign off September", "btn--primary", function () { S.signed = true; save(); update(); }));
      } else {
        kids.push(h("p", { "class": "sbx-note", text: "Sign-off opens when nothing is blocking. Still blocking: " + g.total + "." }));
        kids.push(h("button", { type: "button", "class": "btn btn--sm", disabled: true }, ["Sign off September"]));
      }
      setKids(box, kids);
    });
    setKids(fill("signoff"), [box, h("details", { "class": "sbx-more" }, [h("summary", null, ["The binder's sections (" + D.binder.sections.length + ")"]), sections]),
      h("details", { "class": "sbx-more" }, [h("summary", null, ["The close checklist as the tool left it"]),
        h("ol", { "class": "sbx-binder" }, D.checklist.map(function (s) {
          return h("li", null, [h("strong", { text: s.label }), " ", s.state === "done" ? chip("good", "tick", "Done") : chip("pend", "dash", words(s.state)), h("span", { "class": "sub", text: s.result })]);
        }))])]);
  })();

  // ---------------------------------------------------------------- gate panel and stage counts
  (function () {
    var gateEl = fill("gate");
    var head = h("p", { "class": "sbx-gate__h", role: "status", "@live": "polite" });
    var parts = h("ul", { "class": "sbx-gate__parts" });
    var figs = h("dl", { "class": "sbx-gate__figs" });
    var reset = btn("Reset", "", function () {
      S = fresh(); save(); update();
      var t = document.getElementById("h-in"); if (t) { t.scrollIntoView({ block: "start" }); }
    }, { "@label": "Reset every decision" });
    var go = h("a", { "class": "sbx-gate__go", href: "#stage-review" }, ["See the books"]);
    setKids(gateEl, [h("p", { "class": "label sbx-gate__k", text: "Close gate" }), head, parts, figs, h("div", { "class": "sbx-gate__acts" }, [go, reset])]);
    var counts = {};
    root.querySelectorAll("[data-count]").forEach(function (el) { counts[el.getAttribute("data-count")] = el; });
    live.push(function (B) {
      var g = gate(B);
      gateEl.classList.toggle("is-ready", g.total === 0);
      setKids(head, [icon(g.total === 0 ? "tick" : "stop"), " " + (S.signed && g.total === 0 ? "Signed" : g.total === 0 ? "Ready to sign" : "Not ready: " + g.total + " blocking")]);
      setKids(parts, [["Entries", g.entries, "#stage-entries"], ["Tags", g.tags, "#stage-tags"], ["Recs", g.recs, "#stage-recs"], ["Flux notes", g.flux, "#stage-flux"]].map(function (p) {
        return h("li", { "class": p[1] ? "" : "ok" }, [h("a", { href: p[2], text: p[0] }), h("span", { text: p[1] ? String(p[1]) : "done" })]);
      }).concat(B.balanced ? [] : [h("li", null, ["Books out of balance"])]));
      setKids(figs, [
        h("div", null, [h("dt", { text: "Net income, September" }), h("dd", { text: m(B.niMonth) })]),
        h("div", null, [h("dt", { text: "Total assets" }), h("dd", { text: m(B.assets) })]),
        h("div", null, [h("dt", { text: "Debits = credits" }), h("dd", null, [B.balanced ? "yes" : "no"])])]);
      function set(k, n) { if (counts[k]) { counts[k].textContent = n ? String(n) : ""; counts[k].parentNode.classList.toggle("is-done", !n); } }
      set("tags", g.tags); set("recs", g.recs); set("entries", g.entries); set("flux", g.flux);
      set("review", B.balanced ? 0 : 1); set("signoff", 0); set("in", 0);
      counts.signoff && counts.signoff.parentNode.classList.toggle("is-done", !!S.signed && g.total === 0);
    });
  })();

  update();
})();
