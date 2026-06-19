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
            id: `order-cli-test-${Date.now()}`,
            customer_name: 'Test Customer',
            customer_email: process.env.NOTIFICATION_TEST_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || 'test@example.com',
            customer_phone: '+65 0000 0000',
            customer_telegram: process.env.NOTIFICATION_TEST_TELEGRAM || '',
            fulfilment: 'meetup',
            meetup: {
                date: 'Test date',
                time: 'Test time',
                location: 'Test location'
            },
            totals: {
                total: 0
            }
        }
    });

    return new Promise(resolve => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            path: '/api/order-notification',
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
