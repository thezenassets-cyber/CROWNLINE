/** API base URL. Defaults to the current origin; set an api-base meta tag to override it. */
(function (global) {
    var base = '';
    if (typeof document !== 'undefined') {
        var meta = document.querySelector('meta[name="api-base"]');
        if (meta && meta.content) base = meta.content.replace(/\/$/, '');
    }
    global.SITE_API_BASE = base;
    global.siteApi = function (path) {
        if (!path) return global.SITE_API_BASE;
        if (path.indexOf('http') === 0) return path;
        var p = path.charAt(0) === '/' ? path : '/' + path;
        return global.SITE_API_BASE + p;
    };
})(typeof window !== 'undefined' ? window : this);
