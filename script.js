// Global Error Diagnostic Tool - displays errors on-screen if anything fails
window.onerror = function(message, source, lineno, colno, error) {
    if (message === 'Script error.' && !source && lineno === 0) return true;

    const errDiv = document.createElement('div');
    errDiv.style.position = 'fixed';
    errDiv.style.top = '0';
    errDiv.style.left = '0';
    errDiv.style.width = '100%';
    errDiv.style.background = '#ff3333';
    errDiv.style.color = 'white';
    errDiv.style.padding = '12px';
    errDiv.style.zIndex = '99999';
    errDiv.style.fontSize = 'var(--font-errorBanner, 14px)';
    errDiv.style.fontWeight = 'bold';
    errDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
    const errorText = (window.POPOUTPICK_CONFIG && window.POPOUTPICK_CONFIG.text && window.POPOUTPICK_CONFIG.text.error) || {};
    const fileName = source ? source.split('/').pop() : '';
    errDiv.innerText = `${errorText.prefix || 'Configurator Error:'} ${message} (${errorText.lineLabel || 'Line'} ${lineno} ${errorText.inLabel || 'in'} ${fileName})`;
    document.body.appendChild(errDiv);
};

const APP_CONFIG = window.POPOUTPICK_CONFIG || {};
const APP_TEXT = APP_CONFIG.text || {};

function getText(path, fallback) {
    const value = path.split('.').reduce((obj, key) => obj && obj[key], APP_TEXT);
    return value === undefined || value === null ? fallback : value;
}

function formatText(template, values) {
    return Object.keys(values).reduce((text, key) => {
        return String(text).replaceAll(`{${key}}`, values[key]);
    }, template);
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

function uploadStatusText(path, fallback, values) {
    return formatText(getText(path, fallback), values);
}

function getUploadStatusClass(status) {
    return `upload-overwrite-status${status ? ` is-${status.phase}` : ''}`;
}

function renderUploadStatus(status) {
    if (!status) return '';

    const showProgress = Number.isFinite(status.progress);
    const progress = showProgress ? Math.max(0, Math.min(100, status.progress)) : 0;
    const progressHtml = showProgress ? `
        <div class="upload-progress-track" aria-label="${escapeHtml(status.message)}" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100" role="progressbar">
            <div class="upload-progress-fill" style="width:${progress}%"></div>
        </div>` : '';

    return `
        <div class="upload-overwrite-message">${escapeHtml(status.message)}</div>
        ${status.meta ? `<div class="upload-overwrite-meta">${escapeHtml(status.meta)}</div>` : ''}
        ${progressHtml}`;
}

function updateUploadStatusElement(id, status) {
    const element = document.getElementById(id);
    if (!element) return;
    element.className = getUploadStatusClass(status);
    element.innerHTML = renderUploadStatus(status);
}

function setDesignUploadStatus(key, status) {
    uploadStatuses.designs[key] = status;
    updateUploadStatusElement(`design-upload-status-${key}`, status);
}

function applyTypographyConfig() {
    const root = document.documentElement;
    const fonts = APP_CONFIG.fonts || {};
    const typography = APP_CONFIG.typography || {};

    if (fonts.family) {
        root.style.setProperty('--font-family-main', fonts.family);
    }

    Object.entries(typography).forEach(([key, value]) => {
        root.style.setProperty(`--font-${key}`, value);
    });
}

function applyStaticTextConfig() {
    document.querySelectorAll('[data-text-key]').forEach((el) => {
        const fallback = el.textContent;
        const value = getText(el.dataset.textKey, fallback);
        el.textContent = el.dataset.textKey === 'timeline.stepIndicator'
            ? formatText(value, { current: 1, total: 8 })
            : value;
    });

    document.querySelectorAll('[data-alt-key]').forEach((el) => {
        const fallback = el.getAttribute('alt') || '';
        el.setAttribute('alt', getText(el.dataset.altKey, fallback));
    });

    document.title = getText('documentTitle', document.title);
}

let currentStep = 1;
let activeView = 'customizer';
let activeShopProductId = null;
let activeSlot = 0;
let isRotating = true;
let isHolderRotating = true;

// ASSEMBLY SPACING CONFIGURATION
// Adjust this number (in mm) to match the spacing between the slots in your actual CAD Module
const holderSpacing = 14.5;
const holderNumberColorStartY = 15.1; // Adjust this number (in mm) to match the Y coordinate where the holder's number color should start in your CAD Module

// 1. MODEL FILE PATH DICTIONARY
const glbModels = {
    guitar: {
        body: "GLB/(Guitar) body.glb",
        checkoutPreview: "GLB/Guitar body Preview for checkout.glb",
        module: "GLB/(Guitar) Pick Holder Module.glb",
        slider: "GLB/Slider for both.glb",
        top: "GLB/(Guitar) Top Plate.glb",
        bottom: "GLB/(Guitar) Base Plate.glb",
        holders: {
            "10mm": "GLB/(Guitar) Pick Holder 10mm.glb",
            "8mm": "GLB/(Guitar) Pick Holder 8mm.glb",
            "7mm": "GLB/(Guitar) Pick Holder 7mm.glb",
            "6mm": "GLB/(Guitar) Pick Holder 6mm.glb"
        }
    },
    bass: {
        body: "GLB/(Bass) Body.glb",
        checkoutPreview: "GLB/Bass body Preview for checkout.glb",
        module: "GLB/(Bass) Pick Holder Module.glb",
        slider: "GLB/Slider for both.glb",
        top: "GLB/(Bass) Top Plate.glb",
        bottom: "GLB/(Bass) Base Plate.glb",
        holders: {
            "30mm": "GLB/(Bass) Pick Holder 30mm.glb",
            "20mm": "GLB/(Bass) Pick Holder 20mm.glb",
            "10mm": "GLB/(Bass) Pick Holder 10mm.glb",
            "8mm": "GLB/(Bass) Pick Holder 8mm.glb",
            "6mm": "GLB/(Bass) Pick Holder 6mm.glb"
        }
    }
};

let selections = {
    type: 'guitar', 
    body: '#1a1a1a', 
    module: '#ffffff',
    slider: '#ffffff',
    top: '#ffffff',
    bottom: '#ffffff',
    designImages: {
        slider: null,
        top: null,
        bottom: null
    },
    designFileNames: {
        slider: null,
        top: null,
        bottom: null
    },
    designFiles: {
        slider: null,
        top: null,
        bottom: null
    },
    designColors: {
        slider: '#1a1a1a',
        top: '#1a1a1a',
        bottom: '#1a1a1a'
    },
    designAddOns: {
        slider: false,
        top: false,
        top2d: false,
        bottom: false
    },
    designTransforms: {
        slider: { x: 0, y: 0, scale: 100 },
        top: { x: 0, y: 0, scale: 100 },
        bottom: { x: 0, y: 0, scale: 100 }
    },
    holders: [
        {c1: '#ffffff', c2: '#ffffff', t: '10mm'}, 
        {c1: '#ffffff', c2: '#ffffff', t: '8mm'},
        {c1: '#ffffff', c2: '#ffffff', t: '7mm'}, 
        {c1: '#ffffff', c2: '#ffffff', t: '6mm'}
    ]
};

const defaultSelections = JSON.parse(JSON.stringify(selections));

const colors = ["#1a1a1a", "#ffffff", "#e53935", "#1e88e5"];
const blackColor = "#1a1a1a";
const whiteColor = "#ffffff";
const defaultDesignColor = "#1a1a1a";
const designPartKeys = ['slider', 'top', 'bottom'];
const designAddOnKeys = ['slider', 'top', 'top2d', 'bottom'];

function normalizeHexColor(value, fallback = defaultDesignColor) {
    const color = String(value || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function getDefaultDesignColors(source = {}) {
    return designPartKeys.reduce((designColors, key) => {
        designColors[key] = normalizeHexColor(source?.[key], defaultDesignColor);
        return designColors;
    }, {});
}

function isBlackColor(color) {
    return String(color || '').toLowerCase() === blackColor;
}

function isWhiteColor(color) {
    return String(color || '').toLowerCase() === whiteColor;
}

function holderUsesBlack(holder) {
    return isBlackColor(holder?.c1) || isBlackColor(holder?.c2);
}

function holderBodyUsesWhite(holder) {
    return isWhiteColor(holder?.c1);
}

function holderUsesWhite(holder) {
    return isWhiteColor(holder?.c1) || isWhiteColor(holder?.c2);
}

function designUsesBlack() {
    return ['body', 'module', 'slider', 'top', 'bottom'].some((key) => isBlackColor(selections[key]))
        || selections.holders.some(holderUsesBlack);
}

function designUsesWhite() {
    return ['body', 'module', 'slider', 'top', 'bottom'].some((key) => isWhiteColor(selections[key]))
        || selections.holders.some(holderUsesWhite);
}

function setPreviewContrast(id, useWhiteBackground, useDarkBackground = false) {
    const element = document.getElementById(id);
    if (!element) return;
    element.classList.toggle('preview-contrast-white', useWhiteBackground);
    element.classList.toggle('preview-contrast-dark', !useWhiteBackground && useDarkBackground);
}

function syncPreviewContrast(activeKey = null) {
    setPreviewContrast(
        'main-3d-viewport',
        activeKey ? !isWhiteColor(selections[activeKey]) : true,
        activeKey ? isWhiteColor(selections[activeKey]) : false
    );
    setPreviewContrast(
        'holder-3d-viewport',
        currentStep === 3 && !holderBodyUsesWhite(selections.holders[activeSlot]),
        currentStep === 3 && holderBodyUsesWhite(selections.holders[activeSlot])
    );

    const finalPreview = document.querySelector('#step-8 .preview-box-large');
    if (finalPreview) {
        const useDarkBackground = currentStep === 8 && designUsesWhite();
        finalPreview.classList.toggle('preview-contrast-dark', useDarkBackground);
        finalPreview.classList.toggle('preview-contrast-white', !useDarkBackground);
    }
}

let uploadStatuses = {
    designs: {
        slider: null,
        top: null,
        bottom: null
    }
};

let checkoutState = {
    addedToCart: false,
    started: false,
    screen: 'cart',
    quantity: 1,
    cartItems: [],
    checkoutPreviewIndex: 0,
    fulfilment: 'meetup',
    selectedDate: null,
    selectedTime: null,
    selectedLocation: null,
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    paymentScreenshotName: '',
    paymentScreenshotSource: '',
    paymentScreenshotFile: null,
    promoCode: '',
    promoValidation: { code: '', phase: '', promo: null },
    promoValidationTimer: null,
    errors: {},
    contact: { name: '', email: '', phone: '', telegram: '' },
    delivery: { postal: '', street: '', block: '', floor: '', unit: '', building: '', notes: '' },
    confirmed: false,
    isSubmitting: false,
    submissionStatus: null
};

const cartStorageKey = 'popoutpick.cart.v1';
let checkoutManagedSettings = {
    loaded: false,
    timeSlots: [],
    blockedDates: []
};
let promoValidationRequestId = 0;

function getEmptyDesignFiles() {
    return designPartKeys.reduce((files, key) => {
        files[key] = null;
        return files;
    }, {});
}

function normalizePersistedCartItem(item, index = 0) {
    if (!item || typeof item !== 'object') return null;

    const normalized = {
        ...item,
        id: item.id || `restored-${Date.now()}-${index}`,
        quantity: Math.max(1, Number(item.quantity) || 1)
    };

    if (normalized.selections) {
        normalized.selections = {
            ...normalized.selections,
            designImages: { ...(normalized.selections.designImages || {}) },
            designFileNames: { ...(normalized.selections.designFileNames || {}) },
            designFiles: getEmptyDesignFiles(),
            designColors: getDefaultDesignColors(normalized.selections.designColors),
            designAddOns: { ...(normalized.selections.designAddOns || {}) },
            designTransforms: JSON.parse(JSON.stringify(normalized.selections.designTransforms || {})),
            holders: JSON.parse(JSON.stringify(normalized.selections.holders || []))
        };
    }

    if ('designFile' in normalized) {
        normalized.designFile = null;
    }
    if ('designColor' in normalized) {
        normalized.designColor = normalizeHexColor(normalized.designColor, defaultDesignColor);
    }

    return normalized;
}

function getPersistableCartItem(item, index) {
    const clone = JSON.parse(JSON.stringify(item, (_key, value) => {
        if (typeof Blob !== 'undefined' && value instanceof Blob) return undefined;
        return value;
    }));
    return normalizePersistedCartItem(clone, index);
}

function saveCartToStorage() {
    try {
        if (typeof localStorage === 'undefined') return;
        if (!checkoutState.cartItems.length) {
            localStorage.removeItem(cartStorageKey);
            return;
        }

        const items = checkoutState.cartItems
            .map((item, index) => getPersistableCartItem(item, index))
            .filter(Boolean);

        localStorage.setItem(cartStorageKey, JSON.stringify({
            version: 1,
            items
        }));
    } catch (error) {
        console.warn('Could not save cart to browser storage', error);
    }
}

function clearSavedCart() {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.removeItem(cartStorageKey);
    } catch (error) {
        console.warn('Could not clear saved cart from browser storage', error);
    }
}

function restoreCartFromStorage() {
    try {
        if (typeof localStorage === 'undefined') return;
        const raw = localStorage.getItem(cartStorageKey);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        const items = (Array.isArray(parsed) ? parsed : parsed.items || [])
            .map((item, index) => normalizePersistedCartItem(item, index))
            .filter(Boolean);

        if (items.length) {
            checkoutState.cartItems = items;
            checkoutState.addedToCart = false;
        } else {
            clearSavedCart();
        }
    } catch (error) {
        console.warn('Could not restore saved cart from browser storage', error);
        clearSavedCart();
    }
}

// 3D SCENE CONFIGURATION
let scene, camera, renderer, controls, assemblyGroup;
const modelCache = {};
const rawModelCache = {};
const designTextureCache = {};

// Arrays to store the 4 miniature engines inside the slot cards
let slotScenes = [null, null, null, null];
let slotCameras = [null, null, null, null];
let slotRenderers = [null, null, null, null];
let slotModels = [null, null, null, null];

function initEngine(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Safely calculate container dimensions on every load to prevent squishing
    const width = container.clientWidth || 420;
    const height = container.clientHeight || 420;

    // If the renderer already exists, reuse it but completely align its dimensions
    if (renderer) {
        if (renderer.domElement.parentElement !== container) {
            container.appendChild(renderer.domElement);
        }
        renderer.setSize(width, height);
        camera.aspect = width / height; 
        camera.updateProjectionMatrix(); 
        return;
    }
    
    scene = new THREE.Scene();
    
    // Create and add the rotation group to the scene
    assemblyGroup = new THREE.Group();
    scene.add(assemblyGroup);
    
    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0, 120);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
    const light = new THREE.DirectionalLight(0xffffff, 0.5); 
    light.position.set(5, 5, 5); 
    scene.add(light);
    
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.autoRotate = isRotating;
    controls.autoRotateSpeed = 1.2;
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    
    animate();
}

function syncCameraOrbit() {
    if (!controls) return;

    controls.autoRotate = currentStep === 3 ? isHolderRotating : isRotating;
    controls.target.set(0, 0, 0);
    camera.lookAt(controls.target);
}

function animate() {
    requestAnimationFrame(animate);
    syncCameraOrbit();
    if (controls) {
        controls.update();
    }
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// SLOT CARDS 3D VIEWPORT INITIALIZATION
function initSlotEngine(index) {
    const container = document.getElementById(`slot-3d-canvas-${index}`);
    if (!container) return;

    const width = container.clientWidth || 240;
    const height = container.clientHeight || 170;

    // If the canvas is already built, append it back to the newly injected container
    if (slotRenderers[index]) {
        container.appendChild(slotRenderers[index].domElement);
        slotRenderers[index].setSize(width, height);
        slotCameras[index].aspect = width / height;
        slotCameras[index].updateProjectionMatrix();
        return;
    }

    const sScene = new THREE.Scene();
    const sCamera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    sCamera.position.set(0, 0, 48); // Positioned closer for clear card examples

    const sRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    sRenderer.setSize(width, height);
    sRenderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(sRenderer.domElement);

    sScene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.4));

    slotScenes[index] = sScene;
    slotCameras[index] = sCamera;
    slotRenderers[index] = sRenderer;
}

function renderSlot(index) {
    const sScene = slotScenes[index];
    const sCamera = slotCameras[index];
    const sRenderer = slotRenderers[index];
    if (sRenderer && sScene && sCamera) {
        sRenderer.render(sScene, sCamera);
    }
}

function loadSlotPart(index) {
    if (index < 0 || index > 3) return;

    const activeSet = glbModels[selections.type];
    const size = selections.holders[index].t;
    if (size === 'Empty') return;

    const file = activeSet.holders[size];
    const sScene = slotScenes[index];
    if (!file || !sScene) return; // Safely return if the viewport is not yet ready

    if (slotModels[index]) {
        sScene.remove(slotModels[index]);
        disposeObject(slotModels[index]);
    }

    const mat = getMat(selections.holders[index].c1, selections.holders[index].c2, true);
    loadGlbModel(file, null, (model) => {
        // Safety wrapper inside async callback: verify container still exists
        const activeScene = slotScenes[index];
        if (!activeScene) return;

        addPreparedModel(model, mat);
        activeScene.add(model);
        slotModels[index] = model;
        renderSlot(index);
    }, () => console.log("Missing model file: " + file));
}

// Universal material generator (solid colors or Y-axis dual-colors split at 15.2mm)
function getDesignTexture(key) {
    if (!hasDesignAddOnForPart(selections, key)) return null;

    const src = selections.designImages[key];
    if (!src) return null;

    if (!designTextureCache[key] || designTextureCache[key].src !== src) {
        const texture = new THREE.TextureLoader().load(src);
        texture.flipY = false;
        designTextureCache[key] = { src, texture };
    }

    return designTextureCache[key].texture;
}

function getPartMat(key) {
    return getMat(selections[key]);
}

function getSnapshotDesignTexture(snapshot, key) {
    if (!hasDesignAddOnForPart(snapshot, key)) return null;

    const src = snapshot.designImages?.[key];
    if (!src) return null;

    const cacheKey = `snapshot-${key}-${src}`;
    if (!designTextureCache[cacheKey]) {
        const texture = new THREE.TextureLoader().load(src);
        texture.flipY = false;
        designTextureCache[cacheKey] = { src, texture };
    }

    return designTextureCache[cacheKey].texture;
}

function getSnapshotPartMat(snapshot, key) {
    return getMat(snapshot[key]);
}

function getMat(c1, c2, split = false) {
    if (!split) {
        const mat = new THREE.MeshStandardMaterial({ color: c1, roughness: 0.5 });
        mat.userData = { c1, c2, split: false };
        return mat;
    }

    const mat = new THREE.MeshStandardMaterial({ color: c1, roughness: 0.5 });
    mat.userData = { c1, c2, split: true };
    mat.onBeforeCompile = (sh) => {
        sh.uniforms.splitY = { value: holderNumberColorStartY };
        sh.uniforms.c2 = { value: new THREE.Color(c2) };
        sh.vertexShader = `varying vec3 vP;\n` + sh.vertexShader.replace(
            `#include <begin_vertex>`,
            `#include <begin_vertex>\nvP = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        );
        sh.fragmentShader = `uniform float splitY; uniform vec3 c2; varying vec3 vP;\n` + sh.fragmentShader.replace(
            `vec4 diffuseColor = vec4( diffuse, opacity );`,
            `vec3 col = diffuse; if(vP.y >= splitY) col = c2; vec4 diffuseColor = vec4( col, opacity );`
        );
    };
    mat.customProgramCacheKey = () => `holder-split-${c1}-${c2}-${holderNumberColorStartY}`;
    return mat;
}

function disposeObject(object) {
    object.traverse?.((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    });
}

function centerObject(object) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);
}

function applyModelWorldYToGeometry(model) {
    model.updateMatrixWorld(true);
    model.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;

        child.geometry = child.geometry.clone();
        child.geometry.applyMatrix4(child.matrixWorld);
        child.position.set(0, 0, 0);
        child.rotation.set(0, 0, 0);
        child.scale.set(1, 1, 1);
        child.updateMatrixWorld(true);
    });

    // The geometry now contains the GLB's original transforms. Reset the root so
    // OrbitControls can orbit around world origin instead of an offset model pivot.
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);
}

function applyMaterialToModel(model, mat) {
    model.traverse((child) => {
        if (!child.isMesh) return;

        child.material = mat.userData?.split
            ? getMat(mat.userData.c1, mat.userData.c2, true)
            : mat.clone();
        child.castShadow = true;
        child.receiveShadow = true;
    });
}

function addPreparedModel(model, mat, slotIndex = null) {
    centerObject(model);
    applyModelWorldYToGeometry(model);
    centerObject(model);
    applyMaterialToModel(model, mat);
    model.rotation.x = Math.PI / 248;
    model.rotation.y = 0;

    if (slotIndex !== null) {
        model.position.x += (slotIndex - 1.5) * holderSpacing;
    }

    return model;
}

function cloneCachedModel(model) {
    const clone = model.clone(true);
    clone.traverse((child) => {
        if (!child.isMesh || !child.material) return;

        child.material = Array.isArray(child.material)
            ? child.material.map((m) => m.clone())
            : child.material.clone();
    });
    return clone;
}

function loadGlbModel(file, manager, onLoad, onError) {
    if (modelCache[file]) {
        if (manager) manager.itemStart(file);
        onLoad(cloneCachedModel(modelCache[file]));
        if (manager) manager.itemEnd(file);
        return;
    }

    const loader = manager ? new THREE.GLTFLoader(manager) : new THREE.GLTFLoader();
    loader.load(file, (gltf) => {
        const model = gltf.scene || gltf.scenes[0];
        centerObject(model);
        modelCache[file] = model;
        onLoad(cloneCachedModel(model));
    }, undefined, onError);
}

function loadRawGlbModel(file, manager, onLoad, onError) {
    const cacheKey = `raw:${file}`;
    if (rawModelCache[cacheKey]) {
        if (manager) manager.itemStart(file);
        onLoad(cloneCachedModel(rawModelCache[cacheKey]));
        if (manager) manager.itemEnd(file);
        return;
    }

    const loader = manager ? new THREE.GLTFLoader(manager) : new THREE.GLTFLoader();
    loader.load(file, (gltf) => {
        const model = gltf.scene || gltf.scenes[0];
        rawModelCache[cacheKey] = model;
        onLoad(cloneCachedModel(model));
    }, undefined, onError);
}

function clearScene() {
    if (!assemblyGroup) return;
    // Deep memory disposal to prevent mixed pieces sticking around
    while (assemblyGroup.children.length > 0) {
        const obj = assemblyGroup.children[0];
        disposeObject(obj);
        assemblyGroup.remove(obj);
    }
    assemblyGroup.rotation.set(0, 0, 0);
}

function loadPart(file, mat, manager = null, slotIndex = null) {
    loadGlbModel(file, manager, (model) => {
        assemblyGroup.add(addPreparedModel(model, mat, slotIndex));
    }, () => console.log("Missing model file: " + file));
}

function getObjectNamePath(object) {
    const names = [];
    let node = object;
    while (node) {
        if (node.name) names.push(node.name);
        node = node.parent;
    }
    return names.join(' ');
}

function normalizeModelName(name) {
    return String(name || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function getNamedPartMaterial(name, source = selections) {
    const normalized = normalizeModelName(name);
    if (normalized.includes('body')) return getMat(source.body);
    if (normalized.includes('module')) return getMat(source.module);
    if (normalized.includes('slider')) return getSnapshotPartMat(source, 'slider');
    if (normalized.includes('top plate')) return getSnapshotPartMat(source, 'top');
    if (normalized.includes('base plate')) return getSnapshotPartMat(source, 'bottom');
    return null;
}

function getCheckoutHolderSlotIndex(name) {
    const match = normalizeModelName(name).match(/pick\s*holder\s*(\d)/i);
    if (!match) return null;

    const slotIndex = Number(match[1]) - 1;
    return slotIndex >= 0 && slotIndex <= 3 ? slotIndex : null;
}

function getObjectBounds(object) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return null;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    return { box, center, size };
}

function prepareCheckoutPreviewBase(model, source = selections) {
    const placeholders = [];
    model.updateMatrixWorld(true);

    model.traverse((child) => {
        if (!child.isMesh) return;
        const label = getObjectNamePath(child);

        child.castShadow = true;
        child.receiveShadow = true;

        const slotIndex = getCheckoutHolderSlotIndex(label);
        if (slotIndex !== null) {
            const bounds = getObjectBounds(child);
            if (bounds) placeholders.push({ slotIndex, center: bounds.center.clone(), size: bounds.size.clone() });
            child.visible = false;
            return;
        }

        const mat = getNamedPartMaterial(label, source);
        if (mat) {
            child.material = mat.userData?.split
                ? getMat(mat.userData.c1, mat.userData.c2, true)
                : mat.clone();
        }
    });

    const modelBounds = getObjectBounds(model);
    const offset = modelBounds ? modelBounds.center.clone() : new THREE.Vector3();
    model.position.sub(offset);
    placeholders.forEach((placeholder) => placeholder.center.sub(offset));

    model.rotation.x = Math.PI / 248;
    model.rotation.y = 0;
    model.updateMatrixWorld(true);

    return placeholders;
}

function addCheckoutHolderReplacement(file, mat, placeholder, manager, targetGroup = assemblyGroup, onPartAdded = null) {
    loadRawGlbModel(file, manager, (model) => {
        applyMaterialToModel(model, mat);
        const bounds = getObjectBounds(model);
        if (!bounds) return;

        model.position.add(placeholder.center.clone().sub(bounds.center));
        model.rotation.x = Math.PI / 248;
        model.rotation.y = 0;
        targetGroup.add(model);
        if (onPartAdded) onPartAdded(model);
    }, () => console.log("Missing model file: " + file));
}

function loadCheckoutPreviewAssembly(activeSet, loadingManager, source = selections, targetGroup = assemblyGroup, onPartAdded = null) {
    if (!activeSet.checkoutPreview) return false;

    loadRawGlbModel(activeSet.checkoutPreview, loadingManager, (model) => {
        const placeholders = prepareCheckoutPreviewBase(model, source);
        targetGroup.add(model);
        if (onPartAdded) onPartAdded(model);

        placeholders.forEach((placeholder) => {
            const holder = source.holders[placeholder.slotIndex];
            if (!holder || holder.t === 'Empty') return;

            const holderFile = activeSet.holders[holder.t];
            if (!holderFile) return;

            addCheckoutHolderReplacement(
                holderFile,
                getMat(holder.c1, holder.c2, true),
                placeholder,
                loadingManager,
                targetGroup,
                onPartAdded
            );
        });
    }, () => {
        console.log("Missing model file: " + activeSet.checkoutPreview);
    });

    return true;
}

// PAGE NAVIGATION AND STATE RENDERING
function render() {
    document.querySelectorAll('.view-step').forEach(v => v.classList.remove('active'));
    const timeline = document.getElementById('timeline');
    const navFooter = document.querySelector('.nav-footer');
    const configContainer = document.getElementById('config-ui-container');
    const prevButton = document.getElementById('btn-prev');
    const nextButton = document.getElementById('btn-next');
    const stepIndicator = document.getElementById('step-indicator');

    if (activeView === 'shop') {
        if (configContainer) configContainer.style.display = 'none';
        if (timeline) timeline.style.display = 'none';
        if (navFooter) navFooter.style.display = 'none';
        document.getElementById('shop-view')?.classList.add('active');
        renderShopProducts();
        updateSiteCartCount();
        return;
    }

    if (activeView === 'checkout') {
        if (configContainer) configContainer.style.display = 'none';
        if (timeline) timeline.style.display = 'none';
        if (navFooter) navFooter.style.display = 'none';
        document.getElementById('checkout-view')?.classList.add('active');
        buildCheckout();
        updateSiteCartCount();
        return;
    }

    const isShopDetail = activeView === 'shop-detail';
    if (timeline) timeline.style.display = isShopDetail ? 'none' : '';
    if (navFooter) navFooter.style.display = '';
    if (stepIndicator) stepIndicator.style.display = isShopDetail ? 'none' : '';
    // Step 3 is hidden here because it uses its own custom left grid in index.html
    if (configContainer) configContainer.style.display = (currentStep > 1 && currentStep < 8 && currentStep !== 3) ? 'block' : 'none';
    prevButton.style.visibility = (currentStep === 1 && !isShopDetail) ? "hidden" : "visible";
    nextButton.style.display = "block";
    prevButton.textContent = isShopDetail ? 'Back to Shop' : getText('nav.previous', '← Previous');
    prevButton.onclick = isShopDetail ? openShop : () => changeStep(-1);
    nextButton.textContent = (currentStep === 8 || isShopDetail) ? 'Add to Cart' : getText('nav.next', 'Next →');
    nextButton.onclick = isShopDetail ? addActiveShopProductToCart : (currentStep === 8 ? addToCart : () => changeStep(1));

    const activeSet = glbModels[selections.type];
    const shopDetailProduct = isShopDetail ? getShopProductById(activeShopProductId) : null;
    syncPreviewContrast();

    if (currentStep === 1) {
        document.getElementById('step-1').classList.add('active');
    } else if (currentStep === 8) {
        const finalStep = document.getElementById('step-8');
        finalStep.classList.add('active');
        syncPreviewContrast();
        const finalStepInner = finalStep.firstElementChild;
        if (finalStepInner) finalStepInner.style.maxWidth = '850px';

        const placeholder = document.getElementById('final-assembly-viewport');
        initEngine('final-assembly-viewport');
        const finalSize = Math.min(placeholder.clientWidth || 600, placeholder.clientHeight || 600);
        renderer.setSize(finalSize, finalSize);
        camera.aspect = 1;
        camera.updateProjectionMatrix();
        placeholder.appendChild(renderer.domElement);
        clearScene();

        // 3D Assembly loading with Manager for progress calculations
        const loadingManager = new THREE.LoadingManager();
        const statusElement = document.getElementById('assembly-status');

        statusElement.style.display = 'block';

        loadingManager.onProgress = function (item, loaded, total) {
            const progress = Math.round((loaded / total) * 100);
            statusElement.innerText = formatText(
                getText('finalReview.assemblyStatusWithProgress', 'Assembling your PopOutPick... {progress}%'),
                { progress }
            );
        };

        loadingManager.onLoad = function () {
            statusElement.style.display = 'none';
        };

        if (!loadCheckoutPreviewAssembly(activeSet, loadingManager)) {
            loadPart(activeSet.body, getMat(selections.body), loadingManager);
            loadPart(activeSet.module, getMat(selections.module), loadingManager);
            loadPart(activeSet.slider, getPartMat('slider'), loadingManager);
            loadPart(activeSet.top, getPartMat('top'), loadingManager);
            loadPart(activeSet.bottom, getPartMat('bottom'), loadingManager);

            for (let i = 0; i < 4; i++) {
                const size = selections.holders[i].t;
                if (size !== 'Empty') {
                    const holderFile = activeSet.holders[size];
                    loadPart(holderFile, getMat(selections.holders[i].c1, selections.holders[i].c2, true), loadingManager, i);
                }
            }
        }
        buildBreakdown();
    } else if (currentStep === 3) {
        document.getElementById('step-3').classList.add('active');
        const isShopHolderDetail = isShopDetail && isShopHolderProduct(shopDetailProduct);
        
        // 1. Inject Left Slots Grid dynamically with unique canvas viewport containers
        const slotsLeft = document.getElementById('slots-grid-left');
        const slotIndexes = isShopHolderDetail ? [activeSlot] : [0,1,2,3];
        slotsLeft.innerHTML = slotIndexes.map(i => {
            const h = selections.holders[i];
            const bgColor = '#ffffff';
            const isConfigured = h.t !== 'Empty';
            const isActive = activeSlot === i;
            const bodyUsesWhite = isWhiteColor(h.c1);
            return `
            <div class="slot-card ${isActive ? 'active' : ''} ${bodyUsesWhite ? 'preview-contrast-dark' : 'preview-contrast-white'}" onclick="selectSlot(${i})" style="background:${bodyUsesWhite ? '#0b0807' : bgColor};">
                <div id="slot-3d-canvas-${i}" class="slot-3d-canvas"></div>
                <span class="slot-add-icon" style="display:${isConfigured ? 'none' : 'block'};">${escapeHtml(getText('symbols.add', '+'))}</span>
                ${isActive ? `<div class="slot-active-check">${escapeHtml(getText('symbols.configured', '✓'))}</div>` : ''}
                <div style="position:absolute;bottom:10px;left:12px;z-index:2;">
                    <span class="slot-badge">#${i+1}</span>
                </div>
                <div style="position:absolute;bottom:10px;right:12px;z-index:2;">
                    <span class="slot-badge">${escapeHtml(h.t)}</span>
                </div>
                ${isConfigured ? `<div class="slot-music-note">${escapeHtml(getText('symbols.musicNote', '♩'))}</div>` : ''}
            </div>`;
        }).join('');

        // Check if all 4 slots are configured
        const allConfigured = selections.holders.every(h => h.t !== 'Empty');
        const msgEl = document.getElementById('slots-complete-msg');
        if (msgEl) msgEl.style.display = !isShopHolderDetail && allConfigured ? 'block' : 'none';

        // 2. Inject Right Controls (slot header + thickness + color only; viewport is static in HTML)
        const ctrlRight = document.getElementById('step-3-controls-right');
        const currentHolder = selections.holders[activeSlot];
        const slotBg = currentHolder.c1 !== '#ffffff' ? currentHolder.c1 : '#e0e0e0';
        
        let html = `
        <div style="display:flex; align-items:center; gap:14px; margin-top:20px; margin-bottom:18px;">
            <div class="pickholder-number" style="background:${slotBg};">#${activeSlot+1}</div>
            <div>
                <div class="pickholder-title">${escapeHtml(isShopHolderDetail ? shopDetailProduct.name : formatText(getText('pickholders.itemTitle', 'Pickholder {number}'), { number: activeSlot + 1 }))}</div>
                <div class="pickholder-helper">${escapeHtml(isShopHolderDetail ? shopDetailProduct.description : getText('pickholders.helper', 'Configure the thickness and color for this slot'))}</div>
            </div>
        </div>`;

        if (isShopHolderDetail && shouldShopProductChooseType(shopDetailProduct)) {
            html += renderShopTypeSelector(shopDetailProduct);
        }

        const fixedHolderThickness = isShopHolderDetail ? getShopHolderThickness(shopDetailProduct) : null;
        const thicknessOptions = fixedHolderThickness ? [fixedHolderThickness] : getHolderThicknessOptions(selections.type);

        html += `<div class="label-caps">${escapeHtml(getText('pickholders.thicknessLabel', 'THICKNESS'))}</div>
        <div style="display:grid; grid-template-columns: repeat(3,1fr); gap:10px; margin-bottom:10px;">
            ${thicknessOptions.map(t => `<button class="thick-btn ${selections.holders[activeSlot].t===t?'selected':''}" onclick="setThick('${t}')">${escapeHtml(t)}</button>`).join('')}
        </div>`;
        ctrlRight.innerHTML = html;

        // 3. Mount the shared renderer into the static holder-3d-viewport and load the model
        initEngine('holder-3d-viewport');
        syncPreviewContrast();
        clearScene();

        const colorsBelowPreview = document.getElementById('step-3-colors-below-preview');
        if (colorsBelowPreview) {
            colorsBelowPreview.innerHTML = `
                <div class="label-caps">${escapeHtml(getText('pickholders.bodyColorLabel', 'COLOUR OF BODY'))}</div><div class="color-grid" id="g1"></div>
                <div class="label-caps">${escapeHtml(getText('pickholders.numberColorLabel', 'COLOR OF NUMBER'))}</div><div class="color-grid" id="g2"></div>`;
            renderGrid('g1', 'c1');
            renderGrid('g2', 'c2');
        }

        // Sync the rotate button to current state
        const rotBtn = document.getElementById('btn-rotate-holder');
        if (rotBtn) rotBtn.classList.toggle('active', isHolderRotating);
        updateRotateButtonLabel('btn-rotate-holder', isHolderRotating);

        const size = selections.holders[activeSlot].t;
        if (size !== 'Empty') {
            loadPart(activeSet.holders[size], getMat(selections.holders[activeSlot].c1, selections.holders[activeSlot].c2, true));
        }

        for (const i of slotIndexes) {
            initSlotEngine(i);
            loadSlotPart(i);
        }
    } else {
        const ctrl = document.getElementById('step-controls-injected');
        const titles = getText('normalSteps.titles', ["", "Body", "Pickholders", "Pick Holder Module", "Slider", "Top Plate", "Base Plate"]);

        initEngine('main-3d-viewport');
        clearScene();
        const rotBtn = document.getElementById('btn-rotate');
        if (rotBtn) rotBtn.classList.toggle('active', isRotating);
        updateRotateButtonLabel('btn-rotate', isRotating);

        const files = [
            "", 
            "", 
            activeSet.body, 
            "", 
            activeSet.module, 
            activeSet.slider, 
            activeSet.top,    
            activeSet.bottom  
        ];

        const keys = [
            "", 
            "", 
            "body", 
            "", 
            "module", 
            "slider", 
            "top", 
            "bottom" 
        ];
        loadPart(files[currentStep], ['slider', 'top', 'bottom'].includes(keys[currentStep]) ? getPartMat(keys[currentStep]) : getMat(selections[keys[currentStep]]));

        // Render Injected Content for normal steps
        const activeKey = keys[currentStep];
        syncPreviewContrast(activeKey);
        let html = `<h1>${escapeHtml(isShopDetail && shopDetailProduct?.name ? shopDetailProduct.name : titles[currentStep-1])}</h1>`;
        if (isShopDetail && shouldShopProductChooseType(shopDetailProduct)) {
            html += renderShopTypeSelector(shopDetailProduct);
        }
        html += `<div class="label-caps">${escapeHtml(getText('normalSteps.colorLabel', 'COLOR'))}</div><div class="color-grid" id="gc"></div>`;
        if (designPartKeys.includes(activeKey)) {
            const addOnKeys = getDesignAddOnKeysForPart(activeKey);
            const isDesignEnabled = hasDesignAddOnForPart(selections, activeKey);
            const previewSrc = selections.designImages[activeKey];
            const transform = selections.designTransforms[activeKey];
            html += addOnKeys.map(addOnKey => {
                const addOn = getDesignAddOnConfig(addOnKey);
                const selected = !!selections.designAddOns?.[addOnKey];
                return `
                    <button class="design-addon-toggle ${selected ? 'selected' : ''}" onclick="toggleDesignAddOn('${addOnKey}', ${!selected})">
                        <span>${escapeHtml(addOn?.label || getText('normalSteps.customDesignLabel', 'CUSTOM DESIGN IMAGE'))}</span>
                    </button>`;
            }).join('');

            if (isDesignEnabled) {
                const designColor = getDesignColor(activeKey);
                html += `
                    ${renderDesignColorGrid(activeKey)}
                    <div class="label-caps">${escapeHtml(getText('normalSteps.previewLabel', '2D PREVIEW'))}</div>
                    <div class="design-preview-box design-upload-dropzone ${isWhiteColor(designColor) ? 'preview-contrast-light-part' : ''} ${isBlackColor(designColor) ? 'preview-contrast-dark-part' : ''}" style="background:${designColor};" onclick="triggerDesignUpload(event, '${activeKey}')" ondragover="handleDesignDragOver(event)" ondragleave="handleDesignDragLeave(event)" ondrop="handleDesignDrop(event, '${activeKey}')">
                        <input id="design-upload-${activeKey}" class="design-upload-input" type="file" accept="image/*" onchange="handleDesignUpload(event, '${activeKey}')">
                        ${previewSrc
                            ? `<img id="design-preview-image-${activeKey}" class="design-preview-image" src="${previewSrc}" alt="${escapeHtml(getText('normalSteps.previewAlt', 'Uploaded custom design preview'))}" style="left:calc(50% + ${transform.x}px); top:calc(50% + ${transform.y}px); transform:translate(-50%, -50%) scale(${transform.scale / 100});" onpointerdown="startDesignDrag(event, '${activeKey}')">`
                            : `<div class="design-preview-empty"><strong>${escapeHtml(getText('symbols.upload', '☁️'))}</strong><span>${escapeHtml(getText('normalSteps.designDropText', 'Click or drop an image here'))}</span></div>`}
                    </div>
                    ${previewSrc ? `<div class="design-move-help">${escapeHtml(getText('normalSteps.designMoveHelp', 'Drag the uploaded design around the 2D preview'))}</div>` : ''}
                    <button class="design-addon-remove" onclick="clearDesignAddOnsForPart('${activeKey}')">${escapeHtml(getText('normalSteps.removeDesign', 'Remove design'))}</button>
                    <div id="design-upload-status-${activeKey}" class="${getUploadStatusClass(uploadStatuses.designs[activeKey])}">${renderUploadStatus(uploadStatuses.designs[activeKey])}</div>`;
            }
        }
        ctrl.innerHTML = html;
        renderGrid('gc', activeKey);
    }
    if (!isShopDetail) updateTimeline();
}

function renderGrid(id, key) {
    const g = document.getElementById(id); 
    if (!g) return;
    g.innerHTML = '';
    colors.forEach(c => {
        const s = document.createElement('div');
        let isSel = (currentStep === 3) ? selections.holders[activeSlot][key] === c : selections[key] === c;
        s.className = `swatch ${isSel?'selected':''}`; 
        s.style.backgroundColor = c;
        s.innerHTML = `<div class="mini-check">${escapeHtml(getText('symbols.configured', '✓'))}</div>`;
        s.onclick = () => { 
            if (currentStep === 3) selections.holders[activeSlot][key] = c; 
            else selections[key] = c; 
            render(); 
        };
        g.appendChild(s);
    });
}

function renderDesignColorGrid(partKey) {
    return `
        <div class="label-caps">${escapeHtml(getText('normalSteps.designColorLabel', 'DESIGN COLOUR'))}</div>
        <div class="color-grid design-color-grid">
            ${colors.map(color => `
                <button class="swatch ${getDesignColor(partKey) === color ? 'selected' : ''}" type="button" style="background-color:${color};" onclick="setDesignColor('${partKey}', '${color}')">
                    <div class="mini-check">${escapeHtml(getText('symbols.configured', '✓'))}</div>
                </button>`).join('')}
        </div>`;
}

function shouldShopProductChooseType(product) {
    return !!product && product.previewPart !== 'slider';
}

function getHolderThicknessOptions(type = selections.type) {
    return type === 'bass'
        ? ['30mm', '20mm', '10mm', '8mm', '6mm']
        : ['10mm', '8mm', '7mm', '6mm'];
}

function getDefaultHolderThicknessForType(type = selections.type) {
    return getHolderThicknessOptions(type)[0] || '10mm';
}

function renderShopTypeSelector(product = null) {
    const options = [
        { value: 'guitar', label: getText('step1.guitarTitle', 'Guitar') },
        { value: 'bass', label: getText('step1.bassTitle', 'Bass') }
    ];
    const label = product?.shopPartType === 'holder'
        ? getText('normalSteps.pickHolderTypeLabel', 'TYPE')
        : getText('normalSteps.moduleTypeLabel', 'TYPE');

    return `
        <div class="module-type-selector" aria-label="Choose ${escapeHtml(product?.name || 'shop part')} type">
            <div class="label-caps">${escapeHtml(label)}</div>
            <div class="module-type-options">
                ${options.map(option => `
                    <button class="module-type-option ${selections.type === option.value ? 'selected' : ''}" type="button" onclick="setShopProductType('${option.value}')">
                        ${escapeHtml(option.label)}
                    </button>`).join('')}
            </div>
        </div>`;
}

function getColorName(color) {
    const names = {
        '#1a1a1a': 'Black',
        '#ffffff': 'White',
        '#e53935': 'Red',
        '#1e88e5': 'Blue'
    };
    return names[color.toLowerCase()] || color;
}

function renderColorDetail(label, color) {
    return `
        <div class="part-color-detail">
            <span class="part-color-dot" style="background:${color};"></span>
            <span>${escapeHtml(label)}: ${escapeHtml(getColorName(color))}</span>
        </div>`;
}

function buildBreakdown() {
    const box = document.getElementById('master-breakdown-list');
    box.innerHTML = `<div class="label-caps">${escapeHtml(getText('finalReview.partsBreakdown', 'PARTS BREAKDOWN'))}</div>`;

    const colorLabel = getText('finalReview.colorLabel', 'Color');
    const bodyColorLabel = getText('finalReview.bodyColorLabel', 'Body color');
    const numberColorLabel = getText('finalReview.numberColorLabel', 'Number color');
    const thicknessLabel = getText('finalReview.thicknessLabel', 'Thickness');

    const getDesignDetails = (key) => {
        const details = [renderColorDetail(colorLabel, selections[key])];
        const addOns = getSelectedDesignAddOns(selections).filter(addOn => addOn.partKey === key);
        addOns.forEach((addOn) => {
            const designLabel = formatText(getText('normalSteps.designAddedLabel', '{type} design added'), { type: addOn.type || 'Custom' });
            details.push(`${escapeHtml(designLabel)} (+${formatCheckoutMoney(addOn.price)})`);
            details.push(renderColorDetail(getText('normalSteps.designColorLabel', 'Design colour'), getDesignColor(key)));
        });
        if (addOns.length && selections.designFileNames?.[key]) {
            details.push(`${escapeHtml(getText('normalSteps.designFileLabel', 'File'))}: ${escapeHtml(selections.designFileNames[key])}`);
        }
        return details;
    };

    const parts = [
        { name: getText('summary.body', 'Body'), step: 2, swatch: selections.body, details: [renderColorDetail(colorLabel, selections.body)] },
        { name: getText('summary.module', 'Pick Holder Module'), step: 4, swatch: selections.module, details: [renderColorDetail(colorLabel, selections.module)] },
        { name: getText('summary.slider', 'Slider'), step: 5, swatch: selections.slider, details: getDesignDetails('slider') },
        { name: getText('summary.top', 'Top Plate'), step: 6, swatch: selections.top, details: getDesignDetails('top') },
        { name: getText('summary.bottom', 'Base Plate'), step: 7, swatch: selections.bottom, details: getDesignDetails('bottom') }
    ];

    selections.holders.forEach((holder, index) => {
        parts.splice(1 + index, 0, {
            name: formatText(getText('pickholders.itemTitle', 'Pickholder {number}'), { number: index + 1 }),
            step: 3,
            swatch: `linear-gradient(90deg, ${holder.c1} 0 50%, ${holder.c2} 50% 100%)`,
            details: [
                `${escapeHtml(thicknessLabel)}: ${escapeHtml(holder.t)}`,
                renderColorDetail(bodyColorLabel, holder.c1),
                renderColorDetail(numberColorLabel, holder.c2)
            ]
        });
    });

    parts.forEach(item => {
        box.innerHTML += `
            <div class="part-card" onclick="goToStep(${item.step})">
                <div class="part-main">
                    <div class="summary-swatch" style="background:${item.swatch}"></div>
                    <div>
                        <strong>${escapeHtml(item.name)}</strong>
                        <div class="part-details">${item.details.map(detail => detail.startsWith('<') ? detail : `<div>${detail}</div>`).join('')}</div>
                    </div>
                </div>
                <div class="part-edit">${escapeHtml(getText('symbols.edit', '✎'))}</div>
            </div>`;
    });
}

function getCheckoutText(key, fallback) {
    return getText(`checkout.${key}`, fallback);
}

function getCommerceConfig() {
    return APP_CONFIG.commerce || {};
}

function shouldLogOptionalSupabaseWarnings() {
    return getCommerceConfig().quietOptionalSupabaseWarnings === false;
}

function formatCheckoutMoney(amount) {
    const symbol = getCommerceConfig().currencySymbol || '$';
    return `${symbol}${amount.toFixed(2)}`;
}

function getShopProducts() {
    return getCommerceConfig().shopProducts || [];
}

function getShopProductById(productId) {
    return getShopProducts().find(product => product.id === productId);
}

function getShopProductStep(product) {
    const part = product?.previewPart;
    if (product?.shopPartType === 'holder' || part?.startsWith('holder:')) return 3;
    if (part === 'module') return 4;
    if (part === 'slider') return 5;
    if (part === 'top') return 6;
    if (part === 'bottom' || part === 'base') return 7;
    return null;
}

function getStepPartKey(step = currentStep) {
    return {
        4: 'module',
        5: 'slider',
        6: 'top',
        7: 'bottom'
    }[step] || null;
}

function getShopHolderThickness(product) {
    return product?.shopPartType !== 'holder' && product?.previewPart?.startsWith('holder:')
        ? product.previewPart.replace('holder:', '')
        : null;
}

function isShopHolderProduct(product) {
    return product?.shopPartType === 'holder' || !!getShopHolderThickness(product);
}

function renderShopProductFallback(product, fallbackName = '') {
    const name = product?.name || fallbackName || 'Product';
    const symbol = product?.symbol || name.charAt(0);

    return product?.icon
        ? `<img src="${escapeHtml(product.icon)}" alt="${escapeHtml(name)}">`
        : `<span>${escapeHtml(symbol)}</span>`;
}

function getShopProductPreviewSpec(product) {
    const previewPart = product?.previewPart;
    if (!previewPart) return null;

    const type = product.selectedPreviewType || product.previewType || 'guitar';
    const activeSet = glbModels[type] || glbModels.guitar;
    const partKey = previewPart === 'base' ? 'bottom' : previewPart;
    const color = product.previewColor || '#ffffff';
    const numberColor = product.previewNumberColor || color;

    if (activeSet[partKey]) {
        return {
            file: activeSet[partKey],
            mat: getMat(color),
            color,
            rotation: product.previewRotation || null,
            spinSpeed: Number.isFinite(product.previewSpinSpeed) ? product.previewSpinSpeed : 0.012,
            zoom: product.previewZoom || 1.8
        };
    }

    const holderThickness = product.shopPartType === 'holder'
        ? getDefaultHolderThicknessForType(type)
        : partKey.replace(/^holder:/, '');
    if (activeSet.holders?.[holderThickness]) {
        return {
            file: activeSet.holders[holderThickness],
            mat: getMat(color, numberColor, true),
            color,
            rotation: product.previewRotation || null,
            spinSpeed: Number.isFinite(product.previewSpinSpeed) ? product.previewSpinSpeed : 0.012,
            zoom: product.previewZoom || 1.8
        };
    }

    return null;
}

function fitPreviewCameraToObject(object, camera, zoom = 1.8) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fov = camera.fov * (Math.PI / 180);
    const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * zoom;

    camera.position.set(maxDim * 0.08, maxDim * 0.05, cameraZ);
    camera.near = Math.max(cameraZ / 100, 0.01);
    camera.far = cameraZ * 100;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
}

function mountShopPartPreview(product, containerId, fallbackName = '') {
    const container = document.getElementById(containerId);
    if (!container || !product) return;

    const spec = getShopProductPreviewSpec(product);
    container.innerHTML = '';

    if (!spec || !window.THREE) {
        container.innerHTML = renderShopProductFallback(product, fallbackName);
        return;
    }

    container.classList.toggle('preview-contrast-dark', isWhiteColor(spec.color));
    container.classList.toggle('preview-contrast-white', !isWhiteColor(spec.color));

    const width = container.clientWidth || 220;
    const height = container.clientHeight || 160;
    const previewScene = new THREE.Scene();
    const previewCamera = new THREE.PerspectiveCamera(38, width / height, 0.1, 1000);
    const previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    previewRenderer.setSize(width, height);
    previewRenderer.setPixelRatio(window.devicePixelRatio || 1);
    container.appendChild(previewRenderer.domElement);

    previewScene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.35));
    const previewLight = new THREE.DirectionalLight(0xffffff, 0.65);
    previewLight.position.set(5, 6, 8);
    previewScene.add(previewLight);

    const previewGroup = new THREE.Group();
    previewScene.add(previewGroup);

    loadGlbModel(spec.file, null, (model) => {
        const preparedModel = addPreparedModel(model, spec.mat);
        if (Array.isArray(spec.rotation)) {
            preparedModel.rotation.set(spec.rotation[0] || 0, spec.rotation[1] || 0, spec.rotation[2] || 0);
        }
        previewGroup.add(preparedModel);
        fitPreviewCameraToObject(previewGroup, previewCamera, spec.zoom);
    }, () => {
        container.classList.remove('preview-contrast-dark', 'preview-contrast-white');
        container.innerHTML = renderShopProductFallback(product, fallbackName);
    });

    function animateShopPartPreview() {
        if (!container.isConnected) return;
        previewGroup.rotation.y += spec.spinSpeed;
        previewRenderer.render(previewScene, previewCamera);
        requestAnimationFrame(animateShopPartPreview);
    }
    animateShopPartPreview();
}

function mountVisibleShopPreviews() {
    document.querySelectorAll('[data-shop-preview-index]').forEach((container) => {
        const index = Number(container.dataset.shopPreviewIndex);
        mountShopPartPreview(getShopProducts()[index], container.id);
    });
}

function renderShopProducts() {
    const grid = document.getElementById('shop-product-grid');
    if (!grid) return;

    const products = getShopProducts();
    grid.innerHTML = products.map((product, index) => `
        <button class="shop-product-card" type="button" onclick="openShopProductDetail('${escapeHtml(product.id)}')">
            <div class="shop-part-preview" id="shop-preview-${index}" data-shop-preview-index="${index}">
                ${renderShopProductFallback(product)}
            </div>
            <h2>${escapeHtml(product.name)}</h2>
            <p>${escapeHtml(product.description || '')}</p>
            <strong>${formatCheckoutMoney(product.price)}</strong>
            <span class="shop-add-label">Customize</span>
        </button>`).join('');

    mountVisibleShopPreviews();
}

function createCartItemFromShopProduct(product) {
    const partKey = getStepPartKey(getShopProductStep(product));
    const holderSnapshot = isShopHolderProduct(product) ? { ...selections.holders[activeSlot] } : null;
    const selectedAddOns = partKey ? getSelectedDesignAddOns(selections).filter(addOn => addOn.partKey === partKey) : [];
    const addOnTotal = selectedAddOns.reduce((sum, addOn) => sum + addOn.price, 0);
    const details = [];
    const selectedType = product.previewType || selections.type;
    const typeLabel = selectedType ? selectedType.charAt(0).toUpperCase() + selectedType.slice(1) : '';

    if (holderSnapshot) {
        if (typeLabel) details.push(`Type: ${typeLabel}`);
        details.push(`${getText('finalReview.thicknessLabel', 'Thickness')}: ${holderSnapshot.t}`);
        details.push(`${getText('finalReview.bodyColorLabel', 'Body color')}: ${getColorName(holderSnapshot.c1)}`);
        details.push(`${getText('finalReview.numberColorLabel', 'Number color')}: ${getColorName(holderSnapshot.c2)}`);
    } else if (partKey && selections[partKey]) {
        if (shouldShopProductChooseType(product) && typeLabel) details.push(`Type: ${typeLabel}`);
        details.push(`${getText('finalReview.colorLabel', 'Color')}: ${getColorName(selections[partKey])}`);
    }
    selectedAddOns.forEach((addOn) => {
        details.push(getDesignAddOnSummary(addOn));
    });
    if (partKey && selectedAddOns.length) {
        details.push(`${getText('normalSteps.designColorLabel', 'Design colour')}: ${getColorName(getDesignColor(partKey))}`);
    }
    if (partKey && selectedAddOns.length && selections.designFileNames?.[partKey]) {
        details.push(`${getText('normalSteps.designFileLabel', 'File')}: ${selections.designFileNames[partKey]}`);
    }

    return {
        id: `${product.id}-${Date.now()}-${checkoutState.cartItems.length}`,
        type: 'shop-product',
        productId: product.id,
        name: product.name,
        description: [product.description || '', ...details].filter(Boolean).join(' | '),
        unitPrice: product.price + addOnTotal,
        addOns: selectedAddOns,
        partKey,
        holder: holderSnapshot,
        previewType: selectedType,
        partColor: partKey ? selections[partKey] : null,
        designImage: partKey ? selections.designImages?.[partKey] : null,
        designFileName: partKey ? selections.designFileNames?.[partKey] : null,
        designFile: partKey ? selections.designFiles?.[partKey] : null,
        designColor: partKey ? getDesignColor(partKey) : null,
        selections: null,
        quantity: 1
    };
}

function addShopProductToCart(productId) {
    const product = getShopProductById(productId);
    if (!product) return;

    checkoutState.cartItems.push(createCartItemFromShopProduct(product));
    saveCartToStorage();
    updateSiteCartCount();
    showShopCartAddedModal();
}

function openShopProductDetail(productId) {
    const product = getShopProductById(productId);
    const step = getShopProductStep(product);
    if (!product || !step) return;

    activeView = 'shop-detail';
    activeShopProductId = productId;
    checkoutState.addedToCart = false;
    checkoutState.started = false;
    currentStep = step;
    if (shouldShopProductChooseType(product)) {
        selections.type = product.previewType || selections.type || 'guitar';
        normalizeHolderThicknessesForType(selections.type);
    }
    if (step === 3) {
        activeSlot = 0;
        const holderThickness = getShopHolderThickness(product);
        selections.holders[activeSlot].t = holderThickness && getHolderThicknessOptions(selections.type).includes(holderThickness)
            ? holderThickness
            : getDefaultHolderThicknessForType(selections.type);
    }
    render();
}

function addActiveShopProductToCart() {
    if (!activeShopProductId) return;
    const product = getShopProductById(activeShopProductId);
    if (!product) return;

    checkoutState.cartItems.push(createCartItemFromShopProduct(product));
    saveCartToStorage();
    updateSiteCartCount();
    showShopCartAddedModal();
}

function getDesignAddOnConfig(key) {
    return getCommerceConfig().designAddOns?.[key] || null;
}

function getDesignAddOnPartKey(key) {
    return getDesignAddOnConfig(key)?.partKey || key;
}

function getDesignAddOnKeysForPart(partKey) {
    return designAddOnKeys.filter(key => getDesignAddOnPartKey(key) === partKey);
}

function hasDesignAddOnForPart(source = selections, partKey) {
    return getDesignAddOnKeysForPart(partKey).some(key => source.designAddOns?.[key]);
}

function clearDesignAddOnsForPart(partKey) {
    getDesignAddOnKeysForPart(partKey).forEach(key => {
        selections.designAddOns[key] = false;
    });
    selections.designImages[partKey] = null;
    selections.designFileNames[partKey] = null;
    selections.designFiles[partKey] = null;
    selections.designColors[partKey] = defaultDesignColor;
    selections.designTransforms[partKey] = { x: 0, y: 0, scale: 100 };
    uploadStatuses.designs[partKey] = null;
    render();
}

function getSelectedDesignAddOns(source = selections) {
    return designAddOnKeys
        .filter(key => source.designAddOns?.[key])
        .map(key => ({ key, partKey: getDesignAddOnPartKey(key), ...getDesignAddOnConfig(key) }))
        .filter(addOn => Number.isFinite(addOn.price));
}

function getDesignColor(partKey, source = selections) {
    return normalizeHexColor(source.designColors?.[partKey], defaultDesignColor);
}

function setDesignColor(partKey, color) {
    if (!designPartKeys.includes(partKey)) return;
    selections.designColors[partKey] = normalizeHexColor(color, defaultDesignColor);
    render();
}

function getConfiguredUnitPrice(source = selections) {
    const basePrice = getCommerceConfig().productBasePrice || 49;
    return getSelectedDesignAddOns(source).reduce((sum, addOn) => sum + addOn.price, basePrice);
}

function getCartItemUnitPrice(item) {
    if (Number.isFinite(item?.unitPrice)) return item.unitPrice;
    return getConfiguredUnitPrice(item?.selections || selections);
}

function getDesignAddOnSummary(addOn) {
    const type = addOn.type || getText('normalSteps.designAddedLabel', '{type} design added').replace('{type}', 'Custom');
    const partName = getText(`summary.${addOn.partKey || addOn.key}`, addOn.partKey || addOn.key);
    return `${partName} ${type} design (+${formatCheckoutMoney(addOn.price)})`;
}

function toggleDesignAddOn(key, enabled) {
    const partKey = getDesignAddOnPartKey(key);

    if (enabled && partKey === 'top') {
        getDesignAddOnKeysForPart('top').forEach(topKey => {
            selections.designAddOns[topKey] = false;
        });
    }

    selections.designAddOns[key] = enabled;

    if (!hasDesignAddOnForPart(selections, partKey)) {
        selections.designImages[partKey] = null;
        selections.designFileNames[partKey] = null;
        selections.designFiles[partKey] = null;
        selections.designColors[partKey] = defaultDesignColor;
        selections.designTransforms[partKey] = { x: 0, y: 0, scale: 100 };
        uploadStatuses.designs[partKey] = null;
    }

    render();
}

function getConfiguredProductName(source = selections) {
    return formatText(getCheckoutText('productName', 'Custom {type} PopOutPick'), {
        type: source.type.charAt(0).toUpperCase() + source.type.slice(1)
    });
}

function getConfiguredProductDescription(source = selections) {
    const addOns = getSelectedDesignAddOns(source);
    const addOnText = addOns.length
        ? ` · ${addOns.map(getDesignAddOnSummary).join(', ')}`
        : '';
    return `${getCheckoutText('productDescription', 'Configured set with 4 pickholders')} · ${source.holders.map(h => h.t).join(', ')}${addOnText}`;
}

function getCheckoutProductName() {
    return checkoutState.cartItems[0]?.name || getConfiguredProductName();
}

function getCheckoutProductDescription() {
    return checkoutState.cartItems[0]?.description || getConfiguredProductDescription();
}

function getCheckoutSubtotal() {
    const items = checkoutState.cartItems.length ? checkoutState.cartItems : [{ quantity: checkoutState.quantity, selections }];
    return items.reduce((sum, item) => sum + getCartItemUnitPrice(item) * item.quantity, 0);
}

function getCheckoutShipping() {
    const commerce = getCommerceConfig();
    return checkoutState.fulfilment === 'delivery'
        ? (commerce.deliveryShippingPrice || 0)
        : (commerce.meetupShippingPrice || 0);
}

function normalizePromoCode(code = '') {
    return String(code).trim().toUpperCase();
}

function getPromoCodes() {
    return getCommerceConfig().promoCodes || [];
}

function getActivePromo() {
    const normalizedCode = normalizePromoCode(checkoutState.promoCode);
    if (!normalizedCode) return null;
    if (checkoutState.promoValidation.code === normalizedCode) {
        return checkoutState.promoValidation.promo;
    }
    return null;
}

async function loadManagedCheckoutSettings() {
    const client = getSupabaseClient();
    if (!client) return;

    try {
        const { data, error } = await client.rpc('get_checkout_availability');
        if (error) throw error;

        checkoutManagedSettings = {
            loaded: true,
            timeSlots: data?.timeSlots || [],
            blockedDates: data?.blockedDates || []
        };

        if (activeView === 'checkout') buildCheckout();
    } catch (error) {
        if (shouldLogOptionalSupabaseWarnings()) {
            console.warn('Could not load managed checkout settings; using local config fallback', error);
        }
    }
}

async function validatePromoCode(code) {
    const normalizedCode = normalizePromoCode(code);
    const requestId = ++promoValidationRequestId;

    if (!normalizedCode) {
        checkoutState.promoValidation = { code: '', phase: '', promo: null };
        buildCheckout();
        return;
    }

    checkoutState.promoValidation = { code: normalizedCode, phase: 'checking', promo: null };
    buildCheckout();

    const client = getSupabaseClient();
    if (!client) {
        checkoutState.promoValidation = {
            code: normalizedCode,
            phase: 'error',
            promo: null
        };
        buildCheckout();
        return;
    }

    try {
        const { data, error } = await client.rpc('get_active_promo_code', { p_code: normalizedCode });
        if (error) throw error;
        if (requestId !== promoValidationRequestId) return;

        const row = Array.isArray(data) ? data[0] : null;
        checkoutState.promoValidation = {
            code: normalizedCode,
            phase: row ? 'success' : 'error',
            promo: row ? {
                code: row.code,
                label: row.label,
                type: row.discount_type,
                value: Number(row.discount_value) || 0
            } : null
        };
    } catch (error) {
        console.warn('Could not validate promo code through Supabase', error);
        checkoutState.promoValidation = {
            code: normalizedCode,
            phase: 'error',
            promo: null
        };
    }

    buildCheckout();
}

function getCheckoutDiscount() {
    const promo = getActivePromo();
    if (!promo) return 0;

    const subtotal = getCheckoutSubtotal();
    const value = Number(promo.value) || 0;
    const rawDiscount = promo.type === 'percent'
        ? subtotal * Math.max(0, value) / 100
        : Math.max(0, value);

    return Math.min(subtotal, Number(rawDiscount.toFixed(2)));
}

function getPromoStatus() {
    const code = checkoutState.promoCode.trim();
    if (!code) return null;

    if (checkoutState.promoValidation.code === normalizePromoCode(code) && checkoutState.promoValidation.phase === 'checking') {
        return {
            phase: 'sending',
            message: getCheckoutText('promoCheckingMessage', 'Checking promo code...')
        };
    }

    const promo = getActivePromo();
    if (!promo) {
        return {
            phase: 'error',
            message: formatText(getCheckoutText('promoInvalidMessage', '{code} is not a valid promo code.'), { code })
        };
    }

    return {
        phase: 'success',
        message: formatText(getCheckoutText('promoAppliedMessage', '{label} applied.'), {
            label: promo.label || normalizePromoCode(promo.code)
        })
    };
}

function getCheckoutTotal() {
    return Math.max(0, getCheckoutSubtotal() + getCheckoutShipping() - getCheckoutDiscount());
}

function getCheckoutLocation(locationId = checkoutState.selectedLocation) {
    return (getCommerceConfig().meetupLocations || []).find(location => location.id === locationId);
}

function buildCheckout() {
    const box = document.getElementById('checkout-box');
    if (!box) return;

    if (!checkoutState.addedToCart && !checkoutState.started) {
        box.classList.add('checkout-box-hidden');
        box.innerHTML = '';
        return;
    }

    box.classList.remove('checkout-box-hidden');

    if (checkoutState.addedToCart && !checkoutState.started) {
        box.innerHTML = `
            <div class="checkout-cart-prompt">
                <span class="checkout-kicker">Added to cart</span>
                <h2>Your custom PopOutPick is in your cart.</h2>
                <p class="subtitle">Would you like to continue shopping or proceed to checkout?</p>
                <div class="checkout-prompt-actions">
                    <button class="btn-nav" onclick="continueShopping()">Continue Shopping</button>
                    <button class="btn-nav btn-next" onclick="checkoutStartFlow()">Proceed to Checkout</button>
                </div>
            </div>`;
        return;
    }
    box.innerHTML = `
        <div class="checkout-flow">
            ${renderCheckoutProgress()}
            <div class="checkout-screen ${checkoutState.screen === 'cart' ? 'active' : ''}">${renderCheckoutCartScreen()}</div>
            <div class="checkout-screen ${checkoutState.screen === 'details' ? 'active' : ''}">${renderCheckoutDetailsScreen()}</div>
            <div class="checkout-screen ${checkoutState.screen === 'payment' ? 'active' : ''}">${renderCheckoutPaymentScreen()}</div>
        </div>`;

    mountVisibleCheckoutPreviews();
}

function mountCheckoutPreview(item, containerTarget) {
    const container = typeof containerTarget === 'string'
        ? document.getElementById(containerTarget)
        : containerTarget;
    if (!container || !item) return;

    container.innerHTML = '';
    if (!item.selections) {
        const product = getShopProductById(item.productId);
        if (product?.previewPart) {
            mountShopPartPreview({
                ...product,
                previewType: item.previewType || product.previewType,
                previewColor: item.holder?.c1 || item.partColor || product.previewColor,
                previewNumberColor: item.holder?.c2 || product.previewNumberColor
            }, container.id, item.name);
            return;
        }

        container.innerHTML = renderShopProductFallback(product, item.name);
        return;
    }

    if (!window.THREE) {
        container.textContent = item.name?.charAt(0) || 'P';
        return;
    }

    const width = container.clientWidth || 96;
    const height = container.clientHeight || 96;
    const previewZoom = container.classList.contains('checkout-product-preview-small') ? 1.9 : 1.65;
    const previewScene = new THREE.Scene();
    const previewCamera = new THREE.PerspectiveCamera(38, width / height, 0.1, 1000);

    const previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    previewRenderer.setSize(width, height);
    previewRenderer.setPixelRatio(window.devicePixelRatio || 1);
    container.appendChild(previewRenderer.domElement);

    previewScene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.35));
    const previewLight = new THREE.DirectionalLight(0xffffff, 0.5);
    previewLight.position.set(5, 6, 8);
    previewScene.add(previewLight);

    const previewGroup = new THREE.Group();
    previewScene.add(previewGroup);

    const snapshot = item.selections;
    const activeSet = glbModels[snapshot.type];
    if (!activeSet) {
        container.textContent = item.name?.charAt(0) || 'P';
        return;
    }

    const fitConfiguredPreview = () => {
        previewGroup.updateMatrixWorld(true);
        fitPreviewCameraToObject(previewGroup, previewCamera, previewZoom);
    };

    if (!loadCheckoutPreviewAssembly(activeSet, null, snapshot, previewGroup, fitConfiguredPreview)) {
        const addPreviewPart = (file, mat, slotIndex = null) => {
            loadGlbModel(file, null, (model) => {
                previewGroup.add(addPreparedModel(model, mat, slotIndex));
                fitConfiguredPreview();
            }, () => {});
        };

        addPreviewPart(activeSet.body, getMat(snapshot.body));
        addPreviewPart(activeSet.module, getMat(snapshot.module));
        addPreviewPart(activeSet.slider, getSnapshotPartMat(snapshot, 'slider'));
        addPreviewPart(activeSet.top, getSnapshotPartMat(snapshot, 'top'));
        addPreviewPart(activeSet.bottom, getSnapshotPartMat(snapshot, 'bottom'));
        snapshot.holders.forEach((holder, index) => {
            if (holder.t !== 'Empty') {
                addPreviewPart(activeSet.holders[holder.t], getMat(holder.c1, holder.c2, true), index);
            }
        });
    }

    function animatePreview() {
        if (!container.isConnected) return;
        previewGroup.rotation.y += 0.012;
        previewRenderer.render(previewScene, previewCamera);
        requestAnimationFrame(animatePreview);
    }
    animatePreview();
}

function mountVisibleCheckoutPreviews() {
    document.querySelectorAll('[data-checkout-preview-index]').forEach((container) => {
        const index = Number(container.dataset.checkoutPreviewIndex);
        mountCheckoutPreview(checkoutState.cartItems[index], container);
    });
}

function copyDesignFiles(source = selections) {
    return designPartKeys.reduce((files, key) => {
        files[key] = source.designFiles?.[key] || null;
        return files;
    }, {});
}

function createCartItemFromCurrentDesign() {
    const snapshot = JSON.parse(JSON.stringify(selections));
    snapshot.designFiles = copyDesignFiles(selections);

    return {
        id: `${Date.now()}-${checkoutState.cartItems.length}`,
        type: 'configured-design',
        productId: null,
        name: getConfiguredProductName(snapshot),
        description: getConfiguredProductDescription(snapshot),
        selections: snapshot,
        unitPrice: getConfiguredUnitPrice(snapshot),
        addOns: getSelectedDesignAddOns(snapshot),
        quantity: 1
    };
}

function renderCheckoutProgress() {
    const labels = getCheckoutText('flowLabels', ['Cart', 'Details', 'Payment']);
    const screens = ['cart', 'details', 'payment'];
    const activeIndex = screens.indexOf(checkoutState.screen);

    return `<div class="checkout-flow-progress">
        ${screens.map((screen, index) => `
            <div class="checkout-progress-step ${index < activeIndex ? 'done' : ''} ${index === activeIndex ? 'active' : ''}">
                <div class="checkout-progress-number">${index + 1}</div>
                <span>${escapeHtml(labels[index])}</span>
            </div>
            ${index < screens.length - 1 ? '<div class="checkout-progress-line"></div>' : ''}
        `).join('')}
    </div>`;
}

function renderCheckoutCartItems() {
    if (!checkoutState.cartItems.length) {
        return `<div class="checkout-empty-cart">
            <h3>${escapeHtml(getCheckoutText('emptyCartTitle', 'Your cart is empty.'))}</h3>
            <p>${escapeHtml(getCheckoutText('emptyCartMessage', 'Add a custom PopOutPick or shop individual parts to begin checkout.'))}</p>
            <div class="checkout-empty-actions">
                <button class="btn-nav" onclick="goToStep(1)">${escapeHtml(getCheckoutText('emptyCartCustomize', 'Customize'))}</button>
                <button class="btn-nav btn-next" onclick="openShop()">${escapeHtml(getCheckoutText('emptyCartShop', 'Shop Parts'))}</button>
            </div>
        </div>`;
    }

    return checkoutState.cartItems.map((item, index) => {
        const unitPrice = getCartItemUnitPrice(item);
        const canEdit = !!item.selections;
        return `
        <div class="checkout-cart-row">
            <div class="checkout-cart-product-block">
                <div class="checkout-product-preview" id="checkout-preview-${index}" data-checkout-preview-index="${index}">P</div>
                <div class="checkout-cart-product-copy">
                    <strong>${escapeHtml(item.name)}</strong>
                </div>
            </div>
            ${canEdit
                ? `<button class="checkout-edit-design" onclick="editCartItem(${index})">${escapeHtml(getCheckoutText('editDesign', 'Edit design'))}</button>`
                : '<span></span>'}
            <div class="checkout-qty-control">
                <button onclick="checkoutChangeItemQuantity(${index}, -1)">−</button>
                <strong>${item.quantity}</strong>
                <button onclick="checkoutChangeItemQuantity(${index}, 1)">+</button>
            </div>
            <strong>${formatCheckoutMoney(unitPrice * item.quantity)}</strong>
            <button class="checkout-remove-item" onclick="removeCartItem(${index})" aria-label="Remove item">×</button>
            <p class="checkout-cart-description">${escapeHtml(item.description)}</p>
        </div>`;
    }).join('');
}

function renderCheckoutCartScreen() {
    const hasItems = checkoutState.cartItems.length > 0;
    return `
        <div class="checkout-flow-grid">
            <section class="checkout-main-panel">
                <h2>${escapeHtml(getCheckoutText('cartTitle', 'Shopping Cart'))}</h2>
                ${renderCheckoutTrustCard('cart')}
                <div class="checkout-cart-header${hasItems ? '' : ' is-hidden'}">
                    <span>${escapeHtml(getCheckoutText('productHeader', 'Product'))}</span>
                    <span></span>
                    <span>${escapeHtml(getCheckoutText('quantityHeader', 'Quantity'))}</span>
                    <span>${escapeHtml(getCheckoutText('totalHeader', 'Total Price'))}</span>
                    <span></span>
                </div>
                ${renderCheckoutCartItems()}
                ${renderCheckoutTotals()}
            </section>
            <aside class="checkout-side-panel${hasItems ? '' : ' checkout-side-panel-disabled'}">
                <h2>${escapeHtml(getCheckoutText('fulfilmentTitle', 'Fulfilment'))}</h2>
                <div class="field-label">${escapeHtml(getCheckoutText('fulfilmentPrompt', 'How would you like to receive your order?'))}</div>
                <div class="checkout-method-list">
                    ${renderCheckoutMethod('meetup', getCheckoutText('meetupLabel', 'Meet-up'))}
                    ${renderCheckoutMethod('delivery', `${getCheckoutText('deliveryLabel', 'Delivery')} ${getCheckoutText('deliveryPriceLabel', '+$2.60')}`)}
                </div>
                ${renderCheckoutTrustList()}
                <button class="checkout-submit" onclick="checkoutGoToDetails()">${escapeHtml(getCheckoutText('continueToDetails', 'Continue to Details →'))}</button>
            </aside>
        </div>`;
}

function renderCheckoutMethod(type, label) {
    const checked = checkoutState.fulfilment === type;
    return `<label class="checkout-method-option ${checked ? 'selected' : ''}" onclick="checkoutSetFulfilment('${type}')">
        <span class="checkout-radio"><span></span></span>
        <span>${escapeHtml(label)}</span>
    </label>`;
}

function renderCheckoutDetailsScreen() {
    const isDelivery = checkoutState.fulfilment === 'delivery';
    return `
        <div class="checkout-flow-grid">
            <section class="checkout-main-panel">
                <h2>${escapeHtml(getCheckoutText(isDelivery ? 'detailsDeliveryTitle' : 'detailsMeetupTitle', isDelivery ? 'Delivery Details' : 'Meet-up Details'))}</h2>
                ${renderCheckoutTrustCard('details')}
                ${renderCheckoutContactFields()}
                ${isDelivery ? renderCheckoutDeliveryFields() : renderCheckoutMeetupFields()}
                ${checkoutState.errors.details ? `<div class="checkout-message">${escapeHtml(checkoutState.errors.details)}</div>` : ''}
                <button class="back-link" onclick="checkoutGoToCart()">${escapeHtml(getCheckoutText('backToCart', '‹ Back to Cart'))}</button>
            </section>
            <aside class="checkout-side-panel">
                <h2>${escapeHtml(getCheckoutText('orderSummaryTitle', 'Your Order'))}</h2>
                ${renderCheckoutFulfilmentDetails()}
                ${renderCheckoutOrderSummary('details')}
                <button class="checkout-submit" onclick="checkoutGoToPayment()">${escapeHtml(getCheckoutText('continueToPayment', 'Continue to Payment →'))}</button>
            </aside>
        </div>`;
}

function renderCheckoutContactFields() {
    return `<div class="label-caps">${escapeHtml(getCheckoutText('contactSectionLabel', 'Contact details'))}</div>
        <div class="checkout-form-grid cols-1">
            ${renderCheckoutInput('contact', 'name', getCheckoutText('nameLabel', 'Full name'), 'Alex Player')}
            ${renderCheckoutInput('contact', 'email', getCheckoutText('emailLabel', 'Email'), 'alex@example.com')}
            ${renderCheckoutInput('contact', 'phone', getCheckoutText('phoneLabel', 'Phone number'), '+65 9123 4567')}
            ${renderCheckoutInput('contact', 'telegram', getCheckoutText('telegramLabel', 'Telegram @'), '@alexplayer')}
        </div>`;
}

function renderCheckoutInput(group, field, label, placeholder) {
    const value = checkoutState[group][field] || '';
    return `<label class="checkout-input-wrap">${escapeHtml(label)}
        <input class="checkout-field" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" oninput="checkoutUpdateField('${group}', '${field}', this.value)">
    </label>`;
}

function renderCheckoutTextarea(group, field, label, placeholder) {
    const value = checkoutState[group][field] || '';
    return `<label class="checkout-input-wrap">${escapeHtml(label)}
        <textarea class="checkout-field" rows="3" placeholder="${escapeHtml(placeholder)}" oninput="checkoutUpdateField('${group}', '${field}', this.value)">${escapeHtml(value)}</textarea>
    </label>`;
}

function getAvailableTimeSlots() {
    if (checkoutManagedSettings.loaded && checkoutState.selectedDate && checkoutState.selectedLocation) {
        const selectedDate = getCheckoutSelectedDateObject();
        if (!selectedDate || isCheckoutDateBlocked(selectedDate, checkoutState.selectedLocation)) return [];
        const dayOfWeek = selectedDate.getDay();
        const managedTimes = checkoutManagedSettings.timeSlots
            .filter(slot => slot.location_id === checkoutState.selectedLocation && Number(slot.day_of_week) === dayOfWeek)
            .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
            .map(slot => slot.time_label);
        return [...new Set(managedTimes)];
    }

    const allSlots = getCommerceConfig().timeSlots || [];
    
    // If no date or location is selected, return all slots so the UI isn't empty
    if (!checkoutState.selectedDate || !checkoutState.selectedLocation) {
        return allSlots; 
    }

    const [dayStr, monthStr] = checkoutState.selectedDate.split(' ');
    const checkDate = new Date(`${monthStr} ${dayStr}, ${checkoutState.calendarYear}`);
    const dayOfWeek = checkDate.getDay();

    // 0 = Sun, 3 = Wed, 6 = Sat
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const isWednesday = (dayOfWeek === 3);
    const isWeekday = !isWeekend && !isWednesday; // Mon, Tue, Thu, Fri

    return allSlots.filter(time => {
        if (checkoutState.selectedLocation === 'ntu') {
            // NTU: 10:00 AM to 6:00 PM on Weekdays
            const ntuAllowed = ["10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM"];
            return isWeekday && ntuAllowed.includes(time);
        }

        if (checkoutState.selectedLocation === 'pasir-ris') {
            if (isWeekday) {
                // Pasir Ris Weekdays: Only 7:00 PM and 8:00 PM
                const pasirRisWeekdayAllowed = ["7:00 PM", "8:00 PM"];
                return pasirRisWeekdayAllowed.includes(time);
            } else if (isWednesday) {
                // Wednesdays AND Weekends at Pasir Ris: Allow all default times
                return true; 
            }
            // Weekends at Pasir Ris: Allow all default times
            return true;
        }

        return true;
    });
}

function getCheckoutSelectedDateObject(value = checkoutState.selectedDate) {
    if (!value) return null;
    const [dayStr, monthStr] = value.split(' ');
    const date = new Date(`${monthStr} ${dayStr}, ${checkoutState.calendarYear}`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function toLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function isCheckoutDateBlocked(date, locationId = checkoutState.selectedLocation) {
    if (!checkoutManagedSettings.loaded) return false;
    const dateKey = toLocalDateKey(date);
    return checkoutManagedSettings.blockedDates.some(blocked => {
        const sameDate = blocked.blocked_date === dateKey;
        const sameLocation = !blocked.location_id || blocked.location_id === locationId;
        return sameDate && sameLocation;
    });
}

function renderCheckoutMeetupFields() {
    const availableTimes = getAvailableTimeSlots();
    
    return `<div class="label-caps">${escapeHtml(getCheckoutText('locationLabel', 'Choose location'))}</div>
        <div class="checkout-location-grid">${(getCommerceConfig().meetupLocations || []).map(location => `<button class="checkout-location-card ${checkoutState.selectedLocation === location.id ? 'selected' : ''}" onclick="checkoutSelectLocation('${escapeHtml(location.id)}')"><strong>${escapeHtml(location.name)}</strong><small>${escapeHtml(location.sub)}</small></button>`).join('')}</div>
        <div class="label-caps">${escapeHtml(getCheckoutText('dateLabel', 'Pick a date'))}</div>
        ${renderCheckoutCalendar()}
        <div class="label-caps">${escapeHtml(getCheckoutText('timeLabel', 'Pick a time'))}</div>
        <div class="checkout-time-grid">
            ${availableTimes.length > 0
                ? availableTimes.map(time => `<button class="checkout-time-chip ${checkoutState.selectedTime === time ? 'selected' : ''}" onclick="checkoutSelectTime('${escapeHtml(time)}')">${escapeHtml(time)}</button>`).join('')
                : '<p style="color:#8d7d70; font-size:0.95rem; grid-column: 1/-1;">No times available for this date/location.</p>'}
        </div>`;
}

function getEarliestCheckoutDate() {
    const earliestDate = new Date();
    earliestDate.setHours(0, 0, 0, 0);
    earliestDate.setDate(earliestDate.getDate() + 7);
    return earliestDate;
}

function isCheckoutDateSelectable(date) {
    if (!date) return false;
    if (isCheckoutDateBlocked(date)) return false;
    if (checkoutManagedSettings.loaded && checkoutState.selectedLocation) {
        const dayOfWeek = date.getDay();
        return checkoutManagedSettings.timeSlots.some(slot => (
            slot.location_id === checkoutState.selectedLocation
            && Number(slot.day_of_week) === dayOfWeek
        )) && date >= getEarliestCheckoutDate();
    }
    return date >= getEarliestCheckoutDate();
}

function renderCheckoutCalendar() {
    const year = checkoutState.calendarYear;
    const month = checkoutState.calendarMonth;
    const monthName = new Date(year, month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const blanks = Array.from({ length: firstDay }, () => '<span></span>').join('');
    const days = Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const date = new Date(year, month, day);
        const value = `${day} ${monthName}`;
        // Orders need at least 7 days of lead time.
        let disabled = !isCheckoutDateSelectable(date);
    
    // Check if NTU is selected and if the day is a weekend
        if (checkoutState.selectedLocation === 'ntu') {
            const dayOfWeek = date.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 3 || dayOfWeek === 6) { // 0 = Sunday, 3 = Wednesday, 6 = Saturday
                disabled = true;
            }
        }
        return `<button class="checkout-calendar-day ${checkoutState.selectedDate === value ? 'selected' : ''}" ${disabled ? 'disabled' : ''} onclick="checkoutSelectDate('${value}')">${day}</button>`;
    }).join('');

    return `<div class="checkout-calendar-nav"><button onclick="checkoutShiftMonth(-1)">‹</button><strong>${escapeHtml(monthName)}</strong><button onclick="checkoutShiftMonth(1)">›</button></div>
        <div class="checkout-calendar-head"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
        <div class="checkout-calendar-grid">${blanks}${days}</div>`;
}

function renderCheckoutDeliveryFields() {
    return `<div class="label-caps">${escapeHtml(getCheckoutText('deliverySectionLabel', 'Delivery address'))}</div>
        <div class="checkout-form-grid cols-2">
            ${renderCheckoutInput('delivery', 'postal', getCheckoutText('postalLabel', 'Postal Code'), '510123')}
            ${renderCheckoutInput('delivery', 'street', getCheckoutText('streetLabel', 'Street Name'), 'Pasir Ris Drive 1')}
            ${renderCheckoutInput('delivery', 'block', getCheckoutText('blockLabel', 'Block No.'), '123')}
            ${renderCheckoutInput('delivery', 'floor', getCheckoutText('floorLabel', 'Floor No.'), '05')}
            ${renderCheckoutInput('delivery', 'unit', getCheckoutText('unitLabel', 'Unit No.'), '88')}
            ${renderCheckoutInput('delivery', 'building', getCheckoutText('buildingLabel', 'Building Name'), 'Sunrise Condo')}
        </div>
        ${renderCheckoutTextarea('delivery', 'notes', getCheckoutText('notesLabel', 'Others / Notes'), 'Leave at door, ring bell, etc.')}`;
}

function getDeliveryAddressSummary(delivery = checkoutState.delivery) {
    return [
        delivery.block ? `Blk ${delivery.block}` : '',
        delivery.street,
        delivery.floor || delivery.unit ? `#${delivery.floor || ''}${delivery.unit ? `-${delivery.unit}` : ''}` : '',
        delivery.building,
        delivery.postal ? `Singapore ${delivery.postal}` : ''
    ].filter(Boolean).join(', ');
}

function getCheckoutFulfilmentRows() {
    if (checkoutState.fulfilment === 'delivery') {
        const delivery = checkoutState.delivery;
        return [
            [getCheckoutText('deliveryLabel', 'Delivery'), getDeliveryAddressSummary(delivery) || getCheckoutText('deliverySectionLabel', 'Delivery address')],
            [getCheckoutText('postalLabel', 'Postal Code'), delivery.postal],
            [getCheckoutText('buildingLabel', 'Building Name'), delivery.building],
            [getCheckoutText('notesLabel', 'Others / Notes'), delivery.notes]
        ].filter(([, value]) => String(value || '').trim());
    }

    const location = getCheckoutLocation();
    return [
        [getCheckoutText('meetupLabel', 'Meet-up'), location ? `${location.name}${location.sub ? `, ${location.sub}` : ''}` : checkoutState.selectedLocation],
        [getCheckoutText('dateLabel', 'Pick a date'), checkoutState.selectedDate],
        [getCheckoutText('timeLabel', 'Pick a time'), checkoutState.selectedTime]
    ].filter(([, value]) => String(value || '').trim());
}

function renderCheckoutFulfilmentDetails() {
    const rows = getCheckoutFulfilmentRows();
    if (!rows.length) return '';

    return `<div class="checkout-fulfilment-card">
        <div class="label-caps">${escapeHtml(getCheckoutText('fulfilmentDetailsTitle', 'Fulfilment Details'))}</div>
        ${rows.map(([label, value]) => `
            <div class="checkout-fulfilment-row">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
            </div>`).join('')}
    </div>`;
}

function renderCheckoutPaymentScreen() {
    if (checkoutState.confirmed) {
        return renderCheckoutSuccessScreen();
    }

    const location = getCheckoutLocation();
    const details = checkoutState.fulfilment === 'delivery'
        ? getDeliveryAddressSummary()
        : [checkoutState.selectedDate, checkoutState.selectedTime, location ? location.name : '']
            .filter(Boolean)
            .join(' · ');

    const canConfirm = isUploadableFile(checkoutState.paymentScreenshotFile) && !checkoutState.isSubmitting && !checkoutState.confirmed;

    return `<div class="checkout-flow-grid">
        <section class="checkout-main-panel">
            <h2>${escapeHtml(getCheckoutText('paymentTitle', 'Order Summary'))}</h2>
            <div class="checkout-fulfilment-badge">${escapeHtml(checkoutState.fulfilment === 'delivery' ? getCheckoutText('deliveryLabel', 'Delivery') : getCheckoutText('meetupLabel', 'Meet-up'))}</div>
            <p class="checkout-fulfilment-detail">${escapeHtml(details)}</p>
            ${renderCheckoutFulfilmentDetails()}
            ${renderCheckoutOrderSummary('payment')}
            ${renderCheckoutPromoCode()}
            ${renderCheckoutTrustCard('payment')}
            <button class="back-link" onclick="checkoutGoToDetails()">${escapeHtml(getCheckoutText('backToDetails', '‹ Back to Details'))}</button>
        </section>
        <aside class="checkout-paynow-panel">
            <h2>${escapeHtml(getCheckoutText('payNowTitle', 'Pay via PayNow'))}</h2>
            <p>${escapeHtml(getCheckoutText('payNowSubtitle', 'Scan with your bank app to complete payment.'))}</p>
            <div class="checkout-qr-box">${renderCheckoutQrImage()}</div>
            <div class="checkout-qr-amount">${formatCheckoutMoney(getCheckoutTotal())}</div>
            <div class="checkout-qr-note">${escapeHtml(getCheckoutText('qrTransferTo', 'Transfer to: PopOutPick'))}</div>
            <div class="checkout-payment-upload ${checkoutState.paymentScreenshotName ? 'has-file' : ''}" role="button" tabindex="0" onclick="checkoutTriggerPaymentScreenshotUpload(event)" onkeydown="checkoutHandlePaymentUploadKeydown(event)" onpaste="checkoutHandlePaymentScreenshotPaste(event)">
                <span>${escapeHtml(getCheckoutText('paymentScreenshotLabel', "Upload or Paste Payment's Screen Shot"))}</span>
                <input id="checkout-payment-screenshot" type="file" accept="image/*" onchange="checkoutHandlePaymentScreenshot(event)">
                <small>${escapeHtml(checkoutState.paymentScreenshotName || getCheckoutText('paymentScreenshotHelp', 'Click here, or copy and paste your bank payment confirmation screenshot.'))}</small>
                ${checkoutState.paymentScreenshotName ? `<button type="button" class="checkout-payment-remove" onclick="checkoutRemovePaymentScreenshot(event)">${escapeHtml(getCheckoutText('paymentScreenshotRemove', 'Remove screenshot'))}</button>` : ''}
            </div>
            <div class="checkout-confirm-focus ${canConfirm ? 'is-ready' : ''}">
                <span class="checkout-confirm-arrow" aria-hidden="true">➜</span>
                <button class="checkout-confirm ${canConfirm ? 'is-ready' : ''}" ${canConfirm ? '' : 'disabled aria-disabled="true"'} onclick="checkoutHandleConfirm()">${escapeHtml(checkoutState.isSubmitting ? getCheckoutText('confirmSavingButton', 'Saving order...') : getCheckoutText('confirmButton', 'I’ve Paid — Confirm Order'))}</button>
                <span class="checkout-confirm-arrow" aria-hidden="true">⬅</span>
            </div>
            ${getCommerceConfig().enableCheckoutTestButton ? `<button class="checkout-test-sheet" onclick="checkoutSendSupabaseTest()">${escapeHtml(getCheckoutText('testSupabaseButton', 'Send test order to Supabase'))}</button>` : ''}
            ${checkoutState.submissionStatus ? `<div class="checkout-test-status ${checkoutState.submissionStatus.phase}">${escapeHtml(checkoutState.submissionStatus.message)}</div>` : ''}
        </aside>
    </div>`;
}

function renderCheckoutOrderSummary(scope = 'summary') {
    const items = checkoutState.cartItems.map((item, index) => {
        const unitPrice = getCartItemUnitPrice(item);
        return `
        <div class="checkout-summary-item">
            <div class="checkout-product-preview checkout-product-preview-small" id="checkout-${scope}-preview-${index}" data-checkout-preview-index="${index}">P</div>
            <div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description)} ×${item.quantity}</p></div>
            <strong>${formatCheckoutMoney(unitPrice * item.quantity)}</strong>
        </div>`;
    }).join('');

    return `${items}${renderCheckoutTotals()}`;
}

function renderCheckoutPromoCode() {
    const status = getPromoStatus();
    return `<div class="checkout-promo-card">
        <label class="checkout-input-wrap">${escapeHtml(getCheckoutText('promoCodeLabel', 'Promo code'))}
            <input id="checkout-promo-code" class="checkout-field" value="${escapeHtml(checkoutState.promoCode)}" placeholder="${escapeHtml(getCheckoutText('promoCodePlaceholder', 'Enter code'))}" oninput="checkoutUpdatePromoCode(this)">
        </label>
        ${status ? `<div class="checkout-promo-status ${status.phase}">${escapeHtml(status.message)}</div>` : `<small>${escapeHtml(getCheckoutText('promoCodeHelp', 'Discounts update automatically before you pay.'))}</small>`}
    </div>`;
}

function renderCheckoutTrustCard(stage = 'cart') {
    const fallbackCards = {
        cart: [
            { label: 'Production', value: 'Custom orders need at least 7 days before meetup or delivery.' },
            { label: 'Payment', value: 'PayNow confirmation is checked before the order is prepared.' },
            { label: 'Contact', value: 'We use your contact details only for this order.' }
        ],
        details: [
            { label: 'Meetup or delivery', value: 'Choose a valid date, time, and location before payment.' },
            { label: 'Order updates', value: 'We will contact you using your email, phone, or Telegram handle.' },
            { label: 'Privacy', value: 'Only the details needed to complete your order are collected.' }
        ],
        payment: [
            { label: 'Before confirming', value: 'Pay the exact total shown and upload your bank screenshot.' },
            { label: 'After confirming', value: 'Your order is saved and we will verify payment before making it.' },
            { label: 'Keep your ID', value: 'Save the order ID shown after confirmation.' }
        ]
    };
    const configuredCards = getCheckoutText('checkoutTrustCards', {});
    const rows = Array.isArray(configuredCards[stage]) && configuredCards[stage].length
        ? configuredCards[stage]
        : (fallbackCards[stage] || fallbackCards.cart);

    const safeRows = rows
        .map(row => ({
            label: row?.label || '',
            value: row?.value || ''
        }))
        .filter(row => row.label || row.value);

    return `<div class="checkout-trust-card">
        ${safeRows.map(({ label, value }) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join('')}
    </div>`;
}

function renderCheckoutTrustList() {
    return `<div class="checkout-side-note">
        <strong>${escapeHtml(getCheckoutText('checkoutTrustTitle', 'Good to know'))}</strong>
        <span>${escapeHtml(getCheckoutText('checkoutTrustLeadTime', 'Orders open from 7 days ahead so there is time to prepare your design.'))}</span>
        <span>${escapeHtml(getCheckoutText('checkoutTrustPayment', 'Payment proof is uploaded privately with your order.'))}</span>
    </div>`;
}

function renderCheckoutSuccessScreen() {
    const orderId = checkoutState.lastOrderId || '';
    return `<section class="checkout-success-panel">
        <span class="checkout-kicker">${escapeHtml(getCheckoutText('successKicker', 'Order received'))}</span>
        <h2>${escapeHtml(getCheckoutText('successTitle', 'Order confirmed'))}</h2>
        <p>${escapeHtml(getCheckoutText('successMessage', 'Thank you. We will contact you to confirm the details.'))}</p>
        ${orderId ? `<div class="checkout-order-id"><span>${escapeHtml(getCheckoutText('successOrderIdLabel', 'Order ID'))}</span><strong>${escapeHtml(orderId)}</strong></div>` : ''}
        <div class="checkout-next-steps">
            <div><strong>1</strong><span>${escapeHtml(getCheckoutText('successStepPayment', 'We verify your PayNow screenshot.'))}</span></div>
            <div><strong>2</strong><span>${escapeHtml(getCheckoutText('successStepConfirm', 'We contact you if any design or meetup detail needs confirmation.'))}</span></div>
            <div><strong>3</strong><span>${escapeHtml(getCheckoutText('successStepPrepare', 'Your PopOutPick is prepared for the selected meetup or delivery option.'))}</span></div>
        </div>
        <div class="checkout-prompt-actions">
            <button class="btn-nav" onclick="openShop()">${escapeHtml(getCheckoutText('continueShopping', 'Continue Shopping'))}</button>
            <button class="btn-nav btn-next" onclick="restartCustomPopOutPick()">${escapeHtml(getCheckoutText('restartCustom', 'Restart Custom PopOutPick'))}</button>
        </div>
    </section>`;
}

function renderCheckoutTotals() {
    const shipping = getCheckoutShipping();
    const discount = getCheckoutDiscount();
    return `<div class="checkout-totals"><div><span>${escapeHtml(getCheckoutText('subtotalLabel', 'Subtotal'))}</span><strong>${formatCheckoutMoney(getCheckoutSubtotal())}</strong></div><div><span>${escapeHtml(getCheckoutText('shippingLabel', 'Shipping'))}</span><strong>${shipping ? formatCheckoutMoney(shipping) : escapeHtml(getCheckoutText('freeShippingLabel', 'Free'))}</strong></div>${discount ? `<div><span>${escapeHtml(getCheckoutText('discountLabel', 'Discount'))}</span><strong>-${formatCheckoutMoney(discount)}</strong></div>` : ''}<div class="checkout-grand"><span>${escapeHtml(getCheckoutText('totalLabel', 'Total'))}</span><strong>${formatCheckoutMoney(getCheckoutTotal())}</strong></div></div>`;
}

function renderCheckoutQrImage() {
    return `<img class="checkout-qr-image" src="Picture/PayNOW QR code.jpg" alt="PayNow QR code">`;
}

function getCartItemCount() {
    return checkoutState.cartItems.reduce((sum, item) => sum + item.quantity, 0);
}

function updateSiteCartCount() {
    const count = getCartItemCount();
    document.querySelectorAll('.cart-badge, #site-cart-count').forEach((badge) => {
        badge.textContent = count;
    });
}

function setCartActionStatus(message = '') {
    const status = document.getElementById('cart-action-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-visible', Boolean(message));
}

function closeShopCartAddedModal() {
    document.getElementById('shop-cart-added-modal')?.remove();
}

function showShopCartAddedModal() {
    closeShopCartAddedModal();

    const modal = document.createElement('div');
    modal.id = 'shop-cart-added-modal';
    modal.className = 'shop-cart-added-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
        <div class="shop-cart-added-dialog">
            <p>${escapeHtml(getCheckoutText('shopAddedToCartMessage', 'Item has been added to cart'))}</p>
            <button type="button" class="btn-nav btn-next" onclick="closeShopCartAddedModal()">${escapeHtml(getCheckoutText('shopAddedToCartOk', 'OK'))}</button>
        </div>`;

    document.body.appendChild(modal);
    modal.querySelector('button')?.focus();
}

function renderFinalReviewCartPrompt(show = false) {
    const prompt = document.getElementById('final-review-cart-prompt');
    if (!prompt) return;

    if (!show) {
        prompt.innerHTML = '';
        prompt.classList.remove('is-visible');
        return;
    }

    prompt.classList.add('is-visible');
    prompt.innerHTML = `
        <span class="checkout-kicker">${escapeHtml(getCheckoutText('addedToCartMessage', 'Added to cart'))}</span>
        <h3>${escapeHtml(getCheckoutText('customAddedTitle', 'Your custom PopOutPick is in your cart.'))}</h3>
        <p>${escapeHtml(getCheckoutText('customAddedPrompt', 'Continue shopping or start another custom PopOutPick?'))}</p>
        <div class="checkout-prompt-actions">
            <button class="btn-nav" onclick="continueShopping()">${escapeHtml(getCheckoutText('continueShopping', 'Continue Shopping'))}</button>
            <button class="btn-nav btn-next" onclick="restartCustomPopOutPick()">${escapeHtml(getCheckoutText('restartCustom', 'Restart Custom PopOutPick'))}</button>
            <button class="btn-nav btn-proceed-cart" onclick="openCart()">${escapeHtml(getCheckoutText('proceedToCart', 'Proceed to Cart'))}</button>
        </div>`;
}

function addToCart() {
    checkoutState.cartItems.push(createCartItemFromCurrentDesign());
    checkoutState.addedToCart = true;
    saveCartToStorage();
    updateSiteCartCount();
    setCartActionStatus(getCheckoutText('addedToCartMessage', 'Added to cart'));
    renderFinalReviewCartPrompt(true);
}

function openCart() {
    setCartActionStatus();
    renderFinalReviewCartPrompt(false);
    activeView = 'checkout';
    checkoutState.addedToCart = false;
    checkoutState.started = true;
    checkoutState.screen = 'cart';
    updateSiteCartCount();
    render();
}
function openShop() {
    setCartActionStatus();
    renderFinalReviewCartPrompt(false);
    activeView = 'shop';
    activeShopProductId = null;
    checkoutState.addedToCart = false;
    checkoutState.started = false;
    render();
}
function continueShopping() { openShop(); }
function restartCustomPopOutPick() {
    setCartActionStatus();
    renderFinalReviewCartPrompt(false);
    Object.assign(selections, JSON.parse(JSON.stringify(defaultSelections)));
    checkoutState.addedToCart = false;
    checkoutState.started = false;
    activeSlot = 0;
    goToStep(1);
}
function checkoutStartFlow() { openCart(); }
function checkoutGoToCart() { activeView = 'checkout'; checkoutState.screen = 'cart'; render(); }
function checkoutGoToDetails() { if (!checkoutState.cartItems.length) return; checkoutState.screen = 'details'; checkoutState.errors = {}; buildCheckout(); }
function checkoutSetFulfilment(type) { checkoutState.fulfilment = type; checkoutState.errors = {}; buildCheckout(); }
function checkoutChangeItemQuantity(index, delta) {
    const item = checkoutState.cartItems[index];
    if (!item) return;
    item.quantity = Math.max(1, item.quantity + delta);
    saveCartToStorage();
    updateSiteCartCount();
    buildCheckout();
}
function removeCartItem(index) {
    checkoutState.cartItems.splice(index, 1);
    checkoutState.started = checkoutState.cartItems.length > 0;
    checkoutState.addedToCart = false;
    saveCartToStorage();
    updateSiteCartCount();
    if (checkoutState.cartItems.length) buildCheckout();
    else render();
}
function editCartItem(index) {
    const item = checkoutState.cartItems[index];
    if (!item || !item.selections) return;
    Object.assign(selections, JSON.parse(JSON.stringify(item.selections)));
    checkoutState.addedToCart = false;
    checkoutState.started = false;
    goToStep(1);
}
function checkoutChangeQuantity(delta) { checkoutChangeItemQuantity(0, delta); }
function checkoutUpdateField(group, field, value) { checkoutState[group][field] = value; }
function checkoutUpdatePromoCode(input) {
    const value = typeof input === 'string' ? input : input?.value || '';
    const cursor = typeof input?.selectionStart === 'number' ? input.selectionStart : value.length;
    checkoutState.promoCode = value;
    window.clearTimeout(checkoutState.promoValidationTimer);
    checkoutState.promoValidationTimer = window.setTimeout(() => validatePromoCode(value), 250);
    buildCheckout();
    const restoredInput = document.getElementById('checkout-promo-code');
    if (restoredInput) {
        restoredInput.focus();
        restoredInput.setSelectionRange(cursor, cursor);
    }
}
function checkoutShiftMonth(delta) { checkoutState.calendarMonth += delta; if (checkoutState.calendarMonth > 11) { checkoutState.calendarMonth = 0; checkoutState.calendarYear++; } if (checkoutState.calendarMonth < 0) { checkoutState.calendarMonth = 11; checkoutState.calendarYear--; } buildCheckout(); }
function checkoutSelectDate(value) {
    const selectedDate = getCheckoutSelectedDateObject(value);
    if (!isCheckoutDateSelectable(selectedDate)) return;

    checkoutState.selectedDate = value;
    checkoutState.errors = {};

    // Clear the time selection if the new date makes the current time invalid
    const availableTimes = getAvailableTimeSlots();
    if (checkoutState.selectedTime && !availableTimes.includes(checkoutState.selectedTime)) {
        checkoutState.selectedTime = null;
    }
    
    buildCheckout(); 
}
function checkoutSelectTime(value) { checkoutState.selectedTime = value; checkoutState.errors = {}; buildCheckout(); }
function checkoutSelectLocation(value) { 
    checkoutState.selectedLocation = value; 
    checkoutState.errors = {}; 
    
    // Clear dates that do not meet the lead-time/location rules.
    if (checkoutState.selectedDate) {
        const checkDate = getCheckoutSelectedDateObject();
        const dayOfWeek = checkDate.getDay();
        const blockedByLocation = value === 'ntu' && (dayOfWeek === 0 || dayOfWeek === 3 || dayOfWeek === 6);
        const blockedByManagedRules = checkoutManagedSettings.loaded && (
            isCheckoutDateBlocked(checkDate, value)
            || !checkoutManagedSettings.timeSlots.some(slot => slot.location_id === value && Number(slot.day_of_week) === dayOfWeek)
        );

        if (!isCheckoutDateSelectable(checkDate) || blockedByLocation || blockedByManagedRules) {
            checkoutState.selectedDate = null;
        }
    }
    
    // Clear the time selection if the new location makes the current time invalid
    const availableTimes = getAvailableTimeSlots();
    if (checkoutState.selectedTime && !availableTimes.includes(checkoutState.selectedTime)) {
        checkoutState.selectedTime = null;
    }

    buildCheckout(); 
}

function checkoutGoToPayment() {
    const hasContact = checkoutState.contact.name.trim()
        && checkoutState.contact.email.trim()
        && checkoutState.contact.phone.trim()
        && checkoutState.contact.telegram.trim();
    if (!hasContact) {
        checkoutState.errors.details = getCheckoutText('requiredContactMessage', 'Please enter your name, email, phone number, and Telegram @.');
        buildCheckout();
        return;
    }
    if (checkoutState.fulfilment === 'meetup' && (!checkoutState.selectedDate || !checkoutState.selectedTime || !checkoutState.selectedLocation)) {
        checkoutState.errors.details = getCheckoutText('requiredMeetupMessage', 'Please select a date, time, and location to continue.');
        buildCheckout();
        return;
    }
    if (checkoutState.fulfilment === 'delivery' && (!checkoutState.delivery.postal.trim() || !checkoutState.delivery.street.trim())) {
        checkoutState.errors.details = getCheckoutText('requiredDeliveryMessage', 'Please complete the required delivery fields.');
        buildCheckout();
        return;
    }
    checkoutState.screen = 'payment';
    checkoutState.confirmed = false;
    checkoutState.paymentScreenshotName = '';
    checkoutState.paymentScreenshotSource = '';
    checkoutState.paymentScreenshotFile = null;
    buildCheckout();
}

function checkoutSetPaymentScreenshot(name, source, file = null) {
    const validFile = isUploadableFile(file) && String(file.type || '').toLowerCase().startsWith('image/');
    checkoutState.paymentScreenshotName = validFile ? (name || file.name || 'Payment screenshot') : '';
    checkoutState.paymentScreenshotSource = validFile ? source : '';
    checkoutState.paymentScreenshotFile = validFile ? file : null;
    buildCheckout();
}

function checkoutTriggerPaymentScreenshotUpload(event) {
    if (event.target.closest('.checkout-payment-remove')) return;
    const input = document.getElementById('checkout-payment-screenshot');
    if (input) input.click();
}

function checkoutHandlePaymentUploadKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    checkoutTriggerPaymentScreenshotUpload(event);
}

function checkoutHandlePaymentScreenshot(event) {
    const file = event.target.files && event.target.files[0];
    checkoutSetPaymentScreenshot(file ? file.name : '', 'upload', file || null);
}

function checkoutHandlePaymentScreenshotPaste(event) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(item => item.type && item.type.startsWith('image/'));
    if (!imageItem) return;

    event.preventDefault();
    const file = imageItem.getAsFile();
    checkoutSetPaymentScreenshot(file?.name || 'Pasted payment screenshot', 'paste', file || null);
}

function checkoutRemovePaymentScreenshot(event) {
    event.preventDefault();
    event.stopPropagation();
    checkoutState.paymentScreenshotName = '';
    checkoutState.paymentScreenshotSource = '';
    checkoutState.paymentScreenshotFile = null;
    buildCheckout();
}

function cloneSelectionsForOrder(source) {
    if (!source) return null;
    return {
        ...source,
        designImages: undefined,
        designFiles: undefined,
        designFileNames: { ...source.designFileNames },
        designColors: getDefaultDesignColors(source.designColors),
        designAddOns: { ...source.designAddOns },
        designTransforms: JSON.parse(JSON.stringify(source.designTransforms || {})),
        holders: JSON.parse(JSON.stringify(source.holders || []))
    };
}

function buildOrderPayload() {
    const location = getCheckoutLocation();
    const orderId = createOrderId();
    const fulfilmentSummary = getCheckoutFulfilmentRows().map(([label, value]) => `${label}: ${value}`).join(' | ');
    const promo = getActivePromo();
    const promoCode = normalizePromoCode(checkoutState.promoCode);
    return {
        orderId,
        createdAt: new Date().toISOString(),
        customer: { ...checkoutState.contact },
        fulfilment: checkoutState.fulfilment,
        meetup: checkoutState.fulfilment === 'meetup' ? {
            date: checkoutState.selectedDate,
            time: checkoutState.selectedTime,
            locationId: checkoutState.selectedLocation,
            location: location ? location.name : checkoutState.selectedLocation,
            locationSub: location?.sub || '',
            summary: fulfilmentSummary
        } : null,
        delivery: checkoutState.fulfilment === 'delivery' ? {
            ...checkoutState.delivery,
            addressSummary: getDeliveryAddressSummary(),
            summary: fulfilmentSummary
        } : null,
        items: checkoutState.cartItems.map((item) => ({
            id: item.id,
            type: item.type || 'configured-design',
            productId: item.type === 'shop-product' ? (item.productId || null) : null,
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            unitPrice: getCartItemUnitPrice(item),
            lineTotal: getCartItemUnitPrice(item) * item.quantity,
            addOns: item.addOns || (item.selections ? getSelectedDesignAddOns(item.selections) : []),
            designColor: item.designColor || null,
            selections: cloneSelectionsForOrder(item.selections)
        })),
        totals: {
            subtotal: getCheckoutSubtotal(),
            shipping: getCheckoutShipping(),
            discount: getCheckoutDiscount(),
            promoCode: promo ? promoCode : '',
            promoLabel: promo ? promo.label || promoCode : '',
            total: getCheckoutTotal()
        },
        payment: {
            method: 'PayNow',
            status: 'pending_payment_review',
            screenshotName: checkoutState.paymentScreenshotName,
            screenshotSource: checkoutState.paymentScreenshotSource
        }
    };
}

function getSupabaseConfig() {
    return getCommerceConfig().supabase || {};
}

function getSupabaseClient() {
    const config = getSupabaseConfig();
    if (!config.url || !config.anonKey || !window.supabase?.createClient) return null;
    if (!window.popoutpickSupabaseClient) {
        window.popoutpickSupabaseClient = window.supabase.createClient(config.url, config.anonKey);
    }
    return window.popoutpickSupabaseClient;
}

function getExtensionFromMime(type = '') {
    const mime = String(type).toLowerCase();
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/gif') return 'gif';
    if (mime === 'image/svg+xml') return 'svg';
    return 'bin';
}

function sanitizeStorageName(name = 'file') {
    return String(name)
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        || 'file';
}

function createOrderId() {
    const buyerName = sanitizeStorageBucketName(checkoutState.contact.name || 'customer').replace(/^order-/, '').slice(0, 40);
    const now = new Date();
    const timestamp = now.toISOString()
        .replace(/\.\d{3}Z$/, 'Z')
        .replace(/[:.]/g, '-')
        .toLowerCase();
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return `order-${buyerName}-${timestamp}-${uniqueId}`;
}

function createTestOrderId() {
    const timestamp = new Date().toISOString()
        .replace(/\.\d{3}Z$/, 'Z')
        .replace(/[:.]/g, '-')
        .toLowerCase();
    return `order-test-${timestamp}-${Date.now()}`;
}

function isUploadableFile(value) {
    return value instanceof Blob && Number.isFinite(value.size);
}

function getFileForItemDesign(item, partKey) {
    const selectionFile = item.selections?.designFiles?.[partKey];
    if (isUploadableFile(selectionFile)) return selectionFile;
    if (item.selections?.designImages?.[partKey] && item.selections?.designFileNames?.[partKey]) {
        return dataUrlToFile(item.selections.designImages[partKey], item.selections.designFileNames[partKey]);
    }
    if (isUploadableFile(item.designFile)) return item.designFile;
    if (item.designImage && item.designFileName) return dataUrlToFile(item.designImage, item.designFileName);
    return null;
}

function dataUrlToFile(dataUrl, name) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
    const [meta, base64] = dataUrl.split(',');
    const mime = meta.match(/data:(.*?);base64/)?.[1] || 'application/octet-stream';
    const binary = atob(base64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    const fileName = name || `upload.${getExtensionFromMime(mime)}`;
    return new File([bytes], fileName, { type: mime });
}

function sanitizeStorageBucketName(name = 'order') {
    const normalized = sanitizeStorageName(name)
        .toLowerCase()
        .replace(/_/g, '-')
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized.startsWith('order-') ? normalized : `order-${normalized || 'file'}`;
}

function getOrderStorageBucket(orderId) {
    return sanitizeStorageBucketName(orderId || createTestOrderId());
}

function getStorageSubfolderForRole(fileRole) {
    return fileRole === 'payment-proof' ? 'payment' : 'design';
}

function createCheckoutFileUpload(file, fileRole, itemId = '', partKey = null, index = 0) {
    if (!file) return null;
    if (!isUploadableFile(file)) {
        throw new Error(`Invalid upload for ${fileRole}: expected a File or Blob.`);
    }

    const fallbackName = `${fileRole}.${getExtensionFromMime(file.type)}`;
    const safeName = sanitizeStorageName(file.name || fallbackName);
    return {
        file,
        metadata: {
            fieldName: `file-${index}`,
            fileRole: fileRole === 'payment-proof' ? 'payment_proof' : 'design_upload',
            itemId: itemId || null,
            partKey: partKey || null,
            originalName: file.name || safeName,
            contentType: file.type || 'application/octet-stream',
            size: file.size || null
        }
    };
}

function collectCheckoutFilesForApi() {
    const files = [];

    if (checkoutState.paymentScreenshotFile) {
        files.push(createCheckoutFileUpload(
            checkoutState.paymentScreenshotFile,
            'payment-proof',
            '',
            null,
            files.length
        ));
    }

    for (const item of checkoutState.cartItems) {
        const partKeys = item.selections
            ? designPartKeys.filter(partKey => item.selections.designFileNames?.[partKey])
            : (item.designFileName ? [item.partKey] : []);

        for (const partKey of partKeys) {
            const file = getFileForItemDesign(item, partKey);
            if (!file) continue;

            files.push(createCheckoutFileUpload(
                file,
                'design-upload',
                item.id,
                partKey,
                files.length
            ));
        }
    }

    return files.filter(Boolean);
}

function getCheckoutApiUrl() {
    const configuredUrl = String(getCommerceConfig().checkoutApiUrl || '').trim();
    if (configuredUrl) return configuredUrl;
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        return `${window.location.origin}/api/checkout/orders`;
    }
    return '';
}

function normalizeUploadedOrderFile(file) {
    return file.metadata;
}

async function submitCheckoutOrderToApi(payload, files) {
    const checkoutApiUrl = getCheckoutApiUrl();
    if (!checkoutApiUrl) return { skipped: true };

    const formData = new FormData();
    formData.append('order', JSON.stringify(payload));
    formData.append('fileMetadata', JSON.stringify(files.map(normalizeUploadedOrderFile)));
    files.forEach(({ file, metadata }) => {
        formData.append(metadata.fieldName, file, metadata.originalName || file.name || 'upload');
    });

    const response = await fetch(checkoutApiUrl, {
        method: 'POST',
        body: formData
    });

    const text = await response.text();
    let data = {};
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = { error: text };
        }
    }

    if (!response.ok) {
        throw new Error(data.error || `Checkout API failed with status ${response.status}.`);
    }

    return { skipped: false, files, server: data };
}

function getCheckoutSubmissionErrorMessage(error) {
    const fallback = getCheckoutText('orderSubmissionError', 'Order submission failed. Please try again or contact us with your order details.');
    const details = error?.message ? String(error.message).trim() : '';
    if (!details || details === fallback) return fallback;
    return `${fallback} ${details}`;
}

async function submitOrderToSupabase(payload) {
    const files = collectCheckoutFilesForApi();
    return submitCheckoutOrderToApi(payload, files);
}

function buildSupabaseTestPayload() {
    const sampleSelections = cloneSelectionsForOrder(selections);
    return {
        orderId: createTestOrderId(),
        createdAt: new Date().toISOString(),
        customer: {
            name: 'TEST CUSTOMER',
            email: 'test@example.com',
            phone: '+65 0000 0000',
            telegram: '@testcustomer'
        },
        fulfilment: 'meetup',
        meetup: {
            date: 'TEST DATE',
            time: 'TEST TIME',
            location: 'TEST LOCATION'
        },
        delivery: null,
        items: [{
            id: 'test-item-1',
            name: 'TEST PopOutPick Order',
            description: 'This is a test order from the website test button.',
            quantity: 1,
            unitPrice: getConfiguredUnitPrice(sampleSelections),
            lineTotal: getConfiguredUnitPrice(sampleSelections),
            addOns: getSelectedDesignAddOns(sampleSelections),
            selections: sampleSelections
        }],
        totals: {
            subtotal: getConfiguredUnitPrice(sampleSelections),
            shipping: 0,
            discount: 0,
            promoCode: '',
            promoLabel: '',
            total: getConfiguredUnitPrice(sampleSelections)
        },
        payment: {
            method: 'TEST',
            status: 'supabase_connection_test'
        }
    };
}

async function checkoutSendSupabaseTest() {
    checkoutState.submissionStatus = { phase: 'sending', message: 'Sending test order...' };
    buildCheckout();

    try {
        const result = await submitOrderToSupabase(buildSupabaseTestPayload());
        checkoutState.submissionStatus = result.skipped
            ? { phase: 'error', message: getCheckoutText('missingSupabaseMessage', 'Supabase is not configured yet.') }
            : { phase: 'success', message: getCheckoutText('supabaseTestSuccess', 'Test order saved in Supabase.') };
    } catch (error) {
        console.error('Supabase test failed', error);
        checkoutState.submissionStatus = { phase: 'error', message: getCheckoutText('supabaseTestError', 'Supabase test failed. Check your project URL, anon key, and RLS policies.') };
    }

    buildCheckout();
}

async function checkoutHandleConfirm() {
    if (!checkoutState.paymentScreenshotName || checkoutState.isSubmitting || checkoutState.confirmed) return;

    const payload = buildOrderPayload();
    checkoutState.lastOrderId = payload.orderId;
    checkoutState.isSubmitting = true;
    checkoutState.submissionStatus = { phase: 'sending', message: 'Saving order...' };
    buildCheckout();

    try {
        const result = await submitOrderToSupabase(payload);
        if (result.skipped) {
            throw new Error(getCheckoutText('missingSupabaseMessage', 'Supabase is not configured yet.'));
        }
        checkoutState.confirmed = true;
        checkoutState.isSubmitting = false;
        checkoutState.submissionStatus = null;
        checkoutState.cartItems = [];
        clearSavedCart();
        updateSiteCartCount();
    } catch (error) {
        console.error('Order Supabase submission failed', error);
        checkoutState.confirmed = false;
        checkoutState.isSubmitting = false;
        checkoutState.submissionStatus = { phase: 'error', message: getCheckoutSubmissionErrorMessage(error) };
    }

    buildCheckout();
}

function updateTimeline() {
    const labels = getText('timeline.labels', ['Type', 'Body', 'Pickholders', 'Module', 'Slider', 'Top Plate', 'Base Plate', 'Final Review']);
    const container = document.getElementById('timeline');
    container.innerHTML = '';
    labels.forEach((l, i) => {
        const num = i + 1;
        const status = num < currentStep ? 'completed' : (num === currentStep ? 'active' : '');
        const circleText = num < currentStep ? getText('symbols.configured', '✓') : num;
        container.innerHTML += `<div class="step ${status}" onclick="goToStep(${num})"><div class="step-circle">${escapeHtml(circleText)}</div><div class="step-label">${escapeHtml(l)}</div><div class="line"></div></div>`;
    });
    document.getElementById('step-indicator').innerText = formatText(
        getText('timeline.stepIndicator', 'STEP {current} OF {total}'),
        { current: currentStep, total: labels.length }
    );
}

function toggleRotate() { 
    isRotating = !isRotating; 
    const btn = document.getElementById('btn-rotate');
    if (btn) btn.classList.toggle('active', isRotating);
    updateRotateButtonLabel('btn-rotate', isRotating);
}

function toggleHolderRotate() {
    isHolderRotating = !isHolderRotating;
    const btn = document.getElementById('btn-rotate-holder');
    if (btn) btn.classList.toggle('active', isHolderRotating);
    updateRotateButtonLabel('btn-rotate-holder', isHolderRotating);
}

function updateRotateButtonLabel(buttonId, rotating) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    const label = rotating ? 'Click to stop rotating' : 'Click to start rotating';
    btn.title = label;
    btn.setAttribute('aria-label', label);
}

function normalizeHolderThicknessesForType(type) {
    const allowed = type === 'bass'
        ? ['30mm', '20mm', '10mm', '8mm', '6mm']
        : ['10mm', '8mm', '7mm', '6mm'];

    selections.holders.forEach((holder) => {
        if (!allowed.includes(holder.t)) {
            holder.t = allowed[0];
        }
    });
}

function selectType(t) {
    selections.type = t;
    normalizeHolderThicknessesForType(t);
    document.querySelectorAll('.type-card').forEach(c => c.classList.toggle('selected', c.id === 'card-'+t));
    setTimeout(() => changeStep(1), 300);
}

function setShopProductType(type) {
    if (!glbModels[type]) return;
    const product = getShopProductById(activeShopProductId);
    selections.type = type;
    normalizeHolderThicknessesForType(type);
    if (isShopHolderProduct(product)) {
        const fixedThickness = getShopHolderThickness(product);
        selections.holders[activeSlot].t = fixedThickness && getHolderThicknessOptions(type).includes(fixedThickness)
            ? fixedThickness
            : getDefaultHolderThicknessForType(type);
    }
    render();
}

function handleImageFile(file, handlers = {}) {
    if (!file) return;

    handlers.onStart?.(file);
    const reader = new FileReader();
    reader.onprogress = function(e) {
        handlers.onProgress?.(e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : null);
    };
    reader.onload = function(e) {
        handlers.onLoad?.(e.target.result);
    };
    reader.onerror = function() {
        handlers.onError?.(reader.error || new Error('File could not be read'));
    };
    reader.readAsDataURL(file);
}

function handleDesignFileForKey(file, key) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        setDesignUploadStatus(key, {
            phase: 'error',
            progress: null,
            message: uploadStatusText('normalSteps.uploadErrorText', 'Could not load {name}', { name: file.name }),
            meta: 'Please upload an image file.'
        });
        return;
    }

    if (!hasDesignAddOnForPart(selections, key)) {
        selections.designAddOns[key] = true;
    }

    const previousName = selections.designFileNames[key] || getText('normalSteps.currentDesignFallback', 'current design');
    const values = { name: file.name, previous: previousName };

    handleImageFile(file, {
        onStart: () => {
            setDesignUploadStatus(key, {
                phase: 'reading',
                progress: 0,
                message: uploadStatusText('normalSteps.uploadReadingText', 'Reading new file: {name}', values),
                meta: uploadStatusText('normalSteps.uploadReplacingMeta', 'Preparing to replace {previous}', values)
            });
        },
        onProgress: (progress) => {
            setDesignUploadStatus(key, {
                phase: 'reading',
                progress,
                message: uploadStatusText('normalSteps.uploadReadingText', 'Reading new file: {name}', values),
                meta: uploadStatusText('normalSteps.uploadReplacingMeta', 'Preparing to replace {previous}', values)
            });
        },
        onLoad: (src) => {
            setDesignUploadStatus(key, {
                phase: 'replacing',
                progress: 100,
                message: uploadStatusText('normalSteps.uploadReplacingText', 'Replacing {previous} with {name}', values)
            });
            selections.designImages[key] = src;
            selections.designFileNames[key] = file.name;
            selections.designFiles[key] = file;
            selections.designTransforms[key] = { x: 0, y: 0, scale: 100 };
            uploadStatuses.designs[key] = {
                phase: 'complete',
                progress: 100,
                message: uploadStatusText('normalSteps.uploadCompleteText', '{name} is now active in this design', values),
                meta: uploadStatusText('normalSteps.uploadCompleteMeta', 'Previous in-memory file: {previous}', values)
            };
            render();
        },
        onError: () => {
            setDesignUploadStatus(key, {
                phase: 'error',
                progress: null,
                message: uploadStatusText('normalSteps.uploadErrorText', 'Could not load {name}', values),
                meta: getText('normalSteps.uploadErrorMeta', 'The previous file is still active.')
            });
        }
    });
}

function handleDesignUpload(event, key) {
    const file = event.target.files && event.target.files[0];
    if (event.target) event.target.value = '';
    handleDesignFileForKey(file, key);
}

function triggerDesignUpload(event, key) {
    if (event.target.closest('.design-preview-image')) return;
    document.getElementById(`design-upload-${key}`)?.click();
}

function handleDesignDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('is-dragover');
}

function handleDesignDragLeave(event) {
    event.currentTarget.classList.remove('is-dragover');
}

function handleDesignDrop(event, key) {
    event.preventDefault();
    event.currentTarget.classList.remove('is-dragover');
    const file = event.dataTransfer?.files?.[0];
    handleDesignFileForKey(file, key);
}

function updateDesignScale(key, value) {
    selections.designTransforms[key].scale = Number(value);
    const image = document.getElementById(`design-preview-image-${key}`);
    if (image) {
        const transform = selections.designTransforms[key];
        image.style.transform = `translate(-50%, -50%) scale(${transform.scale / 100})`;
    }
}

function startDesignDrag(event, key) {
    event.preventDefault();
    event.stopPropagation();
    const image = event.currentTarget;
    image.setPointerCapture(event.pointerId);

    const transform = selections.designTransforms[key];
    const startX = event.clientX;
    const startY = event.clientY;
    const initialX = transform.x;
    const initialY = transform.y;

    function moveDesign(moveEvent) {
        transform.x = initialX + moveEvent.clientX - startX;
        transform.y = initialY + moveEvent.clientY - startY;
        image.style.left = `calc(50% + ${transform.x}px)`;
        image.style.top = `calc(50% + ${transform.y}px)`;
    }

    function stopDrag() {
        image.removeEventListener('pointermove', moveDesign);
        image.removeEventListener('pointerup', stopDrag);
        image.removeEventListener('pointercancel', stopDrag);
    }

    image.addEventListener('pointermove', moveDesign);
    image.addEventListener('pointerup', stopDrag);
    image.addEventListener('pointercancel', stopDrag);
}

function goToStep(n) { setCartActionStatus(); renderFinalReviewCartPrompt(false); activeView = 'customizer'; currentStep = n; render(); }
function changeStep(d) { setCartActionStatus(); renderFinalReviewCartPrompt(false); activeView = 'customizer'; currentStep += d; if (currentStep < 1) currentStep = 1; if (currentStep > 8) currentStep = 8; render(); }
function selectSlot(i) { activeSlot = i; render(); }
function setThick(t) { selections.holders[activeSlot].t = t; render(); }

function handleConfiguratorHashRoute() {
    if (window.location.hash === '#shop') {
        openShop();
        return true;
    }
    if (window.location.hash === '#checkout-box') {
        openCart();
        return true;
    }
    return false;
}

function getSamePageHashFromLink(link) {
    if (!link?.hash) return '';

    const linkUrl = new URL(link.href, window.location.href);
    const currentPath = window.location.pathname.split('/').pop() || 'configurator.html';
    const linkPath = linkUrl.pathname.split('/').pop() || 'configurator.html';
    return linkUrl.origin === window.location.origin && linkPath === currentPath ? linkUrl.hash : '';
}

function handleConfiguratorNavClick(event) {
    const link = event.target.closest('a[href]');
    const hash = getSamePageHashFromLink(link);
    if (hash !== '#shop' && hash !== '#checkout-box') return;

    event.preventDefault();
    if (window.location.hash !== hash) {
        window.location.hash = hash;
        return;
    }
    handleConfiguratorHashRoute();
}

// INITIAL ENGINE EXECUTION
applyTypographyConfig();
applyStaticTextConfig();
restoreCartFromStorage();
updateSiteCartCount();
loadManagedCheckoutSettings();
document.addEventListener('click', handleConfiguratorNavClick);
window.addEventListener('hashchange', () => {
    handleConfiguratorHashRoute();
});
if (!handleConfiguratorHashRoute()) {
    render();
}

