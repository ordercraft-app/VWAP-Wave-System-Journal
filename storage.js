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


let currentPsychology = [];
const psychHeader = document.getElementById('psych-select-header');
const psychDropdown = document.getElementById('psych-dropdown');
const psychPillsContainer = document.getElementById('psych-selected-pills');

function renderPsychDropdown() {
    if (!psychDropdown) return;
    psychDropdown.innerHTML = '';
    const options = appData.settings.psychology || [];
    options.forEach(opt => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        const isChecked = currentPsychology.includes(opt);
        item.innerHTML = `
            <input type="checkbox" ${isChecked ? 'checked' : ''} id="psych-${opt}">
            <label for="psych-${opt}">${opt}</label>
        `;
        item.addEventListener('click', (e) => {
            // Prevent double-firing if they actually click the input directly
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL') {
                const cb = item.querySelector('input');
                cb.checked = !cb.checked;
            }
            
            // Allow DOM to update checkbox state if label was clicked
            setTimeout(() => {
                const cb = item.querySelector('input');
                if (cb.checked) {
                    if (!currentPsychology.includes(opt)) currentPsychology.push(opt);
                } else {
                    currentPsychology = currentPsychology.filter(p => p !== opt);
                }
                renderPsychPills();
            }, 0);
        });
        psychDropdown.appendChild(item);
    });
}

function renderPsychPills() {
    if (!psychPillsContainer) return;
    psychPillsContainer.innerHTML = '';
    if (currentPsychology.length === 0) {
        psychPillsContainer.innerHTML = '<span class="placeholder">Select psychology states...</span>';
        return;
    }
    currentPsychology.forEach(p => {
        const pill = document.createElement('div');
        pill.className = 'psych-pill-tag';
        pill.innerHTML = `<span>${p}</span><button type="button" class="remove-psych">&times;</button>`;
        pill.querySelector('.remove-psych').addEventListener('click', (e) => {
            e.stopPropagation();
            currentPsychology = currentPsychology.filter(item => item !== p);
            renderPsychPills();
            renderPsychDropdown();
        });
        psychPillsContainer.appendChild(pill);
    });
}

if (psychHeader) {
    psychHeader.addEventListener('click', () => {
        psychDropdown.classList.toggle('active');
    });
}

document.addEventListener('click', (e) => {
    if (psychDropdown && !e.target.closest('.custom-multi-select')) {
        psychDropdown.classList.remove('active');
    }
});

// --- Data Loading ---

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

