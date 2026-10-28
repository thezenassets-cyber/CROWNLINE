// Progressive enhancement only: every page works without JavaScript.
(function () {
  'use strict';

  document.documentElement.classList.add('is-ready');

  document.querySelectorAll('[data-theme-set]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var theme = btn.getAttribute('data-theme-set');
      if (theme !== 'light' && theme !== 'dark') return;
      document.documentElement.setAttribute('data-theme', theme);
      document.querySelectorAll('[data-theme-set]').forEach(function (other) {
        other.setAttribute('aria-pressed', other.getAttribute('data-theme-set') === theme ? 'true' : 'false');
      });
      document.cookie = 'theme=' + theme + '; Path=/; Max-Age=31536000; SameSite=Lax';
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', theme === 'dark' ? '#101820' : '#fbfaf6');
    });
  });

  // Move focus to results, errors or confirmations so screen-reader and keyboard users land on what changed.
  var target = document.querySelector('[data-autofocus]');
  if (target && typeof target.focus === 'function') {
    target.focus({ preventScroll: false });
  }

  // Close the mobile menu after choosing a link or pressing Escape.
  var menu = document.querySelector('.nav-mobile');
  if (menu) {
    menu.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('a')) menu.removeAttribute('open');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.hasAttribute('open')) {
        menu.removeAttribute('open');
        var summary = menu.querySelector('summary');
        if (summary) summary.focus();
      }
    });
  }

  // Normalise tracking codes as they are typed: uppercase, no stray spaces.
  document.querySelectorAll('input[name="code"]').forEach(function (input) {
    input.addEventListener('blur', function () {
      input.value = input.value.trim().toUpperCase().replace(/\s+/g, '');
    });
  });

  document.querySelectorAll('video source').forEach(function (source) {
    source.addEventListener('error', function () {
      var video = source.parentElement;
      if (video && video.tagName === 'VIDEO') video.remove();
    });
  });

  function startFilm(video) {
    video.muted = true;
    video.play().catch(function () {});
  }

  // Keep the hero still when the visitor has asked for less motion.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('video').forEach(function (video) {
      video.removeAttribute('autoplay');
      video.pause();
    });
  } else {
    var films = document.querySelectorAll('video.home-film-video');
    if (films.length && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          startFilm(entry.target);
          io.unobserve(entry.target);
        });
      }, { rootMargin: '240px 0px' });
      films.forEach(function (video) { io.observe(video); });
    } else {
      films.forEach(startFilm);
    }
  }

  // Prevent accidental double submission of forms that create records.
  document.querySelectorAll('form[method="post"]').forEach(function (form) {
    form.addEventListener('submit', function () {
      var btn = form.querySelector('button[type="submit"]');
      if (!btn) return;
      window.setTimeout(function () { btn.disabled = true; }, 0);
      window.setTimeout(function () { btn.disabled = false; }, 8000);
    });
  });
})();
