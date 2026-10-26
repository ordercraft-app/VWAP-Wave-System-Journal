// --- IndexedDB Setup ---

const DB_NAME = 'VWAPAppDB';
const STORE_NAME = 'fileStore';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e);
    });
}

async function saveHandleToDB(handle) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(handle, 'journalDirHandle'); 
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    });
}

async function getHandleFromDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get('journalDirHandle');
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e);
    });
}

async function verifyPermission(dirHandle, readWrite = true) {
    const opts = { mode: readWrite ? 'readwrite' : 'read' };
    if ((await dirHandle.queryPermission(opts)) === 'granted') {
        return true;
    }
    if ((await dirHandle.requestPermission(opts)) === 'granted') {
        return true;
    }
    return false;
}


// --- Data Loading ---

// Setup used to be one flat list; it is now grouped in categories
// (like Evidence). Known core setups go to "Core setup", the rest to "Advanced setup".
const CORE_SETUP_NAMES = ['price discovery continuation', 'fade value area extremes', 'return to value', 'vwap bounce'];

// Setup names in American title case. Old spellings are renamed in the
// settings and in every saved trade, so stats keep counting them together.
const SETUP_RENAMES = {
    'Fade value area extremes': 'Fade Value Area Extremes',
    'Return to value': 'Return to Value',
    'VWAP/POC Scalpes in balance': 'VWAP/POC Scalps in Balance',
    'Inside HTF balance fades': 'Inside HTF Balance Fades',
    'IB Extension fades': 'IB Extension Fades'
};

function renameSetups() {
    const rename = name => SETUP_RENAMES[name] || name;
    const cfg = appData.settings.setup;
    if (cfg && !Array.isArray(cfg)) {
        Object.keys(cfg).forEach(cat => {
            if (!Array.isArray(cfg[cat])) return;
            // Rename and drop duplicates if both spellings existed
            cfg[cat] = cfg[cat].map(rename).filter((v, i, arr) => arr.indexOf(v) === i);
        });
    }
    appData.trades.forEach(t => {
        if (t.setup) t.setup = rename(t.setup);
    });
}

// Starter custom chart every user gets once. If they delete it, it stays gone.
// Setup values are only used when they exist in the user's own setup list.
const DEFAULT_SETUPS_FOR_HEATMAP = ['Price Discovery Continuation', 'Fade Value Area Extremes', 'Return to Value', 'VWAP Bounce'];

function addDefaultCustomCharts() {
    const sets = appData.settings;
    if (!Array.isArray(sets.customCharts)) sets.customCharts = [];
    if (sets.customCharts.some(c => c && c.id === 'cc_default_symbol_setup')) return;

    const setupCfg = sets.setup && !Array.isArray(sets.setup) ? sets.setup : {};
    const known = Object.values(setupCfg).flat();
    const setups = DEFAULT_SETUPS_FOR_HEATMAP.filter(s => known.includes(s));

    const filters = [];
    if (setups.length) filters.push({ field: 'setup', exclude: false, values: setups });
    filters.push({ field: 'symbol', exclude: true, values: ['BTC', 'CL'] });

    sets.customCharts.push({
        id: 'cc_default_symbol_setup',
        title: '',
        view: 'heatmap',
        metric: 'winRate',
        groupBy: '',
        rowsBy: 'symbol',
        colsBy: 'setup',
        filters,
        minTrades: 3,
        size: 3
    });
    if (!sets.chartVisibility) sets.chartVisibility = {};
    sets.chartVisibility['custom:cc_default_symbol_setup'] = true;
}

// Target "Swing" (High / Low) became "Price Action" (Swing High / Swing Low,
// plus Higher High and Lower Low). Renamed in settings, trades and custom charts.
const SWING_SUB_RENAMES = { 'HIgh': 'Swing High', 'High': 'Swing High', 'Low': 'Swing Low' };

function migrateTargetPriceAction() {
    const sets = appData.settings;
    const target = sets.target;
    if (!target || typeof target !== 'object' || Array.isArray(target)) return;
    if (!target.Swing || target['Price Action']) return; // user changed it already, leave it alone

    const renamed = {};
    Object.keys(target).forEach(key => {
        if (key !== 'Swing') { renamed[key] = target[key]; return; }
        const old = target.Swing || {};
        const sub1 = (old.sub1 || []).map(v => SWING_SUB_RENAMES[v] || v);
        ['Higher High', 'Lower Low'].forEach(v => { if (!sub1.includes(v)) sub1.push(v); });
        renamed['Price Action'] = { sub1: [...new Set(sub1)], sub2: old.sub2 || [] };
    });
    sets.target = renamed;

    appData.trades.forEach(t => {
        if (t.target !== 'Swing') return;
        t.target = 'Price Action';
        if (t.targetSub1) t.targetSub1 = SWING_SUB_RENAMES[t.targetSub1] || t.targetSub1;
    });

    (sets.customCharts || []).forEach(c => (c.filters || []).forEach(f => {
        if (f.field !== 'target' || !Array.isArray(f.values)) return;
        f.values = f.values.map(v => {
            const parts = String(v).split(' › ');
            if (parts[0] !== 'Swing') return v;
            parts[0] = 'Price Action';
            if (parts[1]) parts[1] = SWING_SUB_RENAMES[parts[1]] || parts[1];
            return parts.join(' › ');
        });
    }));
}

// Clean up trades so every part of the app can rely on the same shape:
// lists are always arrays, without empty entries. Runs on every load and
// only removes values that could never be shown (null, missing primary).
function normalizeTrades() {
    if (!Array.isArray(appData.trades)) appData.trades = [];
    const pathList = list => (Array.isArray(list) ? list : [])
        .filter(x => x && typeof x === 'object' && x.primary)
        .map(x => ({ ...x, primary: String(x.primary) }));
    appData.trades = appData.trades.filter(t => t && typeof t === 'object').map(t => {
        const n = { ...t };
        n.locations = pathList(t.locations);
        n.evidences = pathList(t.evidences);
        n.invalidations = pathList(t.invalidations);
        n.psychology = (Array.isArray(t.psychology) ? t.psychology : []).filter(x => typeof x === 'string' && x.trim());
        ['symbol', 'marketCondition', 'setup', 'direction', 'target', 'targetSub1', 'targetSub2', 'notes'].forEach(k => {
            if (n[k] === undefined || n[k] === null) n[k] = '';
        });
        if (!n.id) n.id = (crypto.randomUUID ? crypto.randomUUID() : 'id_' + Math.random().toString(36).slice(2));
        return n;
    });
}

// Make sure every list the app reads exists with the right type, so a
// hand-edited or older settings.json can't break the Settings page or forms.
function ensureSettingsShape() {
    if (!appData.settings || typeof appData.settings !== 'object' || Array.isArray(appData.settings)) appData.settings = {};
    const sets = appData.settings;
    ['symbol', 'marketCondition', 'direction', 'psychology'].forEach(k => {
        if (!Array.isArray(sets[k])) sets[k] = [];
    });
    ['location', 'evidence', 'invalidation', 'target'].forEach(k => {
        if (!sets[k] || typeof sets[k] !== 'object' || Array.isArray(sets[k])) sets[k] = {};
    });
    ['location', 'target'].forEach(k => {
        Object.keys(sets[k]).forEach(cat => {
            const v = sets[k][cat];
            sets[k][cat] = {
                sub1: Array.isArray(v && v.sub1) ? v.sub1 : [],
                sub2: Array.isArray(v && v.sub2) ? v.sub2 : []
            };
        });
    });
    ['evidence', 'invalidation'].forEach(k => {
        Object.keys(sets[k]).forEach(cat => { if (!Array.isArray(sets[k][cat])) sets[k][cat] = []; });
    });
    if (!sets.features || typeof sets.features !== 'object') sets.features = {};
    ['evidence', 'invalidation', 'target', 'psychology'].forEach(k => {
        if (typeof sets.features[k] !== 'boolean') sets.features[k] = true;
    });
}

function migrateSettings() {
    ensureSettingsShape();
    const sets = appData.settings;
    if (Array.isArray(sets.setup)) {
        const core = sets.setup.filter(x => CORE_SETUP_NAMES.includes(String(x).trim().toLowerCase()));
        const advanced = sets.setup.filter(x => !core.includes(x));
        const grouped = {};
        if (core.length) grouped['Core setup'] = core;
        if (advanced.length) grouped['Advanced setup'] = advanced;
        sets.setup = grouped;
    } else if (!sets.setup || typeof sets.setup !== 'object') {
        sets.setup = {};
    }

    // One-time migrations: run once, then never override the user's own choices
    if (!sets.migrations) sets.migrations = {};
    if (!sets.migrations.setupTitleCase) {
        renameSetups();
        sets.migrations.setupTitleCase = true;
    }
    // Runs after the rename above, so the setup names already match
    if (!sets.migrations.targetPriceAction) {
        migrateTargetPriceAction();
        sets.migrations.targetPriceAction = true;
    }
    if (!sets.migrations.defaultCustomCharts) {
        addDefaultCustomCharts();
        sets.migrations.defaultCustomCharts = true;
    }
}

async function loadDataFromFile() {
    try {
        // Load settings first
        try {
            const settingsHandle = await dirHandle.getFileHandle('settings.json');
            const settingsFile = await settingsHandle.getFile();
            const settingsContents = await settingsFile.text();
            if(settingsContents) {
                appData.settings = JSON.parse(settingsContents);
                if (!appData.settings.symbol) appData.settings.symbol = ["NQ", "ES", "GC", "CL", "BTC"];
            } else {
                appData.settings = { ...getDefaultSettings(), theme: appData.settings.theme };
            }
        } catch(e) {
            // No settings.json yet (new folder): start with the full default settings
            console.log("No existing settings.json found, using defaults.");
            appData.settings = { ...getDefaultSettings(), theme: appData.settings.theme };
        }

        // Load trades
        try {
            const tradesHandle = await dirHandle.getFileHandle('vwap-journal.json', { create: true });
            const tradesFile = await tradesHandle.getFile();
            const tradesContents = await tradesFile.text();
            if(tradesContents) {
                const parsedTrades = JSON.parse(tradesContents);
                // Handle migration from old format where trades and settings were in one file
                if (parsedTrades.trades) {
                   appData.trades = parsedTrades.trades;
                   // Only migrate settings from old journal if we didn't just load a dedicated settings.json
                   const vwap = appData.settings.location && appData.settings.location.VWAP;
                   if(parsedTrades.settings && (!vwap || !(vwap.sub1 || []).length)) {
                        appData.settings = parsedTrades.settings;
                   }
                } else if (Array.isArray(parsedTrades)) {
                   appData.trades = parsedTrades;
                }
                
                // Migrate old trades to arrays and new formats
                appData.trades = appData.trades.map(trade => {
                    if (trade.location !== undefined && !trade.locations) {
                        trade.locations = [{primary: trade.location, sub1: trade.locSub1, sub2: trade.locSub2}];
                        delete trade.location; delete trade.locSub1; delete trade.locSub2;
                    }
                    if (trade.evidence !== undefined && !trade.evidences) {
                        trade.evidences = [{primary: trade.evidence, sub: trade.evidenceSub}];
                        delete trade.evidence; delete trade.evidenceSub;
                    }
                    
                    // Invalidation Migration
                    if (trade.invalidation !== undefined && !trade.invalidations) {
                        trade.invalidations = [{primary: 'Legacy', sub: trade.invalidation}];
                        delete trade.invalidation;
                    } else if (trade.invalidations && trade.invalidations.length > 0) {
                        if (typeof trade.invalidations[0] === 'string') {
                            trade.invalidations = trade.invalidations.map(inv => ({primary: 'Legacy', sub: inv}));
                        }
                    }

                    // Features Migration
                    if (!appData.settings.features) {
                        appData.settings.features = {
                            evidence: true,
                            invalidation: true,
                            target: true,
                            psychology: true
                        };
                    }

                    // Psychology to Notes Migration
                    if (trade.psychology && typeof trade.psychology === 'string') {
                        trade.notes = trade.psychology;
                        trade.psychology = [];
                    }
                    
                    return trade;
                });
            }
        } catch (e) {
            console.error("Error loading vwap-journal.json:", e);
        }
        
        migrateSettings();
        normalizeTrades();

        // Shared trades and their reviews (share.json)
        if (typeof loadShareState === 'function') await loadShareState();

        // Force save to ensure both files exist in the new format
        await autoSave();
        renderDashboard();

        // Promo toast for auto-screenshots (only after the folder is connected,
        // so never while the installation guide / welcome screen is visible)
        if (typeof maybeShowScreenshotPromo === 'function') maybeShowScreenshotPromo();
    } catch (err) {
        console.error("Load process failed:", err);
    }
}

// --- AutoSave Logic ---

async function autoSave() {
    if (!dirHandle) return;
    try {
        const hasPermission = await verifyPermission(dirHandle, true);
        if (!hasPermission) return;
        fileConnected = true;
        
        // Save Trades
        const tradesHandle = await dirHandle.getFileHandle('vwap-journal.json', { create: true });
        const tradesWritable = await tradesHandle.createWritable();
        await tradesWritable.write(JSON.stringify(appData.trades, null, 2));
        await tradesWritable.close();

        // Save Settings
        const settingsHandle = await dirHandle.getFileHandle('settings.json', { create: true });
        const settingsWritable = await settingsHandle.createWritable();
        await settingsWritable.write(JSON.stringify(appData.settings, null, 2));
        await settingsWritable.close();
        
    } catch (err) {
        console.error("Background save failed:", err);
    }
}

// --- Image Handling Logic ---

async function getImageUrl(filename) {
    if (!dirHandle || !filename) return null;
    try {
        const imgDir = await dirHandle.getDirectoryHandle('img', { create: true });
        const fileHandle = await imgDir.getFileHandle(filename);
        const file = await fileHandle.getFile();
        const url = URL.createObjectURL(file);
        activeObjectUrls.push(url);
        return url;
    } catch(e) {
        console.warn("Image not found:", filename);
        return null;
    }
}

async function saveImageToDir(blob, filename) {
    if (!dirHandle) return;
    const imgDir = await dirHandle.getDirectoryHandle('img', { create: true });
    const fileHandle = await imgDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
}

async function deleteImageFromDir(filename) {
    if (!dirHandle || !filename) return;
    try {
        const imgDir = await dirHandle.getDirectoryHandle('img');
        await imgDir.removeEntry(filename);
    } catch(e) {
        console.warn("Could not delete image or already deleted:", filename);
    }
}

function revokeObjectUrls() {
    activeObjectUrls.forEach(url => URL.revokeObjectURL(url));
    activeObjectUrls = [];
}

function openImageViewer(src) {
    enlargedImage.src = src;
    imageViewerModal.classList.add('active');
}

function setupImageViewer() {
    imageViewerClose.addEventListener('click', () => imageViewerModal.classList.remove('active'));
    imageViewerModal.addEventListener('click', (e) => {
        if(e.target === imageViewerModal) imageViewerModal.classList.remove('active');
    });
}

