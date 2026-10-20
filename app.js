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
            if (e.target.tagName !== 'INPUT') {
                const cb = item.querySelector('input');
                cb.checked = !cb.checked;
            }
            const cb = item.querySelector('input');
            if (cb.checked) {
                if (!currentPsychology.includes(opt)) currentPsychology.push(opt);
            } else {
                currentPsychology = currentPsychology.filter(p => p !== opt);
            }
            renderPsychPills();
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

// --- App State ---
let dirHandle = null;
let fileConnected = false;
let appData = {
    trades: [],
    settings: {
        symbol: ["NQ", "ES", "GC", "CL", "BTC"],
        location: { "VWAP": { sub1: [], sub2: [] } },
        marketCondition: [],
        setup: [],
        direction: [],
        evidence: {},
        invalidation: {},
        psychology: [],
        target: { "VWAP": { sub1: [], sub2: [] } }
    }
};

let currentWeekStartDate = new Date();
let activeObjectUrls = []; 

// Image State for Modal
let pendingImageBlob = null;
let existingImageFilename = null;
let imageRemoved = false;

// --- DOM Elements ---
const datePicker = document.getElementById('date-picker');
const tradesList = document.getElementById('trades-list');
const btnNewTrade = document.getElementById('btn-new-trade');
const tradeModal = document.getElementById('trade-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const btnSaveTrade = document.getElementById('btn-save-trade');
const btnDeleteTrade = document.getElementById('btn-delete-trade');
const tradeForm = document.getElementById('trade-form');

// Sidebar Nav Elements
const btnNavDashboard = document.getElementById('btn-nav-dashboard');
const btnNavStats = document.getElementById('btn-nav-stats');
const btnNavSettings = document.getElementById('btn-nav-settings');
const btnNavHelp = document.getElementById('btn-nav-help');

const viewDashboard = document.getElementById('view-dashboard');
const viewSettings = document.getElementById('view-settings');
const viewStats = document.getElementById('view-stats');
const viewHelp = document.getElementById('view-help');
const filterYear = document.getElementById('filter-year');
const filterMonth = document.getElementById('filter-month');
const filterWeek = document.getElementById('filter-week');
const filterDay = document.getElementById('filter-day');
const settingsContainer = document.getElementById('settings-ui-container');

const calDaysContainer = document.getElementById('cal-days-container');
const btnPrevWeek = document.getElementById('cal-prev-week');
const btnNextWeek = document.getElementById('cal-next-week');

// Image Upload DOM
const imageDropzone = document.getElementById('image-dropzone');
const tImageInput = document.getElementById('t-image-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const btnRemoveImage = document.getElementById('btn-remove-image');

// Large Image Viewer DOM
const imageViewerModal = document.getElementById('image-viewer-modal');
const imageViewerClose = document.getElementById('image-viewer-close');
const enlargedImage = document.getElementById('enlarged-image');

// Dynamic Row Containers
const locationContainer = document.getElementById('location-container');
const evidenceContainer = document.getElementById('evidence-container');
const invalidationContainer = document.getElementById('invalidation-container');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA'); 
    datePicker.value = todayStr;
    
    alignWeekToDate(today);
    setupNavigation();
    setupDropdownEvents();
    setupCalendarEvents();
    setupImageUploadEvents();
    setupImageViewer();
    
    document.querySelectorAll('.faq-question').forEach(question => {
        question.addEventListener('click', () => {
            const item = question.parentElement;
            item.classList.toggle('open');
        });
    });

    const btnResetSettings = document.getElementById('btn-reset-settings');
    if (btnResetSettings) {
        btnResetSettings.addEventListener('click', () => {
            const defaultSettings = {
                "symbol": ["NQ", "ES", "GC", "CL", "BTC"],
                "location": {
                  "VWAP": { "sub1": ["Globex", "RTH", "Weekly", "Monthly"], "sub2": ["Upper band", "VWAP", "Lower band"] },
                  "Volume profile": { "sub1": ["Globex", "RTH", "Composite"], "sub2": ["VAH", "POC", "VAL", "LVN", "HVN"] },
                  "IB": { "sub1": ["Current", "Previous"], "sub2": ["High", "Mid", "Low", "High +50%", "High +100%", "High +200%", "Low -50%", "Low -100%", "Low -200%"] }
                },
                "marketCondition": ["Balance", "Imbalance"],
                "setup": ["Price Discovery Continuation", "Fade value area extremes", "Return to value", "VWAP Bounce", "Madonna", "VWAP/POC Scalpes in balance", "Late Entry Continuation", "Inside HTF balance fades", "IB Extension fades"],
                "direction": ["Long", "Short"],
                "evidence": {
                  "VWAP": ["Respecting band", "Respecting VWAP", "Higher timeframe alignment"],
                  "Auction": ["Value acceptance", "Value rejection"],
                  "IB": ["Breakout/Acceptance", "Rejection"],
                  "Orderflow": ["Delta acceleration", "Order book absorption", "Tape change"]
                },
                "invalidation": {
                  "Price Action": ["Failed price discovery", "Anemic Bounce"],
                  "Levels": ["Acceptance beyond key level", "Failed return to value", "Failed Higher timeframe level"],
                  "Orderflow": ["Failed Delta divergence"],
                  "Risk Management": ["Stopped at stop loss"]
                },
                "target": {
                  "VWAP": { "sub1": ["Globex", "RTH", "Weekly", "Monthly"], "sub2": ["Upper band", "VWAP", "Lower band"] },
                  "Volume profile": { "sub1": ["Globex", "RTH", "Composite"], "sub2": ["VAH", "POC", "VAL", "LVN", "HVN", "Other side of value"] },
                  "IB": { "sub1": ["Current", "Previous"], "sub2": ["High", "Mid", "Low", "High +50%", "High +100%", "High +200%", "Low -50%", "Low -100%", "Low -200%"] },
                  "Swing": { "sub1": ["HIgh", "Low"], "sub2": [] },
                  "RR": { "sub1": ["1/1", "1/2", "1/3", "1/4", "1/5"], "sub2": [] }
                },
                "psychology": [
                  "Following the system", "Confident", "Disciplined", "Flow State", "Patient", "Focused", "Objective",
                  "FOMO", "Revenge Trading", "Overconfident", "Hesitant / Fearful", "Impatient", "Tilted / Frustrated", "Bored", "Anxious"
                ]
            };
            const blobSettings = new Blob([JSON.stringify(defaultSettings, null, 2)], { type: "application/json" });
            const urlSettings = URL.createObjectURL(blobSettings);
            const aSettings = document.createElement('a');
            aSettings.href = urlSettings;
            aSettings.download = 'settings.json';
            document.body.appendChild(aSettings);
            aSettings.click();
            document.body.removeChild(aSettings);
            URL.revokeObjectURL(urlSettings);
        });
    }
    
    document.getElementById('btn-add-location').addEventListener('click', () => addLocationRow());
    document.getElementById('btn-add-evidence').addEventListener('click', () => addEvidenceRow());
    document.getElementById('btn-add-invalidation').addEventListener('click', () => addInvalidationRow());

    try {
        const savedHandle = await getHandleFromDB();
        if (savedHandle && savedHandle.kind === 'directory') {
            dirHandle = savedHandle;
            if ((await dirHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
                fileConnected = true;
                await loadDataFromFile();
            } else {
                fileConnected = false;
                renderDashboard();
            }
        } else {
            renderDashboard();
        }
    } catch (e) {
        console.error("Error loading DB:", e);
        renderDashboard();
    }

    datePicker.addEventListener('change', (e) => {
        const newDate = new Date(e.target.value);
        alignWeekToDate(newDate);
        renderDashboard();
    });
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
    } catch (err) {
        console.error("Load process failed:", err);
    }
}

// --- Navigation ---
function setActiveNav(activeBtn) {
    [btnNavDashboard, btnNavStats, btnNavSettings, btnNavHelp].forEach(b => b.classList.remove('active'));
    activeBtn.classList.add('active');
}

function setupNavigation() {
    btnNavSettings.addEventListener('click', () => {
        [viewDashboard, viewStats, viewHelp].forEach(v => v.classList.remove('active'));
        viewSettings.classList.add('active');
        setActiveNav(btnNavSettings);
        renderSettingsUI();
    });

    btnNavStats.addEventListener('click', () => {
        [viewDashboard, viewSettings, viewHelp].forEach(v => v.classList.remove('active'));
        viewStats.classList.add('active');
        setActiveNav(btnNavStats);
        renderStatsDashboard();
    });

    btnNavDashboard.addEventListener('click', () => {
        [viewSettings, viewStats, viewHelp].forEach(v => v.classList.remove('active'));
        viewDashboard.classList.add('active');
        setActiveNav(btnNavDashboard);
        renderDashboard();
    });
    
    btnNavHelp.addEventListener('click', () => {
        [viewDashboard, viewStats, viewSettings].forEach(v => v.classList.remove('active'));
        viewHelp.classList.add('active');
        setActiveNav(btnNavHelp);
    });
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

// --- Image Upload Events (Modal) ---
function setupImageUploadEvents() {
    imageDropzone.addEventListener('click', () => tImageInput.click());
    tImageInput.addEventListener('change', (e) => {
        if(e.target.files && e.target.files[0]) handleImageFile(e.target.files[0]);
    });

    imageDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        imageDropzone.classList.add('dragover');
    });
    imageDropzone.addEventListener('dragleave', () => imageDropzone.classList.remove('dragover'));
    imageDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        imageDropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if(file.type.startsWith('image/')) handleImageFile(file);
        }
    });

    tradeModal.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let index in items) {
            const item = items[index];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                handleImageFile(blob);
                break;
            }
        }
    });

    btnRemoveImage.addEventListener('click', () => {
        pendingImageBlob = null;
        imageRemoved = true;
        showDropzone();
    });
    
    imagePreview.addEventListener('click', () => {
        if(imagePreview.src) openImageViewer(imagePreview.src);
    });
}

function handleImageFile(file) {
    pendingImageBlob = file;
    imageRemoved = false;
    const url = URL.createObjectURL(file);
    imagePreview.src = url;
    hideDropzone();
}

function showDropzone() {
    imageDropzone.style.display = 'flex';
    imagePreviewContainer.style.display = 'none';
    imagePreview.src = '';
    tImageInput.value = '';
}

function hideDropzone() {
    imageDropzone.style.display = 'none';
    imagePreviewContainer.style.display = 'flex';
}

// --- Helpers ---
function formatHierarchy(primary, sub1, sub2) {
    if (!primary) return '<div class="group-primary">-</div>';
    const subs = [sub1, sub2].filter(Boolean).join(' - ');
    let html = `<div class="group-primary">${primary}</div>`;
    if (subs) html += `<div class="group-secondary">${subs}</div>`;
    return html;
}

function formatMultiHierarchy(items) {
    if (!items || items.length === 0) return '<div class="group-primary">-</div>';
    
    const htmls = items.map(item => {
        if (typeof item === 'string') {
            return `<div class="multi-item"><div class="group-primary">${item}</div></div>`;
        }
        const primary = item.primary || '-';
        const subs = [item.sub1, item.sub2, item.sub].filter(Boolean).join(' - ');
        let html = `<div class="group-primary">${primary}</div>`;
        if (subs) html += `<div class="group-secondary">${subs}</div>`;
        return `<div class="multi-item">${html}</div>`;
    });
    
    return htmls.join('<div class="multi-divider"></div>');
}

function getMonday(d) {
    d = new Date(d);
    var day = d.getDay(),
        diff = d.getDate() - day + (day == 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function alignWeekToDate(dateObj) {
    currentWeekStartDate = getMonday(dateObj);
}

function setupCalendarEvents() {
    btnPrevWeek.addEventListener('click', () => {
        currentWeekStartDate.setDate(currentWeekStartDate.getDate() - 7);
        renderDashboard();
    });
    btnNextWeek.addEventListener('click', () => {
        currentWeekStartDate.setDate(currentWeekStartDate.getDate() + 7);
        renderDashboard();
    });
}

function renderWeeklyCalendar() {
    calDaysContainer.innerHTML = '';
    const selectedDateStr = datePicker.value; 
    const todayStr = new Date().toLocaleDateString('en-CA');
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    
    for (let i = 0; i < 7; i++) {
        let d = new Date(currentWeekStartDate);
        d.setDate(d.getDate() + i);
        const dateStr = d.toLocaleDateString('en-CA');
        
        const tradesForThisDate = appData.trades.filter(t => t.date === dateStr);
        const tradesCount = tradesForThisDate.length;
        
        const isActive = dateStr === selectedDateStr;
        const isToday = dateStr === todayStr; 
        
        const dayDiv = document.createElement('div');
        dayDiv.className = `cal-day ${isActive ? 'active' : ''} ${isToday ? 'is-today' : ''}`;
        
        const tradesText = tradesCount > 0 ? `${tradesCount} ${tradesCount === 1 ? 'trade' : 'trades'}` : '';
        
        dayDiv.innerHTML = `
            <span class="cal-day-name">${dayNames[i]}</span>
            <span class="cal-day-num">${d.getDate()}</span>
            <span class="cal-day-trades">${tradesText}</span>
        `;
        
        dayDiv.addEventListener('click', () => {
            datePicker.value = dateStr;
            renderDashboard();
        });
        
        calDaysContainer.appendChild(dayDiv);
    }
}

// --- Dashboard Rendering ---
async function renderDashboard() {
    renderWeeklyCalendar();
    revokeObjectUrls();
    tradesList.innerHTML = '';
    
    if (dirHandle && !fileConnected) {
        tradesList.innerHTML = `
            <div class="empty-state" style="max-width: 400px; margin: 40px auto; padding: 32px; border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-panel); box-shadow: 0 12px 24px rgba(0,0,0,0.2);">
                <h3 style="color: var(--text-main); margin-bottom: 12px; font-size: 18px; letter-spacing: -0.4px;">Welcome back! 👋</h3>
                <p style="color: var(--text-muted); font-size: 13px; line-height: 1.5; margin-bottom: 24px;">Ready to start journaling? Re-connect your folder to pick up right where you left off.</p>
                <button id="btn-restore-conn" class="btn-primary" style="width: 100%;">Connect Folder</button>
            </div>`;
        document.getElementById('btn-restore-conn').addEventListener('click', async () => {
            if (await verifyPermission(dirHandle, true)) {
                fileConnected = true;
                await loadDataFromFile();
            }
        });
        return;
    }

    if (!dirHandle) {
        tradesList.innerHTML = `
            <div class="empty-state" style="max-width: 440px; margin: 40px auto; padding: 32px; border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-panel); box-shadow: 0 12px 24px rgba(0,0,0,0.2);">
                <h3 style="color: var(--text-main); margin-bottom: 12px; font-size: 18px; letter-spacing: -0.4px;">Welcome to VWAP Wave System Journal</h3>
                <p style="color: var(--text-muted); font-size: 13px; line-height: 1.5; margin-bottom: 24px;">To get started, you need to set up a local folder on your computer to store your trades and images securely.</p>
                
                <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 16px; border-radius: 8px; margin-bottom: 16px; text-align: left;">
                    <div style="font-weight: 600; font-size: 13px; color: var(--text-main); margin-bottom: 4px;">Step 1: Get Your Starter File</div>
                    <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 12px; line-height: 1.4;">First, create an empty folder on your computer (e.g., 'VWAP Journal'). Then, click below to download your starter file and save it into that folder.</p>
                    <button id="btn-download-template" class="btn-secondary" style="width: 100%;">Download Starter file</button>
                </div>

                <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 16px; border-radius: 8px; text-align: left;">
                    <div style="font-weight: 600; font-size: 13px; color: var(--text-main); margin-bottom: 4px;">Step 2: Connect Your Folder</div>
                    <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 12px; line-height: 1.4;">Give the app secure access to the folder you just created so it can save your trades and settings locally.</p>
                    <button id="btn-initial-load" class="btn-primary" style="width: 100%;">Connect Folder</button>
                </div>

                <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 16px; border-radius: 8px; text-align: left; margin-top: 16px;">
                    <div style="font-weight: 600; font-size: 13px; color: var(--text-main); margin-bottom: 4px;">Step 3: Install Desktop App (Optional)</div>
                    <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 12px; line-height: 1.4;">Click the Chrome menu (3 dots) top right ➔ <b>Cast, save and share</b> ➔ <b>Install page as app...</b> to use this as a standalone desktop app.</p>
                    <img src="install-guide.png" alt="Install instructions" style="width: 100%; border-radius: 6px; border: 1px solid var(--border-color);">
                </div>
            </div>`;
            
        document.getElementById('btn-download-template').addEventListener('click', async () => {
            const defaultSettings = {
    "symbol": [
        "NQ",
        "ES",
        "GC",
        "CL",
        "BTC"
    ],
    "location": {
        "VWAP": {
            "sub1": [
                "Globex",
                "RTH",
                "Weekly",
                "Monthly"
            ],
            "sub2": [
                "Upper band",
                "VWAP",
                "Lower band"
            ]
        },
        "Volume profile": {
            "sub1": [
                "Globex",
                "RTH",
                "Composite"
            ],
            "sub2": [
                "VAH",
                "POC",
                "VAL",
                "LVN",
                "HVN"
            ]
        },
        "IB": {
            "sub1": [
                "Current",
                "Previous"
            ],
            "sub2": [
                "High",
                "Mid",
                "Low",
                "High +50%",
                "High +100%",
                "High +200%",
                "Low -50%",
                "Low -100%",
                "Low -200%"
            ]
        }
    },
    "marketCondition": [
        "Balance",
        "Imbalance"
    ],
    "setup": [
        "Price Discovery Continuation",
        "Fade value area extremes",
        "Return to value",
        "VWAP Bounce",
        "Madonna",
        "VWAP/POC Scalpes in balance",
        "Late Entry Continuation",
        "Inside HTF balance fades",
        "IB Extension fades"
    ],
    "direction": [
        "Long",
        "Short"
    ],
    "evidence": {
        "VWAP": [
            "Respecting band",
            "Respecting VWAP",
            "Higher timeframe alignment"
        ],
        "Auction": [
            "Value acceptance",
            "Value rejection"
        ],
        "IB": [
            "Breakout/Acceptance",
            "Rejection"
        ],
        "Orderflow": [
            "Delta acceleration",
            "Order book absorption",
            "Tape change"
        ]
    },
    "invalidation": {
        "Price Action": [
            "Failed price discovery",
            "Anemic Bounce"
        ],
        "Levels": [
            "Acceptance beyond key level",
            "Failed return to value",
            "Failed Higher timeframe level"
        ],
        "Orderflow": [
            "Failed Delta divergence"
        ],
        "Risk Management": [
            "Stopped at stop loss"
        ]
    },
    "target": {
        "VWAP": {
            "sub1": [
                "Globex",
                "RTH",
                "Weekly",
                "Monthly"
            ],
            "sub2": [
                "Upper band",
                "VWAP",
                "Lower band"
            ]
        },
        "Volume profile": {
            "sub1": [
                "Globex",
                "RTH",
                "Composite"
            ],
            "sub2": [
                "VAH",
                "POC",
                "VAL",
                "LVN",
                "HVN",
                "Other side of value"
            ]
        },
        "IB": {
            "sub1": [
                "Current",
                "Previous"
            ],
            "sub2": [
                "High",
                "Mid",
                "Low",
                "High +50%",
                "High +100%",
                "High +200%",
                "Low -50%",
                "Low -100%",
                "Low -200%"
            ]
        },
        "Swing": {
            "sub1": [
                "HIgh",
                "Low"
            ],
            "sub2": []
        },
        "RR": {
            "sub1": [
                "1/1",
                "1/2",
                "1/3",
                "1/4",
                "1/5"
            ],
            "sub2": []
        }
    },
    "psychology": [
        "Following the system",
        "Confident",
        "Disciplined",
        "Flow State",
        "Patient",
        "Focused",
        "Objective",
        "FOMO",
        "Revenge Trading",
        "Overconfident",
        "Hesitant / Fearful",
        "Impatient",
        "Tilted / Frustrated",
        "Bored",
        "Anxious"
    ]
};
            
            // Trigger download of settings.json
            const blobSettings = new Blob([JSON.stringify(defaultSettings, null, 2)], { type: "application/json" });
            const urlSettings = URL.createObjectURL(blobSettings);
            const aSettings = document.createElement('a');
            aSettings.href = urlSettings;
            aSettings.download = 'settings.json';
            document.body.appendChild(aSettings);
            aSettings.click();
            document.body.removeChild(aSettings);
            URL.revokeObjectURL(urlSettings);
        });

        document.getElementById('btn-initial-load').addEventListener('click', async () => {
            try {
                const newHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                dirHandle = newHandle;
                fileConnected = true;
                await saveHandleToDB(dirHandle);
                await loadDataFromFile();
            } catch (err) {}
        });
        return;
    }

    const selectedDate = datePicker.value;
    const tradesForDate = appData.trades.filter(t => t.date === selectedDate);
    
    if (tradesForDate.length === 0) {
        tradesList.innerHTML = `
            <div class="empty-state">
                <p style="margin-bottom: 16px; font-weight: 500;">Add first trade for this date</p>
                <button class="btn-primary" id="btn-add-first-trade">Add Trade</button>
            </div>`;
            
        document.getElementById('btn-add-first-trade').addEventListener('click', () => {
            openTradeModal();
        });
        return;
    }

    for (const trade of tradesForDate) {
        const resultClass = trade.result ? trade.result.toLowerCase().replace('/', '') : '';
        const card = document.createElement('div');
        card.className = 'trade-card';
        
        let imageUrl = null;
        if (trade.screenshot) {
            imageUrl = await getImageUrl(trade.screenshot);
        }

        let imageHtml = '';
        if (imageUrl) {
            imageHtml = `
            <div class="card-image-area">
                <img src="${imageUrl}" class="trade-screenshot-thumb" alt="Screenshot" onclick="openImageViewer('${imageUrl}'); event.stopPropagation();">
            </div>`;
        }

        card.innerHTML = `
            ${imageHtml}
            <div class="card-content-area">
                <div class="card-header">
                    <div class="card-trade-id">
                        ${trade.number || '-'}
                        ${trade.symbol ? `<span class="symbol-tag">${trade.symbol}</span>` : ''}
                    </div>
                    <span class="badge ${resultClass}">${trade.result || '-'}</span>
                </div>
                <div class="card-body">
                    <div class="card-group">
                        <span class="group-title">Location</span>
                        <div class="group-value">${formatMultiHierarchy(trade.locations)}</div>
                    </div>
                    <div class="card-group">
                        <span class="group-title">Market Condition</span>
                        <div class="group-value">${formatHierarchy(trade.marketCondition)}</div>
                    </div>
                    <div class="card-group">
                        <span class="group-title">Setup</span>
                        <div class="group-value">${formatHierarchy(trade.setup, trade.direction)}</div>
                    </div>
                    <div class="card-group">
                        <span class="group-title">Evidence</span>
                        <div class="group-value">${formatMultiHierarchy(trade.evidences)}</div>
                    </div>
                    <div class="card-group">
                        <span class="group-title">Invalidation</span>
                        <div class="group-value">${formatMultiHierarchy(trade.invalidations)}</div>
                    </div>
                    <div class="card-group">
                        <span class="group-title">Target</span>
                        <div class="group-value">${formatHierarchy(trade.target, trade.targetSub1, trade.targetSub2)}</div>
                    </div>
                    ${trade.psychology && trade.psychology.length > 0 ? `
                    <div class="card-group psych-group">
                        <span class="group-title">Psychology</span>
                        <div class="group-value">
                            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                ${trade.psychology.map(p => `<span class="psych-pill-tag" style="padding-right: 8px;">${p}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                    ` : ''}
                    ${trade.notes ? `
                    <div class="card-group psych-group">
                        <span class="group-title">Notes</span>
                        <div class="group-value">
                            <div class="group-primary" style="font-weight: 400; font-size: 13px; white-space: pre-wrap; line-height: 1.5;">${trade.notes}</div>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        card.addEventListener('click', () => openTradeModal(trade.id));
        tradesList.appendChild(card);
    }
}

// --- Trade Modal Dynamic Dropdowns (Elements instead of IDs) ---
function populateSelectEl(selectEl, optionsArray, currentValue = null) {
    selectEl.innerHTML = '';
    let optionsToRender = [...(optionsArray || [])];
    if (currentValue && !optionsToRender.includes(currentValue)) {
        optionsToRender.unshift(currentValue); 
    }

    if(optionsToRender.length > 0) {
        selectEl.disabled = false;
        optionsToRender.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            selectEl.appendChild(option);
        });
        if (currentValue) selectEl.value = currentValue;
        else selectEl.selectedIndex = 0;
    } else {
        selectEl.disabled = true;
    }
}

function updateDependentDropdowns(tradeData = {}) {
    const sets = appData.settings;
    populateSelectEl(document.getElementById('t-symbol'), sets.symbol, tradeData.symbol);
    populateSelectEl(document.getElementById('t-market-cond'), sets.marketCondition, tradeData.marketCondition);
    populateSelectEl(document.getElementById('t-setup'), sets.setup, tradeData.setup);
    populateSelectEl(document.getElementById('t-direction'), sets.direction, tradeData.direction);
    
    populateSelectEl(document.getElementById('t-target'), Object.keys(sets.target || {}), tradeData.target);
    const tgtVal = document.getElementById('t-target').value;
    const tgtConfig = (sets.target || {})[tgtVal] || {sub1:[], sub2:[]};
    populateSelectEl(document.getElementById('t-target-sub1'), tgtConfig.sub1, tradeData.targetSub1);
    populateSelectEl(document.getElementById('t-target-sub2'), tgtConfig.sub2, tradeData.targetSub2);
}

function setupDropdownEvents() {
    // Only static target dropdowns need global event hook now
    document.getElementById('t-target').addEventListener('change', (e) => {
        const val = e.target.value;
        const config = (appData.settings.target || {})[val] || {sub1:[], sub2:[]};
        populateSelectEl(document.getElementById('t-target-sub1'), config.sub1);
        populateSelectEl(document.getElementById('t-target-sub2'), config.sub2);
    });
}

// Dynamic Row Generators
function updateRemoveButtonsState(container) {
    const btns = container.querySelectorAll('.btn-remove-row');
    const disable = btns.length <= 1;
    btns.forEach(btn => {
        btn.disabled = disable;
    });
}

function addLocationRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'dynamic-row loc-row';
    
    row.innerHTML = `
        <select class="linear-input loc-primary"></select>
        <select class="linear-input loc-sub1" disabled></select>
        <select class="linear-input loc-sub2" disabled></select>
        <button type="button" class="btn-remove-row" title="Remove Confluence">&times;</button>
    `;
    
    const primarySel = row.querySelector('.loc-primary');
    const sub1Sel = row.querySelector('.loc-sub1');
    const sub2Sel = row.querySelector('.loc-sub2');
    
    populateSelectEl(primarySel, Object.keys(appData.settings.location || {}), data.primary);
    
    const updateSubs = (currData) => {
        const val = primarySel.value;
        const config = (appData.settings.location || {})[val] || {sub1:[], sub2:[]};
        populateSelectEl(sub1Sel, config.sub1, currData ? currData.sub1 : null);
        populateSelectEl(sub2Sel, config.sub2, currData ? currData.sub2 : null);
    };
    
    primarySel.addEventListener('change', () => updateSubs(null));
    updateSubs(data);
    
    row.querySelector('.btn-remove-row').addEventListener('click', () => {
        if (locationContainer.children.length > 1) {
            row.remove();
            updateRemoveButtonsState(locationContainer);
        }
    });
    
    locationContainer.appendChild(row);
    updateRemoveButtonsState(locationContainer);
}

function addEvidenceRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'dynamic-row ev-row';
    
    row.innerHTML = `
        <select class="linear-input ev-primary"></select>
        <select class="linear-input ev-sub" disabled></select>
        <button type="button" class="btn-remove-row" title="Remove Confluence">&times;</button>
    `;
    
    const primarySel = row.querySelector('.ev-primary');
    const subSel = row.querySelector('.ev-sub');
    
    populateSelectEl(primarySel, Object.keys(appData.settings.evidence || {}), data.primary);
    
    const updateSubs = (currData) => {
        const val = primarySel.value;
        const config = (appData.settings.evidence || {})[val] || [];
        populateSelectEl(subSel, config, currData ? currData.sub : null);
    };
    
    primarySel.addEventListener('change', () => updateSubs(null));
    updateSubs(data);
    
    row.querySelector('.btn-remove-row').addEventListener('click', () => {
        if (evidenceContainer.children.length > 1) {
            row.remove();
            updateRemoveButtonsState(evidenceContainer);
        }
    });
    
    evidenceContainer.appendChild(row);
    updateRemoveButtonsState(evidenceContainer);
}

function addInvalidationRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'dynamic-row ev-row'; // Reuse ev-row grid layout for 2-level
    
    row.innerHTML = `
        <select class="linear-input inv-primary"></select>
        <select class="linear-input inv-sub" disabled></select>
        <button type="button" class="btn-remove-row" title="Remove Confluence">&times;</button>
    `;
    
    const primarySel = row.querySelector('.inv-primary');
    const subSel = row.querySelector('.inv-sub');
    
    populateSelectEl(primarySel, Object.keys(appData.settings.invalidation || {}), data.primary);
    
    const updateSubs = (currData) => {
        const val = primarySel.value;
        const config = (appData.settings.invalidation || {})[val] || [];
        populateSelectEl(subSel, config, currData ? currData.sub : null);
    };
    
    primarySel.addEventListener('change', () => updateSubs(null));
    updateSubs(data);
    
    row.querySelector('.btn-remove-row').addEventListener('click', () => {
        if (invalidationContainer.children.length > 1) {
            row.remove();
            updateRemoveButtonsState(invalidationContainer);
        }
    });
    
    invalidationContainer.appendChild(row);
    updateRemoveButtonsState(invalidationContainer);
}

btnNewTrade.addEventListener('click', () => openTradeModal());
btnCloseModal.addEventListener('click', closeModal);
btnCancelModal.addEventListener('click', closeModal);

async function openTradeModal(tradeId = null) {
    tradeForm.reset();
    document.getElementById('t-date').value = datePicker.value;
    
    pendingImageBlob = null;
    existingImageFilename = null;
    imageRemoved = false;
    showDropzone();
    
    locationContainer.innerHTML = '';
    evidenceContainer.innerHTML = '';
    invalidationContainer.innerHTML = '';

    if (tradeId) {
        document.getElementById('modal-title').innerText = 'Edit Trade';
        btnDeleteTrade.style.display = 'block';
        const trade = appData.trades.find(t => t.id === tradeId);
        
        document.getElementById('trade-id').value = trade.id;
        document.getElementById('t-date').value = trade.date;
        document.getElementById('t-number').value = trade.number;
        document.getElementById('t-result').value = trade.result;
        
        
        const locs = trade.locations && trade.locations.length > 0 ? trade.locations : [{}];
        locs.forEach(l => addLocationRow(l));
        
        const evs = trade.evidences && trade.evidences.length > 0 ? trade.evidences : [{}];
        evs.forEach(e => addEvidenceRow(e));
        
        const invs = trade.invalidations && trade.invalidations.length > 0 ? trade.invalidations : [{}];
        invs.forEach(i => addInvalidationRow(i));
        
        currentPsychology = trade.psychology ? [...trade.psychology] : [];
        renderPsychPills();
        renderPsychDropdown();
        document.getElementById('t-notes').value = trade.notes || '';
        
        if (trade.screenshot) {
            existingImageFilename = trade.screenshot;
            const url = await getImageUrl(trade.screenshot);
            if(url) {
                imagePreview.src = url;
                hideDropzone();
            }
        }
        
        updateDependentDropdowns(trade);
    } else {
        document.getElementById('modal-title').innerText = 'Add Trade';
        document.getElementById('trade-id').value = '';
        btnDeleteTrade.style.display = 'none';
        
        const todayTrades = appData.trades.filter(t => t.date === datePicker.value);
        document.getElementById('t-number').value = todayTrades.length + 1;
        
        addLocationRow();
        addEvidenceRow();
        addInvalidationRow();
        
        currentPsychology = [];
        renderPsychPills();
        renderPsychDropdown();
        document.getElementById('t-notes').value = '';
        
        updateDependentDropdowns({});
    }

    tradeModal.classList.add('active');
}

function closeModal() {
    tradeModal.classList.remove('active');
}

btnSaveTrade.addEventListener('click', async (e) => {
    e.preventDefault();
    if(!document.getElementById('t-date').value) return alert('Date is required');

    const tradeId = document.getElementById('trade-id').value || Date.now().toString();
    
    let finalImageName = existingImageFilename;

    if (imageRemoved && existingImageFilename) {
        await deleteImageFromDir(existingImageFilename);
        finalImageName = null;
    }

    if (pendingImageBlob) {
        if (existingImageFilename && !imageRemoved) {
             await deleteImageFromDir(existingImageFilename); 
        }
        finalImageName = `trade_${tradeId}_${Date.now()}.png`;
        await saveImageToDir(pendingImageBlob, finalImageName);
    }
    
    // Gather dynamic arrays
    const locations = Array.from(locationContainer.querySelectorAll('.loc-row')).map(row => ({
        primary: row.querySelector('.loc-primary').value,
        sub1: row.querySelector('.loc-sub1').value,
        sub2: row.querySelector('.loc-sub2').value
    })).filter(l => l.primary);

    const evidences = Array.from(evidenceContainer.querySelectorAll('.ev-row')).map(row => ({
        primary: row.querySelector('.ev-primary').value,
        sub: row.querySelector('.ev-sub').value
    })).filter(e => e.primary);

    const invalidations = Array.from(invalidationContainer.querySelectorAll('.ev-row'))
        .map(row => {
            const p = row.querySelector('.inv-primary');
            const s = row.querySelector('.inv-sub');
            if(p && s) return { primary: p.value, sub: s.value };
            return null;
        }).filter(i => i && i.primary);

    const tradeData = {
        id: tradeId,
        date: document.getElementById('t-date').value,
        number: document.getElementById('t-number').value,
        result: document.getElementById('t-result').value,
        symbol: document.getElementById('t-symbol').value,
        locations: locations, // New Array structure
        marketCondition: document.getElementById('t-market-cond').value,
        setup: document.getElementById('t-setup').value,
        direction: document.getElementById('t-direction').value,
        evidences: evidences, // New Array structure
        invalidations: invalidations, // New Array structure
        target: document.getElementById('t-target').value,
        targetSub1: document.getElementById('t-target-sub1').value,
        targetSub2: document.getElementById('t-target-sub2').value,
        psychology: [...currentPsychology],
        notes: document.getElementById('t-notes').value,
        screenshot: finalImageName 
    };

    const existingIndex = appData.trades.findIndex(t => t.id === tradeId);
    if (existingIndex >= 0) {
        appData.trades[existingIndex] = tradeData;
    } else {
        appData.trades.push(tradeData);
    }

    closeModal();
    datePicker.value = tradeData.date;
    alignWeekToDate(new Date(tradeData.date));
    await renderDashboard();
    
    await autoSave();
});

btnDeleteTrade.addEventListener('click', async (e) => {
    e.preventDefault();
    if(confirm('Are you sure you want to delete this trade?')) {
        const tradeId = document.getElementById('trade-id').value;
        const trade = appData.trades.find(t => t.id === tradeId);
        
        if(trade && trade.screenshot) {
            await deleteImageFromDir(trade.screenshot);
        }

        appData.trades = appData.trades.filter(t => t.id !== tradeId);
        closeModal();
        await renderDashboard();
        await autoSave();
    }
});


// --- Settings UI Architecture ---
function createPillBox(dataArray, onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pill-box';
    let draggedIndex = null;
    
    function render() {
        wrapper.innerHTML = '';
        dataArray.forEach((item, index) => {
            const pill = document.createElement('div');
            pill.className = 'pill';
            pill.draggable = true;
            
            // Drag Drop logic for pills
            pill.ondragstart = (e) => {
                e.stopPropagation(); // STOP event from reaching the row drag handler
                draggedIndex = index;
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => pill.classList.add('dragging'), 0);
            };
            pill.ondragend = () => {
                draggedIndex = null;
                pill.classList.remove('dragging');
                wrapper.querySelectorAll('.pill').forEach(p => p.classList.remove('drag-over'));
            };
            pill.ondragover = (e) => {
                e.preventDefault();
                if (draggedIndex !== null && draggedIndex !== index) {
                    pill.classList.add('drag-over');
                }
            };
            pill.ondragleave = () => pill.classList.remove('drag-over');
            pill.ondrop = (e) => {
                e.preventDefault();
                pill.classList.remove('drag-over');
                if (draggedIndex !== null && draggedIndex !== index) {
                    const draggedItem = dataArray.splice(draggedIndex, 1)[0];
                    dataArray.splice(index, 0, draggedItem);
                    onChange();
                    render();
                }
            };
            
            const textNode = document.createElement('span');
            textNode.textContent = item;
            textNode.className = 'pill-text';
            textNode.title = "Click to edit, Drag to reorder";
            
            textNode.onclick = (e) => {
                e.stopPropagation();
                textNode.contentEditable = true;
                pill.draggable = false; 
                textNode.focus();
            };
            
            textNode.onblur = () => {
                textNode.contentEditable = false;
                pill.draggable = true;
                const newVal = textNode.textContent.trim();
                if (newVal && newVal !== item && !dataArray.includes(newVal)) {
                    dataArray[index] = newVal;
                    onChange();
                    render();
                } else if (!newVal) {
                    dataArray.splice(index, 1);
                    onChange();
                    render();
                } else {
                    textNode.textContent = item;
                }
            };
            
            textNode.onkeydown = (e) => {
                if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    textNode.blur();
                }
            };
            
            const closeBtn = document.createElement('span');
            closeBtn.innerHTML = '&times;';
            closeBtn.className = 'pill-close';
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                dataArray.splice(index, 1);
                onChange();
                render();
            };
            
            pill.appendChild(textNode);
            pill.appendChild(closeBtn);
            wrapper.appendChild(pill);
        });
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'pill-input-field';
        input.placeholder = dataArray.length === 0 ? 'Type & press comma...' : '';
        
        input.onkeydown = (e) => {
            if (e.key === ',' || e.key === 'Enter') {
                e.preventDefault();
                let val = input.value.trim().replace(/,+$/, '');
                if (val && !dataArray.includes(val)) {
                    dataArray.push(val);
                    onChange();
                    render();
                    wrapper.querySelector('.pill-input-field').focus();
                } else {
                    input.value = '';
                }
            }
        };
        
        wrapper.appendChild(input);
        wrapper.onclick = () => input.focus();
    }
    
    render();
    return wrapper;
}

function renderSetupCombined(onChange) {
    const container = document.createElement('div');
    container.className = 'setting-category-card';
    
    const header = document.createElement('h3');
    header.textContent = 'Setup';
    header.className = 'setting-cat-title';
    container.appendChild(header);

    const subsDiv = document.createElement('div');
    subsDiv.className = 'setting-subs';
    
    const setupLabel = document.createElement('label');
    setupLabel.textContent = 'Setup';
    subsDiv.appendChild(setupLabel);
    subsDiv.appendChild(createPillBox(appData.settings.setup, onChange));
    
    const dirLabel = document.createElement('label');
    dirLabel.textContent = 'Direction';
    dirLabel.style.marginTop = '16px'; 
    subsDiv.appendChild(dirLabel);
    subsDiv.appendChild(createPillBox(appData.settings.direction, onChange));

    container.appendChild(subsDiv);
    return container;
}

function renderComplexSetting(title, configObj, type, onChange) {
    const container = document.createElement('div');
    container.className = 'setting-category-card';
    
    const header = document.createElement('h3');
    header.textContent = title;
    header.className = 'setting-cat-title';
    container.appendChild(header);
    
    const itemsWrapper = document.createElement('div');
    itemsWrapper.className = 'setting-items-wrapper';
    container.appendChild(itemsWrapper);
    
    let draggedRowKey = null;

    const renderItems = () => {
        itemsWrapper.innerHTML = '';
        Object.keys(configObj).forEach((key) => {
            const row = document.createElement('div');
            row.className = 'setting-row';
            
            // Row drag and drop (Level 1)
            row.ondragstart = (e) => {
                draggedRowKey = key;
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => row.classList.add('dragging-row'), 0);
            };
            row.ondragend = () => {
                draggedRowKey = null;
                row.draggable = false; 
                row.classList.remove('dragging-row');
                itemsWrapper.querySelectorAll('.setting-row').forEach(r => r.classList.remove('row-drag-over'));
            };
            row.ondragover = (e) => {
                e.preventDefault();
                if (draggedRowKey && draggedRowKey !== key) {
                    row.classList.add('row-drag-over');
                }
            };
            row.ondragleave = () => row.classList.remove('row-drag-over');
            row.ondrop = (e) => {
                e.preventDefault();
                row.classList.remove('row-drag-over');
                if (draggedRowKey && draggedRowKey !== key) {
                    const keysArray = Object.keys(configObj);
                    const draggedIdx = keysArray.indexOf(draggedRowKey);
                    const dropIdx = keysArray.indexOf(key);
                    
                    keysArray.splice(draggedIdx, 1);
                    keysArray.splice(dropIdx, 0, draggedRowKey);
                    
                    const newObj = {};
                    keysArray.forEach(k => newObj[k] = configObj[k]);
                    
                    Object.keys(configObj).forEach(k => delete configObj[k]);
                    Object.keys(newObj).forEach(k => configObj[k] = newObj[k]);
                    
                    onChange();
                    renderItems();
                }
            };
            
            const level1Div = document.createElement('div');
            level1Div.className = 'setting-level-1';
            
            const dragHandle = document.createElement('div');
            dragHandle.innerHTML = '&#8942;&#8942;';
            dragHandle.className = 'row-drag-handle';
            dragHandle.title = "Drag to reorder category";
            
            dragHandle.onmousedown = () => { row.draggable = true; };
            dragHandle.onmouseup = () => { row.draggable = false; };
            dragHandle.onmouseleave = () => { row.draggable = false; };
            
            const keyInput = document.createElement('input');
            keyInput.type = 'text';
            keyInput.className = 'linear-input level-1-input';
            keyInput.value = key;
            
            const delLvl1Btn = document.createElement('button');
            delLvl1Btn.innerHTML = '&times;';
            delLvl1Btn.className = 'btn-icon delete-level-1';
            delLvl1Btn.onclick = () => {
                if(confirm(`Delete category "${key}"?`)) {
                    delete configObj[key];
                    onChange();
                    renderItems();
                }
            };
            
            level1Div.appendChild(dragHandle);
            level1Div.appendChild(keyInput);
            level1Div.appendChild(delLvl1Btn);
            row.appendChild(level1Div);
            
            keyInput.onblur = () => {
                const newKey = keyInput.value.trim();
                if(newKey && newKey !== key && !configObj[newKey]) {
                    configObj[newKey] = configObj[key];
                    delete configObj[key];
                    onChange();
                    renderItems();
                } else {
                    keyInput.value = key; 
                }
            };

            const subsDiv = document.createElement('div');
            subsDiv.className = 'setting-subs';
            
            if (type === '3-level') {
                const sub1Label = document.createElement('label');
                sub1Label.textContent = 'Level 1';
                subsDiv.appendChild(sub1Label);
                subsDiv.appendChild(createPillBox(configObj[key].sub1, onChange));
                
                const sub2Label = document.createElement('label');
                sub2Label.textContent = 'Level 2';
                subsDiv.appendChild(sub2Label);
                subsDiv.appendChild(createPillBox(configObj[key].sub2, onChange));
            } else if (type === '2-level') {
                const subLabel = document.createElement('label');
                subLabel.textContent = 'Level 1';
                subsDiv.appendChild(subLabel);
                subsDiv.appendChild(createPillBox(configObj[key], onChange));
            }
            
            row.appendChild(subsDiv);
            itemsWrapper.appendChild(row);
        });
        
        const addBtn = document.createElement('button');
        addBtn.className = 'btn-secondary btn-sm add-level-1-btn';
        addBtn.textContent = '+ Add Category';
        addBtn.onclick = () => {
            let newKey = 'New Category';
            let counter = 1;
            while(configObj[newKey]) {
                newKey = `New Category ${counter}`;
                counter++;
            }
            if (type === '3-level') {
                configObj[newKey] = { sub1: [], sub2: [] };
            } else {
                configObj[newKey] = [];
            }
            onChange();
            renderItems();
        };
        itemsWrapper.appendChild(addBtn);
    };
    
    renderItems();
    return container;
}

function renderSimpleSetting(title, dataArray, onChange) {
    const container = document.createElement('div');
    container.className = 'setting-category-card';
    
    const header = document.createElement('h3');
    header.textContent = title;
    header.className = 'setting-cat-title';
    container.appendChild(header);
    
    container.appendChild(createPillBox(dataArray, onChange));
    return container;
}

function renderSettingsUI() {
    settingsContainer.innerHTML = '';
    
    const onSettingsChange = async () => {
        await autoSave();
    };

    settingsContainer.appendChild(renderSimpleSetting('Symbol', appData.settings.symbol, onSettingsChange));
    settingsContainer.appendChild(renderComplexSetting('Location', appData.settings.location, '3-level', onSettingsChange));
    settingsContainer.appendChild(renderSimpleSetting('Market Condition', appData.settings.marketCondition, onSettingsChange));
    settingsContainer.appendChild(renderSetupCombined(onSettingsChange));
    settingsContainer.appendChild(renderComplexSetting('Evidence', appData.settings.evidence, '2-level', onSettingsChange));
    settingsContainer.appendChild(renderComplexSetting('Invalidation', appData.settings.invalidation, '2-level', onSettingsChange));
    settingsContainer.appendChild(renderComplexSetting('Target', appData.settings.target, '3-level', onSettingsChange));
    settingsContainer.appendChild(renderSimpleSetting('Psychology', appData.settings.psychology, onSettingsChange));
}

// --- Chart.js Settings & Stats Dashboard ---
let chartInstances = {};

Chart.defaults.color = '#888888';
Chart.defaults.font.family = 'Inter';
Chart.defaults.scale.grid.color = '#2D2E33';

function getWinRateData(tradesArray) {
    const wins = tradesArray.filter(t => t.result === 'WIN').length;
    const losses = tradesArray.filter(t => t.result === 'LOST').length;
    const be = tradesArray.filter(t => t.result === 'B/E').length;
    const total = wins + losses + be;
    const winRate = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : 0;
    return { wins, losses, be, total, winRate };
}

function groupByAttribute(trades, attributeKey) {
    return trades.reduce((acc, trade) => {
        const key = trade[attributeKey] || 'Unknown';
        if (!acc[key]) acc[key] = [];
        acc[key].push(trade);
        return acc;
    }, {});
}

function destroyChart(chartId) {
    if (chartInstances[chartId]) {
        chartInstances[chartId].destroy();
    }
}


let filtersInitialized = false;

function getWeekOfMonth(date) {
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    let firstDayWeekday = firstDayOfMonth.getDay(); 
    firstDayWeekday = firstDayWeekday === 0 ? 7 : firstDayWeekday; 
    const offsetDate = date.getDate() + firstDayWeekday - 1;
    return Math.ceil(offsetDate / 7);
}

function populateFilterSelect(el, options, selectedVal) {
    if(!el) return;
    el.innerHTML = '';
    options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.val;
        o.textContent = opt.text;
        if(String(opt.val) === String(selectedVal)) o.selected = true;
        el.appendChild(o);
    });
}

function updateDependentFilters() {
    if (!filterYear || !filterMonth || !filterWeek || !filterDay) return;
    
    const y = parseInt(filterYear.value);
    const m = filterMonth.value === 'all' ? 'all' : parseInt(filterMonth.value);
    
    // Update Week options
    let weekVal = filterWeek.value || 'all';
    let weekOptions = [{val: 'all', text: 'All Weeks'}];
    if (m !== 'all') {
        const lastDay = new Date(y, m, 0);
        const maxWeeks = getWeekOfMonth(lastDay);
        for(let i=1; i<=maxWeeks; i++) {
            weekOptions.push({val: i, text: `Week ${i}`});
        }
    }
    if(!weekOptions.find(o => String(o.val) === String(weekVal))) weekVal = 'all';
    populateFilterSelect(filterWeek, weekOptions, weekVal);
    
    // Update Day options
    let dayVal = filterDay.value || 'all';
    let dayOptions = [{val: 'all', text: 'All Days'}];
    if (filterWeek.value === 'all') {
        if (m !== 'all') {
            const daysInMonth = new Date(y, m, 0).getDate();
            for(let i=1; i<=daysInMonth; i++) {
                dayOptions.push({val: i, text: `${i}`});
            }
        }
    } else {
        dayOptions.push(
            {val: 1, text: 'Monday'},
            {val: 2, text: 'Tuesday'},
            {val: 3, text: 'Wednesday'},
            {val: 4, text: 'Thursday'},
            {val: 5, text: 'Friday'},
            {val: 6, text: 'Saturday'},
            {val: 0, text: 'Sunday'}
        );
    }
    if(!dayOptions.find(o => String(o.val) === String(dayVal))) dayVal = 'all';
    populateFilterSelect(filterDay, dayOptions, dayVal);
}

function initFilters() {
    if(filtersInitialized) return;
    if (!filterYear || !filterMonth || !filterWeek || !filterDay) return;

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    
    let years = new Set(appData.trades.map(t => {
        if(!t.date) return currentYear;
        return parseInt(t.date.substring(0,4));
    }));
    years.add(currentYear);
    years = Array.from(years).sort((a,b) => b - a);
    
    populateFilterSelect(filterYear, years.map(y => ({val: y, text: y})), currentYear);
    
    const months = [
        {val: 'all', text: 'All Months'},
        {val: 1, text: 'January'}, {val: 2, text: 'February'}, {val: 3, text: 'March'},
        {val: 4, text: 'April'}, {val: 5, text: 'May'}, {val: 6, text: 'June'},
        {val: 7, text: 'July'}, {val: 8, text: 'August'}, {val: 9, text: 'September'},
        {val: 10, text: 'October'}, {val: 11, text: 'November'}, {val: 12, text: 'December'}
    ];
    populateFilterSelect(filterMonth, months, currentMonth);
    
    updateDependentFilters();
    
    filterYear.addEventListener('change', () => { updateDependentFilters(); renderStatsDashboard(); });
    filterMonth.addEventListener('change', () => { filterWeek.value = 'all'; updateDependentFilters(); renderStatsDashboard(); });
    filterWeek.addEventListener('change', () => { filterDay.value = 'all'; updateDependentFilters(); renderStatsDashboard(); });
    filterDay.addEventListener('change', () => { renderStatsDashboard(); });
    
    filtersInitialized = true;
}

function renderStatsDashboard() {
    initFilters();

    const fY = filterYear.value;
    const fM = filterMonth.value;
    const fW = filterWeek.value;
    const fD = filterDay.value;

    const trades = appData.trades.filter(t => {
        if(!t.date) return false;
        const d = new Date(t.date);
        const tY = d.getFullYear();
        const tM = d.getMonth() + 1;
        const tD = d.getDate();
        const tW = getWeekOfMonth(d);
        const tDayOfWeek = d.getDay();
        
        if (String(tY) !== fY) return false;
        if (fM !== 'all' && String(tM) !== fM) return false;
        if (fW !== 'all' && String(tW) !== fW) return false;
        
        if (fD !== 'all') {
            if (fW === 'all') {
                if (String(tD) !== fD) return false;
            } else {
                if (String(tDayOfWeek) !== fD) return false;
            }
        }
        return true;
    });

    const colors = { win: '#3EBC74', loss: '#E05252', be: '#888888', accent: '#5E6AD2' };

    Chart.defaults.scale.grid.display = false;
    Chart.defaults.scale.grid.drawBorder = false;

    // KPI's
    const overallStats = getWinRateData(trades);
    document.getElementById('kpi-total').innerText = overallStats.total;
    document.getElementById('kpi-winrate').innerText = `${overallStats.winRate}%`;
    document.getElementById('kpi-ratio').innerText = overallStats.losses > 0 ? (overallStats.wins / overallStats.losses).toFixed(2) : overallStats.wins;

    // Overall Win/Loss Doughnut
    destroyChart('winLossChart');
    chartInstances['winLossChart'] = new Chart(document.getElementById('winLossChart'), {
        type: 'doughnut',
        data: {
            labels: ['Wins', 'Losses', 'B/E'],
            datasets: [{ data: [overallStats.wins, overallStats.losses, overallStats.be], backgroundColor: [colors.win, colors.loss, colors.be], borderWidth: 0 }]
        },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#888', usePointStyle: true, pointStyle: 'circle' } } } }
    });

    // Bar Charts Helper
    function renderBarChart(chartId, attribute, horizontal = false, hideAxis = false) {
        const grouped = groupByAttribute(trades, attribute);
        let stats = Object.keys(grouped).map(label => {
            const wData = getWinRateData(grouped[label]);
            return { label: label, winRate: parseFloat(wData.winRate), total: wData.total };
        });
        
        // Sort highest win rate first
        stats.sort((a, b) => {
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            return b.total - a.total; // Tiebreaker on volume
        });

        const labels = stats.map(s => s.label);
        const winRates = stats.map(s => s.winRate);
        
        const scales = horizontal 
            ? { x: { display: !hideAxis, beginAtZero: true, max: 100 }, y: { display: true } }
            : { y: { display: !hideAxis, beginAtZero: true, max: 100 }, x: { display: true } };

        destroyChart(chartId);
        chartInstances[chartId] = new Chart(document.getElementById(chartId), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{ label: 'Win Rate %', data: winRates, backgroundColor: colors.accent, borderRadius: 4 }]
            },
            options: { maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x', scales: scales, plugins: { legend: { display: false } } }
        });
    }

    renderBarChart('symbolChart', 'symbol', false, true);
    
    // Setup Effectiveness (Top 5)
    const setupGroup = groupByAttribute(trades, 'setup');
    const setupStats = Object.keys(setupGroup).map(setup => {
        const stats = getWinRateData(setupGroup[setup]);
        return { setup: setup, winRate: parseFloat(stats.winRate), total: stats.total };
    });
    setupStats.sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.total - a.total;
    });
    const top5Setups = setupStats.slice(0, 5);

    destroyChart('setupChart');
    chartInstances['setupChart'] = new Chart(document.getElementById('setupChart'), {
        type: 'bar',
        data: {
            labels: top5Setups.map(s => s.setup),
            datasets: [{ label: 'Win Rate %', data: top5Setups.map(s => s.winRate), backgroundColor: colors.accent, borderRadius: 4 }]
        },
        options: { maintainAspectRatio: false, indexAxis: 'y', scales: { x: { display: false, beginAtZero: true, max: 100 }, y: { display: true } }, plugins: { legend: { display: false } } }
    });
    
    renderBarChart('marketCondChart', 'marketCondition', false, true);
    
    // Direction Doughnut (wins)
    const dirGroup = groupByAttribute(trades, 'direction');
    // Force specific order to ensure Long is on the left and gets the accent color
    const dirLabels = ['Long', 'Short'];
    const dirWins = dirLabels.map(l => dirGroup[l] ? getWinRateData(dirGroup[l]).wins : 0);
    
    destroyChart('directionChart');
    chartInstances['directionChart'] = new Chart(document.getElementById('directionChart'), {
        type: 'doughnut',
        data: { labels: dirLabels, datasets: [{ data: dirWins, backgroundColor: [colors.accent, '#4A5561'], borderWidth: 0 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#888', usePointStyle: true, pointStyle: 'circle' } } } }
    });

    // Top 5 Psychology (Frequency)
    const psychGroup = {};
    trades.forEach(t => {
        (t.psychology || []).forEach(p => {
            if(!psychGroup[p]) psychGroup[p] = [];
            psychGroup[p].push(t);
        });
    });
    const psychStats = Object.keys(psychGroup).map(p => {
        return { psych: p, total: psychGroup[p].length };
    });
    psychStats.sort((a, b) => {
        return b.total - a.total; // Sort strictly by frequency
    });
    const top5Psych = psychStats.slice(0, 5);

    destroyChart('psychologyChart');
    chartInstances['psychologyChart'] = new Chart(document.getElementById('psychologyChart'), {
        type: 'bar',
        data: {
            labels: top5Psych.map(s => s.psych),
            datasets: [{ label: 'Count', data: top5Psych.map(s => s.total), backgroundColor: colors.accent, borderRadius: 4 }]
        },
        options: { maintainAspectRatio: false, indexAxis: 'y', scales: { x: { display: false, beginAtZero: true }, y: { display: true } }, plugins: { legend: { display: false } } }
    });

    // Invalidation Top 5
    const lostTrades = trades.filter(t => t.result === 'LOST');
    let invCounts = {};
    lostTrades.forEach(t => {
        (t.invalidations || []).forEach(inv => {
            const invName = inv.sub ? inv.sub : (inv.primary || inv);
            invCounts[invName] = (invCounts[invName] || 0) + 1;
        });
    });
    const sortedInvs = Object.entries(invCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    
    destroyChart('invalidationChart');
    chartInstances['invalidationChart'] = new Chart(document.getElementById('invalidationChart'), {
        type: 'bar',
        data: {
            labels: sortedInvs.map(i => i[0]),
            datasets: [{ label: 'Loss Count', data: sortedInvs.map(i => i[1]), backgroundColor: colors.loss, borderRadius: 4 }]
        },
        options: { maintainAspectRatio: false, indexAxis: 'y', scales: { x: { display: false }, y: { display: true } }, plugins: { legend: { display: false } } }
    });

    // Day of Week
    const daysMap = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
    const dayGroups = { 'Mon':[], 'Tue':[], 'Wed':[], 'Thu':[], 'Fri':[], 'Sat':[], 'Sun':[] };
    trades.forEach(t => {
        const day = daysMap[new Date(t.date).getDay()];
        if(dayGroups[day]) dayGroups[day].push(t);
    });
    
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayWinRates = dayLabels.map(d => dayGroups[d].length > 0 ? getWinRateData(dayGroups[d]).winRate : 0);

    destroyChart('dayOfWeekChart');
    chartInstances['dayOfWeekChart'] = new Chart(document.getElementById('dayOfWeekChart'), {
        type: 'line',
        data: { labels: dayLabels, datasets: [{ label: 'Win Rate %', data: dayWinRates, borderColor: colors.accent, tension: 0.3, fill: true, backgroundColor: 'rgba(94, 106, 210, 0.1)' }] },
        options: { maintainAspectRatio: false, scales: { y: { display: false, beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } }
    });

    // Confluence Rate
    const confGroups = { '1': [], '2': [], '3': [], '4+': [] };
    trades.forEach(t => {
        if (t.result === 'WIN' || t.result === 'LOST') {
            const count = (t.locations || []).length;
            if(count === 1) confGroups['1'].push(t);
            else if(count === 2) confGroups['2'].push(t);
            else if(count === 3) confGroups['3'].push(t);
            else if(count >= 4) confGroups['4+'].push(t);
        }
    });

    destroyChart('confluenceChart');
    chartInstances['confluenceChart'] = new Chart(document.getElementById('confluenceChart'), {
        type: 'bar',
        data: {
            labels: Object.keys(confGroups),
            datasets: [{ label: 'Win Rate %', data: Object.keys(confGroups).map(k => getWinRateData(confGroups[k]).winRate), backgroundColor: colors.win, borderRadius: 4 }]
        },
        options: { maintainAspectRatio: false, scales: { y: { display: false, beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } }
    });

    // Location Heatmap
    let locStats = {};
    trades.forEach(t => {
        (t.locations || []).forEach(loc => {
            const primary = loc.primary || 'Unknown';
            if(!locStats[primary]) locStats[primary] = { win: 0, loss: 0, be: 0 };
            if(t.result === 'WIN') locStats[primary].win++;
            if(t.result === 'LOST') locStats[primary].loss++;
            if(t.result === 'B/E') locStats[primary].be++;
        });
    });

    let locArray = Object.keys(locStats).map(key => {
        const w = locStats[key].win;
        const l = locStats[key].loss;
        const be = locStats[key].be;
        const total = w + l + be;
        
        const winPct = total > 0 ? (w / total) * 100 : 0;
        const lossPct = total > 0 ? (l / total) * 100 : 0;
        const bePct = total > 0 ? (be / total) * 100 : 0;
        
        return { label: key, winPct: winPct, lossPct: lossPct, bePct: bePct, total: total };
    });

    // Sort by win rate (descending), then by total volume
    locArray.sort((a, b) => {
        if (b.winPct !== a.winPct) return b.winPct - a.winPct;
        return b.total - a.total;
    });

    const sortedLocLabels = locArray.map(item => item.label);
    const sortedLocWins = locArray.map(item => parseFloat(item.winPct.toFixed(1)));
    const sortedLocLosses = locArray.map(item => parseFloat(item.lossPct.toFixed(1)));
    const sortedLocBE = locArray.map(item => parseFloat(item.bePct.toFixed(1)));
    
    destroyChart('locationChart');
    chartInstances['locationChart'] = new Chart(document.getElementById('locationChart'), {
        type: 'bar',
        data: {
            labels: sortedLocLabels,
            datasets: [
                { label: 'Wins', data: sortedLocWins, backgroundColor: colors.win },
                { label: 'Losses', data: sortedLocLosses, backgroundColor: colors.loss },
                { label: 'B/E', data: sortedLocBE, backgroundColor: colors.be }
            ]
        },
        options: { 
            maintainAspectRatio: false,
            indexAxis: 'y', 
            scales: { x: { stacked: true, max: 100, display: false }, y: { stacked: true } },
            plugins: { 
                legend: { position: 'bottom', labels: { color: '#888', usePointStyle: true, pointStyle: 'circle' } },
                tooltip: { callbacks: { label: function(context) { return context.dataset.label + ': ' + context.parsed.x + '%'; } } }
            }
        }
    });
}
