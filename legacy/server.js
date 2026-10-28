require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const http = require('http');
const https = require('https');
const { MongoClient } = require('mongodb');
const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

var CUSTOMER_HTML = ['index.html', 'tracking.html', 'dashboard.html', 'terms.html', 'privacy-policy.html', 'cookie-policy.html', 'partners.html'];

var ALLOWED_CORS_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
(process.env.CORS_ORIGINS || '').split(',').forEach(function (o) {
    o = (o || '').trim().replace(/\/$/, '');
    if (o && ALLOWED_CORS_ORIGINS.indexOf(o) === -1) ALLOWED_CORS_ORIGINS.push(o);
});
var siteUrlEnv = (process.env.SITE_URL || '').trim().replace(/\/$/, '');
if (siteUrlEnv && ALLOWED_CORS_ORIGINS.indexOf(siteUrlEnv) === -1) ALLOWED_CORS_ORIGINS.push(siteUrlEnv);
if (siteUrlEnv) {
    var www = siteUrlEnv.replace('://', '://www.');
    if (www !== siteUrlEnv && ALLOWED_CORS_ORIGINS.indexOf(www) === -1) ALLOWED_CORS_ORIGINS.push(www);
}

// Fix common Atlas copy/paste mistakes (quotes, <password> placeholders, angle brackets)
function normalizeMongoUri(uri) {
    if (!uri || typeof uri !== 'string') return uri;
    uri = uri.trim().replace(/^["']|["']$/g, '');
    // :<YOUR_DB_PASSWORD>@ → :YOUR_DB_PASSWORD@  (user kept Atlas angle brackets)
    uri = uri.replace(/:<([^>@/]+)>@/, ':$1@');
    // literal placeholder left in string
    uri = uri.replace(/:<password>@/i, ':@');
    return uri;
}

function getMongoDbName() {
    return (process.env.MONGODB_DB || 'livexpress').trim() || 'livexpress';
}

// Build a URI from separate variables when credentials are supplied individually.
function resolveMongoUri() {
    var user = process.env.MONGODB_USER && String(process.env.MONGODB_USER).trim();
    var pass = process.env.MONGODB_PASSWORD;
    var cluster = process.env.MONGODB_CLUSTER && String(process.env.MONGODB_CLUSTER).trim();
    if (user && pass && cluster) {
        cluster = cluster.replace(/^mongodb\+srv:\/\//i, '').replace(/^mongodb:\/\//i, '');
        if (cluster.indexOf('@') !== -1) {
            return normalizeMongoUri('mongodb+srv://' + cluster);
        }
        return 'mongodb+srv://' + encodeURIComponent(user) + ':' + encodeURIComponent(pass) +
            '@' + cluster + '/?retryWrites=true&w=majority';
    }
    if (process.env.MONGODB_URI) {
        return normalizeMongoUri(process.env.MONGODB_URI);
    }
    return null;
}

function isMongoConfigured() {
    return !!resolveMongoUri();
}

// ==================== EMAIL SETUP ====================
let emailTransporter = null;
let emailReady = false;
let emailVerifyError = null;
let emailMode = 'none'; // 'brevo-api', 'smtp', or 'none'

const BREVO_API_KEY = process.env.BREVO_API_KEY; // Optional: xkeysib-... key for HTTP API
const EMAIL_SENDER = process.env.EMAIL_USER || process.env.EMAIL_FROM;

if (process.env.NODE_ENV !== 'production') {
    console.log('  [Email Config] EMAIL_USER:', process.env.EMAIL_USER ? 'set' : 'NOT SET');
    console.log('  [Email Config] EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 'set' : 'NOT SET');
    console.log('  [Email Config] BREVO_API_KEY:', process.env.BREVO_API_KEY ? 'set' : 'NOT SET');
    console.log('  [Email Config] EMAIL_HOST:', process.env.EMAIL_HOST || 'NOT SET');
}

if (BREVO_API_KEY && EMAIL_SENDER) {
    // Brevo HTTP API (port 443) — always works, bypasses SMTP blocks
    emailMode = 'brevo-api';
    emailReady = true;
    console.log('  ✅ Email configured via Brevo HTTP API');
}

if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    // Also set up SMTP as primary or fallback
    var smtpConfig;
    if (process.env.EMAIL_HOST) {
        smtpConfig = {
            host: process.env.EMAIL_HOST.trim(),
            port: parseInt(process.env.EMAIL_PORT) || 587,
            secure: (parseInt(process.env.EMAIL_PORT) || 587) === 465,
            auth: {
                user: process.env.EMAIL_USER.trim(),
                pass: process.env.EMAIL_PASSWORD.trim()
            },
            tls: { rejectUnauthorized: false },
            connectionTimeout: 15000,
            greetingTimeout: 10000,
            socketTimeout: 20000
        };
    } else {
        smtpConfig = {
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER.trim(),
                pass: process.env.EMAIL_PASSWORD.trim()
            },
            tls: { rejectUnauthorized: true }
        };
    }
    emailTransporter = nodemailer.createTransport(smtpConfig);
    if (emailMode !== 'brevo-api') {
        emailMode = 'smtp';
        emailReady = true;
    }
    emailTransporter.verify(function(err) {
        if (err) {
            console.log('  ⚠️  SMTP verify error:', err.message);
            emailVerifyError = err.message;
            if (emailMode !== 'brevo-api') {
                console.log('  ⚠️  SMTP is the only email method — emails may fail');
            }
        } else {
            console.log('  ✅ SMTP transporter verified');
            emailVerifyError = null;
            // If SMTP works, prefer it over API
            emailMode = 'smtp';
        }
    });
} else if (emailMode !== 'brevo-api') {
    console.log('  ⚠️  EMAIL_USER / EMAIL_PASSWORD not set — email sending disabled');
    var envKeys = Object.keys(process.env).filter(function(k) { return k.indexOf('EMAIL') > -1 || k.indexOf('email') > -1; });
    if (envKeys.length > 0) {
        console.log('  ⚠️  Found email-related env vars:', envKeys.join(', '));
    }
}

// Brevo HTTP API send function (uses HTTPS, no SMTP port needed)
async function sendViaBrevoAPI(to, subject, htmlContent, senderEmail) {
    const https = require('https');
    const postData = JSON.stringify({
        sender: { name: process.env.COMPANY_NAME || 'LIVEXPRESS', email: senderEmail },
        to: [{ email: to }],
        subject: subject,
        htmlContent: htmlContent
    });
    return new Promise(function(resolve, reject) {
        const req = https.request({
            hostname: 'api.brevo.com',
            path: '/v3/smtp/email',
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': BREVO_API_KEY,
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(postData)
            }
        }, function(res) {
            var body = '';
            res.on('data', function(chunk) { body += chunk; });
            res.on('end', function() {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ messageId: JSON.parse(body).messageId || 'sent' });
                } else {
                    reject(new Error('Brevo API ' + res.statusCode + ': ' + body));
                }
            });
        });
        req.on('error', function(e) { reject(e); });
        req.write(postData);
        req.end();
    });
}

// ==================== SECURITY: Rate Limiting ====================
const rateLimitMap = new Map();
const loginAttempts = new Map();

function rateLimit(windowMs, maxReqs) {
    return function(req, res, next) {
        var ip = req.ip || req.connection.remoteAddress;
        var now = Date.now();
        var key = ip + ':' + req.path;
        var entry = rateLimitMap.get(key);
        if (!entry || now - entry.start > windowMs) {
            rateLimitMap.set(key, { start: now, count: 1 });
            return next();
        }
        entry.count++;
        if (entry.count > maxReqs) {
            return res.status(429).json({ error: 'Too many requests. Please try again later.' });
        }
        next();
    };
}

// Clean up rate limit map every 5 min
setInterval(function() {
    var now = Date.now();
    rateLimitMap.forEach(function(val, key) {
        if (now - val.start > 300000) rateLimitMap.delete(key);
    });
    loginAttempts.forEach(function(val, key) {
        if (now - val.first > 900000) loginAttempts.delete(key);
    });
}, 300000);

// ==================== SECURITY: Headers ====================
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Removed X-Frame-Options - it blocks Smartsupp iframes
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // SEO: Tell search engines to index public pages
    var reqPath = req.path.toLowerCase();
    if (reqPath === '/' || (reqPath.endsWith('.html') && reqPath !== '/admin.html')) {
        res.setHeader('X-Robots-Tag', 'index, follow, max-snippet:-1, max-image-preview:large');
    } else if (reqPath === '/admin.html') {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }

    // No CSP - let Smartsupp load without any restrictions
    next();
});

// ==================== SEO: IndexNow & Search Engine Pinging ====================
const INDEXNOW_KEY = (process.env.INDEXNOW_KEY || '').trim();
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ALL_URLS = [
    SITE_URL + '/',
    SITE_URL + '/tracking.html',
    SITE_URL + '/dashboard.html',
    SITE_URL + '/partners.html',
    SITE_URL + '/privacy-policy.html',
    SITE_URL + '/terms.html',
    SITE_URL + '/cookie-policy.html'
];

if (INDEXNOW_KEY) {
    app.get('/' + INDEXNOW_KEY + '.txt', (req, res) => {
        res.type('text/plain').send(INDEXNOW_KEY);
    });
}

function pingSearchEngines() {
    if (!INDEXNOW_KEY || SITE_URL.indexOf('localhost') !== -1 || SITE_URL.indexOf('example.com') !== -1) {
        console.log('  ⚠️  Search engine ping skipped (set SITE_URL and INDEXNOW_KEY for this project)');
        return;
    }
    var hostName = SITE_URL.replace(/^https?:\/\//, '').split('/')[0];
    var sitemapUrl = encodeURIComponent(SITE_URL + '/sitemap.xml');

    // 1. Ping Google sitemap
    https.get('https://www.google.com/ping?sitemap=' + sitemapUrl, (resp) => {
        var d = '';
        resp.on('data', (c) => { d += c; });
        resp.on('end', () => { console.log('  ✅ Google sitemap ping: HTTP ' + resp.statusCode); });
    }).on('error', (e) => { console.log('  ⚠️  Google ping failed:', e.message); });

    // 2. Ping Bing sitemap
    https.get('https://www.bing.com/ping?sitemap=' + sitemapUrl, (resp) => {
        var d = '';
        resp.on('data', (c) => { d += c; });
        resp.on('end', () => { console.log('  ✅ Bing sitemap ping: HTTP ' + resp.statusCode); });
    }).on('error', (e) => { console.log('  ⚠️  Bing ping failed:', e.message); });

    // 3. IndexNow — submit all URLs to Bing/Yandex for instant indexing
    var indexNowPayload = JSON.stringify({
        host: hostName,
        key: INDEXNOW_KEY,
        keyLocation: SITE_URL + '/' + INDEXNOW_KEY + '.txt',
        urlList: ALL_URLS
    });

    var indexNowReq = https.request({
        hostname: 'api.indexnow.org',
        path: '/IndexNow',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(indexNowPayload)
        }
    }, (resp) => {
        var d = '';
        resp.on('data', (c) => { d += c; });
        resp.on('end', () => { console.log('  ✅ IndexNow submission: HTTP ' + resp.statusCode + ' (' + ALL_URLS.length + ' URLs)'); });
    });
    indexNowReq.on('error', (e) => { console.log('  ⚠️  IndexNow failed:', e.message); });
    indexNowReq.write(indexNowPayload);
    indexNowReq.end();

    // 4. Ping Yandex sitemap
    https.get('https://webmaster.yandex.com/ping?sitemap=' + sitemapUrl, (resp) => {
        var d = '';
        resp.on('data', (c) => { d += c; });
        resp.on('end', () => { console.log('  ✅ Yandex sitemap ping: HTTP ' + resp.statusCode); });
    }).on('error', (e) => { console.log('  ⚠️  Yandex ping failed:', e.message); });

    console.log('  🔍 Search engine pings sent for ' + SITE_URL);
}

// CORS — allow only configured website origins.
app.use(function (req, res, next) {
    var origin = req.headers.origin;
    if (origin && ALLOWED_CORS_ORIGINS.indexOf(origin) !== -1) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
        res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.get('/health', function (req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, service: 'livexpress-api' });
});

// Middleware
app.use(express.static(__dirname, {
    dotfiles: 'deny',
    index: ['index.html'],
    setHeaders: function(res, filePath) {
        var base = path.basename(filePath);
        if (CUSTOMER_HTML.indexOf(base) !== -1) {
            res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800');
        } else if (base === 'admin.html') {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
        } else if (filePath.includes(path.join('data', path.sep)) && filePath.endsWith('.json')) {
            res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
        }
    }
}));
app.use(express.json({ limit: '1mb' }));

// Clean URL routes
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Block access to sensitive files
app.use((req, res, next) => {
    var blocked = ['.env', '.git', '.gitignore', 'package-lock.json', 'node_modules'];
    var reqPath = req.path.toLowerCase();
    for (var i = 0; i < blocked.length; i++) {
        if (reqPath.includes(blocked[i])) {
            return res.status(403).json({ error: 'Forbidden' });
        }
    }
    // Prevent path traversal
    if (reqPath.includes('..')) {
        return res.status(400).json({ error: 'Invalid path' });
    }
    next();
});

// ==================== SECURITY: Input Sanitizer ====================
function sanitize(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[<>"'&]/g, function(c) {
        return { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c];
    }).substring(0, 2000);
}

function sanitizeObj(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    var clean = {};
    Object.keys(obj).forEach(function(key) {
        var safeKey = sanitize(key);
        clean[safeKey] = typeof obj[key] === 'string' ? sanitize(obj[key]) : obj[key];
    });
    return clean;
}

// Data file paths
const dataDir = path.join(__dirname, 'data');
const visitorsFile = path.join(dataDir, 'visitors.json');
const shipmentsFile = path.join(dataDir, 'shipments.json');
const auditLogFile = path.join(dataDir, 'audit-log.json');
const notificationsFile = path.join(dataDir, 'notifications.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// ==================== SHIPMENT PERSISTENCE (MONGODB PRIMARY) ====================
// Shipments NEVER auto-delete — only admin can remove them.
// JSONBin kept as secondary backup only.

let shipmentCache = null;
let mongoDb = null;           // MongoDB database reference
let mongoCollection = null;   // MongoDB shipments collection
let mongoHealthy = false;     // Track if MongoDB is connected
let jsonBinHealthy = false;   // Track if JSONBin backup is working
let lastDbSync = 0;           // Timestamp of last successful DB operation

// ---- MongoDB Connection ----
async function connectMongo() {
    var uri = resolveMongoUri();
    if (!uri) return false;
    var dbName = getMongoDbName();
    var viaParts = !!(process.env.MONGODB_USER && process.env.MONGODB_PASSWORD && process.env.MONGODB_CLUSTER);
    try {
        const client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 30000,
            retryWrites: true,
            retryReads: true
        });
        await client.connect();
        await client.db().admin().ping();
        mongoDb = client.db(dbName);
        mongoCollection = mongoDb.collection('shipments');
        await mongoCollection.createIndex({ id: 1 }, { unique: true, background: true });
        mongoHealthy = true;
        lastDbSync = Date.now();
        var count = await mongoCollection.countDocuments();
        console.log('  ✅ MongoDB connected (' + (viaParts ? 'MONGODB_USER/PASSWORD/CLUSTER' : 'MONGODB_URI') +
            ') — db: ' + dbName + ', collection: shipments, documents: ' + count);
        if (count === 0) {
            console.log('  ⚠️  MongoDB is empty. In Atlas → Browse Collections, check database "' + dbName + '" → shipments');
        }
        return true;
    } catch (e) {
        console.error('  ❌ MongoDB connection FAILED:', e.message);
        if (e.message && e.message.indexOf('bad auth') !== -1) {
            console.error('  💡 Auth fix: Atlas → Database Access → reset DB user password.');
            console.error('     Set MONGODB_USER, MONGODB_PASSWORD, and MONGODB_CLUSTER if URI encoding is an issue.');
            console.error('     Or MONGODB_URI without < > brackets around the password.');
        }
        mongoHealthy = false;
        return false;
    }
}

// ---- MongoDB CRUD Operations ----
async function mongoGetAll() {
    if (!mongoCollection) throw new Error('MongoDB not connected');
    const docs = await mongoCollection.find({}).toArray();
    // Strip MongoDB _id field for compatibility
    return docs.map(d => { const { _id, ...rest } = d; return rest; });
}

async function mongoSaveAll(shipments) {
    if (!mongoCollection) throw new Error('MongoDB not connected');
    // Use bulkWrite for atomic replacement of all shipments
    const ops = [];
    for (const s of shipments) {
        ops.push({
            replaceOne: {
                filter: { id: s.id },
                replacement: s,
                upsert: true
            }
        });
    }
    if (ops.length > 0) {
        await mongoCollection.bulkWrite(ops, { ordered: false });
    }
    // Remove shipments from DB that are no longer in the array (admin deleted them)
    const currentIds = shipments.map(s => s.id);
    await mongoCollection.deleteMany({ id: { $nin: currentIds } });
    lastDbSync = Date.now();
}

async function mongoInsertOne(shipment) {
    if (!mongoCollection) throw new Error('MongoDB not connected');
    await mongoCollection.replaceOne({ id: shipment.id }, shipment, { upsert: true });
    lastDbSync = Date.now();
}

async function mongoUpdateOne(shipmentId, updates) {
    if (!mongoCollection) throw new Error('MongoDB not connected');
    await mongoCollection.updateOne({ id: shipmentId }, { $set: updates });
    lastDbSync = Date.now();
}

async function mongoDeleteOne(shipmentId) {
    if (!mongoCollection) throw new Error('MongoDB not connected');
    await mongoCollection.deleteOne({ id: shipmentId });
    lastDbSync = Date.now();
}

// ---- JSONBin (Backup Only) ----
function jsonBinGet() {
    return new Promise((resolve, reject) => {
        if (!process.env.JSONBIN_API_KEY || !process.env.JSONBIN_BIN_ID) {
            return reject(new Error('JSONBin env vars not set'));
        }
        const options = {
            hostname: 'api.jsonbin.io',
            path: '/v3/b/' + process.env.JSONBIN_BIN_ID + '/latest',
            method: 'GET',
            headers: { 'X-Master-Key': process.env.JSONBIN_API_KEY },
            timeout: 15000
        };
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (Array.isArray(parsed.record)) { jsonBinHealthy = true; resolve(parsed.record); }
                    else reject(new Error('JSONBin: unexpected response'));
                } catch (e) { reject(e); }
            });
        });
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('JSONBin GET timeout')); });
        req.on('error', reject);
        req.end();
    });
}

function jsonBinPut(data) {
    return new Promise((resolve, reject) => {
        if (!process.env.JSONBIN_API_KEY || !process.env.JSONBIN_BIN_ID) {
            return reject(new Error('JSONBin env vars not set'));
        }
        const body = JSON.stringify(data);
        const options = {
            hostname: 'api.jsonbin.io',
            path: '/v3/b/' + process.env.JSONBIN_BIN_ID,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': process.env.JSONBIN_API_KEY,
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: 15000
        };
        const req = https.request(options, (res) => {
            let rb = '';
            res.on('data', d => rb += d);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) { jsonBinHealthy = true; resolve(rb); }
                else reject(new Error('JSONBin PUT HTTP ' + res.statusCode));
            });
        });
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('JSONBin PUT timeout')); });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ---- JSONBin Retry Wrappers ----
async function jsonBinGetWithRetry() {
    for (var attempt = 1; attempt <= 3; attempt++) {
        try { return await jsonBinGet(); }
        catch (e) {
            console.error('  [JSONBin] GET attempt ' + attempt + '/3 failed:', e.message);
            if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
        }
    }
    throw new Error('JSONBin GET failed after 3 attempts');
}

async function jsonBinPutWithRetry(data) {
    for (var attempt = 1; attempt <= 3; attempt++) {
        try { return await jsonBinPut(data); }
        catch (e) {
            console.error('  [JSONBin] PUT attempt ' + attempt + '/3 failed:', e.message);
            if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
        }
    }
    throw new Error('JSONBin PUT failed after 3 attempts');
}

// ---- Core Storage Functions (used by all endpoints) ----
function getShipments() {
    if (shipmentCache) return shipmentCache;
    try {
        shipmentCache = JSON.parse(fs.readFileSync(shipmentsFile, 'utf8'));
    } catch(e) {
        shipmentCache = [];
    }
    return shipmentCache;
}

function saveShipments(shipments) {
    shipmentCache = shipments;
    // 1. Save locally (fast cache)
    try { fs.writeFileSync(shipmentsFile, JSON.stringify(shipments, null, 2)); } catch(e) {}

    // 2. Save to MongoDB (PRIMARY permanent store)
    if (mongoHealthy && mongoCollection) {
        mongoSaveAll(shipments)
            .then(() => { console.log('  [MongoDB] Saved ' + shipments.length + ' shipments'); })
            .catch(e => { mongoHealthy = false; console.error('  ⚠️  [MongoDB] Save failed:', e.message); });
    }

    // 3. MUST sync to JSONBin — this is what survives redeploys
    if (process.env.JSONBIN_API_KEY && process.env.JSONBIN_BIN_ID) {
        // Use a global promise tracker so saves complete even if request ends
        saveShipments._pending = jsonBinPutWithRetry(shipments)
            .then(() => { console.log('  [JSONBin] ✅ Synced ' + shipments.length + ' shipments'); saveShipments._pending = null; })
            .catch(e => { jsonBinHealthy = false; console.error('  ⚠️  [JSONBin] Sync failed:', e.message); saveShipments._pending = null; });
    }
}
saveShipments._pending = null;

// Smart save — for single shipment operations (faster than full array sync)
function saveShipmentUpdate(shipmentId, updates) {
    // Local + cache already updated by caller
    try { fs.writeFileSync(shipmentsFile, JSON.stringify(shipmentCache, null, 2)); } catch(e) {}

    if (mongoHealthy && mongoCollection) {
        mongoUpdateOne(shipmentId, updates).catch(e => {
            mongoHealthy = false;
            console.error('  ⚠️  [MongoDB] Update failed:', e.message);
        });
    }
    // Also sync full array to JSONBin so it stays current
    if (process.env.JSONBIN_API_KEY && process.env.JSONBIN_BIN_ID) {
        jsonBinPutWithRetry(shipmentCache).catch(() => {});
    }
}

function saveShipmentInsert(shipment) {
    try { fs.writeFileSync(shipmentsFile, JSON.stringify(shipmentCache, null, 2)); } catch(e) {}

    if (mongoHealthy && mongoCollection) {
        mongoInsertOne(shipment).catch(e => {
            mongoHealthy = false;
            console.error('  ⚠️  [MongoDB] Insert failed:', e.message);
        });
    }
    if (process.env.JSONBIN_API_KEY && process.env.JSONBIN_BIN_ID) {
        jsonBinPutWithRetry(shipmentCache).catch(() => {});
    }
}

function saveShipmentDelete(shipmentId) {
    try { fs.writeFileSync(shipmentsFile, JSON.stringify(shipmentCache, null, 2)); } catch(e) {}

    if (mongoHealthy && mongoCollection) {
        mongoDeleteOne(shipmentId).catch(e => {
            mongoHealthy = false;
            console.error('  ⚠️  [MongoDB] Delete failed:', e.message);
        });
    }
    if (process.env.JSONBIN_API_KEY && process.env.JSONBIN_BIN_ID) {
        jsonBinPutWithRetry(shipmentCache).catch(() => {});
    }
}

// ---- Startup: Load shipments — NEVER overwrite good data with empty ----
async function initShipmentStore() {
    // First, read whatever is in the local file (might have data from before restart)
    var localData = [];
    try {
        localData = JSON.parse(fs.readFileSync(shipmentsFile, 'utf8'));
        if (!Array.isArray(localData)) localData = [];
    } catch(e) { localData = []; }

    // PRIORITY 1: MongoDB 
    if (isMongoConfigured()) {
        var connected = await connectMongo();
        if (connected) {
            try {
                var data = await mongoGetAll();
                // SAFETY: Only use MongoDB data if it has MORE shipments, or local is empty
                if (data.length >= localData.length) {
                    shipmentCache = data;
                    try { fs.writeFileSync(shipmentsFile, JSON.stringify(data, null, 2)); } catch(e) {}
                    console.log('  ✅ Loaded ' + data.length + ' shipments from MongoDB');
                } else if (localData.length > 0) {
                    // Local has more data — push it to MongoDB
                    shipmentCache = localData;
                    console.log('  ⚠️  Local has ' + localData.length + ' shipments vs MongoDB ' + data.length + ' — keeping local, syncing to MongoDB');
                    try { await mongoSaveAll(localData); } catch(e) {}
                }
                if (process.env.JSONBIN_API_KEY && process.env.JSONBIN_BIN_ID) {
                    jsonBinPut(shipmentCache).catch(() => {});
                }
                return;
            } catch (e) {
                console.error('  ❌ MongoDB read failed:', e.message);
            }
        }
    } else {
        console.log('  ⚠️  MONGODB_URI not set — MongoDB disabled');
    }

    // PRIORITY 2: JSONBin
    if (process.env.JSONBIN_API_KEY && process.env.JSONBIN_BIN_ID) {
        console.log('  [JSONBin] Loading from permanent storage...');
        try {
            var data = await jsonBinGetWithRetry();
            // ===== CRITICAL FIX: NEVER let empty JSONBin overwrite good local data =====
            if (data.length === 0 && localData.length > 0) {
                console.log('  ⚠️  JSONBin returned EMPTY but local has ' + localData.length + ' shipments — KEEPING LOCAL DATA');
                console.log('  ⚠️  Re-uploading local data to JSONBin...');
                shipmentCache = localData;
                try { await jsonBinPutWithRetry(localData); console.log('  ✅ Restored ' + localData.length + ' shipments to JSONBin'); } catch(e) {}
            } else if (data.length >= localData.length) {
                shipmentCache = data;
                try { fs.writeFileSync(shipmentsFile, JSON.stringify(data, null, 2)); } catch(e) {}
                console.log('  ✅ Loaded ' + data.length + ' shipments from JSONBin');
            } else {
                // Local has more — keep local, re-upload to JSONBin
                console.log('  ⚠️  Local has ' + localData.length + ' vs JSONBin ' + data.length + ' — keeping local');
                shipmentCache = localData;
                try { await jsonBinPutWithRetry(localData); } catch(e) {}
            }
            if (mongoHealthy && mongoCollection && shipmentCache.length > 0) {
                try { await mongoSaveAll(shipmentCache); } catch(e) {}
            }
            return;
        } catch (e) {
            console.error('  ❌ JSONBin failed:', e.message);
        }
    }

    // PRIORITY 3: Local file
    if (localData.length > 0) {
        shipmentCache = localData;
        console.log('  ⚠️  Loaded ' + localData.length + ' shipments from local file');
    } else {
        shipmentCache = [];
        console.log('  ⚠️  No shipments found — starting empty');
    }
}

// Periodic backup — every 10 minutes
function startPeriodicBackup() {
    setInterval(async () => {
        if (!shipmentCache || shipmentCache.length === 0) return;

        // Sync to MongoDB 
        if (mongoHealthy && mongoCollection) {
            try {
                await mongoSaveAll(shipmentCache);
                console.log('  [MongoDB] Periodic sync: ' + shipmentCache.length + ' shipments OK');
            } catch(e) {
                mongoHealthy = false;
                console.error('  ⚠️  [MongoDB] Periodic sync failed:', e.message);
                // Try to reconnect
                try { await connectMongo(); } catch(e2) {}
            }
        } else if (isMongoConfigured()) {
            // Try to reconnect if it was disconnected
            console.log('  [MongoDB] Attempting reconnection...');
            try {
                var reconnected = await connectMongo();
                if (reconnected) {
                    await mongoSaveAll(shipmentCache);
                    console.log('  ✅ [MongoDB] Reconnected and synced ' + shipmentCache.length + ' shipments');
                }
            } catch(e) {}
        }

        // Backup to JSONBin (with retry)
        if (process.env.JSONBIN_API_KEY && process.env.JSONBIN_BIN_ID) {
            try {
                await jsonBinPutWithRetry(shipmentCache);
                console.log('  [JSONBin] Periodic backup: ' + shipmentCache.length + ' shipments synced');
            } catch(e) { jsonBinHealthy = false; }
        }
    }, 10 * 60 * 1000);
}

// Initialize data files (NON-SHIPMENT files only)
// Shipments are handled separately by initShipmentStore()
function initializeDataFiles() {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(visitorsFile)) {
        fs.writeFileSync(visitorsFile, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(auditLogFile)) {
        fs.writeFileSync(auditLogFile, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(notificationsFile)) {
        fs.writeFileSync(notificationsFile, JSON.stringify([], null, 2));
    }
    // Shipments file: create empty placeholder if missing (JSONBin will overwrite)
    if (!fs.existsSync(shipmentsFile)) {
        fs.writeFileSync(shipmentsFile, JSON.stringify([], null, 2));
    }
}

// Logging function
function logAudit(action, details, adminId) {
    try {
        const auditLog = JSON.parse(fs.readFileSync(auditLogFile, 'utf8'));
        // Limit log size to prevent disk exhaustion
        if (auditLog.length > 10000) auditLog.splice(0, auditLog.length - 5000);
        auditLog.push({
            timestamp: new Date().toISOString(),
            action: sanitize(String(action)),
            details: sanitizeObj(details),
            adminId: sanitize(String(adminId || 'system'))
        });
        fs.writeFileSync(auditLogFile, JSON.stringify(auditLog, null, 2));
    } catch(e) { console.error('Audit log error:', e.message); }
}

// IP Geolocation lookup (uses free ip-api.com, no key needed)
function lookupGeo(ip) {
    return new Promise((resolve) => {
        // Skip private/local IPs
        if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
            return resolve({ country: 'Local', city: 'localhost', countryCode: 'XX' });
        }
        const cleanIp = ip.replace(/^::ffff:/, '');
        const url = 'http://ip-api.com/json/' + encodeURIComponent(cleanIp) + '?fields=status,country,city,countryCode';
        http.get(url, { timeout: 3000 }, (resp) => {
            let data = '';
            resp.on('data', c => data += c);
            resp.on('end', () => {
                try {
                    const j = JSON.parse(data);
                    if (j.status === 'success') {
                        resolve({ country: j.country || 'Unknown', city: j.city || '', countryCode: j.countryCode || '' });
                    } else { resolve({ country: 'Unknown', city: '', countryCode: '' }); }
                } catch(e) { resolve({ country: 'Unknown', city: '', countryCode: '' }); }
            });
        }).on('error', () => resolve({ country: 'Unknown', city: '', countryCode: '' }));
    });
}

// Add admin notification
function addAdminNotification(type, message, details) {
    try {
        const notifs = JSON.parse(fs.readFileSync(notificationsFile, 'utf8'));
        if (notifs.length > 500) notifs.splice(0, notifs.length - 250);
        notifs.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
            type: type,
            message: sanitize(String(message).substring(0, 300)),
            details: details || {},
            timestamp: new Date().toISOString(),
            read: false
        });
        fs.writeFileSync(notificationsFile, JSON.stringify(notifs, null, 2));
    } catch(e) { console.error('Notification error:', e.message); }
}

// Track visitor with geo lookup
function trackVisitor(req) {
    try {
        const visitors = JSON.parse(fs.readFileSync(visitorsFile, 'utf8'));
        if (visitors.length > 50000) visitors.splice(0, visitors.length - 25000);
        const visitorEntry = {
            timestamp: new Date().toISOString(),
            ip: req.ip,
            userAgent: sanitize(String(req.get('user-agent') || '').substring(0, 500)),
            path: sanitize(req.path.substring(0, 200)),
            country: '',
            city: '',
            countryCode: ''
        };
        visitors.push(visitorEntry);
        fs.writeFileSync(visitorsFile, JSON.stringify(visitors, null, 2));

        // Async geo lookup — update entry after response
        lookupGeo(req.ip).then(geo => {
            visitorEntry.country = geo.country;
            visitorEntry.city = geo.city;
            visitorEntry.countryCode = geo.countryCode;
            try { fs.writeFileSync(visitorsFile, JSON.stringify(visitors, null, 2)); } catch(e) {}
        });
    } catch(e) { console.error('Visitor tracking error:', e.message); }
}

// Middleware to track all visits
app.use((req, res, next) => {
    if (!req.path.startsWith('/api/admin') && req.path !== '/admin.html' && !req.path.includes('.json')) {
        trackVisitor(req);
    }
    next();
});

// ==================== PUBLIC API ====================

// Visitor click tracking (called from frontend)
app.post('/api/visitor/click', rateLimit(60000, 30), (req, res) => {
    const { page, action, trackingId } = req.body || {};
    const ip = req.ip;

    lookupGeo(ip).then(geo => {
        const clickEvent = {
            timestamp: new Date().toISOString(),
            ip: ip,
            country: geo.country,
            city: geo.city,
            countryCode: geo.countryCode,
            page: sanitize(String(page || '').substring(0, 200)),
            action: sanitize(String(action || 'page_visit').substring(0, 100)),
            trackingId: sanitize(String(trackingId || '').substring(0, 50)),
            userAgent: sanitize(String(req.get('user-agent') || '').substring(0, 300))
        };

        // Add notification for admin
        let msg = '🌍 Visitor from ' + geo.country;
        if (geo.city) msg += ' (' + geo.city + ')';
        if (action === 'tracking_search' && trackingId) {
            msg += ' searched tracking: ' + trackingId;
        } else if (action === 'link_click') {
            msg += ' clicked link on ' + (page || 'homepage');
        } else {
            msg += ' visited ' + (page || 'homepage');
        }
        addAdminNotification('visitor', msg, clickEvent);

        res.json({ success: true, country: geo.country, city: geo.city, countryCode: geo.countryCode });
    }).catch(() => {
        res.json({ success: true });
    });
});

// Get shipment tracking info (rate limited)
app.get('/api/track/:shipmentId', rateLimit(60000, 20), (req, res) => {
    // Accept new LIVEXPRESS IDs and existing shipment IDs.
    if (!/^(?:LX|TW)-[A-Z0-9-]{5,40}$/.test(req.params.shipmentId)) {
        return res.status(400).json({ error: 'Invalid tracking number format' });
    }
    const shipments = getShipments();
    const shipment = shipments.find(s => s.id === req.params.shipmentId);
    if (!shipment) {
        return res.status(404).json({ error: 'Shipment not found', trackingId: req.params.shipmentId });
    }
    // Return only public-safe fields (not client personal data)
    res.json({
        id: shipment.id,
        origin: shipment.origin,
        destination: shipment.destination,
        deliveryAddress: shipment.deliveryAddress || '',
        status: shipment.status,
        type: shipment.type,
        eta: shipment.eta,
        progress: shipment.progress || 0,
        description: shipment.description || '',
        priority: shipment.priority || 'Standard',
        weight: shipment.weight || null,
        pieces: shipment.pieces || 1,
        packaging: shipment.packaging || '',
        pickupDate: shipment.pickupDate || '',
        createdAt: shipment.createdAt || '',
        timeline: shipment.timeline || [],
        current_location: shipment.current_location || '',
        cargo: {
            description: shipment.cargo?.description || '',
            hsCode: shipment.cargo?.hsCode || '',
            insurance: shipment.cargo?.insurance || '',
            flags: shipment.cargo?.flags || []
        },
        dimensions: shipment.dimensions || null,
        incoterms: shipment.incoterms || '',
        handling: shipment.handling || '',
        documents: shipment.documents || [],
        volumetricWeight: shipment.volumetricWeight || null,
        chargeableWeight: shipment.chargeableWeight || null
    });
});

// Get active shipments for public map view (rate limited, minimal data)
app.get('/api/map/shipments', rateLimit(60000, 10), (req, res) => {
    try {
        const shipments = getShipments();
        const active = shipments.filter(s => 
            s.status && !['Delivered', 'Cancelled'].includes(s.status)
        );
        // Return only map-safe fields (no client data, no addresses)
        res.json(active.slice(0, 50).map(s => ({
            id: s.id,
            origin: s.origin || '',
            destination: s.destination || '',
            status: s.status || '',
            type: s.type || '',
            progress: s.progress || 0,
            current_location: s.current_location || ''
        })));
    } catch(e) {
        res.json([]);
    }
});

// Public dashboard stats (no auth required, rate limited)
app.get('/api/dashboard/stats', rateLimit(60000, 15), (req, res) => {
    try {
        const shipments = getShipments();
        const total = shipments.length;
        const inTransit = shipments.filter(s => ['In Transit', 'In Flight', 'Out for Delivery'].includes(s.status)).length;
        const delivered = shipments.filter(s => s.status === 'Delivered').length;
        const processing = shipments.filter(s => ['Processing', 'Loading', 'Pending'].includes(s.status)).length;
        const active = total - delivered;

        // Status breakdown for chart
        const statusCounts = {};
        shipments.forEach(s => {
            var st = s.status || 'Unknown';
            statusCounts[st] = (statusCounts[st] || 0) + 1;
        });

        // Recent shipments (last 10, public-safe fields only)
        var recent = shipments.slice().sort(function(a, b) {
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        }).slice(0, 10).map(function(s) {
            return {
                id: s.id,
                origin: s.origin,
                destination: s.destination,
                status: s.status,
                type: s.type,
                progress: s.progress || 0,
                eta: s.eta,
                createdAt: s.createdAt || ''
            };
        });

        res.json({
            total: total,
            active: active,
            inTransit: inTransit,
            delivered: delivered,
            processing: processing,
            statusCounts: statusCounts,
            recent: recent
        });
    } catch(e) {
        res.json({ total: 0, active: 0, inTransit: 0, delivered: 0, processing: 0, statusCounts: {}, recent: [] });
    }
});

// ==================== ADMIN API ====================

// Admin authentication with brute force protection
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMeLocalOnly';

// Pre-compute SHA-256 hash of admin password so we can compare against
// the hashed token sent by the browser (admin.html uses Web Crypto SHA-256)
function sha256Hex(str) {
    return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}
const ADMIN_PASSWORD_HASH = sha256Hex(ADMIN_PASSWORD);

function verifyAdminToken(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (!token) {
        return res.status(401).json({ error: 'No credentials provided' });
    }
    const tokenStr = String(token);
    // The browser sends SHA-256(password) — compare against our pre-hashed value
    // Also accept plain-text password as fallback (for API/Postman use)
    const hashMatch = tokenStr === ADMIN_PASSWORD_HASH;
    const plainMatch = tokenStr === ADMIN_PASSWORD;
    if (!hashMatch && !plainMatch) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// Apply rate limiting to admin routes
app.use('/api/admin', rateLimit(60000, 30));

// Get visitor analytics
app.get('/api/admin/visitors', verifyAdminToken, (req, res) => {
    const visitors = JSON.parse(fs.readFileSync(visitorsFile, 'utf8'));
    const today = new Date().toDateString();
    const todayVisitors = visitors.filter(v => new Date(v.timestamp).toDateString() === today);
    
    // Count visitors by country
    const countryStats = {};
    visitors.forEach(v => {
        const c = v.country || 'Unknown';
        countryStats[c] = (countryStats[c] || 0) + 1;
    });

    res.json({
        totalVisitors: visitors.length,
        todayVisitors: todayVisitors.length,
        weekVisitors: visitors.filter(v => {
            const date = new Date(v.timestamp);
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            return date >= oneWeekAgo;
        }).length,
        recentVisitors: visitors.slice(-50),
        countryStats: countryStats
    });
});

// Get admin notifications
app.get('/api/admin/notifications', verifyAdminToken, (req, res) => {
    try {
        const notifs = JSON.parse(fs.readFileSync(notificationsFile, 'utf8'));
        const unread = notifs.filter(n => !n.read).length;
        res.json({ notifications: notifs.slice(-50).reverse(), unreadCount: unread });
    } catch(e) {
        res.json({ notifications: [], unreadCount: 0 });
    }
});

// Mark notifications as read
app.post('/api/admin/notifications/read', verifyAdminToken, (req, res) => {
    try {
        const notifs = JSON.parse(fs.readFileSync(notificationsFile, 'utf8'));
        notifs.forEach(n => n.read = true);
        fs.writeFileSync(notificationsFile, JSON.stringify(notifs, null, 2));
        res.json({ success: true });
    } catch(e) {
        res.json({ success: false });
    }
});

// Get all shipments
app.get('/api/admin/shipments', verifyAdminToken, (req, res) => {
    res.json(getShipments());
});

// Update shipment status
app.post('/api/admin/shipments/:id/status', verifyAdminToken, (req, res) => {
    const { status } = req.body;
    if (!status || typeof status !== 'string' || status.length > 50) {
        return res.status(400).json({ error: 'Invalid status' });
    }
    const safeStatus = sanitize(status);
    const shipments = getShipments();
    const shipment = shipments.find(s => s.id === req.params.shipmentId || s.id === req.params.id);
    
    if (!shipment) {
        return res.status(404).json({ error: 'Shipment not found' });
    }
    
    const oldStatus = shipment.status;
    shipment.status = safeStatus;
    saveShipments(shipments);
    
    logAudit('UPDATE_SHIPMENT_STATUS', {
        shipmentId: req.params.id,
        oldStatus,
        newStatus: status
    }, req.headers['x-admin-id'] || 'admin');
    
    res.json({ success: true, message: `Shipment ${req.params.id} updated to ${status}` });
});

// Cancel shipment
app.post('/api/admin/shipments/:id/cancel', verifyAdminToken, (req, res) => {
    const reason = sanitize(req.body.reason || 'No reason provided');
    const shipments = getShipments();
    const shipment = shipments.find(s => s.id === req.params.id);
    
    if (!shipment) {
        return res.status(404).json({ error: 'Shipment not found' });
    }
    
    shipment.status = 'Cancelled';
    shipment.progress = 0;
    saveShipments(shipments);
    
    logAudit('CANCEL_SHIPMENT', {
        shipmentId: req.params.id,
        reason: reason
    }, req.headers['x-admin-id'] || 'admin');
    
    res.json({ success: true, message: `Shipment ${req.params.id} cancelled` });
});

// Update delivery details
app.post('/api/admin/shipments/:id/delivery', verifyAdminToken, (req, res) => {
    const { progress, eta } = req.body;
    const shipments = getShipments();
    const shipment = shipments.find(s => s.id === req.params.id);
    
    if (!shipment) {
        return res.status(404).json({ error: 'Shipment not found' });
    }
    
    if (progress !== undefined) shipment.progress = progress;
    if (eta) shipment.eta = eta;
    saveShipments(shipments);
    
    logAudit('UPDATE_DELIVERY', {
        shipmentId: req.params.id,
        progress,
        eta
    }, req.headers['x-admin-id'] || 'admin');
    
    res.json({ success: true, message: `Shipment delivery updated` });
});

// Bulk delete shipments (permanently removes multiple at once)
app.post('/api/admin/shipments/bulk-delete', verifyAdminToken, (req, res) => {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids array required' });
    }
    let shipments = getShipments();
    const deleted = shipments.filter(s => ids.includes(s.id));
    shipments = shipments.filter(s => !ids.includes(s.id));
    shipmentCache = shipments;
    saveShipments(shipments);
    logAudit('BULK_DELETE', { count: deleted.length, ids: deleted.map(s => s.id) }, req.headers['x-admin-id'] || 'admin');
    res.json({ success: true, deleted: deleted.length, remaining: shipments.length });
});

// Bulk update shipment status
app.post('/api/admin/shipments/bulk-update', verifyAdminToken, (req, res) => {
    const ids = req.body.ids;
    const status = req.body.status;
    const validStatuses = ['Processing', 'Loading', 'In Transit', 'In Flight', 'Customs Clearance', 'Out for Delivery', 'On Hold', 'Delayed', 'Delivered', 'Cancelled'];
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids array required' });
    }
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }
    let shipments = getShipments();
    let updated = 0;
    shipments.forEach(s => {
        if (ids.includes(s.id)) { s.status = status; updated++; }
    });
    saveShipments(shipments);
    logAudit('BULK_UPDATE_STATUS', { count: updated, status, ids }, req.headers['x-admin-id'] || 'admin');
    res.json({ success: true, updated });
});

// Create new shipment
app.post('/api/admin/shipments', verifyAdminToken, (req, res) => {
    const body = sanitizeObj(req.body);
    const { origin, destination, type, weight, eta, status, description } = body;
    if (!origin || !destination || !eta) {
        return res.status(400).json({ error: 'Origin, destination and ETA are required' });
    }
    // Validate new and existing shipment ID formats.
    var id = body.id;
    if (id && !/^(?:LX|TW)-[A-Z0-9-]{5,40}$/.test(id)) {
        return res.status(400).json({ error: 'Invalid shipment ID format' });
    }
    const shipments = getShipments();
    const newShipment = {
        id: id || 'LX-2026-' + String(Math.floor(Math.random() * 900000) + 100000),
        origin: sanitize(origin), destination: sanitize(destination), type: sanitize(type || 'Ocean Freight'),
        weight: typeof weight === 'number' ? weight : 0, status: sanitize(status || 'Processing'),
        progress: status === 'In Transit' ? 10 : 0,
        eta: sanitize(eta), description: sanitize(description || ''),
        createdAt: new Date().toISOString()
    };
    // Preserve full shipment data (client, cargo, dimensions, delivery address, etc.)
    if (body.deliveryAddress) newShipment.deliveryAddress = sanitize(body.deliveryAddress);
    if (body.priority) newShipment.priority = sanitize(body.priority);
    if (body.incoterms) newShipment.incoterms = sanitize(body.incoterms);
    if (body.pieces) newShipment.pieces = parseInt(body.pieces) || 1;
    if (body.packaging) newShipment.packaging = sanitize(body.packaging);
    if (body.pickupDate) newShipment.pickupDate = sanitize(body.pickupDate);
    if (body.handling) newShipment.handling = sanitize(body.handling);
    if (body.volumetricWeight) newShipment.volumetricWeight = parseFloat(body.volumetricWeight) || 0;
    if (body.chargeableWeight) newShipment.chargeableWeight = parseFloat(body.chargeableWeight) || 0;
    if (body.client && typeof body.client === 'object') {
        newShipment.client = {
            name: sanitize(body.client.name || ''),
            email: sanitize(body.client.email || ''),
            phone: sanitize(body.client.phone || ''),
            company: sanitize(body.client.company || '')
        };
    }
    if (body.dimensions && typeof body.dimensions === 'object') {
        newShipment.dimensions = {
            length: parseFloat(body.dimensions.length) || 0,
            width: parseFloat(body.dimensions.width) || 0,
            height: parseFloat(body.dimensions.height) || 0
        };
    }
    if (body.cargo && typeof body.cargo === 'object') {
        newShipment.cargo = {
            description: sanitize(body.cargo.description || ''),
            hsCode: sanitize(body.cargo.hsCode || ''),
            declaredValue: parseFloat(body.cargo.declaredValue) || 0,
            insurance: sanitize(body.cargo.insurance || ''),
            flags: Array.isArray(body.cargo.flags) ? body.cargo.flags.map(f => sanitize(f)) : []
        };
    }
    shipments.push(newShipment);
    saveShipments(shipments);
    logAudit('CREATE_SHIPMENT', { shipmentId: newShipment.id, origin, destination, type: newShipment.type }, req.headers['x-admin-id'] || 'admin');

    // Add to shipment history (audit log)
    logAudit('SHIPMENT_HISTORY_ADD', { shipmentId: newShipment.id, shipment: newShipment }, req.headers['x-admin-id'] || 'admin');

    // Optionally: Add to a separate shipment history file if needed

    res.json({ success: true, shipment: newShipment });
});
// Mark shipment (e.g., as delivered, cancelled, etc.)
app.patch('/api/admin/shipments/:id/mark', verifyAdminToken, (req, res) => {
    const shipments = getShipments();
    const shipment = shipments.find(s => s.id === req.params.id);
    if (!shipment) {
        return res.status(404).json({ error: 'Shipment not found' });
    }
    const updates = req.body || {};
    // Only allow certain fields to be updated
    const allowed = ['status', 'progress', 'eta', 'current_location', 'deliveredAt'];
    allowed.forEach(field => {
        if (updates[field] !== undefined) shipment[field] = updates[field];
    });
    saveShipments(shipments);
    logAudit('MARK_SHIPMENT', { shipmentId: shipment.id, updates }, req.headers['x-admin-id'] || 'admin');
    res.json({ success: true, shipment });
});

// Delete shipment
app.delete('/api/admin/shipments/:id', verifyAdminToken, (req, res) => {
    let shipments = getShipments();
    const idx = shipments.findIndex(s => s.id === req.params.id);
    if (idx === -1) {
        return res.status(404).json({ error: 'Shipment not found' });
    }
    const deleted = shipments[idx];
    shipments.splice(idx, 1);
    saveShipments(shipments);
    logAudit('DELETE_SHIPMENT', { shipmentId: deleted.id }, req.headers['x-admin-id'] || 'admin');
    res.json({ success: true });
});

// Get audit logs (regulatory compliance)
app.get('/api/admin/audit-logs', verifyAdminToken, (req, res) => {
    const auditLog = JSON.parse(fs.readFileSync(auditLogFile, 'utf8'));
    res.json(auditLog.slice(-100)); // Last 100 actions
});

// Get dashboard stats
app.get('/api/admin/stats', verifyAdminToken, (req, res) => {
    const visitors = JSON.parse(fs.readFileSync(visitorsFile, 'utf8'));
    const shipments = getShipments();
    const auditLog = JSON.parse(fs.readFileSync(auditLogFile, 'utf8'));
    
    const inTransit = shipments.filter(s => s.status === 'In Transit' || s.status === 'In Flight' || s.status === 'Loading').length;
    const delivered = shipments.filter(s => s.status === 'Delivered').length;
    const cancelled = shipments.filter(s => s.status === 'Cancelled').length;
    
    res.json({
        totalVisitors: visitors.length,
        todayVisitors: visitors.filter(v => new Date(v.timestamp).toDateString() === new Date().toDateString()).length,
        totalShipments: shipments.length,
        inTransit,
        delivered,
        cancelled,
        auditActionsToday: auditLog.filter(a => new Date(a.timestamp).toDateString() === new Date().toDateString()).length
    });
});

// ==================== EMAIL ENDPOINTS ====================
app.get('/api/admin/email-status', verifyAdminToken, (req, res) => {
    res.json({
        connected: emailReady,
        mode: emailMode,
        verifyError: emailVerifyError,
        configuredHost: process.env.EMAIL_HOST || 'none',
        userSet: !!process.env.EMAIL_USER,
        passSet: !!process.env.EMAIL_PASSWORD
    });
});

app.post('/api/admin/send-email', verifyAdminToken, rateLimit(60000, 20), (req, res) => {
    if (!emailReady) {
        return res.status(503).json({ success: false, error: 'Email server not configured. Set EMAIL_USER and EMAIL_PASSWORD in environment variables.' });
    }

    var to = req.body.to;
    var subject = req.body.subject;
    var html = req.body.html;
    var clientName = req.body.clientName;
    var shipmentId = req.body.shipmentId;

    if (!to || !subject || !html) {
        return res.status(400).json({ success: false, error: 'Missing required fields: to, subject, html' });
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return res.status(400).json({ success: false, error: 'Invalid email address' });
    }

    // Strip any script tags from HTML for safety
    var safeHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '');

    function logEmailAudit(success) {
        try {
            var auditLog = JSON.parse(fs.readFileSync(auditLogFile, 'utf8'));
            auditLog.push({
                action: 'email_sent',
                details: (success ? 'Email sent' : 'Email failed') + ' to ' + to + ' — Subject: ' + subject + (shipmentId ? ' [' + shipmentId + ']' : ''),
                timestamp: new Date().toISOString(),
                ip: req.ip || req.connection.remoteAddress
            });
            fs.writeFileSync(auditLogFile, JSON.stringify(auditLog, null, 2));
        } catch(e) { /* non-critical */ }
    }

    if (emailMode === 'brevo-api') {
        // Send via Brevo HTTP API (HTTPS port 443 — always works)
        sendViaBrevoAPI(to, subject, safeHtml, EMAIL_SENDER)
            .then(function(info) {
                logEmailAudit(true);
                res.json({ success: true, messageId: info.messageId, mode: 'brevo-api' });
            })
            .catch(function(err) {
                console.error('Brevo API send error:', err.message);
                logEmailAudit(false);
                res.status(500).json({ success: false, error: 'Failed to send: ' + err.message });
            });
    } else if (emailMode === 'smtp' && typeof emailTransporter !== 'undefined' && emailTransporter) {
        // Send via SMTP
        var fromAddr = process.env.EMAIL_FROM || ('"LIVEXPRESS" <' + process.env.EMAIL_USER + '>');
        var plainText = 'Dear ' + (clientName || 'Valued Client') + ',\n\n' +
            safeHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').substring(0, 4000) +
            '\n\n---\n' + (process.env.COMPANY_NAME || 'LIVEXPRESS') + '\n' + SITE_URL;
        var mailOptions = {
            from: fromAddr,
            to: to,
            subject: subject,
            html: safeHtml,
            text: plainText,
            replyTo: process.env.EMAIL_REPLY_TO || process.env.EMAIL_USER
        };
        emailTransporter.sendMail(mailOptions, function(err, info) {
            if (err) {
                console.error('SMTP send error:', err.message);
                logEmailAudit(false);
                return res.status(500).json({ success: false, error: 'Failed to send: ' + err.message });
            }
            logEmailAudit(true);
            res.json({ success: true, messageId: info.messageId, mode: 'smtp' });
        });
    } else {
        res.status(503).json({ success: false, error: 'No email transport available' });
    }
});

// Initialize and start server
initializeDataFiles();

// Admin endpoint: manually trigger search engine pings
app.post('/api/admin/ping-search-engines', verifyAdminToken, rateLimit(60000, 3), (req, res) => {
    pingSearchEngines();
    res.json({ success: true, message: 'Search engine pings sent for all ' + ALL_URLS.length + ' URLs' });
});

// Admin endpoint: check shipment storage health
app.get('/api/admin/storage-health', verifyAdminToken, (req, res) => {
    var hasMongo = isMongoConfigured();
    var hasJsonBin = !!(process.env.JSONBIN_API_KEY && process.env.JSONBIN_BIN_ID);
    var mode = 'LOCAL ONLY (will lose data on redeploy!)';
    if (hasMongo && mongoHealthy) mode = 'MongoDB Atlas (YOUR permanent database)';
    else if (hasMongo && !mongoHealthy) mode = 'MongoDB (ERROR — check connection)';
    else if (hasJsonBin && jsonBinHealthy) mode = 'JSONBin backup (no MongoDB configured)';

    res.json({
        mongoConfigured: hasMongo,
        mongoHealthy: mongoHealthy,
        jsonBinConfigured: hasJsonBin,
        jsonBinHealthy: jsonBinHealthy,
        lastSync: lastDbSync ? new Date(lastDbSync).toISOString() : 'never',
        shipmentsInMemory: shipmentCache ? shipmentCache.length : 0,
        storageMode: mode
    });
});

// Admin endpoint: force re-sync from database
app.post('/api/admin/storage-resync', verifyAdminToken, rateLimit(60000, 3), async (req, res) => {
    // Try MongoDB first
    if (mongoHealthy && mongoCollection) {
        try {
            var data = await mongoGetAll();
            shipmentCache = data;
            try { fs.writeFileSync(shipmentsFile, JSON.stringify(data, null, 2)); } catch(e) {}
            return res.json({ success: true, message: 'Reloaded ' + data.length + ' shipments from MongoDB', count: data.length, source: 'MongoDB' });
        } catch(e) {
            console.error('  Resync: MongoDB failed, trying JSONBin...', e.message);
        }
    }
    // Fallback to JSONBin
    if (process.env.JSONBIN_API_KEY && process.env.JSONBIN_BIN_ID) {
        try {
            var data = await jsonBinGetWithRetry();
            shipmentCache = data;
            try { fs.writeFileSync(shipmentsFile, JSON.stringify(data, null, 2)); } catch(e) {}
            return res.json({ success: true, message: 'Reloaded ' + data.length + ' shipments from JSONBin', count: data.length, source: 'JSONBin' });
        } catch(e) {
            return res.status(500).json({ error: 'Both MongoDB and JSONBin failed: ' + e.message });
        }
    }
    res.status(400).json({ error: 'No external storage configured (set MONGODB_URI or JSONBin env vars)' });
});

// ---- Graceful shutdown: persist pending data before the process exits ----
async function gracefulShutdown(signal) {
    console.log('\n  ⚠️  ' + signal + ' received — saving pending data before shutdown...');
    // Wait for any in-flight JSONBin save to finish
    if (saveShipments._pending) {
        try { await saveShipments._pending; console.log('  ✅ Pending JSONBin save completed'); }
        catch(e) { console.error('  ❌ Pending save failed:', e.message); }
    }
    // Do one final sync to make sure latest cache is saved
    if (shipmentCache && shipmentCache.length > 0) {
        if (mongoHealthy && mongoCollection) {
            try { await mongoSaveAll(shipmentCache); console.log('  ✅ Final MongoDB sync: ' + shipmentCache.length + ' shipments'); }
            catch(e) { console.error('  ❌ Final MongoDB sync failed:', e.message); }
        }
        if (process.env.JSONBIN_API_KEY && process.env.JSONBIN_BIN_ID) {
            try { await jsonBinPut(shipmentCache); console.log('  ✅ Final JSONBin sync: ' + shipmentCache.length + ' shipments'); }
            catch(e) { console.error('  ❌ Final JSONBin sync failed:', e.message); }
        }
    }
    console.log('  👋 Shutdown complete.');
    process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
    console.error('  ❌ Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('  ❌ Uncaught exception:', err.message, err.stack);
});

// START THE SERVER IMMEDIATELY — bind port first, then do async init
// Bind the port before starting asynchronous initialization.
app.listen(PORT, HOST, () => {
    console.log(`
    ╔════════════════════════════════════════════════════════════════╗
    ║                                                                ║
    ║     🚢 LIVEXPRESS - Server Running              ║
    ║                                                                ║
    ║  🌐 Main Website:  http://localhost:${PORT}                       ║
    ║  📊 Admin Panel:   http://localhost:${PORT}/admin.html          ║
    ║  🌍 Domain:        ${SITE_URL}                     ║
    ║                                                                ║
    ╚════════════════════════════════════════════════════════════════╝
    `);

    // Now do async initialization (MongoDB, JSONBin, etc.)
    (async () => {
        try {
            await initShipmentStore();
        } catch (startupError) {
            console.error('  ❌ initShipmentStore error (non-fatal):', startupError.message);
        }

        startPeriodicBackup();

        // Log storage status
        if (mongoHealthy) {
            console.log('  ✅ Shipment storage: MongoDB Atlas (permanent)');
        } else if (isMongoConfigured()) {
            console.log('  ❌ MongoDB connection FAILED — check MONGODB_USER/PASSWORD/CLUSTER or MONGODB_URI');
        }
        if (jsonBinHealthy) {
            console.log('  ✅ JSONBin backup: Active');
        } else if (process.env.JSONBIN_API_KEY) {
            console.log('  ⚠️  JSONBin backup: FAILED — check env vars');
        }
        if (!mongoHealthy && !jsonBinHealthy) {
            console.log('  ⚠️  NO external storage! Set MONGODB_URI for permanent storage.');
        }

        console.log('  🔍 Pinging search engines...');
        pingSearchEngines();
        setInterval(pingSearchEngines, 4 * 60 * 60 * 1000);
    })().catch(err => {
        console.error('  ❌ Async init error:', err.message);
    });
});
