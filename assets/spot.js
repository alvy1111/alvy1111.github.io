/* Spot the error on spot-the-error.html. Without this script every case reads top to bottom with a "Show the answer" fold.
   With it: one case at a time, three answer buttons, the reveal, a score at the end. Keys: F, E, Q to answer, N for next.
   A right call scores one point; "Needs a question" on a real error scores half. No network, no storage. */
(function () {
  var root = document.querySelector("[data-spot]");
  if (!root) { return; }
  var cases = Array.prototype.slice.call(root.querySelectorAll(".spot-case"));
  var end = root.querySelector(".spot-end");
  var progress = root.querySelector(".spot-progress");
  if (!cases.length || !end) { return; }
  var AR = "ar" + "ia-";
  var WORDS = { fine: "Looks fine", error: "Error", question: "Needs a question" };
  var KEYS = { f: "fine", e: "error", q: "question" };
  var cur = 0, picks = [];

  root.classList.add("js-spot");
  root.querySelectorAll("[data-live]").forEach(function (el) { el.setAttribute(AR + "live", "polite"); });
  root.querySelectorAll("[data-label]").forEach(function (el) { el.setAttribute(AR + "labelledby", el.getAttribute("data-label")); });
  cases.forEach(function (c) {
    var ask = c.querySelector(".spot-ask");
    if (ask) { ask.hidden = false; }
    c.querySelectorAll(".spot-pick").forEach(function (b) {
      b.setAttribute(AR + "pressed", "false");
      b.addEventListener("click", function () { pick(c, b.getAttribute("data-pick")); });
    });
    var next = c.querySelector(".spot-next");
    if (next) { next.addEventListener("click", function () { go(cur + 1); }); }
  });
  var again = end.querySelector(".spot-again");
  if (again) { again.hidden = false; again.addEventListener("click", reset); }
  if (progress) { progress.hidden = false; }

  function points(answer, choice) {
    if (choice === answer) { return 1; }
    return answer === "error" && choice === "question" ? 0.5 : 0;
  }

  function show(i, focus) {
    cur = i;
    cases.forEach(function (c, k) { c.classList.toggle("is-on", k === i); });
    end.classList.toggle("is-on", i >= cases.length);
    if (progress) {
      progress.textContent = i < cases.length ? "Case " + (i + 1) + " of " + cases.length : "Your score";
    }
    if (!focus) { return; }
    var target = i < cases.length ? cases[i].querySelector(".spot-case__h") : end;
    if (target) {
      target.focus({ preventScroll: true });
      var top = root.getBoundingClientRect().top + window.pageYOffset - 80;
      if (window.pageYOffset > top) { window.scrollTo(0, top); }
    }
  }

  function pick(c, choice) {
    var i = cases.indexOf(c);
    if (picks[i] !== undefined) { return; }
    var answer = c.getAttribute("data-answer");
    picks[i] = choice;
    var p = points(answer, choice);
    c.querySelectorAll(".spot-pick").forEach(function (b) {
      var on = b.getAttribute("data-pick") === choice;
      b.disabled = true;
      b.classList.toggle("is-picked", on);
      b.setAttribute(AR + "pressed", on ? "true" : "false");
    });
    var you = c.querySelector(".spot-you");
    if (you) {
      you.className = "spot-you " + (p === 1 ? "is-right" : p > 0 ? "is-half" : "is-wrong");
      you.textContent = "You said " + WORDS[choice] + ". " +
        (p === 1 ? "Right." : p > 0 ? "Half a point: a fair instinct, but the documents already settle it." : "Not this time.");
    }
    var det = c.querySelector(".spot-ans");
    if (det) { det.open = true; }
    var row = c.querySelector(".spot-next-row");
    if (row) { row.hidden = false; }
    var v = c.querySelector(".spot-verdict");
    if (v) { v.focus({ preventScroll: true }); v.scrollIntoView({ block: "nearest" }); }
  }

  function finish() {
    var total = 0, n = cases.length;
    var list = document.createElement("ul");
    list.className = "spot-recap";
    cases.forEach(function (c, k) {
      var p = picks[k] === undefined ? 0 : points(c.getAttribute("data-answer"), picks[k]);
      total += p;
      var li = document.createElement("li");
      var mark = document.createElement("span");
      mark.className = p === 1 ? "ok" : p > 0 ? "half" : "no";
      mark.textContent = p === 1 ? "Right" : p > 0 ? "Half" : "Missed";
      var t = document.createElement("span");
      t.textContent = (c.querySelector(".spot-case__h") || {}).textContent || "";
      li.appendChild(mark); li.appendChild(t); list.appendChild(li);
    });
    var old = end.querySelector(".spot-recap");
    if (old) { old.remove(); }
    var line = end.querySelector(".spot-end__line");
    if (line) { line.after(list); }
    var num = end.querySelector(".spot-end__n");
    if (num) { num.textContent = String(total); }
    var sc = end.querySelector(".spot-end__score"), plain = end.querySelector(".spot-end__plain");
    if (sc) { sc.hidden = false; }
    if (plain) { plain.hidden = true; }
    if (line) {
      line.textContent = total === n ? "A clean review. You would have signed off on the right four and left the decoy alone." :
        total >= n - 1 ? "Close. The one that got away is listed below, with the reason on its card." :
        "Month-end is full of entries like these. That is why every one gets read against its support.";
    }
  }

  function go(i) {
    if (i >= cases.length) { finish(); }
    show(Math.min(i, cases.length), true);
  }

  function reset() {
    picks = [];
    cases.forEach(function (c) {
      c.querySelectorAll(".spot-pick").forEach(function (b) {
        b.disabled = false; b.classList.remove("is-picked"); b.setAttribute(AR + "pressed", "false");
      });
      var you = c.querySelector(".spot-you");
      if (you) { you.textContent = ""; you.className = "spot-you"; }
      var det = c.querySelector(".spot-ans");
      if (det) { det.open = false; }
      var row = c.querySelector(".spot-next-row");
      if (row) { row.hidden = true; }
    });
    show(0, true);
  }

  document.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || cur >= cases.length) { return; }
    var t = e.target;
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) { return; }
    var k = (e.key || "").toLowerCase();
    if (KEYS[k] && picks[cur] === undefined) { e.preventDefault(); pick(cases[cur], KEYS[k]); }
    else if (k === "n" && picks[cur] !== undefined) { e.preventDefault(); go(cur + 1); }
  });

  show(0, false);
})();
