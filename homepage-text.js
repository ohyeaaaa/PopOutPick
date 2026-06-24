(function initHomepageText() {
    const APP_CONFIG = window.POPOUTPICK_CONFIG || {};
    const supabaseConfig = APP_CONFIG.commerce?.supabase || {};
    const quietOptionalWarnings = APP_CONFIG.commerce?.quietOptionalSupabaseWarnings !== false;

    function applyHomepageText(textMap) {
        if (!textMap || typeof textMap !== 'object') return;

        if (typeof textMap.document_title === 'string' && textMap.document_title.trim()) {
            document.title = textMap.document_title;
        }

        document.querySelectorAll('[data-home-text]').forEach(element => {
            const key = element.dataset.homeText;
            const value = textMap[key];
            if (typeof value !== 'string') return;
            element.textContent = value;
            if (element.dataset.homeTextMultiline === 'true') {
                element.style.whiteSpace = 'pre-line';
            }
        });
    }

    async function loadHomepageText() {
        if (!supabaseConfig.url || !supabaseConfig.anonKey || !window.supabase?.createClient) return;

        const client = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
        const { data, error } = await client.rpc('get_homepage_text');
        if (error) throw error;
        applyHomepageText(data);
    }

    loadHomepageText().catch(error => {
        if (quietOptionalWarnings) return;
        console.warn('Homepage text could not be loaded.', error);
    });
})();
