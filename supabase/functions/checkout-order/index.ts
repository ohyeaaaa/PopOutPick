const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    || Deno.env.get('POPOUTPICK_SUPABASE_SERVICE_ROLE_KEY')
    || '';
const CHECKOUT_ALLOWED_ORIGINS = readCsv(Deno.env.get('CHECKOUT_ALLOWED_ORIGINS') || '');
const CHECKOUT_UPLOAD_MAX_BYTES = readPositiveInt(Deno.env.get('CHECKOUT_UPLOAD_MAX_BYTES'), 20 * 1024 * 1024);
const SHOP_NAME = Deno.env.get('SHOP_NAME') || 'PopOutPick';
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const TELEGRAM_ADMIN_CHAT_ID = Deno.env.get('TELEGRAM_ADMIN_CHAT_ID') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const NOTIFICATION_FROM_EMAIL = Deno.env.get('NOTIFICATION_FROM_EMAIL') || '';

const CHECKOUT_DESIGN_PART_KEYS = new Set(['slider', 'top', 'bottom']);

const COMMERCE_CONFIG = {
    productBasePrice: 10,
    meetupShippingPrice: 0,
    deliveryShippingPrice: 2.6,
    shopProducts: [
        { id: 'custom-pick-holder', name: 'Custom Pick Holder', description: 'Replacement pick holder module', price: 1, previewPart: 'module' },
        { id: 'slider', name: 'Slider', description: 'Replacement slider for both Guitar and Bass PopOutPick sets', price: 1, previewPart: 'slider' },
        { id: 'top-plate', name: 'Top Plate', description: 'Replacement top plate', price: 1, previewPart: 'top' },
        { id: 'base-plate', name: 'Base Plate', description: 'Replacement base plate', price: 1, previewPart: 'bottom' },
        { id: 'guitar-pick-holder', name: 'Guitar Pick Holder', description: 'Replacement guitar pick holder. Choose size and colours after clicking.', price: 1, previewPart: 'holder:10mm', shopPartType: 'holder' },
        { id: 'bass-pick-holder', name: 'Bass Pick Holder', description: 'Replacement bass pick holder. Choose size and colours after clicking.', price: 1, previewPart: 'holder:30mm', shopPartType: 'holder' }
    ],
    designAddOns: {
        slider: { label: 'Add a 2D design for $2', price: 2, type: '2D' },
        top: { label: 'Add a 3D design for $3', price: 3, type: '3D' },
        top2d: { label: 'Add a 2D design for $2', price: 2, type: '2D', partKey: 'top' },
        bottom: { label: 'Add a 2D design for $2', price: 2, type: '2D' }
    },
    timeSlots: ['10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM'],
    meetupLocations: [
        { id: 'pasir-ris', name: 'Pasir Ris Mall', sub: 'East Singapore' },
        { id: 'ntu', name: 'NTU', sub: 'Nanyang Technological University' }
    ]
};

class CheckoutValidationError extends Error {
    statusCode: number;

    constructor(message: string, statusCode = 400) {
        super(message);
        this.name = 'CheckoutValidationError';
        this.statusCode = statusCode;
    }
}

Deno.serve(async req => {
    const origin = req.headers.get('origin') || '';
    const headers = corsHeaders(origin);

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers });
    }

    if (req.method === 'GET') {
        return jsonResponse({ ok: true, service: 'checkout-order' }, 200, headers);
    }

    if (req.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405, headers);
    }

    if (!isOriginAllowed(origin)) {
        return jsonResponse({ ok: false, error: 'Checkout origin is not allowed.' }, 403, headers);
    }

    try {
        assertCheckout(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY, 'Checkout backend is not configured.', 503);
        const payload = await readCheckoutPayload(req);
        const result = await insertCheckoutOrder(payload);
        return jsonResponse({ ok: true, ...result }, 201, headers);
    } catch (error) {
        if (error instanceof CheckoutValidationError) {
            return jsonResponse({ ok: false, error: error.message }, error.statusCode, headers);
        }

        console.error(error);
        return jsonResponse({ ok: false, error: 'Checkout submission failed.' }, 500, headers);
    }
});

function readCsv(value: string) {
    return value.split(',').map(item => item.trim()).filter(Boolean);
}

function readPositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function corsHeaders(origin: string) {
    const allowOrigin = isOriginAllowed(origin) ? origin : (CHECKOUT_ALLOWED_ORIGINS[0] || '*');
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Vary': 'Origin'
    };
}

function isOriginAllowed(origin: string) {
    if (!origin) return true;
    if (CHECKOUT_ALLOWED_ORIGINS.includes(origin)) return true;
    return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function jsonResponse(payload: unknown, status: number, headers: Record<string, string>) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...headers,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

function assertCheckout(condition: unknown, message: string, statusCode = 400): asserts condition {
    if (!condition) throw new CheckoutValidationError(message, statusCode);
}

function asPlainObject(value: unknown): Record<string, any> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
}

function cleanText(value: unknown, maxLength = 240) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function cleanOptionalText(value: unknown, maxLength = 240) {
    const cleaned = cleanText(value, maxLength);
    return cleaned || null;
}

function roundMoney(value: unknown) {
    const number = Number(value);
    assertCheckout(Number.isFinite(number), 'Invalid money value.');
    return Math.round(number * 100) / 100;
}

function moneyOrZero(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function assertMoneyMatches(label: string, clientValue: unknown, serverValue: unknown) {
    assertCheckout(clientValue !== undefined && clientValue !== null, `Missing ${label}.`);
    const clientMoney = roundMoney(clientValue);
    const canonicalMoney = roundMoney(serverValue);
    assertCheckout(Math.abs(clientMoney - canonicalMoney) < 0.01, `${label} does not match the server total.`);
}

function normalizePromoCode(code = '') {
    return String(code || '').trim().toUpperCase();
}

function getConfiguredProductBasePrice() {
    return moneyOrZero(COMMERCE_CONFIG.productBasePrice || 49);
}

function getShopProductById(productId: unknown) {
    const id = cleanText(productId, 120);
    return COMMERCE_CONFIG.shopProducts.find(product => product.id === id) || null;
}

function getShopProductPartKey(product: Record<string, any>) {
    const part = product?.previewPart;
    if (product?.shopPartType === 'holder' || String(part || '').startsWith('holder:')) return null;
    if (part === 'module') return 'module';
    if (part === 'slider') return 'slider';
    if (part === 'top') return 'top';
    if (part === 'bottom' || part === 'base') return 'bottom';
    return null;
}

function getDesignAddOnConfig(key: string) {
    return (COMMERCE_CONFIG.designAddOns as Record<string, any>)[key] || null;
}

function getDesignAddOnPartKey(key: string) {
    const config = getDesignAddOnConfig(key);
    return config?.partKey || key;
}

function canonicalDesignAddOn(key: unknown) {
    const addOnKey = cleanText(key, 40);
    const config = getDesignAddOnConfig(addOnKey);
    assertCheckout(config, `Unknown design add-on: ${addOnKey || 'blank'}.`);

    const partKey = getDesignAddOnPartKey(addOnKey);
    assertCheckout(CHECKOUT_DESIGN_PART_KEYS.has(partKey), `Invalid design add-on part: ${partKey}.`);

    return {
        key: addOnKey,
        partKey,
        label: cleanText(config.label || addOnKey, 120),
        price: moneyOrZero(config.price),
        type: cleanText(config.type || 'Custom', 40)
    };
}

function canonicalizeDesignAddOnKeys(keys: unknown[], requiredPartKey = '') {
    const seen = new Set<string>();
    const addOns = [];

    for (const key of keys) {
        const addOn = canonicalDesignAddOn(key);
        if (requiredPartKey) {
            assertCheckout(addOn.partKey === requiredPartKey, `Design add-on ${addOn.key} is not valid for ${requiredPartKey}.`);
        }
        if (seen.has(addOn.key)) continue;
        seen.add(addOn.key);
        addOns.push(addOn);
    }

    const parts = new Set(addOns.map(addOn => addOn.partKey));
    assertCheckout(parts.size === addOns.length, 'Only one design add-on is allowed per part.');
    return addOns;
}

function clientAddOnKeys(addOns: unknown) {
    if (!Array.isArray(addOns)) return [];
    return addOns
        .map(addOn => cleanText(asPlainObject(addOn)?.key || addOn, 40))
        .filter(Boolean);
}

function cleanColor(value: unknown, fallback = '#ffffff') {
    const color = cleanText(value, 32);
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function canonicalizeDesignTransforms(value: unknown) {
    const source = asPlainObject(value) || {};
    return [...CHECKOUT_DESIGN_PART_KEYS].reduce<Record<string, any>>((transforms, partKey) => {
        const transform = asPlainObject(source[partKey]) || {};
        transforms[partKey] = {
            x: Number.isFinite(Number(transform.x)) ? Number(transform.x) : 0,
            y: Number.isFinite(Number(transform.y)) ? Number(transform.y) : 0,
            scale: Number.isFinite(Number(transform.scale)) ? Number(transform.scale) : 100
        };
        return transforms;
    }, {});
}

function canonicalizeDesignFileNames(value: unknown) {
    const source = asPlainObject(value) || {};
    return [...CHECKOUT_DESIGN_PART_KEYS].reduce<Record<string, string | null>>((fileNames, partKey) => {
        fileNames[partKey] = cleanOptionalText(source[partKey], 180);
        return fileNames;
    }, {});
}

function canonicalizeSelections(value: unknown) {
    const source = asPlainObject(value);
    assertCheckout(source, 'Configured products must include selections.');

    const type = cleanText(source.type, 20);
    assertCheckout(type === 'guitar' || type === 'bass', 'Invalid configured product type.');

    const allowedThicknesses = {
        guitar: new Set(['10mm', '8mm', '7mm', '6mm']),
        bass: new Set(['30mm', '20mm', '10mm', '8mm', '6mm'])
    };
    const holders = Array.isArray(source.holders) ? source.holders : [];
    assertCheckout(holders.length === 4, 'Configured products must include four pickholders.');

    const designAddOns: Record<string, boolean> = {};
    for (const key of Object.keys(COMMERCE_CONFIG.designAddOns)) {
        designAddOns[key] = Boolean(asPlainObject(source.designAddOns)?.[key]);
    }

    const enabledAddOns = canonicalizeDesignAddOnKeys(Object.entries(designAddOns)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key));

    return {
        type,
        body: cleanColor(source.body, '#1a1a1a'),
        module: cleanColor(source.module),
        slider: cleanColor(source.slider),
        top: cleanColor(source.top),
        bottom: cleanColor(source.bottom),
        designFileNames: canonicalizeDesignFileNames(source.designFileNames),
        designAddOns,
        designTransforms: canonicalizeDesignTransforms(source.designTransforms),
        holders: holders.map(holder => {
            const item = asPlainObject(holder) || {};
            const thickness = cleanText(item.t, 20);
            assertCheckout((allowedThicknesses as Record<string, Set<string>>)[type].has(thickness), `Invalid ${type} pickholder thickness.`);
            return {
                c1: cleanColor(item.c1),
                c2: cleanColor(item.c2),
                t: thickness
            };
        }),
        _enabledAddOns: enabledAddOns
    };
}

function createCanonicalItemId(value: unknown, index: number) {
    const cleaned = cleanText(value, 120).replace(/[^a-z0-9._:-]+/gi, '-').replace(/^-+|-+$/g, '');
    return cleaned || `item-${index + 1}`;
}

function canonicalizeCheckoutItem(value: unknown, index: number) {
    const item = asPlainObject(value);
    assertCheckout(item, 'Invalid checkout item.');

    const quantity = Number(item.quantity);
    assertCheckout(Number.isInteger(quantity) && quantity >= 1 && quantity <= 99, 'Item quantity must be between 1 and 99.');

    const itemId = createCanonicalItemId(item.id, index);
    const productId = cleanText(item.productId, 120);

    if (cleanText(item.type, 40) === 'shop-product' || productId) {
        const product = getShopProductById(productId);
        assertCheckout(product, `Unknown shop product: ${productId || 'blank'}.`);

        const partKey = getShopProductPartKey(product);
        const addOns = canonicalizeDesignAddOnKeys(clientAddOnKeys(item.addOns), partKey || '');
        assertCheckout(partKey || addOns.length === 0, 'This shop product cannot have design add-ons.');

        const unitPrice = roundMoney(moneyOrZero(product.price) + addOns.reduce((sum, addOn) => sum + addOn.price, 0));
        return {
            id: itemId,
            type: 'shop-product',
            productId: product.id,
            name: cleanText(product.name || item.name || 'Shop product', 180),
            description: cleanText(item.description || product.description || '', 1000),
            quantity,
            unitPrice,
            lineTotal: roundMoney(unitPrice * quantity),
            addOns,
            partKey,
            selections: null
        };
    }

    const {
        _enabledAddOns: addOns,
        ...selections
    } = canonicalizeSelections(item.selections);

    const unitPrice = roundMoney(getConfiguredProductBasePrice() + addOns.reduce((sum, addOn) => sum + addOn.price, 0));
    const productType = selections.type.charAt(0).toUpperCase() + selections.type.slice(1);
    return {
        id: itemId,
        type: 'configured-design',
        productId: null,
        name: cleanText(item.name || `Custom ${productType} PopOutPick`, 180),
        description: cleanText(item.description || 'Configured set with 4 pickholders', 1000),
        quantity,
        unitPrice,
        lineTotal: roundMoney(unitPrice * quantity),
        addOns,
        selections
    };
}

function canonicalizeCheckoutItems(items: unknown) {
    assertCheckout(Array.isArray(items), 'Order items must be an array.');
    assertCheckout(items.length >= 1 && items.length <= 20, 'Orders must include between 1 and 20 items.');
    return items.map(canonicalizeCheckoutItem);
}

function canonicalizeCustomer(order: Record<string, any>) {
    const customer = asPlainObject(order.customer) || {};
    const name = cleanText(customer.name, 120);
    const email = cleanText(customer.email, 254);
    const phone = cleanText(customer.phone, 40);
    const telegram = cleanOptionalText(customer.telegram, 80);

    assertCheckout(name.length >= 1, 'Customer name is required.');
    assertCheckout(email.length >= 3 && email.includes('@'), 'A valid customer email is required.');
    assertCheckout(phone.length >= 3, 'Customer phone is required.');

    return { name, email, phone, telegram };
}

function getDeliveryAddressSummary(delivery: Record<string, string>) {
    return [
        delivery.block ? `Blk ${delivery.block}` : '',
        delivery.street,
        delivery.floor || delivery.unit ? `#${delivery.floor || ''}${delivery.unit ? `-${delivery.unit}` : ''}` : '',
        delivery.building,
        delivery.postal ? `Singapore ${delivery.postal}` : ''
    ].filter(Boolean).join(', ');
}

function parseCheckoutDateText(value: unknown) {
    const match = cleanText(value, 40).match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    assertCheckout(match, 'Invalid meetup date.');

    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const day = Number(match[1]);
    const month = months.indexOf(match[2].toLowerCase());
    const year = Number(match[3]);
    assertCheckout(month >= 0, 'Invalid meetup month.');

    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    assertCheckout(date.getFullYear() === year && date.getMonth() === month && date.getDate() === day, 'Invalid meetup date.');
    return date;
}

function toLocalDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getEarliestCheckoutDate() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 7);
    return date;
}

function getConfiguredMeetupLocation(locationId: string) {
    return COMMERCE_CONFIG.meetupLocations.find(location => location.id === locationId) || null;
}

async function requestSupabaseJson(method: string, endpointPath: string, body: unknown = null) {
    const payload = body === null ? null : JSON.stringify(body);
    const response = await fetch(`${SUPABASE_URL}${endpointPath}`, {
        method,
        headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Accept: 'application/json',
            ...(payload === null ? {} : { 'Content-Type': 'application/json' })
        },
        body: payload
    });

    const text = await response.text();
    let parsed = null;
    if (text) {
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = null;
        }
    }

    if (!response.ok) {
        const details = typeof parsed?.message === 'string' ? parsed.message : text.slice(0, 300);
        throw new Error(`Supabase request failed (${response.status}): ${details}`);
    }

    return parsed;
}

async function callSupabaseRpc(name: string, body = {}) {
    return requestSupabaseJson('POST', `/rest/v1/rpc/${encodeURIComponent(name)}`, body);
}

async function getCheckoutAvailabilityForServer() {
    try {
        const data = await callSupabaseRpc('get_checkout_availability', {});
        return {
            loaded: true,
            timeSlots: Array.isArray(data?.timeSlots) ? data.timeSlots : [],
            blockedDates: Array.isArray(data?.blockedDates) ? data.blockedDates : []
        };
    } catch (error) {
        console.warn(`Could not load checkout availability from Supabase; using config fallback: ${getErrorMessage(error)}`);
        return { loaded: false, timeSlots: [], blockedDates: [] };
    }
}

function fallbackTimesForLocation(locationId: string, date: Date) {
    const allSlots = COMMERCE_CONFIG.timeSlots;
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isWednesday = dayOfWeek === 3;
    const isWeekday = !isWeekend && !isWednesday;

    if (locationId === 'ntu') {
        const ntuAllowed = new Set(['10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM']);
        return allSlots.filter(time => isWeekday && ntuAllowed.has(time));
    }

    if (locationId === 'pasir-ris') {
        if (isWeekday) return allSlots.filter(time => time === '7:00 PM' || time === '8:00 PM');
        if (isWednesday) return allSlots;
        return allSlots;
    }

    return allSlots;
}

function getServerAvailableTimes(availability: Record<string, any>, locationId: string, date: Date) {
    if (availability.loaded) {
        const dayOfWeek = date.getDay();
        const dateKey = toLocalDateKey(date);
        const isBlocked = availability.blockedDates.some((blocked: Record<string, any>) => (
            blocked.blocked_date === dateKey
            && (!blocked.location_id || blocked.location_id === locationId)
        ));
        if (isBlocked) return [];

        return [...new Set(availability.timeSlots
            .filter((slot: Record<string, any>) => slot.location_id === locationId && Number(slot.day_of_week) === dayOfWeek)
            .sort((a: Record<string, any>, b: Record<string, any>) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
            .map((slot: Record<string, any>) => cleanText(slot.time_label, 40))
            .filter(Boolean))];
    }

    return fallbackTimesForLocation(locationId, date);
}

async function canonicalizeFulfilment(order: Record<string, any>) {
    const fulfilment = cleanText(order.fulfilment, 20);
    assertCheckout(fulfilment === 'meetup' || fulfilment === 'delivery', 'Invalid fulfilment method.');

    if (fulfilment === 'delivery') {
        const source = asPlainObject(order.delivery);
        assertCheckout(source, 'Delivery details are required.');

        const delivery = {
            postal: cleanText(source.postal, 20),
            street: cleanText(source.street, 160),
            block: cleanText(source.block, 40),
            floor: cleanText(source.floor, 20),
            unit: cleanText(source.unit, 20),
            building: cleanText(source.building, 160),
            notes: cleanText(source.notes, 500),
            addressSummary: '',
            summary: ''
        };
        assertCheckout(delivery.postal && delivery.street, 'Postal code and street are required for delivery.');
        delivery.addressSummary = getDeliveryAddressSummary(delivery);
        delivery.summary = cleanText(source.summary || delivery.addressSummary, 500);
        return { fulfilment, meetup: null, delivery };
    }

    const source = asPlainObject(order.meetup);
    assertCheckout(source, 'Meetup details are required.');

    const locationId = cleanText(source.locationId || source.location_id, 80);
    const configuredLocation = getConfiguredMeetupLocation(locationId);
    assertCheckout(configuredLocation, 'Unknown meetup location.');

    const date = parseCheckoutDateText(source.date);
    assertCheckout(date >= getEarliestCheckoutDate(), 'Meetup date must be at least 7 days from today.');

    const time = cleanText(source.time, 40);
    const availability = await getCheckoutAvailabilityForServer();
    const availableTimes = getServerAvailableTimes(availability, locationId, date);
    assertCheckout(availableTimes.includes(time), 'Selected meetup time is no longer available.');

    const meetup = {
        date: cleanText(source.date, 40),
        time,
        locationId,
        location: cleanText(configuredLocation.name || source.location || locationId, 160),
        locationSub: cleanText(configuredLocation.sub || source.locationSub || '', 160),
        summary: ''
    };
    meetup.summary = `${meetup.location}: ${meetup.date} | ${meetup.time}`;
    return { fulfilment, meetup, delivery: null };
}

async function getActivePromoForServer(code: string) {
    const normalized = normalizePromoCode(code);
    if (!normalized) return null;

    const data = await callSupabaseRpc('get_active_promo_code', { p_code: normalized });
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return null;

    return {
        code: cleanText(row.code || normalized, 80),
        label: cleanText(row.label || normalized, 120),
        type: cleanText(row.discount_type, 20),
        value: moneyOrZero(row.discount_value)
    };
}

function calculateCheckoutDiscount(subtotal: number, promo: Record<string, any> | null) {
    if (!promo) return 0;
    const rawDiscount = promo.type === 'percent'
        ? subtotal * Math.max(0, promo.value) / 100
        : Math.max(0, promo.value);
    return roundMoney(Math.min(subtotal, rawDiscount));
}

async function canonicalizeTotals(order: Record<string, any>, fulfilment: string, items: Record<string, any>[]) {
    const clientTotals = asPlainObject(order.totals) || {};
    const subtotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
    const shipping = roundMoney(fulfilment === 'delivery'
        ? moneyOrZero(COMMERCE_CONFIG.deliveryShippingPrice)
        : moneyOrZero(COMMERCE_CONFIG.meetupShippingPrice));

    const promoCode = normalizePromoCode(clientTotals.promoCode);
    const promo = await getActivePromoForServer(promoCode);
    assertCheckout(!promoCode || promo, 'Promo code is not valid.');

    const discount = calculateCheckoutDiscount(subtotal, promo);
    const total = roundMoney(Math.max(0, subtotal + shipping - discount));

    assertMoneyMatches('Subtotal', clientTotals.subtotal, subtotal);
    assertMoneyMatches('Shipping', clientTotals.shipping, shipping);
    assertMoneyMatches('Discount', clientTotals.discount, discount);
    assertMoneyMatches('Total', clientTotals.total, total);

    return {
        subtotal,
        shipping,
        discount,
        promoCode: promo ? promo.code : '',
        promoLabel: promo ? promo.label : '',
        total
    };
}

function sanitizeStorageName(value = '') {
    return String(value || '')
        .trim()
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || 'file';
}

function sanitizeStoragePath(value: unknown) {
    const storagePath = String(value || '').trim().replace(/\\/g, '/');
    assertCheckout(storagePath.length >= 8 && storagePath.length <= 240, 'Invalid uploaded file path.');
    assertCheckout(!storagePath.split('/').some(part => part === '..' || part === ''), 'Invalid uploaded file path.');
    return storagePath;
}

function getOrderStorageBucket(orderId: string) {
    return sanitizeStorageName(orderId).toLowerCase().replace(/_/g, '-');
}

function getStorageSubfolderForRole(fileRole: string) {
    return fileRole === 'payment_proof' ? 'payment' : 'design';
}

function createStoragePath(file: Record<string, any>) {
    const safeName = sanitizeStorageName(file.originalName || `${file.fileRole}.bin`);
    const safeItem = file.itemId ? `${sanitizeStorageName(file.itemId)}-` : '';
    const safePart = file.partKey ? `${sanitizeStorageName(file.partKey)}-` : '';
    const unique = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    return `${getStorageSubfolderForRole(file.fileRole)}/${file.fileRole}-${Date.now()}-${unique}-${safeItem}${safePart}${safeName}`;
}

function detectImageContentType(bytes: Uint8Array) {
    if (!bytes || bytes.length < 4) return '';

    if (
        bytes.length >= 8
        && bytes[0] === 0x89
        && bytes[1] === 0x50
        && bytes[2] === 0x4e
        && bytes[3] === 0x47
        && bytes[4] === 0x0d
        && bytes[5] === 0x0a
        && bytes[6] === 0x1a
        && bytes[7] === 0x0a
    ) {
        return 'image/png';
    }

    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return 'image/jpeg';
    }

    if (
        bytes.length >= 6
        && bytes[0] === 0x47
        && bytes[1] === 0x49
        && bytes[2] === 0x46
        && bytes[3] === 0x38
        && (bytes[4] === 0x37 || bytes[4] === 0x39)
        && bytes[5] === 0x61
    ) {
        return 'image/gif';
    }

    if (
        bytes.length >= 12
        && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
        && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    ) {
        return 'image/webp';
    }

    return '';
}

async function normalizeClientUploadFile(file: unknown, uploadedFiles: Map<string, File>) {
    const source = asPlainObject(file);
    assertCheckout(source, 'Invalid uploaded file metadata.');

    const fileRole = cleanText(source.fileRole || source.file_role, 40).replace(/-/g, '_');
    assertCheckout(fileRole === 'design_upload' || fileRole === 'payment_proof', 'Invalid uploaded file role.');

    const fieldName = cleanText(source.fieldName || source.field_name, 80);
    assertCheckout(/^[a-z0-9._-]{1,80}$/i.test(fieldName), 'Invalid uploaded file field.');
    const upload = uploadedFiles.get(fieldName);
    assertCheckout(upload, 'Uploaded file is missing.');

    const size = Number(source.size ?? source.size_bytes);
    assertCheckout(!Number.isFinite(size) || (size >= 0 && size <= CHECKOUT_UPLOAD_MAX_BYTES), 'Uploaded file is too large.');
    assertCheckout(upload.size <= CHECKOUT_UPLOAD_MAX_BYTES, 'Uploaded file is too large.');
    assertCheckout(!Number.isFinite(size) || upload.size === Math.round(size), 'Uploaded file size does not match metadata.');

    const contentType = cleanText(upload.type || source.contentType || source.content_type, 120).toLowerCase();
    assertCheckout(contentType.startsWith('image/'), 'Uploaded payment/design files must be images.');
    const detectedContentType = detectImageContentType(new Uint8Array(await upload.slice(0, 16).arrayBuffer()));
    assertCheckout(detectedContentType, 'Uploaded payment/design files must be PNG, JPEG, GIF, or WebP images.');
    assertCheckout(contentType === detectedContentType || (contentType === 'image/jpg' && detectedContentType === 'image/jpeg'), 'Uploaded file type does not match its contents.');

    const originalName = cleanOptionalText(source.originalName || source.original_name || upload.name, 240);

    return {
        itemId: cleanOptionalText(source.itemId || source.item_id, 120),
        partKey: cleanOptionalText(source.partKey || source.part_key, 40),
        fileRole,
        bucket: '',
        storagePath: '',
        originalName,
        contentType,
        size: upload.size,
        upload
    };
}

function assertDesignFileMatchesItem(file: Record<string, any>, itemsById: Map<string, Record<string, any>>) {
    assertCheckout(file.itemId, 'Design upload is missing an item id.');
    const item = itemsById.get(file.itemId);
    assertCheckout(item, 'Design upload points to an unknown item.');
    assertCheckout(CHECKOUT_DESIGN_PART_KEYS.has(file.partKey), 'Design upload has an invalid part.');
    assertCheckout(item.addOns.some((addOn: Record<string, any>) => addOn.partKey === file.partKey), 'Design upload does not match a paid design add-on.');
}

async function canonicalizeCheckoutFiles(orderId: string, rawFiles: unknown, uploadedFiles: Map<string, File>, items: Record<string, any>[], rawPayment: unknown) {
    assertCheckout(Array.isArray(rawFiles), 'Uploaded file metadata is required.');
    const files = await Promise.all(rawFiles.map(file => normalizeClientUploadFile(file, uploadedFiles)));
    const expectedBucket = getOrderStorageBucket(orderId);
    const itemsById = new Map(items.map(item => [item.id, item]));

    for (const file of files) {
        if (file.fileRole === 'design_upload') assertDesignFileMatchesItem(file, itemsById);
        file.bucket = expectedBucket;
        file.storagePath = sanitizeStoragePath(createStoragePath(file));
    }

    const paymentFiles = files.filter(file => file.fileRole === 'payment_proof');
    assertCheckout(paymentFiles.length === 1, 'Exactly one payment proof image is required.');

    const paymentSource = asPlainObject(rawPayment);
    const paymentFile = paymentFiles[0];
    const payment = {
        method: 'PayNow',
        status: 'pending_payment_review',
        screenshotName: cleanText(paymentFile.originalName || paymentSource?.screenshotName || 'payment-proof', 240),
        screenshotSource: cleanText(paymentSource?.screenshotSource || 'upload', 40),
        screenshotPath: paymentFile.storagePath,
        screenshotBucket: paymentFile.bucket
    };

    const fileRows = files.map(file => ({
        order_id: orderId,
        item_id: file.itemId,
        part_key: file.partKey,
        file_role: file.fileRole,
        bucket: file.bucket,
        storage_path: file.storagePath,
        original_name: file.originalName,
        content_type: file.contentType,
        size_bytes: file.size
    }));

    return { payment, fileRows, storageFiles: files };
}

async function buildCheckoutOrderRecords(payload: Record<string, any>) {
    const order = asPlainObject(payload.order || payload);
    assertCheckout(order, 'Missing order payload.');

    const orderId = cleanText(order.orderId || order.id, 140);
    assertCheckout(/^order-[a-z0-9][a-z0-9-]{8,119}$/.test(orderId), 'Invalid order id.');

    const customer = canonicalizeCustomer(order);
    const fulfilmentDetails = await canonicalizeFulfilment(order);
    const items = canonicalizeCheckoutItems(order.items);
    const totals = await canonicalizeTotals(order, fulfilmentDetails.fulfilment, items);
    const rawFiles = payload.fileMetadata || payload.files || order.files || [];
    const uploadedFiles = payload.uploadedFiles || new Map();
    const { payment, fileRows, storageFiles } = await canonicalizeCheckoutFiles(orderId, rawFiles, uploadedFiles, items, order.payment);

    return {
        orderRecord: {
            id: orderId,
            customer_name: customer.name,
            customer_email: customer.email,
            customer_phone: customer.phone,
            customer_telegram: customer.telegram,
            fulfilment: fulfilmentDetails.fulfilment,
            meetup: fulfilmentDetails.meetup,
            delivery: fulfilmentDetails.delivery,
            items,
            totals,
            payment,
            status: 'new'
        },
        storageFiles,
        fileRows,
        response: {
            orderId,
            totals,
            paymentStatus: payment.status,
            fileCount: fileRows.length
        }
    };
}

async function readCheckoutPayload(req: Request) {
    const contentType = req.headers.get('content-type') || '';
    assertCheckout(contentType.includes('multipart/form-data'), 'Checkout submission must use multipart/form-data.');

    const formData = await req.formData();
    const orderText = String(formData.get('order') || '');
    const fileMetadataText = String(formData.get('fileMetadata') || '[]');
    assertCheckout(orderText, 'Missing order payload.');

    const uploadedFiles = new Map<string, File>();
    for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
            uploadedFiles.set(key, value);
        }
    }

    return {
        order: JSON.parse(orderText),
        fileMetadata: JSON.parse(fileMetadataText),
        uploadedFiles
    };
}

async function ensureOrderStorageBucketForServer(bucket: string) {
    await callSupabaseRpc('ensure_order_storage_bucket', { p_bucket_id: bucket });
}

function encodeSupabaseStoragePath(storagePath: string) {
    return storagePath.split('/').map(part => encodeURIComponent(part)).join('/');
}

async function uploadSupabaseStorageObject(file: Record<string, any>) {
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(file.bucket)}/${encodeSupabaseStoragePath(file.storagePath)}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            'Content-Type': file.contentType || 'application/octet-stream',
            'Cache-Control': '3600',
            'x-upsert': 'false'
        },
        body: file.upload
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Supabase storage upload failed (${response.status}): ${text.slice(0, 300)}`);
    }
}

async function deleteSupabaseStorageObject(file: Record<string, any>) {
    if (!file?.bucket || !file?.storagePath) return;

    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(file.bucket)}/${encodeSupabaseStoragePath(file.storagePath)}`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY
        }
    });

    if (!response.ok) {
        console.warn(`Could not delete orphaned checkout upload ${file.bucket}/${file.storagePath}: ${response.status}`);
    }
}

async function deleteCheckoutStorageFiles(files: Record<string, any>[]) {
    await Promise.allSettled(files.map(deleteSupabaseStorageObject));
}

async function deleteOrderStorageBucket(bucket: string) {
    if (!bucket) return;
    try {
        await callSupabaseRpc('delete_order_storage_bucket', { p_bucket_id: bucket });
    } catch (error) {
        console.warn(`Could not delete orphaned checkout bucket ${bucket}: ${getErrorMessage(error)}`);
    }
}

async function deleteCheckoutStorageBuckets(files: Record<string, any>[]) {
    const buckets = [...new Set(files.map(file => file.bucket).filter(Boolean))];
    await Promise.allSettled(buckets.map(deleteOrderStorageBucket));
}

async function uploadCheckoutStorageFiles(files: Record<string, any>[]) {
    const buckets = [...new Set(files.map(file => file.bucket))];
    await Promise.all(buckets.map(ensureOrderStorageBucketForServer));
    for (const file of files) {
        await uploadSupabaseStorageObject(file);
    }
}

async function insertCheckoutOrder(payload: Record<string, any>) {
    const records = await buildCheckoutOrderRecords(payload);
    await uploadCheckoutStorageFiles(records.storageFiles);
    let orderInserted = false;

    try {
        await requestSupabaseJson('POST', '/rest/v1/orders', records.orderRecord);
        orderInserted = true;

        if (records.fileRows.length) {
            await requestSupabaseJson('POST', '/rest/v1/order_files', records.fileRows);
        }

        await sendOrderNotifications(records.orderRecord).catch(error => {
            console.warn(`Order notification failed for ${records.orderRecord.id}: ${getErrorMessage(error)}`);
        });
    } catch (error) {
        if (orderInserted) {
            await requestSupabaseJson('DELETE', `/rest/v1/orders?id=eq.${encodeURIComponent(records.orderRecord.id)}`).catch(deleteError => {
                console.warn(`Could not delete partial checkout order ${records.orderRecord.id}: ${getErrorMessage(deleteError)}`);
            });
        }
        await deleteCheckoutStorageFiles(records.storageFiles);
        await deleteCheckoutStorageBuckets(records.storageFiles);
        throw error;
    }

    return records.response;
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

function buildOrderMessage(order: Record<string, any>) {
    const total = Number(order.totals?.total || 0).toFixed(2);
    const fulfilment = order.fulfilment === 'delivery'
        ? `Delivery: ${order.delivery?.summary || order.delivery?.addressSummary || 'not provided'}`
        : `Meetup: ${order.meetup?.summary || 'not provided'}`;

    return [
        `New ${SHOP_NAME} order`,
        `Order: ${order.id}`,
        `Customer: ${order.customer_name}`,
        `Email: ${order.customer_email}`,
        `Phone: ${order.customer_phone}`,
        order.customer_telegram ? `Telegram: ${order.customer_telegram}` : '',
        fulfilment,
        `Total: $${total}`,
        `Status: ${order.status}`
    ].filter(Boolean).join('\n');
}

async function sendTelegramMessage(chatId: string, text: string) {
    if (!TELEGRAM_BOT_TOKEN || !chatId) return { skipped: true };
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text })
    });
    if (!response.ok) throw new Error(`Telegram send failed: ${response.status}`);
    return response.json();
}

async function sendOrderEmail(order: Record<string, any>, text: string) {
    if (!RESEND_API_KEY || !NOTIFICATION_FROM_EMAIL || !order.customer_email) return { skipped: true };
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: NOTIFICATION_FROM_EMAIL,
            to: [order.customer_email],
            subject: `${SHOP_NAME} order received: ${order.id}`,
            text: `Thanks for your order.\n\n${text}`
        })
    });
    if (!response.ok) throw new Error(`Email send failed: ${response.status}`);
    return response.json();
}

async function sendOrderNotifications(order: Record<string, any>) {
    const text = buildOrderMessage(order);
    const [telegramAdmin, customerEmail] = await Promise.allSettled([
        sendTelegramMessage(TELEGRAM_ADMIN_CHAT_ID, text),
        sendOrderEmail(order, text)
    ]);

    return { telegramAdmin, customerEmail };
}
