'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
loadDotEnv(path.join(ROOT_DIR, '.env'));

const port = Number.parseInt(process.env.PORT || '8080', 10);
const host = '127.0.0.1';
const adminUsername = process.env.ADMIN_USERNAME || '';
const adminPassword = process.env.ADMIN_PASSWORD || '';

const requiredFiles = [
    'index.html',
    'configurator.html',
    'admin.html',
    'admin.js',
    'admin.css',
    'server.js',
    'site-config.js',
    'script.js',
    'homepage-text.js',
    'supabase-setup.sql'
];

const blockedRoutes = [
    '/.env',
    '/supabase-setup.sql',
    '/google-app-script.gs',
    '/TELEGRAM.txt',
    '/TEXT_GUIDE.md',
    '/PopOutPick_Website/For%20website/full%20set.stl'
];

const publicRoutes = [
    '/',
    '/configurator.html',
    '/site-config.js',
    '/GLB/full%20set.glb'
];

function loadDotEnv(filePath) {
    if (!fs.existsSync(filePath)) return;

    fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const equalsIndex = trimmed.indexOf('=');
        if (equalsIndex === -1) return;

        const key = trimmed.slice(0, equalsIndex).trim();
        let value = trimmed.slice(equalsIndex + 1).trim();
        if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) return;
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    });
}

function request(route, headers = {}) {
    return new Promise(resolve => {
        const req = http.request({
            host,
            port,
            path: route,
            method: 'GET',
            headers
        }, res => {
            res.resume();
            res.on('end', () => resolve({
                route,
                status: res.statusCode,
                contentType: res.headers['content-type'] || '',
                authenticate: res.headers['www-authenticate'] || ''
            }));
        });

        req.on('error', error => resolve({
            route,
            status: 0,
            error: error.message
        }));

        req.end();
    });
}

function printCheck(ok, label, detail = '') {
    const marker = ok ? 'OK ' : 'ERR';
    console.log(`${marker} ${label}${detail ? ` - ${detail}` : ''}`);
    return ok;
}

async function main() {
    let passed = true;

    for (const file of requiredFiles) {
        passed = printCheck(fs.existsSync(path.join(ROOT_DIR, file)), `file:${file}`) && passed;
    }

    passed = printCheck(Boolean(adminUsername && adminPassword.length >= 16), 'admin basic auth configured') && passed;

    for (const route of publicRoutes) {
        const response = await request(route);
        passed = printCheck(response.status === 200, `public:${route}`, `status ${response.status}`) && passed;
    }

    const adminBlocked = await request('/admin.html');
    passed = printCheck(adminBlocked.status === 401, 'admin blocked without basic auth', `status ${adminBlocked.status}`) && passed;

    if (adminUsername && adminPassword) {
        const basic = Buffer.from(`${adminUsername}:${adminPassword}`).toString('base64');
        const adminAllowed = await request('/admin.html', { Authorization: `Basic ${basic}` });
        passed = printCheck(adminAllowed.status === 200, 'admin allowed with basic auth', `status ${adminAllowed.status}`) && passed;

        const preflight = await request('/api/admin/preflight', { Authorization: `Basic ${basic}`, Accept: 'application/json' });
        passed = printCheck(preflight.status === 200, 'admin preflight endpoint', `status ${preflight.status}`) && passed;
    }

    for (const route of blockedRoutes) {
        const response = await request(route);
        passed = printCheck(response.status === 404, `blocked:${route}`, `status ${response.status}`) && passed;
    }

    const health = await request('/healthz');
    passed = printCheck(health.status === 200, 'health endpoint', `status ${health.status}`) && passed;

    if (!passed) process.exit(1);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
