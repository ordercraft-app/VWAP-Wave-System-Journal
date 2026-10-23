// --- App State ---
let dirHandle = null;
let fileConnected = false;
let isFormDirty = false;
let currentSettingsTab = 'journal';
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
        target: { "VWAP": { sub1: [], sub2: [] } },
        features: { evidence: true, invalidation: true, target: true, psychology: true },
        theme: 'dark'
    }
}
let currentWeekStartDate = new Date();
let activeObjectUrls = [];

// Image State for Modal
let pendingImageBlob = null;
let existingImageFilename = null;
let imageRemoved = false;

// --- Browser Auto-Screenshot State ---
let activeMediaStream = null;
const hiddenVideoElement = document.createElement('video');
hiddenVideoElement.autoplay = true;
hiddenVideoElement.muted = true;

// --- DOM Elements ---
const datePicker = document.getElementById('date-picker');
const tradesList = document.getElementById('trades-list');
const dashboardToolbar = document.getElementById('dashboard-toolbar');
const btnViewCard = document.getElementById('btn-view-card');
const btnViewTable = document.getElementById('btn-view-table');
const btnNewTrade = document.getElementById('btn-new-trade');
const tradeModal = document.getElementById('trade-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const btnSaveTrade = document.getElementById('btn-save-trade');
const btnDeleteTrade = document.getElementById('btn-delete-trade');
const tradeForm = document.getElementById('trade-form');

const btnThemeToggle = document.getElementById('btn-theme-toggle');
const iconSun = document.getElementById('icon-sun');
const iconMoon = document.getElementById('icon-moon');
const flatpickrTheme = document.getElementById('flatpickr-theme');

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

const imageDropzone = document.getElementById('image-dropzone');
const tImageInput = document.getElementById('t-image-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const btnRemoveImage = document.getElementById('btn-remove-image');

const imageViewerModal = document.getElementById('image-viewer-modal');
const imageViewerClose = document.getElementById('image-viewer-close');
const enlargedImage = document.getElementById('enlarged-image');

const locationContainer = document.getElementById('location-container');
const evidenceContainer = document.getElementById('evidence-container');
const invalidationContainer = document.getElementById('invalidation-container');

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
