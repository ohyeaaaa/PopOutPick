'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
loadDotEnv(path.join(ROOT_DIR, '.env'));

const TARGET_URL = process.env.MONITOR_URL || process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${process.env.PORT || 8080}/healthz`;
const INTERVAL_MS = Number.parseInt(process.env.MONITOR_INTERVAL_MS || '300000', 10);
const LOG_DIR = path.resolve(ROOT_DIR, process.env.LOG_DIR || 'logs');
const ONCE = process.argv.includes('--once');

fs.mkdirSync(LOG_DIR, { recursive: true });

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

function check() {
    return new Promise(resolve => {
        const startedAt = Date.now();
        const url = new URL(TARGET_URL);
        const client = url.protocol === 'https:' ? https : http;
        const req = client.request(url, { method: 'GET', timeout: 15000 }, res => {
            res.resume();
            res.on('end', () => resolve({
                time: new Date().toISOString(),
                ok: res.statusCode >= 200 && res.statusCode < 300,
                status: res.statusCode,
                durationMs: Date.now() - startedAt,
                url: TARGET_URL
            }));
        });

        req.on('timeout', () => {
            req.destroy(new Error('Request timed out'));
        });

        req.on('error', error => resolve({
            time: new Date().toISOString(),
            ok: false,
            status: 0,
            durationMs: Date.now() - startedAt,
            url: TARGET_URL,
            error: error.message
        }));

        req.end();
    });
}

async function runCheck() {
    const result = await check();
    const line = JSON.stringify(result);
    fs.appendFileSync(path.join(LOG_DIR, 'monitor.jsonl'), `${line}\n`);
    console.log(line);
    if (ONCE && !result.ok) process.exit(1);
}

runCheck()
    .then(() => {
        if (ONCE) return;
        setInterval(runCheck, Number.isFinite(INTERVAL_MS) && INTERVAL_MS > 0 ? INTERVAL_MS : 300000);
    })
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
