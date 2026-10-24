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
        setup: {},
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


function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


// Full default settings: used for the "Download Default Settings" button,
// the template download, and for a folder that has no settings.json yet.
// Returns a fresh copy every time, so callers can change it safely.
function getDefaultSettings() {
    return {
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
        "features": {
            "evidence": true,
            "invalidation": true,
            "target": true,
            "psychology": true
        },
        "marketCondition": [
            "Balance",
            "Imbalance"
        ],
        "setup": {
            "Core setup": [
                "Price Discovery Continuation",
                "Fade Value Area Extremes",
                "Return to Value",
                "VWAP Bounce"
            ],
            "Advanced setup": [
                "Madonna",
                "VWAP/POC Scalps in Balance",
                "Late Entry Continuation",
                "Inside HTF Balance Fades",
                "IB Extension Fades"
            ]
        },
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
            "Price Action": {
                "sub1": [
                    "Swing High",
                    "Swing Low",
                    "Higher High",
                    "Lower Low"
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
}
