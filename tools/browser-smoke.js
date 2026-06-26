'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = Number.parseInt(process.env.SMOKE_PORT || '8091', 10);
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;
const DEBUG_PORT = Number.parseInt(process.env.SMOKE_DEBUG_PORT || '9225', 10);
const PROFILE_DIR = path.join(ROOT_DIR, '.tmp-browser-smoke');
const cleanupAttempts = Number.parseInt(process.env.SMOKE_CLEANUP_ATTEMPTS || '10', 10);
const BROWSER_PATHS = [
    process.env.BROWSER_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
].filter(Boolean);

let commandId = 0;

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getBrowserPath() {
    const browserPath = BROWSER_PATHS.find(candidate => fs.existsSync(candidate));
    if (!browserPath) {
        throw new Error('No supported browser found. Set BROWSER_PATH to Edge or Chrome.');
    }
    return browserPath;
}

function fetchJson(url, method = 'GET') {
    return new Promise((resolve, reject) => {
        const req = http.request(url, { method }, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(error);
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function requestHealth() {
    return new Promise(resolve => {
        const req = http.get(`${BASE_URL}/healthz`, response => {
            response.resume();
            response.on('end', () => resolve(response.statusCode === 200));
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1_000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function waitForServer(serverProcess) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        if (await requestHealth()) return;
        if (serverProcess.exitCode !== null) {
            throw new Error(`Server exited before smoke test could run. Exit code: ${serverProcess.exitCode}`);
        }
        await wait(500);
    }
    throw new Error(`Server did not respond at ${BASE_URL}/healthz`);
}

function startServer() {
    const server = spawn(process.execPath, ['server.js'], {
        cwd: ROOT_DIR,
        env: {
            ...process.env,
            PORT: String(PORT),
            HOST,
            REQUIRE_HTTPS: process.env.SMOKE_REQUIRE_HTTPS || 'false',
            TRUST_PROXY: process.env.SMOKE_TRUST_PROXY || 'false'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    server.stdout.on('data', chunk => process.stdout.write(`[server] ${chunk}`));
    server.stderr.on('data', chunk => process.stderr.write(`[server] ${chunk}`));
    return server;
}

function startBrowser() {
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
    fs.mkdirSync(PROFILE_DIR, { recursive: true });

    return spawn(getBrowserPath(), [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${PROFILE_DIR}`,
        'about:blank'
    ], {
        cwd: ROOT_DIR,
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true
    });
}

function waitForExit(child, timeoutMs = 3_000) {
    if (!child || child.exitCode !== null) return Promise.resolve();
    return new Promise(resolve => {
        const timer = setTimeout(resolve, timeoutMs);
        child.once('exit', () => {
            clearTimeout(timer);
            resolve();
        });
    });
}

async function removeProfileDir() {
    let lastError = null;
    for (let attempt = 0; attempt < cleanupAttempts; attempt += 1) {
        try {
            fs.rmSync(PROFILE_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
            if (!fs.existsSync(PROFILE_DIR)) return;
        } catch (error) {
            lastError = error;
        }
        await wait(400);
    }
    throw new Error(`Could not remove ${PROFILE_DIR}${lastError ? `: ${lastError.message}` : ''}`);
}

async function createBrowserPageTarget() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        try {
            const target = await fetchJson(`http://${HOST}:${DEBUG_PORT}/json/new?about:blank`, 'PUT');
            if (target.webSocketDebuggerUrl) return target;
        } catch {
            // Retry while the browser opens the debugging endpoint.
        }
        await wait(300);
    }
    throw new Error('Could not create a browser page target.');
}

async function connectToBrowser() {
    const target = await createBrowserPageTarget();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', reject, { once: true });
    });

    const pending = new Map();
    const events = {
        console: [],
        exceptions: [],
        requestsFailed: [],
        dialogs: []
    };

    ws.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const { resolve, reject } = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) reject(new Error(JSON.stringify(message.error)));
            else resolve(message.result);
            return;
        }

        if (message.method === 'Runtime.consoleAPICalled') {
            events.console.push({
                type: message.params.type,
                text: message.params.args.map(arg => arg.value || arg.description || '').join(' ')
            });
            return;
        }

        if (message.method === 'Runtime.exceptionThrown') {
            const details = message.params.exceptionDetails;
            events.exceptions.push(details.exception?.description || details.text || 'Runtime exception');
            return;
        }

        if (message.method === 'Network.loadingFailed') {
            events.requestsFailed.push({
                url: message.params.requestId,
                errorText: message.params.errorText
            });
            return;
        }

        if (message.method === 'Page.javascriptDialogOpening') {
            events.dialogs.push(message.params.message || '');
        }
    });

    function send(method, params = {}) {
        const id = ++commandId;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
        });
    }

    return {
        events,
        send,
        close: () => ws.close()
    };
}

async function navigate(client, url) {
    const result = await client.send('Page.navigate', { url });
    if (result.errorText) {
        throw new Error(`Navigation failed for ${url}: ${result.errorText}`);
    }
    await wait(2_500);
}

async function runPage(client, scenario) {
    client.events.console.length = 0;
    client.events.exceptions.length = 0;
    client.events.requestsFailed.length = 0;
    client.events.dialogs.length = 0;

    await client.send('Emulation.setDeviceMetricsOverride', {
        width: scenario.width,
        height: scenario.height,
        deviceScaleFactor: 1,
        mobile: scenario.width < 700
    });

    await navigate(client, `${BASE_URL}${scenario.path}`);

    if (scenario.setup) {
        await client.send('Runtime.evaluate', {
            expression: scenario.setup,
            awaitPromise: true
        });
        await wait(750);
    }

    const evaluated = await client.send('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
            const doc = document.documentElement;
            const hasHorizontalBoundaryAncestor = element => {
                let parent = element.parentElement;
                while (parent && parent !== document.body) {
                    const style = getComputedStyle(parent);
                    const hasClippedX = ['hidden', 'clip'].includes(style.overflowX);
                    const canScrollX = ['auto', 'scroll'].includes(style.overflowX) && parent.scrollWidth > parent.clientWidth + 4;
                    if (hasClippedX || canScrollX) return true;
                    parent = parent.parentElement;
                }
                return false;
            };
            const measuredElements = Array.from(document.querySelectorAll('body *'))
                .filter(element => !hasHorizontalBoundaryAncestor(element))
                .map(element => {
                    const rect = element.getBoundingClientRect();
                    const style = getComputedStyle(element);
                    return {
                        tag: element.tagName.toLowerCase(),
                        id: element.id,
                        className: typeof element.className === 'string' ? element.className : '',
                        text: (element.innerText || element.alt || '').trim().slice(0, 70),
                        left: rect.left,
                        right: rect.right,
                        width: rect.width,
                        display: style.display,
                        visibility: style.visibility
                    };
                })
                .filter(entry => (
                    Number.isFinite(entry.right)
                    && entry.display !== 'none'
                    && entry.visibility !== 'hidden'
                    && entry.width > 0
                ));
            const maxRight = Math.max(doc.clientWidth, ...measuredElements.map(entry => entry.right));
            const overflowElements = measuredElements
                .map(entry => ({
                    ...entry,
                    overflowRight: Math.max(0, entry.right - doc.clientWidth),
                    overflowLeft: Math.max(0, -entry.left)
                }))
                .filter(entry => entry.overflowRight > 4 || entry.overflowLeft > 4)
                .sort((a, b) => Math.max(b.overflowRight, b.overflowLeft) - Math.max(a.overflowRight, a.overflowLeft))
                .slice(0, 8);
            const text = selector => document.querySelector(selector)?.innerText || '';
            const menuButton = document.querySelector('.menu-btn, .icon-btn[aria-label="Menu"]');
            const telegramButton = document.querySelector('.icon-btn[aria-label^="Telegram"], .icon-btn[aria-label^="Add Telegram"]');
            let mobileMenuLinkCount = 0;
            if (menuButton && window.innerWidth < 700) {
                menuButton.click();
                const panel = document.getElementById(menuButton.getAttribute('aria-controls'));
                mobileMenuLinkCount = panel && !panel.hidden ? panel.querySelectorAll('a').length : 0;
                menuButton.click();
            }
            return {
                title: document.title,
                h1: document.querySelector('h1')?.innerText || '',
                clientWidth: doc.clientWidth,
                scrollWidth: doc.scrollWidth,
                overflow: Math.max(0, maxRight - doc.clientWidth),
                overflowElements,
                hero: Boolean(document.querySelector('.glb-grid-wrapper') && document.querySelector('[data-home-text="hero_card_title"]')),
                proof: Boolean(document.querySelector('.product-proof')),
                checkout: Boolean(document.querySelector('#checkout-box')),
                trustCards: document.querySelectorAll('.checkout-trust-card > div').length,
                success: Boolean(document.querySelector('.checkout-success-panel')),
                checkoutPreviewCanvases: document.querySelectorAll('[data-checkout-preview-index] canvas').length,
                activeCheckoutPreviewCanvases: document.querySelectorAll('.checkout-screen.active [data-checkout-preview-index] canvas').length,
                finalReview: {
                    active: Boolean(document.querySelector('#step-8.active')),
                    canvas: Boolean(document.querySelector('#final-assembly-viewport canvas')),
                    assemblyChildren: typeof assemblyGroup !== 'undefined' && assemblyGroup?.children
                        ? assemblyGroup.children.length
                        : 0,
                    text: text('#step-8').slice(0, 160)
                },
                headerControls: {
                    menu: Boolean(menuButton?.getAttribute('aria-controls')),
                    telegram: Boolean(telegramButton),
                    mobileMenuLinkCount
                },
                cartText: text('#checkout-box').slice(0, 400),
                bodyText: document.body.innerText.slice(0, 400)
            };
        })()`
    });

    return {
        name: scenario.name,
        path: scenario.path,
        viewport: `${scenario.width}x${scenario.height}`,
        metrics: evaluated.result.value,
        console: client.events.console.filter(entry => ['error', 'warning'].includes(entry.type)),
        exceptions: [...client.events.exceptions],
        dialogs: [...client.events.dialogs]
    };
}

function assertResult(result) {
    const problems = [];
    if (result.exceptions.length) problems.push(`exceptions: ${result.exceptions.join(' | ')}`);
    if (result.dialogs.length) problems.push(`dialogs: ${result.dialogs.join(' | ')}`);
    if (result.console.some(entry => entry.type === 'error')) {
        problems.push(`console errors: ${result.console.map(entry => entry.text).join(' | ')}`);
    }
    if (result.metrics.overflow > 4 || result.metrics.scrollWidth - result.metrics.clientWidth > 4) {
        problems.push(`horizontal overflow: ${JSON.stringify({
            overflow: result.metrics.overflow,
            scrollWidth: result.metrics.scrollWidth,
            clientWidth: result.metrics.clientWidth
        })}`);
    }
    if (result.path === '/' && (!result.metrics.hero || !result.metrics.proof)) {
        problems.push('homepage hero/product-proof sections missing');
    }
    if (result.name.includes('checkout') && result.metrics.trustCards < 3) {
        problems.push('checkout trust cards did not render');
    }
    if ((result.name.includes('checkout') || result.name.includes('payment order')) && result.metrics.activeCheckoutPreviewCanvases < 1) {
        problems.push('active checkout configured preview canvas did not render');
    }
    if (result.name.includes('final review')) {
        if (!result.metrics.finalReview?.active || !result.metrics.finalReview?.canvas) {
            problems.push('final review preview did not render');
        }
        if (result.metrics.finalReview?.assemblyChildren < 2) {
            problems.push(`final review assembly did not load enough objects: ${result.metrics.finalReview?.assemblyChildren}`);
        }
    }
    if (!result.metrics.headerControls?.menu || !result.metrics.headerControls?.telegram) {
        problems.push('header controls are not wired');
    }
    if (result.viewport.startsWith('390x') && result.metrics.headerControls.mobileMenuLinkCount < 4) {
        problems.push('mobile menu did not expose navigation links');
    }

    return problems;
}

async function cleanup(processes) {
    for (const child of processes) {
        if (child && child.exitCode === null) child.kill('SIGTERM');
    }
    await Promise.all(processes.map(child => waitForExit(child, 2_000)));
    for (const child of processes) {
        if (child && child.exitCode === null) child.kill('SIGKILL');
    }
    await Promise.all(processes.map(child => waitForExit(child, 1_000)));
    await removeProfileDir();
}

async function main() {
    let server = null;
    let browser = null;

    try {
        server = startServer();
        browser = startBrowser();
        await waitForServer(server);
        const client = await connectToBrowser();
        try {
            await client.send('Page.enable');
            await client.send('Runtime.enable');
            await client.send('Network.enable');

            const setupCheckout = `(async () => {
                const snapshot = JSON.parse(JSON.stringify(defaultSelections));
                snapshot.type = 'guitar';
                snapshot.body = '#e25822';
                snapshot.module = '#111111';
                snapshot.slider = '#ffffff';
                snapshot.top = '#e25822';
                snapshot.bottom = '#111111';
                snapshot.holders = [
                    { c1: '#ffffff', c2: '#111111', t: '10mm' },
                    { c1: '#e25822', c2: '#ffffff', t: '8mm' },
                    { c1: '#111111', c2: '#ffffff', t: '7mm' },
                    { c1: '#ffffff', c2: '#e25822', t: '6mm' }
                ];
                checkoutState.cartItems = [{
                    id: 'smoke-1',
                    type: 'configured-design',
                    productId: 'custom-popoutpick',
                    name: 'Smoke Custom PopOutPick',
                    description: 'Browser smoke configured item',
                    unitPrice: 10,
                    quantity: 1,
                    selections: snapshot
                }];
                checkoutState.started = true;
                checkoutState.addedToCart = false;
                checkoutState.screen = 'cart';
                checkoutState.fulfilment = 'meetup';
                buildCheckout();
                await new Promise(resolve => setTimeout(resolve, 3000));
            })()`;

            const setupPayment = `(async () => {
                const snapshot = JSON.parse(JSON.stringify(defaultSelections));
                snapshot.type = 'guitar';
                snapshot.body = '#e25822';
                snapshot.module = '#111111';
                snapshot.slider = '#ffffff';
                snapshot.top = '#e25822';
                snapshot.bottom = '#111111';
                snapshot.holders = [
                    { c1: '#ffffff', c2: '#111111', t: '10mm' },
                    { c1: '#e25822', c2: '#ffffff', t: '8mm' },
                    { c1: '#111111', c2: '#ffffff', t: '7mm' },
                    { c1: '#ffffff', c2: '#e25822', t: '6mm' }
                ];
                checkoutState.cartItems = [{
                    id: 'smoke-1',
                    type: 'configured-design',
                    productId: 'custom-popoutpick',
                    name: 'Smoke Custom PopOutPick',
                    description: 'Browser smoke configured item',
                    unitPrice: 10,
                    quantity: 1,
                    selections: snapshot
                }];
                checkoutState.started = true;
                checkoutState.addedToCart = false;
                checkoutState.screen = 'payment';
                checkoutState.fulfilment = 'meetup';
                checkoutState.selectedLocation = 'pasir-ris';
                checkoutState.selectedDate = '30 Jun';
                checkoutState.selectedTime = '10:00 AM';
                buildCheckout();
                await new Promise(resolve => setTimeout(resolve, 3000));
            })()`;

            const setupFinalReview = `(async () => {
                activeView = 'customizer';
                currentStep = 8;
                selections.type = 'guitar';
                selections.body = '#e25822';
                selections.module = '#111111';
                selections.slider = '#ffffff';
                selections.top = '#e25822';
                selections.bottom = '#111111';
                selections.holders = [
                    { c1: '#ffffff', c2: '#111111', t: '10mm' },
                    { c1: '#e25822', c2: '#ffffff', t: '8mm' },
                    { c1: '#111111', c2: '#ffffff', t: '7mm' },
                    { c1: '#ffffff', c2: '#e25822', t: '6mm' }
                ];
                render();
                await new Promise(resolve => setTimeout(resolve, 3000));
            })()`;

            const scenarios = [
                { name: 'home desktop', path: '/', width: 1366, height: 900 },
                { name: 'home mobile', path: '/', width: 390, height: 844 },
                { name: 'final review desktop', path: '/configurator.html', width: 1366, height: 900, setup: setupFinalReview },
                { name: 'checkout desktop', path: '/configurator.html', width: 1366, height: 900, setup: setupCheckout },
                { name: 'checkout mobile', path: '/configurator.html', width: 390, height: 844, setup: setupCheckout },
                { name: 'payment order desktop', path: '/configurator.html', width: 1366, height: 900, setup: setupPayment }
            ];

            const results = [];
            for (const scenario of scenarios) {
                results.push(await runPage(client, scenario));
            }

            const failures = results.flatMap(result => (
                assertResult(result).map(problem => `${result.name}: ${problem}`)
            ));

            console.log(JSON.stringify(results, null, 2));

            if (failures.length) {
                console.error(`Browser smoke failed:\n${failures.join('\n')}`);
                process.exitCode = 1;
            }
        } finally {
            client.close();
        }
    } finally {
        await cleanup([browser, server]);
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
