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

function migrateSettings() {
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
            }
        } catch(e) {
            // Settings file might not exist yet, that's fine, we use default appData.settings
            console.log("No existing settings.json found, using defaults.");
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
                   if(parsedTrades.settings && Object.keys(appData.settings.location.VWAP.sub1).length === 0) {
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

