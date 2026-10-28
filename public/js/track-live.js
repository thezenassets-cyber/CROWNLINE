// Refreshes a tracking record from coordinator updates. No vehicle position is drawn.
(function () {
  'use strict';

  var root = document.querySelector('[data-track-live]');
  if (!root) return;
  var code = root.getAttribute('data-track-live');
  var revision = root.getAttribute('data-revision') || '';
  if (!code) return;

  function text(node, value) {
    if (node && value !== null && value !== undefined) node.textContent = value;
  }

  function apply(data) {
    if (!data || data.revision === revision) return;
    revision = data.revision;
    root.setAttribute('data-revision', revision);
    text(root.querySelector('[data-live="status"]'), data.status);
    text(root.querySelector('[data-live="explanation"]'), data.explanation);
    text(root.querySelector('[data-live="progress-note"]'), data.progressNote);
    var wrap = root.querySelector('[data-live="progress-wrap"]');
    if (wrap) {
      var strong = wrap.querySelector('strong');
      var bar = wrap.querySelector('progress');
      var label = wrap.querySelector('.progress-meta span');
      text(strong, String(data.progress) + '%');
      text(label, data.status);
      if (bar) {
        bar.value = data.progress;
        bar.setAttribute('aria-label', data.status + ': ' + data.progress + '%');
        bar.textContent = data.progress + '%';
      }
    }
    var list = root.querySelector('[data-live="timeline"]');
    var empty = root.querySelector('[data-live="timeline-empty"]');
    if (empty) empty.hidden = Array.isArray(data.timeline) && data.timeline.length > 0;
    if (list && Array.isArray(data.timeline)) {
      list.hidden = data.timeline.length === 0;
      list.replaceChildren();
      data.timeline.forEach(function (event) {
        var li = document.createElement('li');
        li.className = 'tl tl-milestone';
        var time = document.createElement('span');
        time.className = 'tl-time';
        time.textContent = event.time || '';
        var label = document.createElement('span');
        label.className = 'tl-label';
        label.textContent = event.label || '';
        li.appendChild(time);
        li.appendChild(label);
        if (event.location) {
          var loc = document.createElement('span');
          loc.className = 'tl-loc';
          loc.textContent = event.location;
          li.appendChild(loc);
        }
        if (event.note) {
          var note = document.createElement('span');
          note.className = 'tl-note';
          note.textContent = event.note;
          li.appendChild(note);
        }
        list.appendChild(li);
      });
    }
    var charges = root.querySelector('[data-live="charges"]');
    var section = root.querySelector('[data-live="charges-section"]') || (charges ? charges.closest('.charge-list') : null);
    if (charges && Array.isArray(data.charges)) {
      charges.replaceChildren();
      data.charges.forEach(function (charge) {
        var li = document.createElement('li');
        var desc = document.createElement('span');
        desc.textContent = charge.description || '';
        var amount = document.createElement('strong');
        amount.textContent = charge.amount || '';
        var status = document.createElement('span');
        status.textContent = charge.status || '';
        li.appendChild(desc);
        li.appendChild(amount);
        li.appendChild(status);
        if (charge.note) {
          var note = document.createElement('span');
          note.className = 'small muted';
          note.textContent = charge.note;
          li.appendChild(note);
        }
        charges.appendChild(li);
      });
      if (section) {
        section.hidden = data.charges.length === 0;
        var note = section.querySelector('[data-live="charge-note"]');
        text(note, data.chargeNote || '');
      }
    }
  }

  var stopped = false;

  function tick() {
    if (stopped || document.hidden) return;
    fetch('/track/feed?code=' + encodeURIComponent(code), { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (res.status === 404) { stopped = true; return null; }
        return res.ok ? res.json() : null;
      })
      .then(apply)
      .catch(function () {});
  }

  window.setInterval(tick, 20000);
})();
