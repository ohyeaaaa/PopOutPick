'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
loadDotEnv(path.join(ROOT_DIR, '.env'));

const port = Number.parseInt(process.env.PORT || '8080', 10);
const secret = process.env.ORDER_NOTIFICATION_SECRET || '';

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

function request() {
    const payload = JSON.stringify({
        record: {
            order_id: 'order-file-cli-test',
            file_role: 'payment_proof',
            bucket: 'order-file-cli-test',
            storage_path: 'payment/example.png',
            original_name: 'example.png',
            content_type: 'image/png',
            size_bytes: 0
        }
    });

    return new Promise(resolve => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            path: '/api/order-file-notification',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'X-PopOutPick-Webhook-Secret': secret
            }
        }, res => {
            let body = '';
            res.on('data', chunk => {
                body += chunk.toString('utf8');
            });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });

        req.on('error', error => resolve({ status: 0, body: error.message }));
        req.write(payload);
        req.end();
    });
}

request().then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (result.status < 200 || result.status >= 300) process.exit(1);
});
