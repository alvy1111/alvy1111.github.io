/* The guided tour on tour.html. Without this script every step reads top to bottom.
   With it: one step at a time, arrow keys, a progress rail, swipe, and play/pause at about ten seconds a step.
   Autoplay starts on its own only when the reader has not asked for reduced motion. No network, no storage. */
(function () {
  var tour = document.querySelector("[data-tour]");
  if (!tour) { return; }
  var steps = Array.prototype.slice.call(tour.querySelectorAll(".tstep"));
  var segs = Array.prototype.slice.call(tour.querySelectorAll(".trail__seg"));
  if (!steps.length) { return; }
  var playBtn = tour.querySelector('[data-act="play"]');
  var prevBtn = tour.querySelector('[data-act="prev"]');
  var nextBtn = tour.querySelector('[data-act="next"]');
  var label = playBtn && playBtn.querySelector(".tbtn__lbl");
  var count = tour.querySelector(".tcount");
  var interval = parseInt(tour.getAttribute("data-interval"), 10) || 10000;
  var AR = "ar" + "ia-";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  var cur = 0, playing = false, started = 0, elapsed = 0, raf = 0;

  function idOf(i) { return steps[i].id; }

  function setFill(i, p) { if (segs[i]) { segs[i].style.setProperty("--p", String(Math.max(0, Math.min(1, p)))); } }

  function show(i, fromHash) {
    i = Math.max(0, Math.min(steps.length - 1, i));
    cur = i;
    steps.forEach(function (s, k) { s.classList.toggle("is-on", k === i); });
    segs.forEach(function (s, k) {
      s.classList.toggle("is-on", k === i);
      s.classList.toggle("is-done", k < i);
      if (k === i) { s.setAttribute(AR + "current", "step"); } else { s.removeAttribute(AR + "current"); }
      setFill(k, 0);
    });
    if (count) { count.textContent = (i + 1) + " / " + steps.length; }
    if (prevBtn) { prevBtn.disabled = i === 0; }
    if (nextBtn) { nextBtn.disabled = i === steps.length - 1; }
    if (!fromHash && window.history && history.replaceState) {
      try { history.replaceState(null, "", "#" + idOf(i)); } catch (e) {}
    }
    elapsed = 0; started = performance.now();
  }

  function tick(now) {
    if (!playing) { return; }
    var p = (elapsed + now - started) / interval;
    setFill(cur, p);
    if (p >= 1) {
      if (cur >= steps.length - 1) { setPlaying(false); segs[cur] && segs[cur].classList.add("is-done"); return; }
      show(cur + 1);
    }
    raf = requestAnimationFrame(tick);
  }

  function setPlaying(on) {
    if (on && cur >= steps.length - 1 && !playing) { show(0); }
    playing = on;
    tour.classList.toggle("is-playing", on);
    if (label) { label.textContent = on ? "Pause" : "Play"; }
    if (playBtn) { playBtn.setAttribute(AR + "pressed", on ? "true" : "false"); }
    cancelAnimationFrame(raf);
    if (on) { started = performance.now(); raf = requestAnimationFrame(tick); }
    else { elapsed += performance.now() - started; }
  }

  function go(i) { if (playing) { setPlaying(false); } show(i); }

  tour.classList.add("is-js");
  if (playBtn) { playBtn.setAttribute(AR + "pressed", "false"); }

  if (prevBtn) { prevBtn.addEventListener("click", function () { go(cur - 1); }); }
  if (nextBtn) { nextBtn.addEventListener("click", function () { go(cur + 1); }); }
  if (playBtn) { playBtn.addEventListener("click", function () { setPlaying(!playing); }); }
  segs.forEach(function (s, k) {
    s.addEventListener("click", function (e) { e.preventDefault(); go(k); });
  });

  document.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) { return; }
    var t = e.target && e.target.tagName;
    if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") { return; }
    if (e.key === "ArrowRight") { go(cur + 1); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { go(cur - 1); e.preventDefault(); }
    else if (e.key === "Home" && tour.contains(document.activeElement)) { go(0); e.preventDefault(); }
    else if (e.key === "End" && tour.contains(document.activeElement)) { go(steps.length - 1); e.preventDefault(); }
  });

  var x0 = null, y0 = null;
  tour.addEventListener("touchstart", function (e) {
    if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }
  }, { passive: true });
  tour.addEventListener("touchend", function (e) {
    if (x0 === null) { return; }
    var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) { go(cur + (dx < 0 ? 1 : -1)); }
  }, { passive: true });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && playing) { setPlaying(false); }
  });

  window.addEventListener("hashchange", function () {
    var k = steps.findIndex ? steps.findIndex(function (s) { return "#" + s.id === location.hash; }) : -1;
    if (k >= 0 && k !== cur) { go(k); }
  });

  var start = 0;
  for (var k = 0; k < steps.length; k++) { if ("#" + steps[k].id === location.hash) { start = k; } }
  show(start, true);
  if (start > 0 && steps[start].scrollIntoView) { tour.scrollIntoView({ block: "start" }); }
  if (!(reduce && reduce.matches) && start === 0) { setPlaying(true); }
})();
