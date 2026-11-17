/* Runs before first paint so a saved light or dark choice does not flash. No tracking, no network. */
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") { document.documentElement.setAttribute("data-theme", t); }
  } catch (e) {}
})();
