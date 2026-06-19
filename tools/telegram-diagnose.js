'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
loadDotEnv(path.join(ROOT_DIR, '.env'));

const token = process.env.TELEGRAM_BOT_TOKEN || '';

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

function telegramRequest(method) {
    return new Promise(resolve => {
        if (!token) {
            resolve({ ok: false, description: 'TELEGRAM_BOT_TOKEN is not configured.' });
            return;
        }

        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${token}/${method}`,
            method: 'GET',
            timeout: 15000
        }, res => {
            let body = '';
            res.on('data', chunk => {
                body += chunk.toString('utf8');
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch {
                    resolve({ ok: false, description: 'Telegram returned invalid JSON.' });
                }
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error('Telegram request timed out.'));
        });
        req.on('error', error => resolve({ ok: false, description: error.message }));
        req.end();
    });
}

async function main() {
    const me = await telegramRequest('getMe');
    if (!me.ok) {
        console.log(`Telegram bot check failed: ${me.description || 'unknown error'}`);
        process.exit(1);
    }

    console.log(`Bot username: @${me.result.username}`);

    const updates = await telegramRequest('getUpdates');
    if (!updates.ok) {
        console.log(`Could not read updates: ${updates.description || 'unknown error'}`);
        process.exit(1);
    }

    const chats = new Map();
    (updates.result || []).forEach(update => {
        const message = update.message || update.edited_message;
        const chat = message?.chat;
        if (!chat?.id) return;
        chats.set(chat.id, {
            id: chat.id,
            type: chat.type,
            username: chat.username || message?.from?.username || '',
            firstName: chat.first_name || message?.from?.first_name || ''
        });
    });

    if (!chats.size) {
        console.log('No chats found. Send /start to the bot from your Telegram account, then run this again.');
        return;
    }

    console.log('Chats visible to this bot:');
    Array.from(chats.values()).forEach(chat => {
        const name = chat.username ? `@${chat.username}` : chat.firstName;
        console.log(`- ${chat.id} ${chat.type}${name ? ` ${name}` : ''}`);
    });
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
