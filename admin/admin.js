(function initPopOutPickAdmin() {
    const APP_CONFIG = window.POPOUTPICK_CONFIG || {};
    const commerceConfig = APP_CONFIG.commerce || {};
    const supabaseConfig = commerceConfig.supabase || {};
    const backendAdminApiBaseUrl = String(commerceConfig.backendAdminApiBaseUrl || '').replace(/\/+$/, '');
    const dayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const locations = [
        { id: '', name: 'All locations' },
        ...(commerceConfig.meetupLocations || [])
    ];

    let client = null;
    let currentUser = null;
    let orders = [];
    let orderFiles = [];
    let signedFileUrls = {};
    let selectedOrderId = '';
    let homepageText = [];
    let promos = [];
    let slots = [];
    let blockedDates = [];

    const loginPanel = document.getElementById('admin-login-panel');
    const dashboard = document.getElementById('admin-dashboard');
    const loginForm = document.getElementById('admin-login-form');
    const signOutButton = document.getElementById('admin-signout');
    const refreshButton = document.getElementById('admin-refresh');
    const exportJsonButton = document.getElementById('admin-export-json');
    const exportCsvButton = document.getElementById('admin-export-csv');
    const runPreflightButton = document.getElementById('admin-run-preflight');
    const testNotificationButton = document.getElementById('admin-test-notification');
    const testFileNotificationButton = document.getElementById('admin-test-file-notification');
    const orderSearchInput = document.getElementById('order-search');
    const orderStatusFilter = document.getElementById('order-status-filter');
    const loginStatus = document.getElementById('admin-login-status');
    const adminStatus = document.getElementById('admin-status');
    const sessionLabel = document.getElementById('admin-session-label');
    const orderStatusOptions = ['new', 'paid', 'in_progress', 'ready', 'completed', 'cancelled'];

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[char]);
    }

    function setStatus(element, message = '', phase = '') {
        if (!element) return;
        element.textContent = message;
        element.classList.toggle('is-error', phase === 'error');
        element.classList.toggle('is-success', phase === 'success');
    }

    function getRequiredClient() {
        if (!client) throw new Error('Supabase is not configured.');
        return client;
    }

    function normalizeCode(code) {
        return String(code || '').trim().toUpperCase();
    }

    function formatMoney(value) {
        const amount = Number(value) || 0;
        return `$${amount.toFixed(2)}`;
    }

    function formatDateTime(value) {
        if (!value) return '';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
    }

    function compactId(value) {
        const id = String(value || '');
        return id.length > 34 ? `${id.slice(0, 22)}...${id.slice(-8)}` : id;
    }

    function getOrderTotal(order) {
        return Number(order?.totals?.total) || 0;
    }

    function getOrderFiles(orderId) {
        return orderFiles.filter(file => file.order_id === orderId);
    }

    function getFileKey(file) {
        return `${file.bucket || ''}/${file.storage_path || ''}`;
    }

    function getOrderSearchText(order) {
        return [
            order.id,
            order.customer_name,
            order.customer_email,
            order.customer_phone,
            order.customer_telegram,
            order.fulfilment,
            order.status
        ].join(' ').toLowerCase();
    }

    function toDatetimeLocalValue(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const offsetMs = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
    }

    function fromDatetimeLocalValue(value) {
        return value ? new Date(value).toISOString() : null;
    }

    function renderLocationOptions(select, includeAll = false) {
        const source = includeAll ? locations : locations.filter(location => location.id);
        select.innerHTML = source.map(location => (
            `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`
        )).join('');
    }

    function renderDayOptions(select) {
        select.innerHTML = dayLabels.map((label, index) => (
            `<option value="${index}">${escapeHtml(label)}</option>`
        )).join('');
    }

    function initStaticControls() {
        renderLocationOptions(document.getElementById('slot-location'));
        renderLocationOptions(document.getElementById('blocked-location'), true);
        renderDayOptions(document.getElementById('slot-day'));
        const backendOnlyButtons = [runPreflightButton, testNotificationButton, testFileNotificationButton];
        backendOnlyButtons.forEach(button => {
            if (!button || backendAdminApiBaseUrl) return;
            button.hidden = true;
            button.disabled = true;
        });
    }

    async function requireAdmin() {
        const { data: userData, error: userError } = await getRequiredClient().auth.getUser();
        if (userError) throw userError;
        currentUser = userData.user;
        if (!currentUser) return false;

        const { data, error } = await getRequiredClient()
            .from('admin_users')
            .select('user_id')
            .eq('user_id', currentUser.id)
            .maybeSingle();
        if (error) throw error;
        return Boolean(data);
    }

    async function showDashboard() {
        const isAdmin = await requireAdmin();
        if (!isAdmin) {
            await getRequiredClient().auth.signOut();
            currentUser = null;
            loginPanel.classList.remove('is-hidden');
            dashboard.classList.add('is-hidden');
            setStatus(loginStatus, 'Signed in user is not an admin. Add the user UUID to public.admin_users.', 'error');
            return;
        }

        sessionLabel.textContent = `Signed in as ${currentUser.email}`;
        loginPanel.classList.add('is-hidden');
        dashboard.classList.remove('is-hidden');
        await loadAdminData();
    }

    async function loadAdminData() {
        setStatus(adminStatus, 'Loading settings...');
        const [ordersResult, filesResult, homepageTextResult, promoResult, slotResult, blockedResult] = await Promise.all([
            getRequiredClient()
                .from('orders')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(200),
            getRequiredClient()
                .from('order_files')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1000),
            getRequiredClient()
                .from('homepage_text')
                .select('*')
                .order('sort_order', { ascending: true }),
            getRequiredClient()
                .from('checkout_promo_codes')
                .select('*')
                .order('created_at', { ascending: false }),
            getRequiredClient()
                .from('checkout_time_slots')
                .select('*')
                .order('location_id', { ascending: true })
                .order('day_of_week', { ascending: true })
                .order('sort_order', { ascending: true }),
            getRequiredClient()
                .from('checkout_blocked_dates')
                .select('*')
                .order('blocked_date', { ascending: false })
        ]);

        if (ordersResult.error) throw ordersResult.error;
        if (filesResult.error) throw filesResult.error;
        if (homepageTextResult.error) throw homepageTextResult.error;
        if (promoResult.error) throw promoResult.error;
        if (slotResult.error) throw slotResult.error;
        if (blockedResult.error) throw blockedResult.error;

        orders = ordersResult.data || [];
        orderFiles = filesResult.data || [];
        homepageText = homepageTextResult.data || [];
        promos = promoResult.data || [];
        slots = slotResult.data || [];
        blockedDates = blockedResult.data || [];

        if (selectedOrderId && !orders.some(order => order.id === selectedOrderId)) {
            selectedOrderId = '';
        }

        renderOrdersTable();
        renderOrderDetail();
        renderHomepageTextTable();
        renderPromoTable();
        renderSlotTable();
        renderBlockedTable();
        setStatus(adminStatus, 'Settings loaded.', 'success');
    }

    function getFilteredOrders() {
        const query = String(orderSearchInput?.value || '').trim().toLowerCase();
        const status = String(orderStatusFilter?.value || '');
        return orders.filter(order => {
            if (status && order.status !== status) return false;
            if (query && !getOrderSearchText(order).includes(query)) return false;
            return true;
        });
    }

    function renderOrdersTable() {
        const body = document.getElementById('orders-table-body');
        const filteredOrders = getFilteredOrders();

        if (!filteredOrders.length) {
            body.innerHTML = '<tr><td colspan="6">No orders found.</td></tr>';
            return;
        }

        body.innerHTML = filteredOrders.map(order => {
            const fileCount = getOrderFiles(order.id).length;
            return `<tr class="${selectedOrderId === order.id ? 'is-selected' : ''}">
                <td>
                    <strong>${escapeHtml(compactId(order.id))}</strong>
                    <span class="admin-key-label">${escapeHtml(formatDateTime(order.created_at))}</span>
                    ${fileCount ? `<span class="admin-key-label">${fileCount} upload${fileCount === 1 ? '' : 's'}</span>` : ''}
                </td>
                <td>
                    <strong>${escapeHtml(order.customer_name)}</strong>
                    <span class="admin-key-label">${escapeHtml(order.customer_email || '')}</span>
                    <span class="admin-key-label">${escapeHtml(order.customer_telegram || order.customer_phone || '')}</span>
                </td>
                <td>${escapeHtml(order.fulfilment || '')}</td>
                <td><strong>${escapeHtml(formatMoney(getOrderTotal(order)))}</strong></td>
                <td><span class="admin-pill ${order.status === 'new' ? 'is-active' : ''}">${escapeHtml(order.status || 'new')}</span></td>
                <td><div class="admin-table-actions">
                    <button class="admin-small-button" type="button" data-view-order="${escapeHtml(order.id)}">View</button>
                </div></td>
            </tr>`;
        }).join('');
    }

    function renderOrderDetail() {
        const container = document.getElementById('order-detail');
        const order = orders.find(item => item.id === selectedOrderId);
        if (!order) {
            container.innerHTML = '<p class="admin-muted">Select an order to review details.</p>';
            return;
        }

        const files = getOrderFiles(order.id);
        const items = Array.isArray(order.items) ? order.items : [];
        const meetup = order.meetup || {};
        const delivery = order.delivery || {};
        const fulfilmentDetails = order.fulfilment === 'delivery'
            ? [delivery.address1, delivery.address2, delivery.postal].filter(Boolean).join(', ')
            : [meetup.date, meetup.time, meetup.location].filter(Boolean).join(' - ');

        container.innerHTML = `<div class="admin-detail-header">
            <div>
                <h3>${escapeHtml(order.id)}</h3>
                <p>${escapeHtml(formatDateTime(order.created_at))}</p>
            </div>
            <label>Status
                <select id="selected-order-status">
                    ${orderStatusOptions.map(status => `<option value="${status}" ${order.status === status ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('')}
                </select>
            </label>
            <button class="admin-primary-button" type="button" data-save-order-status="${escapeHtml(order.id)}">Save Status</button>
        </div>
        <div class="admin-detail-grid">
            <div><strong>Customer</strong><span>${escapeHtml(order.customer_name || '')}</span><span>${escapeHtml(order.customer_email || '')}</span><span>${escapeHtml(order.customer_phone || '')}</span><span>${escapeHtml(order.customer_telegram || '')}</span></div>
            <div><strong>Fulfilment</strong><span>${escapeHtml(order.fulfilment || '')}</span><span>${escapeHtml(fulfilmentDetails || '')}</span></div>
            <div><strong>Payment</strong><span>${escapeHtml(order.payment?.method || '')}</span><span>${escapeHtml(order.payment?.status || '')}</span><span>${escapeHtml(formatMoney(getOrderTotal(order)))}</span></div>
        </div>
        <h4>Items</h4>
        <div class="admin-order-items">
            ${items.map(item => `<div>
                <strong>${escapeHtml(item.name || item.id || 'Item')}</strong>
                <span>${escapeHtml(item.description || '')}</span>
                <span>Qty ${escapeHtml(item.quantity || 1)} - ${escapeHtml(formatMoney(item.lineTotal || item.unitPrice || 0))}</span>
            </div>`).join('') || '<p class="admin-muted">No item data saved.</p>'}
        </div>
        <h4>Uploads</h4>
        <div class="admin-order-items">
            ${files.map(file => `<div>
                <strong>${escapeHtml(file.file_role || 'file')}</strong>
                <span>${escapeHtml(file.bucket || '')}/${escapeHtml(file.storage_path || '')}</span>
                <span>${escapeHtml(file.original_name || '')} ${file.size_bytes ? `- ${escapeHtml(file.size_bytes)} bytes` : ''}</span>
                ${signedFileUrls[getFileKey(file)] ? `<a class="admin-file-link" href="${escapeHtml(signedFileUrls[getFileKey(file)])}" target="_blank" rel="noopener noreferrer">Open file</a>` : ''}
            </div>`).join('') || '<p class="admin-muted">No uploaded files recorded.</p>'}
        </div>`;
    }

    async function loadSignedFileUrls(orderId) {
        const files = getOrderFiles(orderId);
        const nextUrls = { ...signedFileUrls };

        await Promise.all(files.map(async file => {
            if (!file.bucket || !file.storage_path) return;
            const key = getFileKey(file);
            if (nextUrls[key]) return;

            const { data, error } = await getRequiredClient()
                .storage
                .from(file.bucket)
                .createSignedUrl(file.storage_path, 60 * 10);
            if (!error && data?.signedUrl) {
                nextUrls[key] = data.signedUrl;
            }
        }));

        signedFileUrls = nextUrls;
    }

    function renderHomepageTextTable() {
        const body = document.getElementById('homepage-text-table-body');
        body.innerHTML = homepageText.map(item => {
            const rows = item.multiline ? 5 : 2;
            return `<tr>
                <td>
                    <strong>${escapeHtml(item.label)}</strong>
                    <span class="admin-key-label">${escapeHtml(item.key)}</span>
                </td>
                <td>
                    <textarea class="admin-textarea" rows="${rows}" data-homepage-text-value="${escapeHtml(item.key)}">${escapeHtml(item.value)}</textarea>
                </td>
                <td><div class="admin-table-actions">
                    <button class="admin-small-button" type="button" data-save-homepage-text="${escapeHtml(item.key)}">Save</button>
                </div></td>
            </tr>`;
        }).join('');
    }

    function renderPromoTable() {
        const body = document.getElementById('promo-table-body');
        body.innerHTML = promos.map(promo => {
            const discount = promo.discount_type === 'percent'
                ? `${Number(promo.discount_value)}%`
                : `$${Number(promo.discount_value).toFixed(2)}`;
            const windowText = [promo.starts_at, promo.ends_at]
                .filter(Boolean)
                .map(value => new Date(value).toLocaleString())
                .join(' to ') || 'Always';
            return `<tr>
                <td><strong>${escapeHtml(promo.code)}</strong></td>
                <td>${escapeHtml(promo.label)}</td>
                <td>${escapeHtml(discount)}</td>
                <td><span class="admin-pill ${promo.active ? 'is-active' : 'is-inactive'}">${promo.active ? 'Active' : 'Inactive'}</span></td>
                <td>${escapeHtml(windowText)}</td>
                <td><div class="admin-table-actions">
                    <button class="admin-small-button" type="button" data-edit-promo="${promo.id}">Edit</button>
                    <button class="admin-small-button admin-danger-button" type="button" data-delete-promo="${promo.id}">Delete</button>
                </div></td>
            </tr>`;
        }).join('');
    }

    function renderSlotTable() {
        const body = document.getElementById('slot-table-body');
        body.innerHTML = slots.map(slot => `<tr>
            <td>${escapeHtml(getLocationName(slot.location_id))}</td>
            <td>${escapeHtml(dayLabels[slot.day_of_week] || slot.day_of_week)}</td>
            <td><strong>${escapeHtml(slot.time_label)}</strong></td>
            <td><span class="admin-pill ${slot.active ? 'is-active' : 'is-inactive'}">${slot.active ? 'Active' : 'Inactive'}</span></td>
            <td><div class="admin-table-actions">
                <button class="admin-small-button" type="button" data-edit-slot="${slot.id}">Edit</button>
                <button class="admin-small-button admin-danger-button" type="button" data-delete-slot="${slot.id}">Delete</button>
            </div></td>
        </tr>`).join('');
    }

    function renderBlockedTable() {
        const body = document.getElementById('blocked-table-body');
        body.innerHTML = blockedDates.map(blocked => `<tr>
            <td>${escapeHtml(blocked.location_id ? getLocationName(blocked.location_id) : 'All locations')}</td>
            <td><strong>${escapeHtml(blocked.blocked_date)}</strong></td>
            <td>${escapeHtml(blocked.reason || '')}</td>
            <td><span class="admin-pill ${blocked.active ? 'is-active' : 'is-inactive'}">${blocked.active ? 'Active' : 'Inactive'}</span></td>
            <td><div class="admin-table-actions">
                <button class="admin-small-button" type="button" data-edit-blocked="${blocked.id}">Edit</button>
                <button class="admin-small-button admin-danger-button" type="button" data-delete-blocked="${blocked.id}">Delete</button>
            </div></td>
        </tr>`).join('');
    }

    function getLocationName(id) {
        return (locations.find(location => location.id === id) || { name: id }).name;
    }

    async function savePromo(event) {
        event.preventDefault();
        const id = document.getElementById('promo-id').value;
        const payload = {
            code: normalizeCode(document.getElementById('promo-code').value),
            label: document.getElementById('promo-label').value.trim(),
            discount_type: document.getElementById('promo-type').value,
            discount_value: Number(document.getElementById('promo-value').value),
            starts_at: fromDatetimeLocalValue(document.getElementById('promo-starts').value),
            ends_at: fromDatetimeLocalValue(document.getElementById('promo-ends').value),
            active: document.getElementById('promo-active').checked,
            updated_at: new Date().toISOString()
        };

        if (!payload.code || !payload.label || !Number.isFinite(payload.discount_value)) {
            setStatus(adminStatus, 'Promo code, label, and value are required.', 'error');
            return;
        }

        const query = id
            ? getRequiredClient().from('checkout_promo_codes').update(payload).eq('id', id)
            : getRequiredClient().from('checkout_promo_codes').insert(payload);
        const { error } = await query;
        if (error) throw error;
        resetPromoForm();
        await loadAdminData();
    }

    async function saveSlot(event) {
        event.preventDefault();
        const id = document.getElementById('slot-id').value;
        const payload = {
            location_id: document.getElementById('slot-location').value,
            day_of_week: Number(document.getElementById('slot-day').value),
            time_label: document.getElementById('slot-time').value.trim(),
            sort_order: Number(document.getElementById('slot-sort').value) || 0,
            active: document.getElementById('slot-active').checked,
            updated_at: new Date().toISOString()
        };

        if (!payload.location_id || !payload.time_label) {
            setStatus(adminStatus, 'Location and time are required.', 'error');
            return;
        }

        const query = id
            ? getRequiredClient().from('checkout_time_slots').update(payload).eq('id', id)
            : getRequiredClient().from('checkout_time_slots').insert(payload);
        const { error } = await query;
        if (error) throw error;
        resetSlotForm();
        await loadAdminData();
    }

    async function saveBlockedDate(event) {
        event.preventDefault();
        const id = document.getElementById('blocked-id').value;
        const payload = {
            location_id: document.getElementById('blocked-location').value || null,
            blocked_date: document.getElementById('blocked-date').value,
            reason: document.getElementById('blocked-reason').value.trim() || null,
            active: document.getElementById('blocked-active').checked,
            updated_at: new Date().toISOString()
        };

        if (!payload.blocked_date) {
            setStatus(adminStatus, 'Blocked date is required.', 'error');
            return;
        }

        const query = id
            ? getRequiredClient().from('checkout_blocked_dates').update(payload).eq('id', id)
            : getRequiredClient().from('checkout_blocked_dates').insert(payload);
        const { error } = await query;
        if (error) throw error;
        resetBlockedForm();
        await loadAdminData();
    }

    async function saveHomepageText(key) {
        const textarea = Array.from(document.querySelectorAll('[data-homepage-text-value]'))
            .find(element => element.dataset.homepageTextValue === key);
        if (!(textarea instanceof HTMLTextAreaElement)) return;

        const { error } = await getRequiredClient()
            .from('homepage_text')
            .update({
                value: textarea.value,
                updated_at: new Date().toISOString()
            })
            .eq('key', key);

        if (error) throw error;
        setStatus(adminStatus, 'Homepage text saved.', 'success');
        await loadAdminData();
    }

    async function saveOrderStatus(orderId) {
        const select = document.getElementById('selected-order-status');
        if (!(select instanceof HTMLSelectElement)) return;
        if (!orderStatusOptions.includes(select.value)) {
            setStatus(adminStatus, 'Invalid order status.', 'error');
            return;
        }

        const { error } = await getRequiredClient()
            .from('orders')
            .update({ status: select.value })
            .eq('id', orderId);
        if (error) throw error;
        setStatus(adminStatus, 'Order status saved.', 'success');
        await loadAdminData();
    }

    function downloadFile(filename, content, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function csvCell(value) {
        const text = String(value ?? '');
        const safeText = /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
        return `"${safeText.replace(/"/g, '""')}"`;
    }

    function exportOrdersCsv() {
        const rows = [
            ['order_id', 'created_at', 'status', 'customer_name', 'email', 'phone', 'telegram', 'fulfilment', 'total', 'promo_code', 'upload_count'],
            ...getFilteredOrders().map(order => [
                order.id,
                order.created_at,
                order.status,
                order.customer_name,
                order.customer_email,
                order.customer_phone,
                order.customer_telegram,
                order.fulfilment,
                getOrderTotal(order),
                order.totals?.promoCode || '',
                getOrderFiles(order.id).length
            ])
        ];
        downloadFile(`popoutpick-orders-${new Date().toISOString().slice(0, 10)}.csv`, rows.map(row => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
    }

    function exportAdminJson() {
        const payload = {
            exportedAt: new Date().toISOString(),
            orders,
            orderFiles,
            homepageText,
            promos,
            slots,
            blockedDates
        };
        downloadFile(`popoutpick-admin-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    }

    function editPromo(id) {
        const promo = promos.find(item => item.id === id);
        if (!promo) return;
        document.getElementById('promo-id').value = promo.id;
        document.getElementById('promo-code').value = promo.code;
        document.getElementById('promo-label').value = promo.label;
        document.getElementById('promo-type').value = promo.discount_type;
        document.getElementById('promo-value').value = promo.discount_value;
        document.getElementById('promo-starts').value = toDatetimeLocalValue(promo.starts_at);
        document.getElementById('promo-ends').value = toDatetimeLocalValue(promo.ends_at);
        document.getElementById('promo-active').checked = promo.active;
    }

    function editSlot(id) {
        const slot = slots.find(item => String(item.id) === String(id));
        if (!slot) return;
        document.getElementById('slot-id').value = slot.id;
        document.getElementById('slot-location').value = slot.location_id;
        document.getElementById('slot-day').value = slot.day_of_week;
        document.getElementById('slot-time').value = slot.time_label;
        document.getElementById('slot-sort').value = slot.sort_order;
        document.getElementById('slot-active').checked = slot.active;
    }

    function editBlockedDate(id) {
        const blocked = blockedDates.find(item => String(item.id) === String(id));
        if (!blocked) return;
        document.getElementById('blocked-id').value = blocked.id;
        document.getElementById('blocked-location').value = blocked.location_id || '';
        document.getElementById('blocked-date').value = blocked.blocked_date;
        document.getElementById('blocked-reason').value = blocked.reason || '';
        document.getElementById('blocked-active').checked = blocked.active;
    }

    async function deleteRow(table, id) {
        if (!window.confirm('Delete this setting?')) return;
        const { error } = await getRequiredClient().from(table).delete().eq('id', id);
        if (error) throw error;
        await loadAdminData();
    }

    function resetPromoForm() {
        document.getElementById('promo-form').reset();
        document.getElementById('promo-id').value = '';
        document.getElementById('promo-active').checked = true;
    }

    function resetSlotForm() {
        document.getElementById('slot-form').reset();
        document.getElementById('slot-id').value = '';
        document.getElementById('slot-active').checked = true;
    }

    function resetBlockedForm() {
        document.getElementById('blocked-form').reset();
        document.getElementById('blocked-id').value = '';
        document.getElementById('blocked-active').checked = true;
    }

    async function handleAsync(action) {
        try {
            await action();
        } catch (error) {
            console.error(error);
            setStatus(adminStatus, error.message || String(error), 'error');
        }
    }

    function bindEvents() {
        loginForm.addEventListener('submit', event => handleAsync(async () => {
            event.preventDefault();
            setStatus(loginStatus, 'Signing in...');
            const { error } = await getRequiredClient().auth.signInWithPassword({
                email: document.getElementById('admin-email').value.trim(),
                password: document.getElementById('admin-password').value
            });
            if (error) throw error;
            setStatus(loginStatus, '');
            await showDashboard();
        }));

        signOutButton.addEventListener('click', () => handleAsync(async () => {
            await getRequiredClient().auth.signOut();
            currentUser = null;
            dashboard.classList.add('is-hidden');
            loginPanel.classList.remove('is-hidden');
            setStatus(loginStatus, 'Signed out.', 'success');
        }));

        refreshButton.addEventListener('click', () => handleAsync(loadAdminData));
        exportJsonButton.addEventListener('click', exportAdminJson);
        exportCsvButton.addEventListener('click', exportOrdersCsv);
        runPreflightButton.addEventListener('click', () => {
            if (!backendAdminApiBaseUrl) return;
            window.open(`${backendAdminApiBaseUrl}/api/admin/preflight`, '_blank', 'noopener,noreferrer');
        });
        testNotificationButton.addEventListener('click', () => handleAsync(async () => {
            if (!backendAdminApiBaseUrl) return;
            setStatus(adminStatus, 'Sending test notification...');
            const response = await fetch(`${backendAdminApiBaseUrl}/api/admin/test-notification`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { Accept: 'application/json' }
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Notification test failed.');
            setStatus(adminStatus, 'Notification test completed. Check email/Telegram results.', 'success');
            console.log('Notification test result', payload);
        }));
        testFileNotificationButton.addEventListener('click', () => handleAsync(async () => {
            if (!backendAdminApiBaseUrl) return;
            setStatus(adminStatus, 'Testing file bot...');
            const response = await fetch(`${backendAdminApiBaseUrl}/api/admin/test-file-notification`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { Accept: 'application/json' }
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'File notification test failed.');
            setStatus(adminStatus, 'File bot test completed. Check console for details.', 'success');
            console.log('File notification test result', payload);
        }));
        orderSearchInput.addEventListener('input', () => {
            renderOrdersTable();
            renderOrderDetail();
        });
        orderStatusFilter.addEventListener('change', () => {
            renderOrdersTable();
            renderOrderDetail();
        });
        document.getElementById('promo-form').addEventListener('submit', event => handleAsync(() => savePromo(event)));
        document.getElementById('slot-form').addEventListener('submit', event => handleAsync(() => saveSlot(event)));
        document.getElementById('blocked-form').addEventListener('submit', event => handleAsync(() => saveBlockedDate(event)));
        document.getElementById('promo-reset').addEventListener('click', resetPromoForm);
        document.getElementById('slot-reset').addEventListener('click', resetSlotForm);
        document.getElementById('blocked-reset').addEventListener('click', resetBlockedForm);

        dashboard.addEventListener('click', event => handleAsync(async () => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.dataset.viewOrder) {
                selectedOrderId = target.dataset.viewOrder;
                renderOrdersTable();
                renderOrderDetail();
                await loadSignedFileUrls(selectedOrderId);
                renderOrderDetail();
            }
            if (target.dataset.saveOrderStatus) await saveOrderStatus(target.dataset.saveOrderStatus);
            if (target.dataset.saveHomepageText) await saveHomepageText(target.dataset.saveHomepageText);
            if (target.dataset.editPromo) editPromo(target.dataset.editPromo);
            if (target.dataset.deletePromo) await deleteRow('checkout_promo_codes', target.dataset.deletePromo);
            if (target.dataset.editSlot) editSlot(target.dataset.editSlot);
            if (target.dataset.deleteSlot) await deleteRow('checkout_time_slots', target.dataset.deleteSlot);
            if (target.dataset.editBlocked) editBlockedDate(target.dataset.editBlocked);
            if (target.dataset.deleteBlocked) await deleteRow('checkout_blocked_dates', target.dataset.deleteBlocked);
        }));
    }

    async function start() {
        initStaticControls();
        bindEvents();

        if (!supabaseConfig.url || !supabaseConfig.anonKey || !window.supabase?.createClient) {
            setStatus(loginStatus, 'Supabase is not configured.', 'error');
            return;
        }

        client = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
        const { data } = await client.auth.getSession();
        if (data.session) {
            await showDashboard();
        }
    }

    start().catch(error => {
        console.error(error);
        setStatus(loginStatus, error.message || String(error), 'error');
    });
})();
