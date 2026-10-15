/* Site behaviour: mobile menu, colour theme, spot map (home),
   publication filters (publications), section index (skills). */
(function () {
  "use strict";

  var root = document.documentElement;

  /* ---------- colour theme ---------- */
  function storedTheme() {
    try { return localStorage.getItem("theme"); } catch (e) { return null; }
  }
  function currentTheme() {
    var t = root.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  var themeBtn = document.querySelector(".theme-toggle");
  function labelTheme() {
    if (themeBtn) themeBtn.textContent = currentTheme() === "dark" ? "Use light theme" : "Use dark theme";
  }
  if (themeBtn) {
    labelTheme();
    themeBtn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      labelTheme();
      document.dispatchEvent(new Event("themechange"));
    });
  }

  /* ---------- mobile menu ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  /* ---------- spot map (home hero) ----------
     An illustration in the style of a spatial transcriptomics slide:
     a tissue-shaped section tiled with capture spots, each coloured by a
     spatial cluster. Drawn once, with a single scan-in on first load. */
  var canvas = document.getElementById("spotmap");
  if (canvas && canvas.getContext) {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var played = false;
    var spots = [];

    function rand(seed) {
      return function () {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
    }

    function build(w, h) {
      var r = rand(20260114);
      var cols = 36;
      var step = w / cols;
      var rowH = step * Math.sqrt(3) / 2;
      var cx = w * 0.5, cy = h * 0.5, RX = w * 0.43, RY = h * 0.42;
      var out = [];
      for (var row = 0; row * rowH < h; row++) {
        for (var col = 0; col < cols + 1; col++) {
          var x = col * step + (row % 2 ? step / 2 : 0) + step / 4;
          var y = row * rowH + step / 2;
          var dx = (x - cx) / RX, dy = (y - cy) / RY;
          var th = Math.atan2(dy, dx);
          // irregular tissue outline: an ellipse with a few soft lobes
          var edge = 1 + 0.06 * Math.sin(2 * th + 0.9) + 0.04 * Math.sin(3 * th + 2.4) + 0.02 * Math.sin(7 * th + 0.3);
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d > edge) continue;
          var u = x / w, v = y / h;
          // layered bands, like cortical layers or tissue zones
          var band = v * 1.05 + 0.11 * Math.sin(u * 6.2 + 0.4) + 0.05 * Math.sin(u * 13 + v * 5) + (r() - 0.5) * 0.045;
          var k;
          if (band < 0.33) k = 1;
          else if (band < 0.47) k = 2;
          else if (band < 0.62) k = 4;
          else k = 3;
          // two follicle-like islands
          var f1 = Math.hypot((u - 0.34) * 1.1, v - 0.70), f2 = Math.hypot((u - 0.67) * 1.1, v - 0.30);
          if (f1 < 0.085 + (r() - 0.5) * 0.02 || f2 < 0.07 + (r() - 0.5) * 0.02) k = 5;
          // a little biological noise
          if (r() < 0.035) k = 1 + Math.floor(r() * 5);
          out.push({ x: x, y: y, k: k, s: step, t: (u * 0.8 + v * 0.5) / 1.3, rim: 1 - d / edge });
        }
      }
      return out;
    }

    function colours() {
      var cs = getComputedStyle(root);
      return {
        tissue: cs.getPropertyValue("--tissue").trim(),
        c: [null, "--c1", "--c2", "--c3", "--c4", "--c5"].map(function (n) { return n ? cs.getPropertyValue(n).trim() : null; })
      };
    }

    function draw(progress) {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        spots = build(w, h);
      }
      var ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      var col = colours();
      // tissue underlay
      ctx.fillStyle = col.tissue;
      for (var i = 0; i < spots.length; i++) {
        var s = spots[i];
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.s * 0.62, 0, Math.PI * 2);
        ctx.fill();
      }
      for (var j = 0; j < spots.length; j++) {
        var p = spots[j];
        var local = progress >= 1 ? 1 : Math.max(0, Math.min(1, (progress * 1.35 - p.t)) * 4);
        if (local <= 0) continue;
        local = Math.min(1, local);
        var rad = p.s * 0.36 * (0.35 + 0.65 * local);
        ctx.globalAlpha = local * (p.rim < 0.06 ? 0.55 : 1);
        ctx.fillStyle = col.c[p.k];
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function play() {
      if (played || reduce) { draw(1); played = true; return; }
      played = true;
      var start = null, dur = 1400;
      function frame(ts) {
        if (!start) start = ts;
        var p = Math.min(1, (ts - start) / dur);
        draw(p);
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    var t;
    window.addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(function () { canvas.width = 0; draw(1); }, 120);
    });
    document.addEventListener("themechange", function () { draw(1); });
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) mq.addEventListener("change", function () { draw(1); });
    }
    play();
  }

  /* ---------- publications filter ---------- */
  var pubList = document.getElementById("pub-list");
  if (pubList) {
    var items = Array.prototype.slice.call(pubList.querySelectorAll(".pub"));
    var groups = Array.prototype.slice.call(pubList.querySelectorAll(".year-group"));
    var search = document.getElementById("pub-search");
    var firstOnly = document.getElementById("first-only");
    var countEl = document.getElementById("result-count");
    var empty = document.getElementById("pub-empty");
    var clearBtn = document.getElementById("clear-filters");
    var total = items.length;

    items.forEach(function (li) {
      li._text = li.textContent.replace(/\s+/g, " ").toLowerCase();
    });

    function selectedType() {
      var c = document.querySelector('input[name="pub-type"]:checked');
      return c ? c.value : "all";
    }

    function apply() {
      var q = (search.value || "").trim().toLowerCase();
      var terms = q ? q.split(/\s+/) : [];
      var type = selectedType();
      var fo = firstOnly.checked;
      var shown = 0;
      items.forEach(function (li) {
        var ok = (type === "all" || li.getAttribute("data-type") === type) &&
          (!fo || li.getAttribute("data-first") === "true") &&
          terms.every(function (w) { return li._text.indexOf(w) !== -1; });
        li.hidden = !ok;
        if (ok) shown++;
      });
      groups.forEach(function (g) {
        g.hidden = !g.querySelector(".pub:not([hidden])");
      });
      countEl.textContent = shown === total ? "Showing all " + total : "Showing " + shown + " of " + total;
      empty.hidden = shown !== 0;
    }

    search.addEventListener("input", apply);
    firstOnly.addEventListener("change", apply);
    Array.prototype.forEach.call(document.querySelectorAll('input[name="pub-type"]'), function (r) {
      r.addEventListener("change", apply);
    });
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        search.value = "";
        firstOnly.checked = false;
        var all = document.querySelector('input[name="pub-type"][value="all"]');
        if (all) all.checked = true;
        apply();
        search.focus();
      });
    }
    apply();
  }

  /* ---------- section index highlight (skills) ---------- */
  var index = document.querySelector(".page-index");
  if (index && "IntersectionObserver" in window) {
    var links = Array.prototype.slice.call(index.querySelectorAll("a"));
    var map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          links.forEach(function (a) { a.classList.remove("is-active"); });
          var a = map[en.target.id];
          if (a) a.classList.add("is-active");
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }
})();
