// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA'); 
    
    window.fpDatePicker = flatpickr(datePicker, {
        defaultDate: todayStr,
        dateFormat: "Y-m-d",
        disableMobile: true,
        onChange: function(selectedDates, dateStr) {
            alignWeekToDate(new Date(dateStr));
            renderDashboard();
        }
    });
    window.fpTDate = flatpickr(document.getElementById('t-date'), {
        dateFormat: "Y-m-d",
        disableMobile: true
    });
    
    alignWeekToDate(today);
    setupNavigation();
    setupDropdownEvents();
    setupCalendarEvents();
    setupImageUploadEvents();
        setupImageViewer();
    setupThemeToggle();
    tradesList.addEventListener('click', (e) => {
        const imgTarget = e.target.closest('.trade-img-trigger');
        if (imgTarget) {
            e.stopPropagation();
            openImageViewer(imgTarget.dataset.imgUrl);
            return;
        }
        
        const chevronWrapper = e.target.closest('.row-chevron-wrapper');
        if (chevronWrapper) {
            e.stopPropagation();
            const row = chevronWrapper.closest('.trade-row');
            const expanded = row.querySelector('.expanded-content');
            const chevron = row.querySelector('.row-chevron');
            if (expanded.style.display === 'none') {
                expanded.style.display = 'block';
                chevron.style.transform = 'rotate(90deg)';
            } else {
                expanded.style.display = 'none';
                chevron.style.transform = 'rotate(0deg)';
            }
            return;
        }
        
        const tradeCard = e.target.closest('.trade-card, .trade-row');
        if (tradeCard) {
            const tradeId = tradeCard.dataset.tradeId;
            if (tradeId) openTradeModal(tradeId);
        }
    });
    

    // --- Hotkeys ---
    document.addEventListener('keydown', (e) => {
        const isInputFocused = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable;
        const isModalOpen = document.getElementById('trade-modal').classList.contains('active');
        const isDashboardOpen = document.getElementById('view-dashboard').classList.contains('active');

        // Alt/Option combinations
        if (e.altKey) {
            if (e.code === 'KeyN') {
                e.preventDefault();
                if (!isModalOpen) document.getElementById('btn-new-trade').click();
                return;
            }
            if (e.code === 'KeyM') {
                e.preventDefault();
                document.getElementById('btn-theme-toggle').click();
                return;
            }

            if (isModalOpen) {
                if (e.code === 'KeyS') {
                    e.preventDefault();
                    document.getElementById('btn-save-trade').click();
                    return;
                }
                if (e.code === 'KeyC') {
                    e.preventDefault();
                    document.getElementById('btn-cancel-modal').click();
                    return;
                }
                if (e.code === 'Backspace' || e.key === 'Backspace') {
                    e.preventDefault();
                    const btnDel = document.getElementById('btn-delete-trade');
                    if (btnDel && btnDel.style.display !== 'none') btnDel.click();
                    return;
                }
            } else if (isDashboardOpen) {
                if (e.code === 'KeyT') {
                    e.preventDefault();
                    const btnToday = document.getElementById('btn-today');
                    if (btnToday) btnToday.click();
                    return;
                }
            }
        }

        // Non-Alt shortcuts (Dashboard Navigation)
        if (!e.altKey && isDashboardOpen && !isModalOpen && !isInputFocused) {
            if (e.code === 'ArrowRight') {
                e.preventDefault();
                if (e.shiftKey) {
                    document.getElementById('cal-next-week').click();
                } else {
                    const picker = document.getElementById('date-picker');
                    let d = new Date(picker.value);
                    d.setDate(d.getDate() + 1);
                    const dStr = d.toLocaleDateString('en-CA');
                    window.fpDatePicker.setDate(dStr);
                    alignWeekToDate(d);
                    renderDashboard();
                }
                return;
            }
            if (e.code === 'ArrowLeft') {
                e.preventDefault();
                if (e.shiftKey) {
                    document.getElementById('cal-prev-week').click();
                } else {
                    const picker = document.getElementById('date-picker');
                    let d = new Date(picker.value);
                    d.setDate(d.getDate() - 1);
                    const dStr = d.toLocaleDateString('en-CA');
                    window.fpDatePicker.setDate(dStr);
                    alignWeekToDate(d);
                    renderDashboard();
                }
                return;
            }
        }
    });

    const btnToday =  document.getElementById('btn-today');
    if (btnToday) {
        btnToday.addEventListener('click', () => {
            const tStr = new Date().toLocaleDateString('en-CA');
            window.fpDatePicker.setDate(tStr);
            alignWeekToDate(new Date(tStr));
            renderDashboard();
        });
    }
    
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
                "features": { "evidence": true, "invalidation": true, "target": true, "psychology": true },
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
});


function setupThemeToggle() {
    const savedTheme = localStorage.getItem('vwap-theme') || 'dark';
    applyTheme(savedTheme);

    if (btnThemeToggle) {
        btnThemeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(newTheme);
            
            localStorage.setItem('vwap-theme', newTheme);
            if (appData && appData.settings) {
                appData.settings.theme = newTheme;
                autoSave();
            }
        });
    }
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    
    if (theme === 'light') {
        if(iconSun) iconSun.style.display = 'none';
        if(iconMoon) iconMoon.style.display = 'block';
        if (flatpickrTheme) flatpickrTheme.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/light.css';
    } else {
        if(iconSun) iconSun.style.display = 'block';
        if(iconMoon) iconMoon.style.display = 'none';
        if (flatpickrTheme) flatpickrTheme.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/dark.css';
    }
    
    if (typeof renderStatsDashboard === 'function' && document.getElementById('view-stats').classList.contains('active')) {
        renderStatsDashboard();
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

    if (btnViewCard) {
        btnViewCard.addEventListener('click', () => {
            appData.settings.viewMode = 'card';
            autoSave();
            renderDashboard();
        });
    }
    if (btnViewTable) {
        btnViewTable.addEventListener('click', () => {
            appData.settings.viewMode = 'table';
            autoSave();
            renderDashboard();
        });
    }
}
