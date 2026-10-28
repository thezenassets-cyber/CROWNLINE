// Progressive enhancement only: every page works without JavaScript.
(function () {
  'use strict';

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

  // Keep the hero still when the visitor has asked for less motion.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('video').forEach(function (video) {
      video.removeAttribute('autoplay');
      video.pause();
    });
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
