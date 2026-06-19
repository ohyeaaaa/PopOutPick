(function syncPersistedCartBadge() {
    const storageKey = 'popoutpick.cart.v1';

    function getPersistedCartCount() {
        try {
            if (typeof localStorage === 'undefined') return 0;
            const raw = localStorage.getItem(storageKey);
            if (!raw) return 0;
            const parsed = JSON.parse(raw);
            const items = Array.isArray(parsed) ? parsed : parsed.items || [];
            return items.reduce((sum, item) => sum + Math.max(1, Number(item?.quantity) || 1), 0);
        } catch (error) {
            console.warn('Could not read saved cart count', error);
            return 0;
        }
    }

    function updateBadges() {
        const count = getPersistedCartCount();
        document.querySelectorAll('.cart-badge, #site-cart-count').forEach((badge) => {
            badge.textContent = count;
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateBadges);
    } else {
        updateBadges();
    }
})();
