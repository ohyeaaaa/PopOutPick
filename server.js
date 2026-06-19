'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const path = require('path');
const crypto = require('crypto');

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
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const PUBLIC_ROOT_FILES = new Set([
    'index.html',
    'configurator.html',
    'PopOutPick-payment.html',
    'style.css',
    'script.js',
    'site-config.js',
    'cart-badge.js',
    'homepage-text.js',
    'PayNOW QR code.jpg'
]);

const ADMIN_FILES = new Set([
    'admin.html',
    'admin.css',
    'admin.js'
]);

const ROUTES = new Map([
    ['/', 'index.html'],
    ['/index.html', 'index.html'],
    ['/configurator', 'configurator.html'],
    ['/configurator.html', 'configurator.html'],
    ['/checkout', 'configurator.html'],
    ['/payment', 'PopOutPick-payment.html'],
    ['/PopOutPick-payment.html', 'PopOutPick-payment.html'],
    ['/admin', 'admin.html'],
    ['/admin.html', 'admin.html']
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

function sendJson(req, res, statusCode, body) {
    setSecurityHeaders(req, res);
    const payload = JSON.stringify(body);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
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
        'admin.html',
        'site-config.js',
        'script.js',
        'server.js',
        'supabase-setup.sql'
    ];
    const checks = [];

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
        name: 'persistent_logs_enabled',
        ok: LOG_TO_FILE,
        severity: 'warning'
    });

    checks.push({
        name: 'https_ready',
        ok: isHttpsRequest(req)
            || REQUIRE_HTTPS
            || Boolean(HTTPS_KEY_PATH && HTTPS_CERT_PATH)
            || PUBLIC_BASE_URL.startsWith('https://'),
        severity: 'warning'
    });

    checks.push({
        name: 'trust_proxy_when_using_forwarded_https',
        ok: !String(req.headers['x-forwarded-proto'] || '') || TRUST_PROXY,
        severity: 'warning'
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
        || url.pathname === '/api/telegram/webhook';

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
        handleNotificationTest(req, res);
        return;
    }

    if (url.pathname === '/api/admin/test-file-notification') {
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
