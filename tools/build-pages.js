'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const rootFiles = [
    'Home.html',
    'configurator.html',
    'style.css',
    'script.js',
    'site-config.js',
    'header-controls.js',
    'cart-badge.js',
    'homepage-text.js'
];

const assetDirs = [
    'GLB',
    'Picture'
];

const assetDirExtensions = new Map([
    ['GLB', new Set(['.glb'])],
    ['Picture', new Set(['.gif', '.jpg', '.jpeg', '.mp4', '.png', '.svg', '.webp'])]
]);

const selectedFiles = [
    'PopOutPick_Website/guitar-icon.png',
    'PopOutPick_Website/bass-icon.png',
    'vendor/three-r128/three.min.js',
    'vendor/three-r128/GLTFLoader.js',
    'vendor/three-r128/OrbitControls.js',
    'vendor/supabase-js-2.108.2/supabase.js'
];

const forbiddenRootPaths = new Set([
    '.env',
    'TELEGRAM.txt',
    'admin',
    'hotcheeks',
    'server.js',
    'database/supabase-setup.sql',
    'integrations/google-app-script.gs',
    'PopOutPick-payment.html',
    'docs',
    'tools',
    'data',
    'logs',
    'certs',
    '.git'
]);

const forbiddenNames = new Set([
    '.env',
    '.git',
    'TELEGRAM.txt',
    'docs',
    'database',
    'admin',
    'hotcheeks',
    'integrations',
    'server.js',
    'supabase-setup.sql',
    'google-app-script.gs',
    'PopOutPick-payment.html',
    'admin.html'
]);

const forbiddenExtensions = new Set([
    '.crt',
    '.csr',
    '.key',
    '.pem',
    '.ps1',
    '.sql'
]);

function toPosixPath(relativePath) {
    return relativePath.split(path.sep).join('/');
}

function copyFile(relativePath) {
    const source = path.join(ROOT_DIR, relativePath);
    const target = path.join(DIST_DIR, relativePath);
    if (!fs.existsSync(source)) return;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

function copyDir(relativePath, targetRelativePath = relativePath, allowedExtensionsOverride = null) {
    const sourceDir = path.join(ROOT_DIR, relativePath);
    const targetDir = path.join(DIST_DIR, targetRelativePath);
    if (!fs.existsSync(sourceDir)) return;

    fs.readdirSync(sourceDir, { withFileTypes: true }).forEach(entry => {
        const source = path.join(sourceDir, entry.name);
        const target = path.join(targetDir, entry.name);
        const nextRelativePath = path.join(relativePath, entry.name);
        const nextTargetRelativePath = path.join(targetRelativePath, entry.name);
        const rootDir = nextRelativePath.split(path.sep)[0];

        if (entry.isDirectory()) {
            copyDir(nextRelativePath, nextTargetRelativePath, allowedExtensionsOverride);
            return;
        }

        const allowedExtensions = allowedExtensionsOverride || assetDirExtensions.get(rootDir);
        const extension = path.extname(entry.name).toLowerCase();
        if (allowedExtensions && !allowedExtensions.has(extension)) return;

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

function walkDist(relativePath = '') {
    const dir = path.join(DIST_DIR, relativePath);
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const childRelativePath = path.join(relativePath, entry.name);
        if (entry.isDirectory()) return [childRelativePath, ...walkDist(childRelativePath)];
        return [childRelativePath];
    });
}

function assertSafeDistArtifact() {
    forbiddenRootPaths.forEach(assertNotCopied);

    for (const relativePath of walkDist()) {
        const normalized = toPosixPath(relativePath);
        const parts = normalized.split('/');
        const extension = path.posix.extname(normalized).toLowerCase();

        if (parts.some(part => forbiddenNames.has(part)) || forbiddenExtensions.has(extension)) {
            throw new Error(`Forbidden artifact found in dist: ${normalized}`);
        }
    }
}

removeDir(DIST_DIR);
fs.mkdirSync(DIST_DIR, { recursive: true });

rootFiles.forEach(copyFile);
assetDirs.forEach(dir => copyDir(dir));
selectedFiles.forEach(copyFile);

const homepagePath = path.join(DIST_DIR, 'Home.html');
if (fs.existsSync(homepagePath)) {
    fs.copyFileSync(homepagePath, path.join(DIST_DIR, 'index.html'));
}

fs.writeFileSync(path.join(DIST_DIR, '.nojekyll'), '');

assertSafeDistArtifact();

console.log(`GitHub Pages artifact built at ${DIST_DIR}`);
