/** Builds the static customer-facing site into dist/. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const FILES = [
    'index.html',
    'tracking.html',
    'dashboard.html',
    'terms.html',
    'privacy-policy.html',
    'cookie-policy.html',
    'partners.html',
    'robots.txt',
];

const DIRS = ['css', 'js', 'data'];

function rmDir(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(function (name) {
        var p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) rmDir(p);
        else fs.unlinkSync(p);
    });
    fs.rmdirSync(dir);
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(function (name) {
        var from = path.join(src, name);
        var to = path.join(dest, name);
        if (fs.statSync(from).isDirectory()) copyDir(from, to);
        else fs.copyFileSync(from, to);
    });
}

function injectConfigScript(htmlPath) {
    var html = fs.readFileSync(htmlPath, 'utf8');
    var tag = '<script src="js/config.js"></script>';
    if (html.indexOf('js/config.js') !== -1) return;
    if (html.indexOf('<script src="js/script.js">') !== -1) {
        html = html.replace('<script src="js/script.js">', tag + '\n    <script src="js/script.js">');
    } else if (html.indexOf('<script src="js/tracking.js">') !== -1) {
        html = html.replace('<script src="js/tracking.js">', tag + '\n    <script src="js/tracking.js">');
    } else if (html.indexOf('<script src="js/dashboard.js">') !== -1) {
        html = html.replace('<script src="js/dashboard.js">', tag + '\n    <script src="js/dashboard.js">');
    }
    fs.writeFileSync(htmlPath, html, 'utf8');
}

console.log('Building static customer site → dist/');
rmDir(DIST);
fs.mkdirSync(DIST, { recursive: true });

FILES.forEach(function (f) {
    var src = path.join(ROOT, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST, f));
});

DIRS.forEach(function (d) {
    var src = path.join(ROOT, d);
    if (fs.existsSync(src)) copyDir(src, path.join(DIST, d));
});

['index.html', 'tracking.html', 'dashboard.html'].forEach(function (f) {
    var p = path.join(DIST, f);
    if (fs.existsSync(p)) injectConfigScript(p);
});

console.log('Static customer site is ready in dist/.');
