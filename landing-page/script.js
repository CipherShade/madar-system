/* ============================================================
   مَدار — Landing Page interactions
   ============================================================ */
(function () {
  "use strict";

  /* ------------------------------------------------------------
     Central configuration — single source of truth for CTAs
     ------------------------------------------------------------ */
  var CONFIG = window.MADAR || {};

  var BRAND = CONFIG.BRAND || "مَدار";
  var TRIAL_URL = CONFIG.TRIAL_URL || "https://madar.app/signup";
  var LOGIN_URL = CONFIG.LOGIN_URL || "https://madar.app/login";
  var LOOM_VIDEO_URL = CONFIG.LOOM_VIDEO_URL || "";

  var REDUCED_MOTION =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var docEl = document.documentElement;
  var body = document.body;

  /* ------------------------------------------------------------
     DOM refs
     ------------------------------------------------------------ */
  var navbar = document.getElementById("navbar");
  var navToggle = document.querySelector("[data-drawer-open]");
  var drawer = document.querySelector("[data-drawer]");
  var drawerScrim = document.querySelector("[data-drawer-scrim]");
  var drawerClose = document.querySelector("[data-drawer-close]");

  /* ------------------------------------------------------------
     Header scroll state
     ------------------------------------------------------------ */
  var scrolled = false;
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    var now = y > 12;
    if (now !== scrolled) {
      scrolled = now;
      navbar && navbar.classList.toggle("navbar--scrolled", now);
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ------------------------------------------------------------
     Mobile drawer
     ------------------------------------------------------------ */
  var drawerOpen = false    ;
  function setDrawer(open) {
    drawerOpen = open;
    if (drawer) {
      drawer.classList.toggle("is-open", open);
      drawer.setAttribute("aria-hidden", String(!open));
    }
    if (drawerScrim) drawerScrim.hidden = !open;
    if (navToggle) {
      navToggle.setAttribute("aria-expanded", String(open));
      navToggle.classList.toggle("is-active", open);
    }
    body.classList.toggle("no-scroll", open);
  }

  if (navToggle) {
    navToggle.addEventListener("click", function (e) {
      e.preventDefault();
      setDrawer(!drawerOpen);
    });
  }
  if (drawerClose) {
    drawerClose.addEventListener("click", function () {
      setDrawer(false);
    });
  }
  if (drawerScrim) {
    drawerScrim.addEventListener("click", function () {
      setDrawer(false);
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && drawerOpen) setDrawer(false);
  });

  /* Close drawer when a nav link (mobile) is chosen */
  if (drawer) {
    drawer.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        setDrawer(false);
      });
    });
  }

  /* ------------------------------------------------------------
     CTA wiring — MAIN + LOGIN go to configured URLs
     ------------------------------------------------------------ */
  var ctaLogin = document.querySelectorAll("[data-cta-login]");
  var ctaMain = document.querySelectorAll("[data-cta-main]");

  ctaLogin.forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.preventDefault();
      window.open(LOGIN_URL, "_self");
    });
  });

  ctaMain.forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.preventDefault();
      window.open(TRIAL_URL, "_self");
    });
  });

  /* ------------------------------------------------------------
     VSL thumbnail -> play embedded Loom video
     ------------------------------------------------------------ */
  var vslThumb = document.querySelector("[data-vsl-thumb]");
  var vslFrame = document.querySelector("[data-vsl]");

  function mountVideo() {
    if (!vslThumb || !vslFrame || !LOOM_VIDEO_URL) return;
    var frame = document.createElement("iframe");
    frame.src = LOOM_VIDEO_URL;
    frame.title = "فيديو: إزاي مَدار بيشتغل في سنتر حقيقي";
    frame.loading = "lazy";
    frame.allowFullscreen = true;
    frame.setAttribute("allow", "fullscreen; autoplay; encrypted-media");
    frame.className = "vsl-embed-frame";
    vslFrame.replaceChild(frame, vslThumb);
  }

  if (vslThumb) {
    vslThumb.addEventListener("click", mountVideo);
    vslThumb.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        mountVideo();
      }
    });
  }

  /* ------------------------------------------------------------
     Reveal-on-scroll (IntersectionObserver) + reduced-motion
     ------------------------------------------------------------ */
  var revealEls = document.querySelectorAll(".reveal");

  if (REDUCED_MOTION) {
    body.classList.add("reduced-motion");
    revealEls.forEach(function (el) {
      el.classList.add("reveal--in");
    });
  } else if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal--in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -60px 0px" }
    );
    revealEls.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("reveal--in");
    });
  }

  /* ------------------------------------------------------------
     FAQ accordion
     ------------------------------------------------------------ */
  var faqItems = document.querySelectorAll(".faq-item");
  function closeOther(curr) {
    faqItems.forEach(function (item) {
      if (item !== curr) {
        item.removeAttribute("open");
      }
    });
  }
  faqItems.forEach(function (item) {
    var q = item.querySelector(".faq-q");
    if (!q) return;
    q.addEventListener("click", function () {
      var isOpen = item.hasAttribute("open");
      closeOther(item);
      if (!isOpen) item.setAttribute("open", "");
    });
  });

  /* ------------------------------------------------------------
     Smooth scroll (handled by CSS scroll-behavior; fallback JS)
     ------------------------------------------------------------ */
  var anchorLinks = document.querySelectorAll('a[href^="#"]');
  anchorLinks.forEach(function (a) {
    var target = document.querySelector(a.getAttribute("href"));
    if (!target) return;
    a.addEventListener("click", function (e) {
      var href = a.getAttribute("href");
      if (href === "#") { e.preventDefault(); return; }
      var el = document.querySelector(href);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "start" });
    });
  });

  /* ------------------------------------------------------------
     Back-to-top button
     ------------------------------------------------------------ */
  var topBtn = document.querySelector("[data-backtotop]");
  if (topBtn) {
    function toggleTopBtn() {
      var y = window.scrollY || window.pageYOffset;
      topBtn.hidden = y < 520;
    }
    window.addEventListener("scroll", toggleTopBtn, { passive: true });
    toggleTopBtn();
    topBtn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? "auto" : "smooth" });
    });
  }

  /* ------------------------------------------------------------
     Year in footer
     ------------------------------------------------------------ */
  var yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ------------------------------------------------------------
     Drawer links scroll (needs smooth scrolling in drawer open)
     ------------------------------------------------------------ */
  drawScrollFix();

  function drawScrollFix() {
    if (!drawer) return;
    drawer.querySelectorAll("a[href^='#']").forEach(function (a) {
      a.addEventListener("click", function (e) {
        var href = a.getAttribute("href");
        if (href === "#") return clickNone(); // placeholder, no-op
        var el = document.querySelector(href);
        if (el) {
          e.preventDefault();
          setDrawer(false);
          el.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "start" });
        }
      });
    });
  }

  function clickNone() {}
})();
