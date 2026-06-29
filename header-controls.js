(function initHeaderControls() {
    const config = window.POPOUTPICK_CONFIG || {};
    const contactConfig = config.contact || config.social || {};
    const telegramUrl = String(contactConfig.telegramUrl || contactConfig.telegram || '').trim();
    const searchItems = [
        { label: 'Home', href: 'Home.html', keywords: 'home brand intro' },
        { label: 'Shop', href: 'configurator.html#shop', keywords: 'shop replacement parts products' },
        { label: 'Customize', href: 'configurator.html', keywords: 'customize configurator build colors' },
        { label: 'Cart', href: 'configurator.html#checkout-box', keywords: 'cart checkout order payment' }
    ];

    function injectStyles() {
        if (document.getElementById('header-controls-styles')) return;
        const style = document.createElement('style');
        style.id = 'header-controls-styles';
        style.textContent = `
            .header-popover {
                position: absolute;
                top: calc(100% + 10px);
                right: 18px;
                width: min(320px, calc(100vw - 28px));
                z-index: 1200;
                border: 1px solid rgba(255, 255, 255, 0.14);
                border-radius: 10px;
                background: rgba(22, 17, 14, 0.96);
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.46);
                padding: 10px;
            }
            .header-popover[hidden] {
                display: none;
            }
            .header-menu-link,
            .header-search-result {
                display: block;
                border-radius: 8px;
                color: #f5f2f0;
                font-size: 14px;
                font-weight: 800;
                letter-spacing: 0;
                padding: 12px 14px;
                text-decoration: none;
                text-transform: uppercase;
            }
            .header-menu-link:hover,
            .header-menu-link:focus,
            .header-search-result:hover,
            .header-search-result:focus {
                background: rgba(226, 88, 34, 0.14);
                color: #ffffff;
                outline: none;
            }
            .header-search-input {
                width: 100%;
                border: 1px solid rgba(255, 255, 255, 0.16);
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.08);
                color: #ffffff;
                font-size: 15px;
                padding: 11px 12px;
                margin-bottom: 8px;
            }
            .header-search-empty {
                color: rgba(245, 242, 240, 0.7);
                font-size: 14px;
                padding: 12px;
            }
            @media (max-width: 760px) {
                .header-popover {
                    position: fixed;
                    top: 72px;
                    left: 14px;
                    right: 14px;
                    width: auto;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function navigateTo(href) {
        window.location.href = href;
    }

    function closePopover(popover, button) {
        if (!popover || popover.hidden) return;
        popover.hidden = true;
        if (button) button.setAttribute('aria-expanded', 'false');
    }

    function openPopover(popover, button) {
        if (!popover) return;
        document.querySelectorAll('.header-popover').forEach((panel) => {
            if (panel !== popover) {
                panel.hidden = true;
                const owner = document.querySelector(`[aria-controls="${panel.id}"]`);
                if (owner) owner.setAttribute('aria-expanded', 'false');
            }
        });
        popover.hidden = false;
        if (button) button.setAttribute('aria-expanded', 'true');
    }

    function togglePopover(popover, button) {
        if (!popover) return;
        if (popover.hidden) openPopover(popover, button);
        else closePopover(popover, button);
    }

    function buildMenuPanel(header, index) {
        const navLinks = Array.from(header.querySelectorAll('.header-nav a, .site-nav-links a'));
        if (!navLinks.length) return null;

        const panel = document.createElement('div');
        panel.id = `header-menu-panel-${index}`;
        panel.className = 'header-popover header-menu-panel';
        panel.hidden = true;
        panel.setAttribute('role', 'menu');

        navLinks.forEach((link) => {
            const item = document.createElement('a');
            item.className = 'header-menu-link';
            item.href = link.getAttribute('href') || '#';
            item.textContent = link.textContent.trim();
            item.setAttribute('role', 'menuitem');
            item.addEventListener('click', () => closePopover(panel, header.querySelector('[aria-controls="' + panel.id + '"]')));
            panel.appendChild(item);
        });

        header.appendChild(panel);
        return panel;
    }

    function scoreItem(item, query) {
        const haystack = `${item.label} ${item.keywords}`.toLowerCase();
        return haystack.includes(query);
    }

    function buildSearchPanel(header, index) {
        const panel = document.createElement('div');
        panel.id = `header-search-panel-${index}`;
        panel.className = 'header-popover header-search-panel';
        panel.hidden = true;

        const input = document.createElement('input');
        input.className = 'header-search-input';
        input.type = 'search';
        input.placeholder = 'Search pages';
        input.setAttribute('aria-label', 'Search pages');

        const results = document.createElement('div');
        panel.append(input, results);

        function renderResults() {
            const query = input.value.trim().toLowerCase();
            const matches = query ? searchItems.filter(item => scoreItem(item, query)) : searchItems;
            results.innerHTML = '';

            if (!matches.length) {
                const empty = document.createElement('div');
                empty.className = 'header-search-empty';
                empty.textContent = 'No matching page';
                results.appendChild(empty);
                return;
            }

            matches.forEach((item) => {
                const link = document.createElement('a');
                link.className = 'header-search-result';
                link.href = item.href;
                link.textContent = item.label;
                link.addEventListener('click', () => closePopover(panel, header.querySelector('[aria-controls="' + panel.id + '"]')));
                results.appendChild(link);
            });
        }

        input.addEventListener('input', renderResults);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                const first = results.querySelector('a');
                if (first) {
                    event.preventDefault();
                    navigateTo(first.href);
                }
            }
        });
        renderResults();

        header.appendChild(panel);
        return { panel, input };
    }

    function initHeader(header, index) {
        const menuButton = header.querySelector('.menu-btn, .icon-btn[aria-label="Menu"]');
        const searchButton = header.querySelector('.icon-btn[aria-label="Search"]');
        const telegramButton = header.querySelector('.icon-btn[aria-label="Telegram"]');

        const menuPanel = buildMenuPanel(header, index);
        if (menuButton && menuPanel) {
            menuButton.type = 'button';
            menuButton.setAttribute('aria-controls', menuPanel.id);
            menuButton.setAttribute('aria-expanded', 'false');
            menuButton.addEventListener('click', () => togglePopover(menuPanel, menuButton));
        }

        if (searchButton) {
            const searchPanel = buildSearchPanel(header, index);
            searchButton.type = 'button';
            searchButton.setAttribute('aria-controls', searchPanel.panel.id);
            searchButton.setAttribute('aria-expanded', 'false');
            searchButton.addEventListener('click', () => {
                togglePopover(searchPanel.panel, searchButton);
                if (!searchPanel.panel.hidden) setTimeout(() => searchPanel.input.focus(), 0);
            });
        }

        if (telegramButton) {
            telegramButton.type = 'button';
            telegramButton.setAttribute('aria-label', telegramUrl ? 'Telegram' : 'Add Telegram contact at checkout');
            telegramButton.addEventListener('click', () => {
                if (telegramUrl) {
                    window.open(telegramUrl, '_blank', 'noopener,noreferrer');
                    return;
                }
                navigateTo('configurator.html#checkout-box');
            });
        }
    }

    function closeOnOutsideClick(event) {
        if (event.target.closest('.site-header')) return;
        document.querySelectorAll('.header-popover').forEach((panel) => {
            closePopover(panel, document.querySelector(`[aria-controls="${panel.id}"]`));
        });
    }

    function closeOnEscape(event) {
        if (event.key !== 'Escape') return;
        document.querySelectorAll('.header-popover').forEach((panel) => {
            closePopover(panel, document.querySelector(`[aria-controls="${panel.id}"]`));
        });
    }

    function boot() {
        injectStyles();
        document.querySelectorAll('.site-header').forEach(initHeader);
        document.addEventListener('click', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
