'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const rootFiles = [
    'index.html',
    'configurator.html',
    'PopOutPick-payment.html',
    'style.css',
    'script.js',
    'site-config.js',
    'cart-badge.js',
    'homepage-text.js',
    'admin.html',
    'admin.css',
    'admin.js',
    'PayNOW QR code.jpg'
];

const assetDirs = [
    'GLB',
    'Picture'
];

const selectedFiles = [
    'PopOutPick_Website/guitar-icon.png',
    'PopOutPick_Website/bass-icon.png'
];

function copyFile(relativePath) {
    const source = path.join(ROOT_DIR, relativePath);
    const target = path.join(DIST_DIR, relativePath);
    if (!fs.existsSync(source)) return;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

function copyDir(relativePath) {
    const sourceDir = path.join(ROOT_DIR, relativePath);
    const targetDir = path.join(DIST_DIR, relativePath);
    if (!fs.existsSync(sourceDir)) return;

    fs.readdirSync(sourceDir, { withFileTypes: true }).forEach(entry => {
        const source = path.join(sourceDir, entry.name);
        const target = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDir(path.join(relativePath, entry.name));
            return;
        }

        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
    });
}

function removeDir(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function assertNotCopied(relativePath) {
    const target = path.join(DIST_DIR, relativePath);
    if (fs.existsSync(target)) {
        throw new Error(`Sensitive file copied into dist: ${relativePath}`);
    }
}

removeDir(DIST_DIR);
fs.mkdirSync(DIST_DIR, { recursive: true });

rootFiles.forEach(copyFile);
assetDirs.forEach(copyDir);
selectedFiles.forEach(copyFile);

fs.writeFileSync(path.join(DIST_DIR, '.nojekyll'), '');

[
    '.env',
    'TELEGRAM.txt',
    'server.js',
    'supabase-setup.sql',
    'google-app-script.gs',
    'NOTIFICATIONS.md',
    'HOSTING.md',
    'tools',
    'data',
    'logs',
    'certs',
    '.git'
].forEach(assertNotCopied);

console.log(`GitHub Pages artifact built at ${DIST_DIR}`);
