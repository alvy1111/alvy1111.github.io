/* Two conveniences, both optional: the light and dark switch, and keeping the current page's tab in view on a phone. */
(function () {
  var root = document.documentElement;
  var btn = document.querySelector(".theme");
  if (btn) {
    btn.hidden = false;
    btn.addEventListener("click", function () {
      var dark = root.getAttribute("data-theme")
        ? root.getAttribute("data-theme") === "dark"
        : !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
      var next = dark ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
    });
  }
  var nav = document.querySelector(".nav");
  var cur = nav && nav.querySelector("a.is-here");
  if (cur && nav.scrollWidth > nav.clientWidth) {
    nav.scrollLeft = Math.max(0, cur.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2);
  }
})();
