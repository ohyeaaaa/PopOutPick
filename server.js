'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT_DIR = __dirname;
loadDotEnv(path.join(ROOT_DIR, '.env'));

const HOST = process.env.HOST || '0.0.0.0';
const PORT = readPositiveInt(process.env.PORT, 8080);
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const TRUST_PROXY = readBoolean(process.env.TRUST_PROXY, false);
const REQUIRE_HTTPS = readBoolean(process.env.REQUIRE_HTTPS, false);
const ADMIN_ENABLED = readBoolean(process.env.ADMIN_ENABLED, false);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_ALLOWED_IPS = readCsv(process.env.ADMIN_ALLOWED_IPS);
const RATE_LIMIT_WINDOW_MS = readPositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
const RATE_LIMIT_MAX = readPositiveInt(process.env.RATE_LIMIT_MAX, 240);
const ADMIN_RATE_LIMIT_MAX = readPositiveInt(process.env.ADMIN_RATE_LIMIT_MAX, 60);
const REQUEST_LOG_LIMIT = readPositiveInt(process.env.REQUEST_LOG_LIMIT, 200);
const LOG_TO_FILE = readBoolean(process.env.LOG_TO_FILE, true);
const LOG_DIR = process.env.LOG_DIR || 'logs';
const HTTPS_KEY_PATH = process.env.HTTPS_KEY_PATH || '';
const HTTPS_CERT_PATH = process.env.HTTPS_CERT_PATH || '';
const ORDER_NOTIFICATION_SECRET = process.env.ORDER_NOTIFICATION_SECRET || '';
const NOTIFICATION_FROM_EMAIL = process.env.NOTIFICATION_FROM_EMAIL || '';
const SHOP_NAME = process.env.SHOP_NAME || 'PopOutPick';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = readPositiveInt(process.env.SMTP_PORT, 587);
const SMTP_SECURE = readBoolean(process.env.SMTP_SECURE, false);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || NOTIFICATION_FROM_EMAIL;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '';
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const TELEGRAM_CUSTOMER_CHAT_MAP_FILE = process.env.TELEGRAM_CUSTOMER_CHAT_MAP_FILE || 'data/telegram-chat-map.json';
const TELEGRAM_CUSTOMER_CHAT_MAP = parseJsonEnv(process.env.TELEGRAM_CUSTOMER_CHAT_MAP, {});
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const CHECKOUT_ALLOWED_ORIGINS = readCsv(process.env.CHECKOUT_ALLOWED_ORIGINS);
const CHECKOUT_UPLOAD_MAX_BYTES = readPositiveInt(process.env.CHECKOUT_UPLOAD_MAX_BYTES, 20 * 1024 * 1024);
const CHECKOUT_REQUEST_MAX_BYTES = readPositiveInt(process.env.CHECKOUT_REQUEST_MAX_BYTES, 80 * 1024 * 1024);
const SITE_CONFIG = loadSiteConfig();
const COMMERCE_CONFIG = SITE_CONFIG.commerce || {};
const CHECKOUT_DESIGN_PART_KEYS = new Set(['slider', 'top', 'bottom']);

const PUBLIC_ROOT_FILES = new Set([
    'index.html',
    'configurator.html',
    'style.css',
    'script.js',
    'site-config.js',
    'header-controls.js',
    'cart-badge.js',
    'homepage-text.js'
]);

const ADMIN_FILES = new Set([
    'admin/index.html',
    'admin/admin.css',
    'admin/admin.js'
]);

const ROUTES = new Map([
    ['/', 'index.html'],
    ['/index.html', 'index.html'],
    ['/configurator', 'configurator.html'],
    ['/configurator.html', 'configurator.html'],
    ['/checkout', 'configurator.html'],
    ['/payment', 'configurator.html'],
    ['/admin', 'admin/index.html'],
    ['/admin.html', 'admin/index.html']
]);

const ASSET_EXTENSIONS = new Set([
    '.css',
    '.gif',
    '.glb',
    '.html',
    '.ico',
    '.jpg',
    '.jpeg',
    '.js',
    '.json',
    '.mp4',
    '.png',
    '.svg',
    '.webp'
]);

const PICTURE_EXTENSIONS = new Set(['.gif', '.jpg', '.jpeg', '.mp4', '.png', '.svg', '.webp']);
const requestLog = [];
const rateBuckets = new Map();
const persistentLogDir = path.resolve(ROOT_DIR, LOG_DIR);
const telegramChatMapPath = path.resolve(ROOT_DIR, TELEGRAM_CUSTOMER_CHAT_MAP_FILE);
const telegramCustomerChatMap = loadJsonFile(telegramChatMapPath, TELEGRAM_CUSTOMER_CHAT_MAP);

if (ADMIN_ENABLED && (!ADMIN_USERNAME || !ADMIN_PASSWORD)) {
    console.error('ADMIN_ENABLED=true requires ADMIN_USERNAME and ADMIN_PASSWORD in .env.');
    process.exit(1);
}

if (LOG_TO_FILE) {
    fs.mkdirSync(persistentLogDir, { recursive: true });
}

fs.mkdirSync(path.dirname(telegramChatMapPath), { recursive: true });

function loadDotEnv(filePath) {
    if (!fs.existsSync(filePath)) return;

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const equalsIndex = trimmed.indexOf('=');
        if (equalsIndex === -1) continue;

        const key = trimmed.slice(0, equalsIndex).trim();
        let value = trimmed.slice(equalsIndex + 1).trim();
        if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;

        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        process.env[key] = value;
    }
}

function readPositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function readCsv(value) {
    return new Set(String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean));
}

function parseJsonEnv(value, fallback) {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function loadJsonFile(filePath, fallback) {
    if (!fs.existsSync(filePath)) return { ...fallback };
    try {
        return { ...fallback, ...JSON.parse(fs.readFileSync(filePath, 'utf8')) };
    } catch {
        return { ...fallback };
    }
}

function loadSiteConfig() {
    const configPath = path.join(ROOT_DIR, 'site-config.js');
    const context = {
        window: {},
        console: { warn() {}, error() {}, log() {} }
    };

    try {
        const code = fs.readFileSync(configPath, 'utf8');
        vm.runInNewContext(code, context, { filename: configPath, timeout: 1000 });
        return context.window.POPOUTPICK_CONFIG || {};
    } catch (error) {
        console.error(`Could not load ${configPath}: ${error.message}`);
        return {};
    }
}

function saveJsonFile(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, error => {
        if (error) console.error(`Could not write ${filePath}: ${error.message}`);
    });
}

function getRemoteIp(req) {
    if (TRUST_PROXY && req.headers['x-forwarded-for']) {
        return String(req.headers['x-forwarded-for']).split(',')[0].trim().replace(/^::ffff:/, '');
    }

    return String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

function isHttpsRequest(req) {
    if (req.socket.encrypted === true) return true;
    if (!TRUST_PROXY) return false;

    const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
    return forwardedProto === 'https';
}

function safeDecodePathname(pathname) {
    try {
        return decodeURIComponent(pathname);
    } catch {
        return null;
    }
}

function normalizeRequestPath(pathname) {
    const decoded = safeDecodePathname(pathname);
    if (!decoded || decoded.includes('\0')) return null;

    const routeTarget = ROUTES.get(decoded);
    const rawRelative = (routeTarget || decoded.replace(/^\/+/, '')).replace(/\\/g, '/');
    const normalized = path.posix.normalize(rawRelative);

    if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
        return null;
    }

    return normalized;
}

function isAllowedPublicFile(relativePath) {
    if (relativePath.split('/').some(part => part.startsWith('.'))) return false;
    if (PUBLIC_ROOT_FILES.has(relativePath)) return true;

    const extension = path.posix.extname(relativePath).toLowerCase();
    if (!ASSET_EXTENSIONS.has(extension)) return false;

    if (relativePath.startsWith('GLB/')) {
        return extension === '.glb';
    }

    if (relativePath.startsWith('Picture/')) {
        return PICTURE_EXTENSIONS.has(extension);
    }

    if (relativePath.startsWith('PopOutPick_Website/')) {
        return relativePath === 'PopOutPick_Website/guitar-icon.png'
            || relativePath === 'PopOutPick_Website/bass-icon.png';
    }

    return false;
}

function isAdminFile(relativePath) {
    return ADMIN_FILES.has(relativePath);
}

function toAbsolutePath(relativePath) {
    const absolutePath = path.resolve(ROOT_DIR, ...relativePath.split('/'));
    const rootWithSeparator = ROOT_DIR.endsWith(path.sep) ? ROOT_DIR : `${ROOT_DIR}${path.sep}`;

    if (absolutePath !== ROOT_DIR && !absolutePath.startsWith(rootWithSeparator)) {
        return null;
    }

    return absolutePath;
}

function getContentType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    const types = {
        '.css': 'text/css; charset=utf-8',
        '.gif': 'image/gif',
        '.glb': 'model/gltf-binary',
        '.html': 'text/html; charset=utf-8',
        '.ico': 'image/x-icon',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.mp4': 'video/mp4',
        '.png': 'image/png',
        '.svg': 'image/svg+xml; charset=utf-8',
        '.webp': 'image/webp'
    };

    return types[extension] || 'application/octet-stream';
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[char]);
}

function setSecurityHeaders(req, res) {
    const isHttps = isHttpsRequest(req);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob:",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
        "worker-src 'self' blob:"
    ].join('; '));

    if (isHttps) {
        res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
}

function timingSafeEquals(left, right) {
    const leftBuffer = Buffer.from(String(left));
    const rightBuffer = Buffer.from(String(right));
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function timingSafeSecretMatches(provided, expected) {
    if (!expected) return false;
    return timingSafeEquals(String(provided || ''), expected);
}

function hasValidAdminAuth(req) {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (!scheme || scheme.toLowerCase() !== 'basic' || !encoded) return false;

    let decoded = '';
    try {
        decoded = Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
        return false;
    }

    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return false;

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    return timingSafeEquals(username, ADMIN_USERNAME) && timingSafeEquals(password, ADMIN_PASSWORD);
}

function hasValidNotificationSecret(req) {
    return timingSafeSecretMatches(req.headers['x-popoutpick-webhook-secret'], ORDER_NOTIFICATION_SECRET)
        || timingSafeSecretMatches(req.headers.authorization?.replace(/^Bearer\s+/i, ''), ORDER_NOTIFICATION_SECRET);
}

function hasValidTelegramWebhookSecret(req) {
    if (!TELEGRAM_WEBHOOK_SECRET) return false;
    return timingSafeSecretMatches(req.headers['x-telegram-bot-api-secret-token'], TELEGRAM_WEBHOOK_SECRET)
        || timingSafeSecretMatches(req.headers['x-popoutpick-telegram-secret'], TELEGRAM_WEBHOOK_SECRET);
}

function requireAdminAccess(req, res) {
    if (!ADMIN_ENABLED) {
        sendError(req, res, 404, 'Not found.');
        return false;
    }

    const ip = getRemoteIp(req);
    if (ADMIN_ALLOWED_IPS.size > 0 && !ADMIN_ALLOWED_IPS.has(ip)) {
        sendError(req, res, 403, 'Forbidden.');
        return false;
    }

    if (!hasValidAdminAuth(req)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="PopOutPick Admin", charset="UTF-8"');
        sendError(req, res, 401, 'Admin authentication required.');
        return false;
    }

    return true;
}

function applyRateLimit(req, res, isAdminRoute) {
    const now = Date.now();
    const ip = getRemoteIp(req);
    const key = `${isAdminRoute ? 'admin' : 'public'}:${ip}`;
    const maxRequests = isAdminRoute ? ADMIN_RATE_LIMIT_MAX : RATE_LIMIT_MAX;
    const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

    if (now > bucket.resetAt) {
        bucket.count = 0;
        bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
    }

    bucket.count += 1;
    rateBuckets.set(key, bucket);

    if (bucket.count <= maxRequests) return true;

    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    sendError(req, res, 429, 'Too many requests.');
    return false;
}

function pruneRateBuckets() {
    const now = Date.now();
    for (const [key, bucket] of rateBuckets.entries()) {
        if (now > bucket.resetAt + RATE_LIMIT_WINDOW_MS) {
            rateBuckets.delete(key);
        }
    }
}

function appendPersistentLog(entry) {
    if (!LOG_TO_FILE) return;

    const dateKey = entry.time.slice(0, 10);
    const filePath = path.join(persistentLogDir, `access-${dateKey}.jsonl`);
    fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, error => {
        if (error) console.error(`Could not write request log: ${error.message}`);
    });
}

function wantsJson(req) {
    const accept = String(req.headers.accept || '');
    return req.url.startsWith('/api/') || accept.includes('application/json');
}

function getRequestOrigin(req) {
    return String(req.headers.origin || '').replace(/\/+$/, '');
}

function originFromUrl(value) {
    try {
        return new URL(value).origin;
    } catch {
        return '';
    }
}

function isLocalHostname(hostname) {
    return hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname === '::1'
        || hostname === '[::1]';
}

function isLocalDevelopment(req) {
    const publicOrigin = originFromUrl(PUBLIC_BASE_URL);
    if (publicOrigin) {
        try {
            return isLocalHostname(new URL(publicOrigin).hostname);
        } catch {
            return false;
        }
    }

    const host = String(req.headers.host || '').split(':')[0];
    return isLocalHostname(host);
}

function isCheckoutOriginAllowed(origin, req) {
    if (!origin) return true;
    if (CHECKOUT_ALLOWED_ORIGINS.has(origin)) return true;

    const publicOrigin = originFromUrl(PUBLIC_BASE_URL);
    if (publicOrigin && origin === publicOrigin) return true;

    const host = req.headers.host;
    if (!host) return false;
    const selfOrigin = `${isHttpsRequest(req) ? 'https' : 'http'}://${host}`;
    return origin === selfOrigin;
}

function isSameOriginRequest(req) {
    const origin = getRequestOrigin(req);
    if (!origin) return true;

    const host = req.headers.host;
    if (!host) return false;
    const selfOrigin = `${isHttpsRequest(req) ? 'https' : 'http'}://${host}`;
    return origin === selfOrigin;
}

function getCorsHeaders(req) {
    const origin = getRequestOrigin(req);
    if (!origin || !isCheckoutOriginAllowed(origin, req)) return {};

    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin'
    };
}

function sendJson(req, res, statusCode, body) {
    setSecurityHeaders(req, res);
    const payload = JSON.stringify(body);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        ...(getCorsHeaders(req)),
        'Cache-Control': 'no-store'
    });

    if (req.method !== 'HEAD') {
        res.end(payload);
    } else {
        res.end();
    }
}

function sendError(req, res, statusCode, message) {
    if (!wantsJson(req)) {
        sendHtmlError(req, res, statusCode, message);
        return;
    }

    const body = {
        error: message,
        status: statusCode
    };
    sendJson(req, res, statusCode, body);
}

function sendHtmlError(req, res, statusCode, message) {
    setSecurityHeaders(req, res);
    const title = `${statusCode} ${http.STATUS_CODES[statusCode] || 'Error'}`;
    const body = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} - PopOutPick</title>
    <style>
        body { margin: 0; font-family: Arial, sans-serif; background: #110d0b; color: #f5f2f0; min-height: 100vh; display: grid; place-items: center; }
        main { width: min(520px, calc(100% - 32px)); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; padding: 28px; background: rgba(28,22,19,.9); }
        h1 { margin: 0 0 10px; font-size: 2rem; }
        p { margin: 0 0 20px; color: #cfc6bf; line-height: 1.5; }
        a { color: #ff9a00; font-weight: 800; }
    </style>
</head>
<body>
    <main>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
        <a href="/">Return home</a>
    </main>
</body>
</html>`;

    res.writeHead(statusCode, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store'
    });

    if (req.method !== 'HEAD') {
        res.end(body);
    } else {
        res.end();
    }
}

function sendOptions(req, res) {
    setSecurityHeaders(req, res);
    res.writeHead(204, {
        'Allow': 'GET, HEAD, POST, OPTIONS',
        ...(getCorsHeaders(req)),
        'Cache-Control': 'no-store'
    });
    res.end();
}

function readJsonBody(req, limitBytes = 128 * 1024) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];

        req.on('data', chunk => {
            size += chunk.length;
            if (size > limitBytes) {
                reject(new Error('Request body is too large.'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw.trim()) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(raw));
            } catch {
                reject(new Error('Invalid JSON body.'));
            }
        });

        req.on('error', reject);
    });
}

function readRequestBuffer(req, limitBytes = 128 * 1024) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];

        req.on('data', chunk => {
            size += chunk.length;
            if (size > limitBytes) {
                reject(new Error('Request body is too large.'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function parseContentDisposition(value = '') {
    const parts = String(value).split(';').map(part => part.trim());
    const result = {};
    for (const part of parts.slice(1)) {
        const equalsIndex = part.indexOf('=');
        if (equalsIndex === -1) continue;
        const key = part.slice(0, equalsIndex).trim().toLowerCase();
        let itemValue = part.slice(equalsIndex + 1).trim();
        if (itemValue.startsWith('"') && itemValue.endsWith('"')) {
            itemValue = itemValue.slice(1, -1).replace(/\\"/g, '"');
        }
        result[key] = itemValue;
    }
    return result;
}

function parseMultipartFormData(buffer, contentType) {
    const boundary = String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1]
        || String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
    assertCheckout(boundary, 'Missing multipart boundary.');

    const boundaryText = `--${boundary}`;
    const body = buffer.toString('binary');
    const fields = {};
    const files = new Map();

    for (const rawPart of body.split(boundaryText).slice(1, -1)) {
        let part = rawPart;
        if (part.startsWith('\r\n')) part = part.slice(2);
        if (part.endsWith('\r\n')) part = part.slice(0, -2);

        const separatorIndex = part.indexOf('\r\n\r\n');
        if (separatorIndex === -1) continue;

        const rawHeaders = part.slice(0, separatorIndex);
        const rawContent = part.slice(separatorIndex + 4);
        const headers = {};
        rawHeaders.split('\r\n').forEach(line => {
            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) return;
            headers[line.slice(0, colonIndex).trim().toLowerCase()] = line.slice(colonIndex + 1).trim();
        });

        const disposition = parseContentDisposition(headers['content-disposition']);
        const name = disposition.name;
        if (!name) continue;

        const contentBuffer = Buffer.from(rawContent, 'binary');
        if (disposition.filename !== undefined) {
            files.set(name, {
                fieldName: name,
                originalName: disposition.filename,
                contentType: headers['content-type'] || 'application/octet-stream',
                buffer: contentBuffer
            });
        } else {
            fields[name] = contentBuffer.toString('utf8');
        }
    }

    return { fields, files };
}

async function readCheckoutPayload(req) {
    const contentType = String(req.headers['content-type'] || '');
    if (contentType.includes('multipart/form-data')) {
        const buffer = await readRequestBuffer(req, CHECKOUT_REQUEST_MAX_BYTES);
        const form = parseMultipartFormData(buffer, contentType);
        return {
            order: JSON.parse(form.fields.order || '{}'),
            fileMetadata: JSON.parse(form.fields.fileMetadata || '[]'),
            uploadedFiles: form.files
        };
    }

    return readJsonBody(req, 512 * 1024);
}

function buildLogEntry(req, statusCode, startedAt) {
    const url = new URL(req.url, 'http://localhost');
    return {
        time: new Date().toISOString(),
        method: req.method,
        path: url.pathname,
        status: statusCode,
        durationMs: Math.max(0, Date.now() - startedAt),
        ip: getRemoteIp(req),
        userAgent: req.headers['user-agent'] || ''
    };
}

function pushRequestLog(entry) {
    requestLog.push(entry);
    while (requestLog.length > REQUEST_LOG_LIMIT) {
        requestLog.shift();
    }
    appendPersistentLog(entry);
}

function cacheControlFor(relativePath) {
    if (relativePath.endsWith('.html') || relativePath.endsWith('.js') || relativePath.endsWith('.css')) {
        return 'no-cache';
    }

    return 'public, max-age=604800';
}

function normalizeTelegramHandle(value) {
    return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

function sanitizeStorageName(name = 'file') {
    return String(name)
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        || 'file';
}

function getNotificationOrder(payload) {
    return payload?.record || payload?.order || payload;
}

function getNotificationOrderFile(payload) {
    return payload?.record || payload?.orderFile || payload?.file || payload;
}

function getFulfilmentText(order) {
    if (order?.fulfilment === 'delivery') {
        const delivery = order.delivery || {};
        return [
            'Delivery',
            delivery.addressSummary || [delivery.address1, delivery.address2, delivery.postal].filter(Boolean).join(', ')
        ].filter(Boolean).join(' - ');
    }

    const meetup = order?.meetup || {};
    return [
        meetup.location || meetup.locationId || 'Pick-up location to be confirmed',
        meetup.date || 'date to be confirmed',
        meetup.time || 'time to be confirmed'
    ].filter(Boolean).join(' - ');
}

function getNotificationMessages(order) {
    const customerName = order.customer_name || order.customer?.name || 'there';
    const orderId = order.id || order.orderId || 'your order';
    const fulfilmentText = getFulfilmentText(order);
    const total = Number(order.totals?.total);
    const totalLine = Number.isFinite(total) ? `\nTotal: $${total.toFixed(2)}` : '';
    const subject = `Thank you for your ${SHOP_NAME} order`;
    const customerText = [
        `Hi ${customerName},`,
        '',
        `Thank you for buying from ${SHOP_NAME}.`,
        `Order ID: ${orderId}`,
        `Pick-up details: ${fulfilmentText}${totalLine}`,
        '',
        'We will contact you if anything changes.'
    ].join('\n');
    const adminText = [
        `New ${SHOP_NAME} order`,
        `Order ID: ${orderId}`,
        `Customer: ${customerName}`,
        `Email: ${order.customer_email || order.customer?.email || ''}`,
        `Phone: ${order.customer_phone || order.customer?.phone || ''}`,
        `Telegram: ${order.customer_telegram || order.customer?.telegram || ''}`,
        `Fulfilment: ${fulfilmentText}${totalLine}`
    ].join('\n');

    return { subject, customerText, adminText };
}

function smtpRead(socket) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        function onData(chunk) {
            buffer += chunk.toString('utf8');
            const lines = buffer.split(/\r?\n/).filter(Boolean);
            const lastLine = lines[lines.length - 1] || '';
            if (/^\d{3}\s/.test(lastLine)) {
                socket.off('data', onData);
                resolve(buffer);
            }
        }
        socket.on('data', onData);
        socket.once('error', reject);
    });
}

async function smtpCommand(socket, command, expectedCodes) {
    if (command) socket.write(`${command}\r\n`);
    const response = await smtpRead(socket);
    const code = Number.parseInt(response.slice(0, 3), 10);
    if (!expectedCodes.includes(code)) {
        throw new Error(`SMTP command failed: ${response.trim()}`);
    }
    return response;
}

function smtpConnect() {
    return new Promise((resolve, reject) => {
        const options = { host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST };
        const socket = SMTP_SECURE ? tls.connect(options) : net.connect(options);
        socket.setTimeout(20_000);
        if (SMTP_SECURE) {
            socket.once('secureConnect', () => resolve(socket));
        } else {
            socket.once('connect', () => resolve(socket));
        }
        socket.once('timeout', () => {
            socket.destroy(new Error('SMTP connection timed out.'));
        });
        socket.once('error', reject);
    });
}

async function sendEmail({ to, subject, text }) {
    if (!SMTP_HOST || !SMTP_FROM || !to) {
        return { skipped: true, reason: 'SMTP is not configured.' };
    }

    let socket = await smtpConnect();
    try {
        await smtpCommand(socket, null, [220]);
        await smtpCommand(socket, `EHLO ${SMTP_HOST}`, [250]);

        if (!SMTP_SECURE && SMTP_PORT === 587) {
            await smtpCommand(socket, 'STARTTLS', [220]);
            socket = tls.connect({ socket, servername: SMTP_HOST });
            await new Promise((resolve, reject) => {
                socket.once('secureConnect', resolve);
                socket.once('error', reject);
            });
            await smtpCommand(socket, `EHLO ${SMTP_HOST}`, [250]);
        }

        if (SMTP_USER && SMTP_PASS) {
            await smtpCommand(socket, 'AUTH LOGIN', [334]);
            await smtpCommand(socket, Buffer.from(SMTP_USER).toString('base64'), [334]);
            await smtpCommand(socket, Buffer.from(SMTP_PASS).toString('base64'), [235]);
        }

        await smtpCommand(socket, `MAIL FROM:<${SMTP_FROM}>`, [250]);
        await smtpCommand(socket, `RCPT TO:<${to}>`, [250, 251]);
        await smtpCommand(socket, 'DATA', [354]);

        const message = [
            `From: ${SHOP_NAME} <${SMTP_FROM}>`,
            `To: ${to}`,
            `Subject: ${subject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=utf-8',
            '',
            text.replace(/\r?\n\./g, '\n..'),
            '.'
        ].join('\r\n');
        await smtpCommand(socket, message, [250]);
        await smtpCommand(socket, 'QUIT', [221]);
        return { skipped: false };
    } finally {
        socket.destroy();
    }
}

function sendTelegramMessage(chatId, text) {
    return new Promise(resolve => {
        if (!TELEGRAM_BOT_TOKEN || !chatId) {
            resolve({ skipped: true, reason: 'Telegram is not configured.' });
            return;
        }

        const payload = JSON.stringify({
            chat_id: chatId,
            text,
            disable_web_page_preview: true
        });

        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 15000
        }, res => {
            let body = '';
            res.on('data', chunk => {
                body += chunk.toString('utf8');
            });
            res.on('end', () => resolve({
                skipped: false,
                ok: res.statusCode >= 200 && res.statusCode < 300,
                status: res.statusCode,
                response: body
            }));
        });

        req.on('timeout', () => {
            req.destroy(new Error('Telegram request timed out.'));
        });
        req.on('error', error => resolve({ skipped: false, ok: false, error: error.message }));
        req.write(payload);
        req.end();
    });
}

function requestBuffer(options, body = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
            const chunks = [];
            res.on('data', chunk => {
                chunks.push(chunk);
            });
            res.on('end', () => resolve({
                status: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks)
            }));
        });

        req.on('timeout', () => {
            req.destroy(new Error('Request timed out.'));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function downloadSupabaseStorageFile(file) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return { skipped: true, reason: 'Supabase service role is not configured.' };
    }

    if (!file.bucket || !file.storage_path) {
        return { skipped: true, reason: 'Missing bucket or storage path.' };
    }

    const projectUrl = new URL(SUPABASE_URL);
    const encodedPath = String(file.storage_path)
        .split('/')
        .map(part => encodeURIComponent(part))
        .join('/');
    const response = await requestBuffer({
        hostname: projectUrl.hostname,
        path: `/storage/v1/object/${encodeURIComponent(file.bucket)}/${encodedPath}`,
        method: 'GET',
        headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY
        },
        timeout: 30000
    });

    if (response.status < 200 || response.status >= 300) {
        return {
            skipped: false,
            ok: false,
            status: response.status,
            error: response.body.toString('utf8').slice(0, 300)
        };
    }

    return {
        skipped: false,
        ok: true,
        body: response.body,
        contentType: response.headers['content-type'] || file.content_type || 'application/octet-stream'
    };
}

function multipartBody(fields, fileField) {
    const boundary = `----popoutpick-${crypto.randomBytes(12).toString('hex')}`;
    const chunks = [];

    Object.entries(fields).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${String(value)}\r\n`));
    });

    if (fileField) {
        chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\nContent-Type: ${fileField.contentType}\r\n\r\n`));
        chunks.push(fileField.content);
        chunks.push(Buffer.from('\r\n'));
    }

    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return {
        boundary,
        body: Buffer.concat(chunks)
    };
}

async function sendTelegramFile({ chatId, buffer, filename, contentType, caption }) {
    if (!TELEGRAM_BOT_TOKEN || !chatId) {
        return { skipped: true, reason: 'Telegram is not configured.' };
    }

    const isImage = /^image\//i.test(contentType);
    const method = isImage ? 'sendPhoto' : 'sendDocument';
    const fieldName = isImage ? 'photo' : 'document';
    const multipart = multipartBody({
        chat_id: chatId,
        caption
    }, {
        name: fieldName,
        filename: sanitizeStorageName(filename || 'upload'),
        contentType,
        content: buffer
    });

    const response = await requestBuffer({
        hostname: 'api.telegram.org',
        path: `/bot${TELEGRAM_BOT_TOKEN}/${method}`,
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${multipart.boundary}`,
            'Content-Length': multipart.body.length
        },
        timeout: 30000
    }, multipart.body);

    return {
        skipped: false,
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        response: response.body.toString('utf8').slice(0, 500)
    };
}

function getOrderFileCaption(file) {
    const role = file.file_role === 'payment_proof' ? 'Payment proof' : 'Design upload';
    return [
        `${role} for ${file.order_id || 'order'}`,
        file.original_name ? `File: ${file.original_name}` : '',
        file.part_key ? `Part: ${file.part_key}` : '',
        file.item_id ? `Item: ${file.item_id}` : '',
        file.bucket && file.storage_path ? `Storage: ${file.bucket}/${file.storage_path}` : ''
    ].filter(Boolean).join('\n');
}

async function sendOrderFileToTelegram(file) {
    const downloaded = await downloadSupabaseStorageFile(file);
    if (downloaded.skipped || !downloaded.ok) return { download: downloaded };

    const telegram = await sendTelegramFile({
        chatId: TELEGRAM_ADMIN_CHAT_ID,
        buffer: downloaded.body,
        filename: file.original_name || path.posix.basename(file.storage_path || 'upload'),
        contentType: downloaded.contentType,
        caption: getOrderFileCaption(file)
    });

    return {
        download: { skipped: false, ok: true, contentType: downloaded.contentType, size: downloaded.body.length },
        telegram
    };
}

async function sendOrderNotifications(order) {
    const messages = getNotificationMessages(order);
    const customerEmail = order.customer_email || order.customer?.email || '';
    const customerTelegram = normalizeTelegramHandle(order.customer_telegram || order.customer?.telegram || '');
    const customerTelegramChatId = customerTelegram ? telegramCustomerChatMap[customerTelegram] : '';

    const results = {
        customerEmail: await sendEmail({
            to: customerEmail,
            subject: messages.subject,
            text: messages.customerText
        }),
        adminTelegram: await sendTelegramMessage(TELEGRAM_ADMIN_CHAT_ID, messages.adminText),
        customerTelegram: await sendTelegramMessage(customerTelegramChatId, messages.customerText)
    };

    return results;
}

class CheckoutValidationError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = 'CheckoutValidationError';
        this.statusCode = statusCode;
    }
}

function assertCheckout(condition, message, statusCode = 400) {
    if (!condition) throw new CheckoutValidationError(message, statusCode);
}

function asPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function cleanText(value, maxLength = 240) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function cleanOptionalText(value, maxLength = 240) {
    const cleaned = cleanText(value, maxLength);
    return cleaned || null;
}

function roundMoney(value) {
    const number = Number(value);
    assertCheckout(Number.isFinite(number), 'Invalid money value.');
    return Math.round(number * 100) / 100;
}

function moneyOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function assertMoneyMatches(label, clientValue, serverValue) {
    assertCheckout(clientValue !== undefined && clientValue !== null, `Missing ${label}.`);
    const clientMoney = roundMoney(clientValue);
    const canonicalMoney = roundMoney(serverValue);
    assertCheckout(Math.abs(clientMoney - canonicalMoney) < 0.01, `${label} does not match the server total.`);
}

function normalizePromoCode(code = '') {
    return String(code || '').trim().toUpperCase();
}

function getConfiguredProductBasePrice() {
    return moneyOrZero(COMMERCE_CONFIG.productBasePrice || 49);
}

function getShopProducts() {
    return Array.isArray(COMMERCE_CONFIG.shopProducts) ? COMMERCE_CONFIG.shopProducts : [];
}

function getShopProductById(productId) {
    const id = cleanText(productId, 120);
    return getShopProducts().find(product => product.id === id) || null;
}

function getShopProductPartKey(product) {
    const part = product?.previewPart;
    if (product?.shopPartType === 'holder' || String(part || '').startsWith('holder:')) return null;
    if (part === 'module') return 'module';
    if (part === 'slider') return 'slider';
    if (part === 'top') return 'top';
    if (part === 'bottom' || part === 'base') return 'bottom';
    return null;
}

function getDesignAddOnConfig(key) {
    return asPlainObject(COMMERCE_CONFIG.designAddOns)?.[key] || null;
}

function getDesignAddOnPartKey(key) {
    const config = getDesignAddOnConfig(key);
    return config?.partKey || key;
}

function canonicalDesignAddOn(key) {
    const addOnKey = cleanText(key, 40);
    const config = getDesignAddOnConfig(addOnKey);
    assertCheckout(config, `Unknown design add-on: ${addOnKey || 'blank'}.`);

    const partKey = getDesignAddOnPartKey(addOnKey);
    assertCheckout(CHECKOUT_DESIGN_PART_KEYS.has(partKey), `Invalid design add-on part: ${partKey}.`);

    return {
        key: addOnKey,
        partKey,
        label: cleanText(config.label || addOnKey, 120),
        price: moneyOrZero(config.price),
        type: cleanText(config.type || 'Custom', 40)
    };
}

function canonicalizeDesignAddOnKeys(keys, requiredPartKey = '') {
    const seen = new Set();
    const addOns = [];

    for (const key of keys) {
        const addOn = canonicalDesignAddOn(key);
        if (requiredPartKey) {
            assertCheckout(addOn.partKey === requiredPartKey, `Design add-on ${addOn.key} is not valid for ${requiredPartKey}.`);
        }
        if (seen.has(addOn.key)) continue;
        seen.add(addOn.key);
        addOns.push(addOn);
    }

    const parts = new Set(addOns.map(addOn => addOn.partKey));
    assertCheckout(parts.size === addOns.length, 'Only one design add-on is allowed per part.');
    return addOns;
}

function clientAddOnKeys(addOns) {
    if (!Array.isArray(addOns)) return [];
    return addOns
        .map(addOn => cleanText(asPlainObject(addOn)?.key || addOn, 40))
        .filter(Boolean);
}

function cleanColor(value, fallback = '#ffffff') {
    const color = cleanText(value, 32);
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function canonicalizeDesignTransforms(value) {
    const source = asPlainObject(value) || {};
    return [...CHECKOUT_DESIGN_PART_KEYS].reduce((transforms, partKey) => {
        const transform = asPlainObject(source[partKey]) || {};
        transforms[partKey] = {
            x: Number.isFinite(Number(transform.x)) ? Number(transform.x) : 0,
            y: Number.isFinite(Number(transform.y)) ? Number(transform.y) : 0,
            scale: Number.isFinite(Number(transform.scale)) ? Number(transform.scale) : 100
        };
        return transforms;
    }, {});
}

function canonicalizeDesignFileNames(value) {
    const source = asPlainObject(value) || {};
    return [...CHECKOUT_DESIGN_PART_KEYS].reduce((fileNames, partKey) => {
        fileNames[partKey] = cleanOptionalText(source[partKey], 180);
        return fileNames;
    }, {});
}

function canonicalizeSelections(value) {
    const source = asPlainObject(value);
    assertCheckout(source, 'Configured products must include selections.');

    const type = cleanText(source.type, 20);
    assertCheckout(type === 'guitar' || type === 'bass', 'Invalid configured product type.');

    const allowedThicknesses = {
        guitar: new Set(['10mm', '8mm', '7mm', '6mm']),
        bass: new Set(['30mm', '20mm', '10mm', '8mm', '6mm'])
    };
    const holders = Array.isArray(source.holders) ? source.holders : [];
    assertCheckout(holders.length === 4, 'Configured products must include four pickholders.');

    const designAddOns = {};
    for (const key of Object.keys(asPlainObject(COMMERCE_CONFIG.designAddOns) || {})) {
        designAddOns[key] = Boolean(asPlainObject(source.designAddOns)?.[key]);
    }

    const enabledAddOns = canonicalizeDesignAddOnKeys(Object.entries(designAddOns)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key));

    return {
        type,
        body: cleanColor(source.body, '#1a1a1a'),
        module: cleanColor(source.module),
        slider: cleanColor(source.slider),
        top: cleanColor(source.top),
        bottom: cleanColor(source.bottom),
        designFileNames: canonicalizeDesignFileNames(source.designFileNames),
        designAddOns,
        designTransforms: canonicalizeDesignTransforms(source.designTransforms),
        holders: holders.map(holder => {
            const thickness = cleanText(asPlainObject(holder)?.t, 20);
            assertCheckout(allowedThicknesses[type].has(thickness), `Invalid ${type} pickholder thickness.`);
            return {
                c1: cleanColor(holder.c1),
                c2: cleanColor(holder.c2),
                t: thickness
            };
        }),
        _enabledAddOns: enabledAddOns
    };
}

function createCanonicalItemId(value, index) {
    const cleaned = cleanText(value, 120).replace(/[^a-z0-9._:-]+/gi, '-').replace(/^-+|-+$/g, '');
    return cleaned || `item-${index + 1}`;
}

function canonicalizeCheckoutItem(value, index) {
    const item = asPlainObject(value);
    assertCheckout(item, 'Invalid checkout item.');

    const quantity = Number(item.quantity);
    assertCheckout(Number.isInteger(quantity) && quantity >= 1 && quantity <= 99, 'Item quantity must be between 1 and 99.');

    const itemId = createCanonicalItemId(item.id, index);
    const productId = cleanText(item.productId, 120);

    if (cleanText(item.type, 40) === 'shop-product' || productId) {
        const product = getShopProductById(productId);
        assertCheckout(product, `Unknown shop product: ${productId || 'blank'}.`);

        const partKey = getShopProductPartKey(product);
        const addOns = canonicalizeDesignAddOnKeys(clientAddOnKeys(item.addOns), partKey || '');
        assertCheckout(partKey || addOns.length === 0, 'This shop product cannot have design add-ons.');

        const unitPrice = roundMoney(moneyOrZero(product.price) + addOns.reduce((sum, addOn) => sum + addOn.price, 0));
        return {
            id: itemId,
            type: 'shop-product',
            productId: product.id,
            name: cleanText(product.name || item.name || 'Shop product', 180),
            description: cleanText(item.description || product.description || '', 1000),
            quantity,
            unitPrice,
            lineTotal: roundMoney(unitPrice * quantity),
            addOns,
            partKey,
            selections: null
        };
    }

    const selections = canonicalizeSelections(item.selections);
    const addOns = selections._enabledAddOns;
    delete selections._enabledAddOns;

    const unitPrice = roundMoney(getConfiguredProductBasePrice() + addOns.reduce((sum, addOn) => sum + addOn.price, 0));
    const productType = selections.type.charAt(0).toUpperCase() + selections.type.slice(1);
    return {
        id: itemId,
        type: 'configured-design',
        productId: null,
        name: cleanText(item.name || `Custom ${productType} PopOutPick`, 180),
        description: cleanText(item.description || `Configured set with 4 pickholders`, 1000),
        quantity,
        unitPrice,
        lineTotal: roundMoney(unitPrice * quantity),
        addOns,
        selections
    };
}

function canonicalizeCheckoutItems(items) {
    assertCheckout(Array.isArray(items), 'Order items must be an array.');
    assertCheckout(items.length >= 1 && items.length <= 20, 'Orders must include between 1 and 20 items.');
    return items.map(canonicalizeCheckoutItem);
}

function canonicalizeCustomer(order) {
    const customer = asPlainObject(order.customer) || {};
    const name = cleanText(customer.name, 120);
    const email = cleanText(customer.email, 254);
    const phone = cleanText(customer.phone, 40);
    const telegram = cleanOptionalText(customer.telegram, 80);

    assertCheckout(name.length >= 1, 'Customer name is required.');
    assertCheckout(email.length >= 3 && email.includes('@'), 'A valid customer email is required.');
    assertCheckout(phone.length >= 3, 'Customer phone is required.');

    return { name, email, phone, telegram };
}

function getDeliveryAddressSummary(delivery) {
    return [
        delivery.block ? `Blk ${delivery.block}` : '',
        delivery.street,
        delivery.floor || delivery.unit ? `#${delivery.floor || ''}${delivery.unit ? `-${delivery.unit}` : ''}` : '',
        delivery.building,
        delivery.postal ? `Singapore ${delivery.postal}` : ''
    ].filter(Boolean).join(', ');
}

function parseCheckoutDateText(value) {
    const match = cleanText(value, 40).match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    assertCheckout(match, 'Invalid meetup date.');

    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const day = Number(match[1]);
    const month = months.indexOf(match[2].toLowerCase());
    const year = Number(match[3]);
    assertCheckout(month >= 0, 'Invalid meetup month.');

    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    assertCheckout(date.getFullYear() === year && date.getMonth() === month && date.getDate() === day, 'Invalid meetup date.');
    return date;
}

function toLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getEarliestCheckoutDate() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 7);
    return date;
}

function getConfiguredMeetupLocation(locationId) {
    const locations = Array.isArray(COMMERCE_CONFIG.meetupLocations) ? COMMERCE_CONFIG.meetupLocations : [];
    return locations.find(location => location.id === locationId) || null;
}

async function requestSupabaseJson(method, endpointPath, body = null) {
    assertCheckout(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY, 'Checkout backend is not configured.', 503);

    const projectUrl = new URL(SUPABASE_URL);
    const payload = body === null ? null : JSON.stringify(body);
    const headers = {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Accept: 'application/json'
    };

    if (payload !== null) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const response = await requestBuffer({
        hostname: projectUrl.hostname,
        path: endpointPath,
        method,
        headers,
        timeout: 30000
    }, payload);

    const text = response.body.toString('utf8');
    let parsed = null;
    if (text) {
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = null;
        }
    }
    if (response.status < 200 || response.status >= 300) {
        const details = typeof parsed?.message === 'string' ? parsed.message : text.slice(0, 300);
        throw new Error(`Supabase request failed (${response.status}): ${details}`);
    }

    return parsed;
}

async function callSupabaseRpc(name, body = {}) {
    return requestSupabaseJson('POST', `/rest/v1/rpc/${encodeURIComponent(name)}`, body);
}

async function ensureOrderStorageBucketForServer(bucket) {
    await callSupabaseRpc('ensure_order_storage_bucket', { p_bucket_id: bucket });
}

async function uploadSupabaseStorageObject(file) {
    assertCheckout(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY, 'Checkout backend is not configured.', 503);

    const projectUrl = new URL(SUPABASE_URL);
    const response = await requestBuffer({
        hostname: projectUrl.hostname,
        path: `/storage/v1/object/${encodeURIComponent(file.bucket)}/${encodeSupabaseStoragePath(file.storagePath)}`,
        method: 'POST',
        headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            'Content-Type': file.contentType || 'application/octet-stream',
            'Content-Length': file.buffer.length,
            'Cache-Control': '3600',
            'x-upsert': 'false'
        },
        timeout: 30000
    }, file.buffer);

    if (response.status < 200 || response.status >= 300) {
        const text = response.body.toString('utf8').slice(0, 300);
        throw new Error(`Supabase storage upload failed (${response.status}): ${text}`);
    }
}

async function deleteSupabaseStorageObject(file) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !file?.bucket || !file?.storagePath) return;

    const projectUrl = new URL(SUPABASE_URL);
    const response = await requestBuffer({
        hostname: projectUrl.hostname,
        path: `/storage/v1/object/${encodeURIComponent(file.bucket)}/${encodeSupabaseStoragePath(file.storagePath)}`,
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY
        },
        timeout: 30000
    });

    if (response.status < 200 || response.status >= 300) {
        console.warn(`Could not delete orphaned checkout upload ${file.bucket}/${file.storagePath}: ${response.status}`);
    }
}

async function deleteCheckoutStorageFiles(files) {
    await Promise.allSettled(files.map(deleteSupabaseStorageObject));
}

async function deleteOrderStorageBucket(bucket) {
    if (!bucket) return;

    try {
        await callSupabaseRpc('delete_order_storage_bucket', { p_bucket_id: bucket });
    } catch (error) {
        console.warn(`Could not delete orphaned checkout bucket ${bucket}: ${error.message}`);
    }
}

async function deleteCheckoutStorageBuckets(files) {
    const buckets = [...new Set(files.map(file => file.bucket).filter(Boolean))];
    await Promise.allSettled(buckets.map(deleteOrderStorageBucket));
}

async function uploadCheckoutStorageFiles(files) {
    const buckets = [...new Set(files.map(file => file.bucket))];
    await Promise.all(buckets.map(ensureOrderStorageBucketForServer));
    for (const file of files) {
        await uploadSupabaseStorageObject(file);
    }
}

async function getCheckoutAvailabilityForServer() {
    try {
        const data = await callSupabaseRpc('get_checkout_availability', {});
        return {
            loaded: true,
            timeSlots: Array.isArray(data?.timeSlots) ? data.timeSlots : [],
            blockedDates: Array.isArray(data?.blockedDates) ? data.blockedDates : []
        };
    } catch (error) {
        console.warn(`Could not load checkout availability from Supabase; using server config fallback: ${error.message}`);
        return {
            loaded: false,
            timeSlots: [],
            blockedDates: []
        };
    }
}

function fallbackTimesForLocation(locationId, date) {
    const allSlots = Array.isArray(COMMERCE_CONFIG.timeSlots) ? COMMERCE_CONFIG.timeSlots : [];
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isWednesday = dayOfWeek === 3;
    const isWeekday = !isWeekend && !isWednesday;

    if (locationId === 'ntu') {
        const ntuAllowed = new Set(['10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM']);
        return allSlots.filter(time => isWeekday && ntuAllowed.has(time));
    }

    if (locationId === 'pasir-ris') {
        if (isWeekday) return allSlots.filter(time => time === '7:00 PM' || time === '8:00 PM');
        if (isWednesday) return allSlots;
        return allSlots;
    }

    return allSlots;
}

function getServerAvailableTimes(availability, locationId, date) {
    if (availability.loaded) {
        const dayOfWeek = date.getDay();
        const dateKey = toLocalDateKey(date);
        const isBlocked = availability.blockedDates.some(blocked => (
            blocked.blocked_date === dateKey
            && (!blocked.location_id || blocked.location_id === locationId)
        ));
        if (isBlocked) return [];

        return [...new Set(availability.timeSlots
            .filter(slot => slot.location_id === locationId && Number(slot.day_of_week) === dayOfWeek)
            .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
            .map(slot => cleanText(slot.time_label, 40))
            .filter(Boolean))];
    }

    return fallbackTimesForLocation(locationId, date);
}

async function canonicalizeFulfilment(order) {
    const fulfilment = cleanText(order.fulfilment, 20);
    assertCheckout(fulfilment === 'meetup' || fulfilment === 'delivery', 'Invalid fulfilment method.');

    if (fulfilment === 'delivery') {
        const source = asPlainObject(order.delivery);
        assertCheckout(source, 'Delivery details are required.');

        const delivery = {
            postal: cleanText(source.postal, 20),
            street: cleanText(source.street, 160),
            block: cleanText(source.block, 40),
            floor: cleanText(source.floor, 20),
            unit: cleanText(source.unit, 20),
            building: cleanText(source.building, 160),
            notes: cleanText(source.notes, 500)
        };
        assertCheckout(delivery.postal && delivery.street, 'Postal code and street are required for delivery.');
        delivery.addressSummary = getDeliveryAddressSummary(delivery);
        delivery.summary = cleanText(source.summary || delivery.addressSummary, 500);
        return { fulfilment, meetup: null, delivery };
    }

    const source = asPlainObject(order.meetup);
    assertCheckout(source, 'Meetup details are required.');

    const locationId = cleanText(source.locationId || source.location_id, 80);
    const configuredLocation = getConfiguredMeetupLocation(locationId);
    assertCheckout(configuredLocation, 'Unknown meetup location.');

    const date = parseCheckoutDateText(source.date);
    assertCheckout(date >= getEarliestCheckoutDate(), 'Meetup date must be at least 7 days from today.');

    const time = cleanText(source.time, 40);
    const availability = await getCheckoutAvailabilityForServer();
    const availableTimes = getServerAvailableTimes(availability, locationId, date);
    assertCheckout(availableTimes.includes(time), 'Selected meetup time is no longer available.');

    const meetup = {
        date: cleanText(source.date, 40),
        time,
        locationId,
        location: cleanText(configuredLocation.name || source.location || locationId, 160),
        locationSub: cleanText(configuredLocation.sub || source.locationSub || '', 160)
    };
    meetup.summary = `${meetup.location}: ${meetup.date} | ${meetup.time}`;
    return { fulfilment, meetup, delivery: null };
}

async function getActivePromoForServer(code) {
    const normalized = normalizePromoCode(code);
    if (!normalized) return null;

    const data = await callSupabaseRpc('get_active_promo_code', { p_code: normalized });
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return null;

    return {
        code: cleanText(row.code || normalized, 80),
        label: cleanText(row.label || normalized, 120),
        type: cleanText(row.discount_type, 20),
        value: moneyOrZero(row.discount_value)
    };
}

function calculateCheckoutDiscount(subtotal, promo) {
    if (!promo) return 0;
    const rawDiscount = promo.type === 'percent'
        ? subtotal * Math.max(0, promo.value) / 100
        : Math.max(0, promo.value);
    return roundMoney(Math.min(subtotal, rawDiscount));
}

async function canonicalizeTotals(order, fulfilment, items) {
    const clientTotals = asPlainObject(order.totals) || {};
    const subtotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
    const shipping = roundMoney(fulfilment === 'delivery'
        ? moneyOrZero(COMMERCE_CONFIG.deliveryShippingPrice)
        : moneyOrZero(COMMERCE_CONFIG.meetupShippingPrice));

    const promoCode = normalizePromoCode(clientTotals.promoCode);
    const promo = await getActivePromoForServer(promoCode);
    assertCheckout(!promoCode || promo, 'Promo code is not valid.');

    const discount = calculateCheckoutDiscount(subtotal, promo);
    const total = roundMoney(Math.max(0, subtotal + shipping - discount));

    assertMoneyMatches('Subtotal', clientTotals.subtotal, subtotal);
    assertMoneyMatches('Shipping', clientTotals.shipping, shipping);
    assertMoneyMatches('Discount', clientTotals.discount, discount);
    assertMoneyMatches('Total', clientTotals.total, total);

    return {
        subtotal,
        shipping,
        discount,
        promoCode: promo ? promo.code : '',
        promoLabel: promo ? promo.label : '',
        total
    };
}

function sanitizeStoragePath(value) {
    const storagePath = String(value || '').trim().replace(/\\/g, '/');
    assertCheckout(storagePath.length >= 8 && storagePath.length <= 240, 'Invalid uploaded file path.');
    assertCheckout(!storagePath.split('/').some(part => part === '..' || part === ''), 'Invalid uploaded file path.');
    return storagePath;
}

function getOrderStorageBucket(orderId) {
    return sanitizeStorageName(orderId).toLowerCase().replace(/_/g, '-');
}

function getStorageSubfolderForRole(fileRole) {
    return fileRole === 'payment_proof' ? 'payment' : 'design';
}

function createStoragePath(file) {
    const safeName = sanitizeStorageName(file.originalName || `${file.fileRole}.bin`);
    const safeItem = file.itemId ? `${sanitizeStorageName(file.itemId)}-` : '';
    const safePart = file.partKey ? `${sanitizeStorageName(file.partKey)}-` : '';
    const unique = crypto.randomBytes(8).toString('hex');
    return `${getStorageSubfolderForRole(file.fileRole)}/${file.fileRole}-${Date.now()}-${unique}-${safeItem}${safePart}${safeName}`;
}

function detectImageContentType(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) return '';

    if (
        buffer.length >= 8
        && buffer[0] === 0x89
        && buffer[1] === 0x50
        && buffer[2] === 0x4e
        && buffer[3] === 0x47
        && buffer[4] === 0x0d
        && buffer[5] === 0x0a
        && buffer[6] === 0x1a
        && buffer[7] === 0x0a
    ) {
        return 'image/png';
    }

    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }

    if (
        buffer.length >= 6
        && buffer[0] === 0x47
        && buffer[1] === 0x49
        && buffer[2] === 0x46
        && buffer[3] === 0x38
        && (buffer[4] === 0x37 || buffer[4] === 0x39)
        && buffer[5] === 0x61
    ) {
        return 'image/gif';
    }

    if (
        buffer.length >= 12
        && buffer.slice(0, 4).toString('ascii') === 'RIFF'
        && buffer.slice(8, 12).toString('ascii') === 'WEBP'
    ) {
        return 'image/webp';
    }

    return '';
}

function normalizeClientUploadFile(file, uploadedFiles) {
    const source = asPlainObject(file);
    assertCheckout(source, 'Invalid uploaded file metadata.');

    const fileRole = cleanText(source.fileRole || source.file_role, 40).replace(/-/g, '_');
    assertCheckout(fileRole === 'design_upload' || fileRole === 'payment_proof', 'Invalid uploaded file role.');

    const fieldName = cleanText(source.fieldName || source.field_name, 80);
    assertCheckout(/^[a-z0-9._-]{1,80}$/i.test(fieldName), 'Invalid uploaded file field.');
    const upload = uploadedFiles.get(fieldName);
    assertCheckout(upload, 'Uploaded file is missing.');

    const size = Number(source.size ?? source.size_bytes);
    assertCheckout(!Number.isFinite(size) || (size >= 0 && size <= CHECKOUT_UPLOAD_MAX_BYTES), 'Uploaded file is too large.');
    assertCheckout(upload.buffer.length <= CHECKOUT_UPLOAD_MAX_BYTES, 'Uploaded file is too large.');
    assertCheckout(!Number.isFinite(size) || upload.buffer.length === Math.round(size), 'Uploaded file size does not match metadata.');

    const contentType = cleanText(upload.contentType || source.contentType || source.content_type, 120).toLowerCase();
    assertCheckout(contentType.startsWith('image/'), 'Uploaded payment/design files must be images.');
    const detectedContentType = detectImageContentType(upload.buffer);
    assertCheckout(detectedContentType, 'Uploaded payment/design files must be PNG, JPEG, GIF, or WebP images.');
    assertCheckout(contentType === detectedContentType || (contentType === 'image/jpg' && detectedContentType === 'image/jpeg'), 'Uploaded file type does not match its contents.');

    const originalName = cleanOptionalText(source.originalName || source.original_name || upload.originalName, 240);

    return {
        itemId: cleanOptionalText(source.itemId || source.item_id, 120),
        partKey: cleanOptionalText(source.partKey || source.part_key, 40),
        fileRole,
        bucket: '',
        storagePath: '',
        originalName,
        contentType,
        size: upload.buffer.length,
        buffer: upload.buffer
    };
}

function assertDesignFileMatchesItem(file, itemsById) {
    assertCheckout(file.itemId, 'Design upload is missing an item id.');
    const item = itemsById.get(file.itemId);
    assertCheckout(item, 'Design upload points to an unknown item.');
    assertCheckout(CHECKOUT_DESIGN_PART_KEYS.has(file.partKey), 'Design upload has an invalid part.');
    assertCheckout(item.addOns.some(addOn => addOn.partKey === file.partKey), 'Design upload does not match a paid design add-on.');
}

function encodeSupabaseStoragePath(storagePath) {
    return storagePath.split('/').map(part => encodeURIComponent(part)).join('/');
}

async function canonicalizeCheckoutFiles(orderId, rawFiles, uploadedFiles, items, rawPayment) {
    assertCheckout(Array.isArray(rawFiles), 'Uploaded file metadata is required.');
    assertCheckout(uploadedFiles instanceof Map, 'Uploaded file data is required.');
    const files = rawFiles.map(file => normalizeClientUploadFile(file, uploadedFiles));
    const expectedBucket = getOrderStorageBucket(orderId);
    const itemsById = new Map(items.map(item => [item.id, item]));

    for (const file of files) {
        if (file.fileRole === 'design_upload') assertDesignFileMatchesItem(file, itemsById);
        file.bucket = expectedBucket;
        file.storagePath = sanitizeStoragePath(createStoragePath(file));
    }

    const paymentFiles = files.filter(file => file.fileRole === 'payment_proof');
    assertCheckout(paymentFiles.length === 1, 'Exactly one payment proof image is required.');

    const paymentSource = asPlainObject(rawPayment);
    const paymentFile = paymentFiles[0];
    const payment = {
        method: 'PayNow',
        status: 'pending_payment_review',
        screenshotName: cleanText(paymentFile.originalName || paymentSource?.screenshotName || 'payment-proof', 240),
        screenshotSource: cleanText(paymentSource?.screenshotSource || 'upload', 40),
        screenshotPath: paymentFile.storagePath,
        screenshotBucket: paymentFile.bucket
    };

    const fileRows = files.map(file => ({
        order_id: orderId,
        item_id: file.itemId,
        part_key: file.partKey,
        file_role: file.fileRole,
        bucket: file.bucket,
        storage_path: file.storagePath,
        original_name: file.originalName,
        content_type: file.contentType,
        size_bytes: file.size
    }));

    const storageFiles = files.map(file => ({
        bucket: file.bucket,
        storagePath: file.storagePath,
        originalName: file.originalName,
        contentType: file.contentType,
        buffer: file.buffer
    }));

    return { payment, fileRows, storageFiles };
}

async function buildCheckoutOrderRecords(payload) {
    const order = asPlainObject(payload.order || payload);
    assertCheckout(order, 'Missing order payload.');

    const orderId = cleanText(order.orderId || order.id, 140);
    assertCheckout(/^order-[a-z0-9][a-z0-9-]{8,119}$/.test(orderId), 'Invalid order id.');

    const customer = canonicalizeCustomer(order);
    const fulfilmentDetails = await canonicalizeFulfilment(order);
    const items = canonicalizeCheckoutItems(order.items);
    const totals = await canonicalizeTotals(order, fulfilmentDetails.fulfilment, items);
    const rawFiles = payload.fileMetadata || payload.files || order.files || [];
    const uploadedFiles = payload.uploadedFiles || new Map();
    const { payment, fileRows, storageFiles } = await canonicalizeCheckoutFiles(orderId, rawFiles, uploadedFiles, items, order.payment);

    return {
        orderRecord: {
            id: orderId,
            customer_name: customer.name,
            customer_email: customer.email,
            customer_phone: customer.phone,
            customer_telegram: customer.telegram,
            fulfilment: fulfilmentDetails.fulfilment,
            meetup: fulfilmentDetails.meetup,
            delivery: fulfilmentDetails.delivery,
            items,
            totals,
            payment,
            status: 'new'
        },
        storageFiles,
        fileRows,
        response: {
            orderId,
            totals,
            paymentStatus: payment.status,
            fileCount: fileRows.length
        }
    };
}

async function insertCheckoutOrder(payload) {
    const records = await buildCheckoutOrderRecords(payload);
    await uploadCheckoutStorageFiles(records.storageFiles);
    let orderInserted = false;

    try {
        await requestSupabaseJson('POST', '/rest/v1/orders', records.orderRecord);
        orderInserted = true;

        if (records.fileRows.length) {
            await requestSupabaseJson('POST', '/rest/v1/order_files', records.fileRows);
        }
    } catch (error) {
        if (orderInserted) {
            await requestSupabaseJson('DELETE', `/rest/v1/orders?id=eq.${encodeURIComponent(records.orderRecord.id)}`).catch(deleteError => {
                console.warn(`Could not delete partial checkout order ${records.orderRecord.id}: ${deleteError.message}`);
            });
        }
        await deleteCheckoutStorageFiles(records.storageFiles);
        await deleteCheckoutStorageBuckets(records.storageFiles);
        throw error;
    }

    return records.response;
}

async function handleCheckoutOrder(req, res) {
    if (!isCheckoutOriginAllowed(getRequestOrigin(req), req)) {
        sendError(req, res, 403, 'Checkout origin is not allowed.');
        return;
    }

    try {
        const payload = await readCheckoutPayload(req);
        const result = await insertCheckoutOrder(payload);
        sendJson(req, res, 201, { ok: true, ...result });
    } catch (error) {
        if (error instanceof CheckoutValidationError) {
            sendError(req, res, error.statusCode, error.message);
            return;
        }

        console.error(error);
        sendError(req, res, 500, 'Checkout submission failed.');
    }
}

async function handleOrderNotification(req, res) {
    if (!ORDER_NOTIFICATION_SECRET) {
        sendError(req, res, 503, 'Order notifications are not configured.');
        return;
    }

    if (!hasValidNotificationSecret(req)) {
        sendError(req, res, 401, 'Invalid notification secret.');
        return;
    }

    try {
        const payload = await readJsonBody(req);
        const order = getNotificationOrder(payload);
        if (!order || typeof order !== 'object') {
            sendError(req, res, 400, 'Missing order payload.');
            return;
        }

        const results = await sendOrderNotifications(order);
        sendJson(req, res, 200, { ok: true, results });
    } catch (error) {
        console.error(error);
        sendError(req, res, 500, error.message || 'Order notification failed.');
    }
}

async function handleOrderFileNotification(req, res) {
    if (!ORDER_NOTIFICATION_SECRET) {
        sendError(req, res, 503, 'Order notifications are not configured.');
        return;
    }

    if (!hasValidNotificationSecret(req)) {
        sendError(req, res, 401, 'Invalid notification secret.');
        return;
    }

    try {
        const payload = await readJsonBody(req);
        const file = getNotificationOrderFile(payload);
        if (!file || typeof file !== 'object') {
            sendError(req, res, 400, 'Missing order file payload.');
            return;
        }

        const result = await sendOrderFileToTelegram(file);
        sendJson(req, res, 200, { ok: true, result });
    } catch (error) {
        console.error(error);
        sendError(req, res, 500, error.message || 'Order file notification failed.');
    }
}

async function handleTelegramWebhook(req, res) {
    if (!hasValidTelegramWebhookSecret(req)) {
        sendError(req, res, 401, 'Invalid Telegram webhook secret.');
        return;
    }

    try {
        const update = await readJsonBody(req);
        const message = update.message || update.edited_message;
        const username = normalizeTelegramHandle(message?.from?.username);
        const chatId = message?.chat?.id;

        if (username && chatId) {
            telegramCustomerChatMap[username] = chatId;
            saveJsonFile(telegramChatMapPath, telegramCustomerChatMap);
            await sendTelegramMessage(chatId, `Thanks. ${SHOP_NAME} can now send order updates to this Telegram chat.`);
        }

        sendJson(req, res, 200, { ok: true, registered: Boolean(username && chatId) });
    } catch (error) {
        console.error(error);
        sendError(req, res, 500, error.message || 'Telegram webhook failed.');
    }
}

async function handleNotificationTest(req, res) {
    if (!requireAdminAccess(req, res)) return;
    if (req.method !== 'POST') {
        sendError(req, res, 405, 'Method not allowed.');
        return;
    }
    if (!isSameOriginRequest(req)) {
        sendError(req, res, 403, 'Admin action origin is not allowed.');
        return;
    }

    const sampleOrder = {
        id: `order-notification-test-${Date.now()}`,
        customer_name: 'Test Customer',
        customer_email: NOTIFICATION_FROM_EMAIL || SMTP_FROM || SMTP_USER,
        customer_phone: '+65 0000 0000',
        customer_telegram: '',
        fulfilment: 'meetup',
        meetup: {
            date: 'Test date',
            time: 'Test time',
            location: 'Test location'
        },
        totals: {
            total: 0
        }
    };

    try {
        const results = await sendOrderNotifications(sampleOrder);
        sendJson(req, res, 200, { ok: true, results });
    } catch (error) {
        console.error(error);
        sendError(req, res, 500, error.message || 'Notification test failed.');
    }
}

async function handleFileNotificationTest(req, res) {
    if (!requireAdminAccess(req, res)) return;
    if (req.method !== 'POST') {
        sendError(req, res, 405, 'Method not allowed.');
        return;
    }
    if (!isSameOriginRequest(req)) {
        sendError(req, res, 403, 'Admin action origin is not allowed.');
        return;
    }

    const sampleFile = {
        order_id: 'order-file-notification-test',
        file_role: 'payment_proof',
        bucket: 'order-file-notification-test',
        storage_path: 'payment/example.png',
        original_name: 'example.png',
        content_type: 'image/png',
        size_bytes: 0
    };

    try {
        const result = await sendOrderFileToTelegram(sampleFile);
        sendJson(req, res, 200, { ok: true, result });
    } catch (error) {
        console.error(error);
        sendError(req, res, 500, error.message || 'File notification test failed.');
    }
}

function parseRange(rangeHeader, size) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || '');
    if (!match) return null;

    let start = match[1] ? Number.parseInt(match[1], 10) : 0;
    let end = match[2] ? Number.parseInt(match[2], 10) : size - 1;

    if (!match[1] && match[2]) {
        const suffixLength = Number.parseInt(match[2], 10);
        start = Math.max(0, size - suffixLength);
        end = size - 1;
    }

    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
        return null;
    }

    return { start, end: Math.min(end, size - 1) };
}

function serveFile(req, res, absolutePath, relativePath) {
    fs.stat(absolutePath, (statError, stat) => {
        if (statError || !stat.isFile()) {
            sendError(req, res, 404, 'Not found.');
            return;
        }

        const lastModified = stat.mtime.toUTCString();
        if (req.headers['if-modified-since'] === lastModified) {
            setSecurityHeaders(req, res);
            res.writeHead(304, {
                'Last-Modified': lastModified,
                'Cache-Control': cacheControlFor(relativePath)
            });
            res.end();
            return;
        }

        const commonHeaders = {
            'Accept-Ranges': 'bytes',
            'Cache-Control': cacheControlFor(relativePath),
            'Content-Type': getContentType(absolutePath),
            'Last-Modified': lastModified
        };

        setSecurityHeaders(req, res);

        const requestedRange = req.headers.range ? parseRange(req.headers.range, stat.size) : null;
        if (req.headers.range && !requestedRange) {
            res.writeHead(416, {
                ...commonHeaders,
                'Content-Range': `bytes */${stat.size}`
            });
            res.end();
            return;
        }

        if (requestedRange) {
            const contentLength = requestedRange.end - requestedRange.start + 1;
            res.writeHead(206, {
                ...commonHeaders,
                'Content-Length': contentLength,
                'Content-Range': `bytes ${requestedRange.start}-${requestedRange.end}/${stat.size}`
            });

            if (req.method === 'HEAD') {
                res.end();
                return;
            }

            fs.createReadStream(absolutePath, requestedRange).pipe(res);
            return;
        }

        res.writeHead(200, {
            ...commonHeaders,
            'Content-Length': stat.size
        });

        if (req.method === 'HEAD') {
            res.end();
            return;
        }

        fs.createReadStream(absolutePath).pipe(res);
    });
}

function handleHealth(req, res) {
    sendJson(req, res, 200, {
        ok: true,
        time: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        adminEnabled: ADMIN_ENABLED,
        https: isHttpsRequest(req)
    });
}

function handleRequestLog(req, res, url) {
    if (!requireAdminAccess(req, res)) return;

    const limit = Math.min(readPositiveInt(url.searchParams.get('limit'), 5), 100);
    sendJson(req, res, 200, {
        persistentLogEnabled: LOG_TO_FILE,
        requests: requestLog.slice(-limit).reverse()
    });
}

function handlePersistentLogs(req, res, url) {
    if (!requireAdminAccess(req, res)) return;

    const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        sendError(req, res, 400, 'Invalid log date.');
        return;
    }

    const limit = Math.min(readPositiveInt(url.searchParams.get('limit'), 100), 1000);
    const filePath = path.join(persistentLogDir, `access-${date}.jsonl`);
    if (!fs.existsSync(filePath)) {
        sendJson(req, res, 200, { date, entries: [] });
        return;
    }

    fs.readFile(filePath, 'utf8', (error, content) => {
        if (error) {
            sendError(req, res, 500, 'Could not read logs.');
            return;
        }

        const entries = content
            .split(/\r?\n/)
            .filter(Boolean)
            .slice(-limit)
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return { raw: line };
                }
            })
            .reverse();

        sendJson(req, res, 200, { date, entries });
    });
}

function runPreflightChecks(req) {
    const requiredFiles = [
        'index.html',
        'configurator.html',
        'admin/index.html',
        'admin/admin.css',
        'admin/admin.js',
        'site-config.js',
        'script.js',
        'server.js',
        'database/supabase-setup.sql'
    ];
    const checks = [];
    const localDevelopment = isLocalDevelopment(req);

    requiredFiles.forEach(file => {
        checks.push({
            name: `required_file:${file}`,
            ok: fs.existsSync(path.join(ROOT_DIR, file)),
            severity: 'error'
        });
    });

    checks.push({
        name: 'admin_basic_auth_enabled',
        ok: ADMIN_ENABLED && ADMIN_USERNAME.length > 0 && ADMIN_PASSWORD.length >= 16,
        severity: 'error'
    });

    checks.push({
        name: 'admin_ip_allowlist_configured',
        ok: localDevelopment || ADMIN_ALLOWED_IPS.size > 0,
        severity: 'warning',
        detail: localDevelopment
            ? 'Skipped for localhost development.'
            : 'Set ADMIN_ALLOWED_IPS in production to restrict Basic auth attempts.'
    });

    checks.push({
        name: 'persistent_logs_enabled',
        ok: LOG_TO_FILE,
        severity: 'warning'
    });

    checks.push({
        name: 'notification_channel_configured',
        ok: Boolean((SMTP_HOST && SMTP_FROM) || (TELEGRAM_BOT_TOKEN && TELEGRAM_ADMIN_CHAT_ID)),
        severity: 'warning',
        detail: SMTP_HOST && SMTP_FROM
            ? 'Email notification channel is configured.'
            : TELEGRAM_BOT_TOKEN && TELEGRAM_ADMIN_CHAT_ID
                ? 'Telegram notification channel is configured; SMTP email is optional.'
                : 'Configure SMTP or Telegram notifications before taking live orders.'
    });

    checks.push({
        name: 'https_ready',
        ok: localDevelopment
            || isHttpsRequest(req)
            || REQUIRE_HTTPS
            || Boolean(HTTPS_KEY_PATH && HTTPS_CERT_PATH)
            || PUBLIC_BASE_URL.startsWith('https://'),
        severity: 'warning',
        detail: localDevelopment ? 'Skipped for localhost development.' : 'Use HTTPS in production.'
    });

    checks.push({
        name: 'trust_proxy_when_using_forwarded_https',
        ok: !String(req.headers['x-forwarded-proto'] || '') || TRUST_PROXY,
        severity: 'warning'
    });

    checks.push({
        name: 'checkout_origin_allowlist_configured',
        ok: localDevelopment || CHECKOUT_ALLOWED_ORIGINS.size > 0,
        severity: 'warning',
        detail: localDevelopment
            ? 'Skipped for localhost development.'
            : 'Set CHECKOUT_ALLOWED_ORIGINS to the exact public site origins that may submit checkout orders.'
    });

    checks.push({
        name: 'csp_without_inline_script',
        ok: localDevelopment,
        severity: 'warning',
        detail: localDevelopment
            ? 'Skipped for localhost development.'
            : 'Current UI uses inline scripts/handlers, so CSP still includes unsafe-inline.'
    });

    const failures = checks.filter(check => !check.ok);
    return {
        ok: failures.every(check => check.severity !== 'error'),
        checks,
        failures
    };
}

function handlePreflight(req, res) {
    if (!requireAdminAccess(req, res)) return;
    sendJson(req, res, 200, runPreflightChecks(req));
}

function redirectToHttps(req, res) {
    const host = req.headers.host;
    if (!host || !['GET', 'HEAD'].includes(req.method)) {
        sendError(req, res, 403, 'HTTPS is required.');
        return;
    }

    setSecurityHeaders(req, res);
    res.writeHead(308, {
        'Location': `https://${host}${req.url}`,
        'Cache-Control': 'no-store'
    });
    res.end();
}

function handleRequest(req, res) {
    const startedAt = Date.now();

    res.on('finish', () => {
        pushRequestLog(buildLogEntry(req, res.statusCode, startedAt));
    });

    const url = new URL(req.url, 'http://localhost');
    const isAdminRoute = url.pathname === '/api/admin/requests'
        || url.pathname === '/api/admin/logs'
        || url.pathname === '/api/admin/preflight'
        || url.pathname === '/api/admin/test-notification'
        || url.pathname === '/api/admin/test-file-notification'
        || isAdminFile(normalizeRequestPath(url.pathname) || '');
    const isPostApiRoute = url.pathname === '/api/order-notification'
        || url.pathname === '/api/order-file-notification'
        || url.pathname === '/api/telegram/webhook'
        || url.pathname === '/api/checkout/orders'
        || url.pathname === '/api/admin/test-notification'
        || url.pathname === '/api/admin/test-file-notification';

    pruneRateBuckets();

    if (!['GET', 'HEAD', 'POST', 'OPTIONS'].includes(req.method)) {
        sendError(req, res, 405, 'Method not allowed.');
        return;
    }

    if (req.method === 'POST' && !isPostApiRoute) {
        sendError(req, res, 405, 'Method not allowed.');
        return;
    }

    if (req.method === 'OPTIONS') {
        sendOptions(req, res);
        return;
    }

    if (REQUIRE_HTTPS && !isHttpsRequest(req)) {
        redirectToHttps(req, res);
        return;
    }

    if (!applyRateLimit(req, res, isAdminRoute)) return;

    if (url.pathname === '/healthz') {
        handleHealth(req, res);
        return;
    }

    if (url.pathname === '/api/order-notification') {
        handleOrderNotification(req, res);
        return;
    }

    if (url.pathname === '/api/order-file-notification') {
        handleOrderFileNotification(req, res);
        return;
    }

    if (url.pathname === '/api/telegram/webhook') {
        handleTelegramWebhook(req, res);
        return;
    }

    if (url.pathname === '/api/checkout/orders') {
        handleCheckoutOrder(req, res);
        return;
    }

    if (url.pathname === '/api/admin/requests') {
        handleRequestLog(req, res, url);
        return;
    }

    if (url.pathname === '/api/admin/logs') {
        handlePersistentLogs(req, res, url);
        return;
    }

    if (url.pathname === '/api/admin/preflight') {
        handlePreflight(req, res);
        return;
    }

    if (url.pathname === '/api/admin/test-notification') {
        if (req.method !== 'POST') {
            sendError(req, res, 405, 'Method not allowed.');
            return;
        }
        handleNotificationTest(req, res);
        return;
    }

    if (url.pathname === '/api/admin/test-file-notification') {
        if (req.method !== 'POST') {
            sendError(req, res, 405, 'Method not allowed.');
            return;
        }
        handleFileNotificationTest(req, res);
        return;
    }

    const relativePath = normalizeRequestPath(url.pathname);
    if (!relativePath) {
        sendError(req, res, 404, 'Not found.');
        return;
    }

    if (isAdminFile(relativePath) && !requireAdminAccess(req, res)) {
        return;
    }

    if (!isAdminFile(relativePath) && !isAllowedPublicFile(relativePath)) {
        sendError(req, res, 404, 'Not found.');
        return;
    }

    const absolutePath = toAbsolutePath(relativePath);
    if (!absolutePath) {
        sendError(req, res, 404, 'Not found.');
        return;
    }

    serveFile(req, res, absolutePath, relativePath);
}

function createServer() {
    if (HTTPS_KEY_PATH && HTTPS_CERT_PATH) {
        return https.createServer({
            key: fs.readFileSync(path.resolve(ROOT_DIR, HTTPS_KEY_PATH)),
            cert: fs.readFileSync(path.resolve(ROOT_DIR, HTTPS_CERT_PATH))
        }, handleRequest);
    }

    return http.createServer(handleRequest);
}

const server = createServer();
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;

server.on('error', error => {
    console.error(`Server failed: ${error.message}`);
    process.exit(1);
});

server.listen(PORT, HOST, () => {
    const protocol = HTTPS_KEY_PATH && HTTPS_CERT_PATH ? 'https' : 'http';
    console.log(`PopOutPick backend running at ${protocol}://${HOST}:${PORT}`);
    console.log(`Admin route is ${ADMIN_ENABLED ? 'enabled' : 'disabled'}.`);
});
