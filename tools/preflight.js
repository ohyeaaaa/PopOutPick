'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
loadDotEnv(path.join(ROOT_DIR, '.env'));

const port = Number.parseInt(process.env.PORT || '8080', 10);
const host = '127.0.0.1';
const adminUsername = process.env.ADMIN_USERNAME || '';
const adminPassword = process.env.ADMIN_PASSWORD || '';
const serverStartupAttempts = Number.parseInt(process.env.PREFLIGHT_SERVER_ATTEMPTS || '30', 10);

const requiredFiles = [
    'index.html',
    'configurator.html',
    'admin/index.html',
    'admin/admin.js',
    'admin/admin.css',
    'server.js',
    'site-config.js',
    'header-controls.js',
    'script.js',
    'homepage-text.js',
    'database/supabase-setup.sql'
];

const blockedRoutes = [
    '/.env',
    '/supabase-setup.sql',
    '/database/supabase-setup.sql',
    '/google-app-script.gs',
    '/integrations/google-app-script.gs',
    '/PopOutPick-payment.html',
    '/TELEGRAM.txt',
    '/TEXT_GUIDE.md',
    '/docs/TEXT_GUIDE.md',
    '/PopOutPick_Website/For%20website/full%20set.stl'
];

const publicRoutes = [
    '/',
    '/payment',
    '/configurator.html',
    '/site-config.js',
    '/header-controls.js',
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

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function startServer() {
    const server = spawn(process.execPath, ['server.js'], {
        cwd: ROOT_DIR,
        env: {
            ...process.env,
            PORT: String(port),
            HOST: host
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    server.stdout.on('data', chunk => process.stdout.write(`[server] ${chunk}`));
    server.stderr.on('data', chunk => process.stderr.write(`[server] ${chunk}`));
    return server;
}

async function stopServer(server) {
    if (!server || server.exitCode !== null) return;
    server.kill('SIGTERM');
    await wait(500);
    if (server.exitCode === null) server.kill('SIGKILL');
}

async function ensureServer() {
    const health = await request('/healthz');
    if (health.status === 200) {
        printCheck(true, 'server reachable', `${host}:${port}`);
        return null;
    }

    const server = startServer();
    for (let attempt = 0; attempt < serverStartupAttempts; attempt += 1) {
        if (server.exitCode !== null) {
            throw new Error(`Preflight server exited early with code ${server.exitCode}.`);
        }
        const response = await request('/healthz');
        if (response.status === 200) {
            printCheck(true, 'started temporary server', `${host}:${port}`);
            return server;
        }
        await wait(500);
    }

    await stopServer(server);
    throw new Error(`Server did not respond at http://${host}:${port}/healthz.`);
}

function printCheck(ok, label, detail = '') {
    const marker = ok ? 'OK ' : 'ERR';
    console.log(`${marker} ${label}${detail ? ` - ${detail}` : ''}`);
    return ok;
}

async function main() {
    let passed = true;
    let startedServer = null;

    try {
        for (const file of requiredFiles) {
            passed = printCheck(fs.existsSync(path.join(ROOT_DIR, file)), `file:${file}`) && passed;
        }

        startedServer = await ensureServer();

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

        if (!passed) process.exitCode = 1;
    } finally {
        await stopServer(startedServer);
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
