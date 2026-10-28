// Shipment map. Three basemaps, no live vehicle position. No inline styles: the canvas
// bitmap size is set through the width and height properties, and CSS sizes the element.
(function () {
  'use strict';

  var STYLES = {
    streets: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    terrain: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
  };

  function project(lat, lng, zoom) {
    var scale = 256 * Math.pow(2, zoom);
    var x = ((lng + 180) / 360) * scale;
    var s = Math.sin((lat * Math.PI) / 180);
    var y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
    return { x: x, y: y };
  }

  function mount(canvas) {
    var raw = canvas.getAttribute('data-map');
    if (!raw) return;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    var points = ['origin', 'destination', 'current'].map(function (key) { return data[key]; }).filter(Boolean);
    if (!points.length) return;

    var shell = canvas.closest('.map-shell');
    var zoom = 4;
    var center = {
      lat: points.reduce(function (s, p) { return s + p.lat; }, 0) / points.length,
      lng: points.reduce(function (s, p) { return s + p.lng; }, 0) / points.length,
    };
    var style = 'streets';
    var cache = {};
    var drag = null;

    function fit() {
      var width = canvas.clientWidth || 640;
      var height = canvas.clientHeight || 420;
      var best = 3;
      for (var z = 3; z <= 8; z++) {
        var xs = points.map(function (p) { return project(p.lat, p.lng, z).x; });
        var ys = points.map(function (p) { return project(p.lat, p.lng, z).y; });
        var spanX = Math.max.apply(null, xs) - Math.min.apply(null, xs);
        var spanY = Math.max.apply(null, ys) - Math.min.apply(null, ys);
        if (spanX < width * 0.62 && spanY < height * 0.55) best = z;
      }
      zoom = best;
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var width = canvas.clientWidth;
      var height = canvas.clientHeight;
      if (!width || !height) return;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      draw();
    }

    function tileUrl(z, x, y) {
      return STYLES[style].replace('{z}', z).replace('{y}', y).replace('{x}', x);
    }

    function draw() {
      var ctx = canvas.getContext('2d');
      var dpr = canvas.width / (canvas.clientWidth || 1);
      var width = canvas.clientWidth;
      var height = canvas.clientHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0b1629';
      ctx.fillRect(0, 0, width, height);
      var c = project(center.lat, center.lng, zoom);
      var originX = c.x - width / 2;
      var originY = c.y - height / 2;
      var n = Math.pow(2, zoom);
      var x0 = Math.floor(originX / 256);
      var y0 = Math.floor(originY / 256);
      var x1 = Math.floor((originX + width) / 256);
      var y1 = Math.floor((originY + height) / 256);
      for (var tx = x0; tx <= x1; tx++) {
        for (var ty = y0; ty <= y1; ty++) {
          if (ty < 0 || ty >= n) continue;
          var wrapped = ((tx % n) + n) % n;
          drawTile(ctx, tileUrl(zoom, wrapped, ty), tx * 256 - originX, ty * 256 - originY);
        }
      }
      function toScreen(p) {
        var q = project(p.lat, p.lng, zoom);
        return { x: q.x - originX, y: q.y - originY };
      }
      if (data.origin && data.destination) {
        var a = toScreen(data.origin);
        var b = toScreen(data.destination);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = 'rgba(207, 174, 115, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([7, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (data.origin) marker(ctx, toScreen(data.origin), '#f4efe6', 'Origin');
      if (data.destination) marker(ctx, toScreen(data.destination), '#17315c', 'Destination');
      if (data.current) marker(ctx, toScreen(data.current), '#c4a15a', 'Last confirmed');
    }

    function drawTile(ctx, url, x, y) {
      if (cache[url] === 'err') return;
      if (cache[url] instanceof Image && cache[url].complete && cache[url].naturalWidth) {
        ctx.drawImage(cache[url], x, y, 256, 256);
        return;
      }
      if (cache[url]) return;
      var img = new Image();
      cache[url] = img;
      img.onload = function () { draw(); };
      img.onerror = function () { cache[url] = 'err'; };
      img.src = url;
    }

    function marker(ctx, p, fill, label) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#08111f';
      ctx.stroke();
      ctx.font = '600 12px Inter, sans-serif';
      var textW = ctx.measureText(label).width;
      var textX = p.x + 12;
      var textY = p.y - 10;
      if (textX + textW > width - 8) textX = Math.max(8, p.x - textW - 12);
      if (textY < 16) textY = p.y + 18;
      ctx.fillStyle = '#fbfaf6';
      ctx.strokeStyle = 'rgba(8, 17, 31, 0.85)';
      ctx.lineWidth = 3;
      ctx.strokeText(label, textX, textY);
      ctx.fillText(label, textX, textY);
    }

    if (shell) {
      shell.querySelectorAll('[data-map-style]').forEach(function (button) {
        button.addEventListener('click', function () {
          style = button.getAttribute('data-map-style') || 'streets';
          shell.querySelectorAll('[data-map-style]').forEach(function (b) {
            b.setAttribute('aria-pressed', b === button ? 'true' : 'false');
          });
          draw();
        });
      });
      shell.querySelectorAll('[data-map-zoom]').forEach(function (button) {
        button.addEventListener('click', function () {
          zoom = Math.max(2, Math.min(12, zoom + (button.getAttribute('data-map-zoom') === 'in' ? 1 : -1)));
          draw();
        });
      });
    }

    canvas.addEventListener('pointerdown', function (event) {
      drag = { x: event.clientX, y: event.clientY, lat: center.lat, lng: center.lng };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', function (event) {
      if (!drag) return;
      var scale = 256 * Math.pow(2, zoom);
      var dx = event.clientX - drag.x;
      var dy = event.clientY - drag.y;
      center.lng = drag.lng - (dx / scale) * 360;
      var y0 = project(drag.lat, 0, zoom).y;
      var lat = unprojectY(y0 - dy, zoom);
      if (lat !== null) center.lat = lat;
      draw();
    });
    canvas.addEventListener('pointerup', function () { drag = null; });
    canvas.addEventListener('wheel', function (event) {
      event.preventDefault();
      zoom = Math.max(2, Math.min(12, zoom + (event.deltaY < 0 ? 1 : -1)));
      draw();
    }, { passive: false });

    fit();
    resize();
    window.addEventListener('resize', resize);
  }

  function unprojectY(y, zoom) {
    var scale = 256 * Math.pow(2, zoom);
    var n = Math.PI - (2 * Math.PI * y) / scale;
    var lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    if (!isFinite(lat)) return null;
    return Math.max(-85, Math.min(85, lat));
  }

  document.querySelectorAll('.shipment-map').forEach(mount);
})();
