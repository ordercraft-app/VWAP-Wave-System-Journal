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

async function compressImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxDim = 1920;
            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.90);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

async function handleImageFile(file) {
    try {
        const compressedBlob = await compressImage(file);
        pendingImageBlob = compressedBlob;
        imageRemoved = false;
        const url = URL.createObjectURL(compressedBlob);
        imagePreview.src = url;
        hideDropzone();
        isFormDirty = true;
    } catch(e) {
        console.error("Compression failed", e);
    }
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
    const subs = [sub1, sub2].filter(Boolean).map(escapeHTML).join(' - ');
    let html = `<div class="group-primary">${escapeHTML(primary)}</div>`;
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
        
        // Result tags: green = wins, red = losses, grey = break-even (only shown when > 0)
        const winCount = tradesForThisDate.filter(t => t.result === 'WIN').length;
        const lossCount = tradesForThisDate.filter(t => t.result === 'LOST').length;
        const beCount = tradesForThisDate.filter(t => t.result === 'B/E').length;
        const tradesText = [
            winCount > 0 ? `<span class="cal-result-tag win" title="${winCount} winning">${winCount}</span>` : '',
            lossCount > 0 ? `<span class="cal-result-tag lost" title="${lossCount} losing">${lossCount}</span>` : '',
            beCount > 0 ? `<span class="cal-result-tag be" title="${beCount} break-even">${beCount}</span>` : ''
        ].join('');
        
        dayDiv.innerHTML = `
            <span class="cal-day-name">${dayNames[i]}</span>
            <span class="cal-day-num">${d.getDate()}</span>
            <span class="cal-day-trades">${tradesText}</span>
        `;
        
        dayDiv.addEventListener('click', () => {
            window.fpDatePicker.setDate(dateStr);
            renderDashboard();
        });
        
        calDaysContainer.appendChild(dayDiv);
    }
}

// --- Motion / Animations ---
// Subtle SaaS-style motion. Disabled automatically when the OS "reduce motion" setting is on.
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAX_STAGGER_ITEMS = 10;   // items after this all share the last delay
let pendingTradesAnimation = 'enter'; // 'enter' | 'next' | 'prev' | null
let lastRenderedDate = null;
let lastRenderedWeek = null;

// Plays a staggered animation on a list of elements: 'enter' (fade + slide up), 'next' or 'prev' (slide sideways)
function animateItems(elements, type = 'enter') {
    if (REDUCED_MOTION || !elements) return;
    const cls = 'anim-' + type;
    Array.from(elements).forEach((el, i) => {
        el.classList.remove('anim-enter', 'anim-next', 'anim-prev');
        el.style.setProperty('--i', Math.min(i, MAX_STAGGER_ITEMS));
        void el.offsetWidth; // restart animation
        el.classList.add(cls);
        const cleanup = (e) => {
            if (e.target !== el) return;
            el.classList.remove(cls);
            el.removeEventListener('animationend', cleanup);
        };
        el.addEventListener('animationend', cleanup);
    });
}

// Page enter: quick fade of the view + staggered content (runs after the page has rendered)
function playViewEnter(view) {
    if (REDUCED_MOTION || !view) return;
    view.classList.remove('view-enter');
    void view.offsetWidth;
    view.classList.add('view-enter');

    if (view.id === 'view-dashboard') pendingTradesAnimation = 'enter';

    // Microtask: runs after the synchronous render of the page, before the browser paints
    queueMicrotask(() => {
        const selectors = {
            'view-dashboard': '#screenshot-connect-banner, #weekly-calendar-widget',
            'view-stats': '.view-header, .stats-filters, .kpi-card, .stats-grid > .stat-card',
            'view-settings': '.view-header, .settings-tabs, #settings-ui-container > .info-banner, .setting-category-card, .chart-toggle-row',
            'view-help': '.view-header, .faq-item, .help-contact-card'
        };
        const sel = selectors[view.id];
        if (!sel) return;
        const items = Array.from(view.querySelectorAll(sel)).filter(el => el.offsetParent !== null);
        animateItems(items, 'enter');
    });
}

// Sliding active indicator behind the sidebar icons
function moveNavIndicator(btn, animate = true) {
    const nav = document.querySelector('.sidebar-nav');
    if (!nav || !btn) return;
    let indicator = nav.querySelector('.nav-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'nav-indicator';
        nav.prepend(indicator);
        nav.classList.add('has-indicator');
        animate = false;
    }
    if (!animate || REDUCED_MOTION) indicator.style.transition = 'none';
    indicator.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`;
    if (!animate || REDUCED_MOTION) {
        void indicator.offsetWidth;
        indicator.style.transition = '';
    }
}

// Sliding pill behind the active tab / toggle (settings tabs, card/list toggle).
// Remembers the previous position per key, so it also slides when the tabs are re-rendered.
const pillIndicatorState = {};
function slidePillIndicator(host, activeEl, key) {
    if (!host || !activeEl) return;
    host.classList.add('pill-indicator-host', 'has-indicator');
    host.dataset.pillKey = key;
    let ind = host.querySelector(':scope > .pill-indicator');
    if (!ind) {
        ind = document.createElement('div');
        ind.className = 'pill-indicator';
        host.prepend(ind);
    }
    const target = { x: activeEl.offsetLeft, y: activeEl.offsetTop, w: activeEl.offsetWidth, h: activeEl.offsetHeight };
    if (!target.w) return; // not visible (yet)
    const place = (r) => {
        ind.style.transform = `translate(${r.x}px, ${r.y}px)`;
        ind.style.width = r.w + 'px';
        ind.style.height = r.h + 'px';
    };
    const prev = pillIndicatorState[key];
    ind.style.transition = 'none';
    if (prev && !REDUCED_MOTION && (prev.x !== target.x || prev.y !== target.y || prev.w !== target.w)) {
        place(prev);
        void ind.offsetWidth;
        ind.style.transition = '';
        place(target);
    } else {
        place(target);
        void ind.offsetWidth;
        ind.style.transition = '';
    }
    pillIndicatorState[key] = target;
}

// Re-place all pills without animation (e.g. after a window resize changes the layout)
function refreshPillIndicators() {
    document.querySelectorAll('.pill-indicator-host.has-indicator').forEach(host => {
        const active = host.querySelector(':scope > .active');
        const key = host.dataset.pillKey;
        if (!active || !key) return;
        delete pillIndicatorState[key];
        slidePillIndicator(host, active, key);
    });
}
window.addEventListener('resize', refreshPillIndicators);

// Settings tab switch: slide the pill + stagger the new tab content
function switchSettingsTab(tab) {
    if (currentSettingsTab === tab) return;
    currentSettingsTab = tab;
    renderSettingsUI();
    animateItems(settingsContainer.querySelectorAll(':scope > .info-banner, .setting-category-card, .chart-toggle-row'), 'enter');
}

// --- Dashboard Rendering ---

async function renderDashboard() {
    renderWeeklyCalendar();

    // Direction-aware motion: compare with what was shown before
    const renderDate = datePicker.value;
    const renderWeek = currentWeekStartDate.toLocaleDateString('en-CA');
    const weekChanged = lastRenderedWeek && renderWeek !== lastRenderedWeek;
    if (weekChanged) {
        animateItems([calDaysContainer], renderWeek > lastRenderedWeek ? 'next' : 'prev');
    }

    // Sliding pill behind the selected day (same motion as the sidebar).
    // On a week change the whole strip slides, so the pill is placed directly.
    const activeDay = calDaysContainer.querySelector('.cal-day.active');
    if (weekChanged || !activeDay) delete pillIndicatorState.calDay;
    if (activeDay) slidePillIndicator(calDaysContainer, activeDay, 'calDay');
    if (lastRenderedDate && renderDate !== lastRenderedDate && !pendingTradesAnimation) {
        pendingTradesAnimation = renderDate > lastRenderedDate ? 'next' : 'prev';
    }
    lastRenderedDate = renderDate;
    lastRenderedWeek = renderWeek;
    const tradesAnimation = pendingTradesAnimation;
    pendingTradesAnimation = null;
    revokeObjectUrls();
    tradesList.innerHTML = '';
    if(dashboardToolbar) dashboardToolbar.style.display = 'none';
    
    // No folder (or no permission yet): the connection popup locks the app
    updateConnectionGate();
    if (!dirHandle || !fileConnected) return;

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
        if (tradesAnimation) animateItems(tradesList.children, tradesAnimation);
        return;
    }

    updateScreenshotBanner();
    if(dashboardToolbar) dashboardToolbar.style.display = 'flex';
    if(!appData.settings.viewMode) appData.settings.viewMode = 'card';
    btnViewCard.classList.toggle('active', appData.settings.viewMode === 'card');
    btnViewTable.classList.toggle('active', appData.settings.viewMode === 'table');
    slidePillIndicator(btnViewCard.parentElement, appData.settings.viewMode === 'table' ? btnViewTable : btnViewCard, 'viewToggle');
    
    const isTableView = appData.settings.viewMode === 'table';
    let tableWrapper, tableContainer;
    if(isTableView) {
        tableWrapper = document.createElement('div');
        tableWrapper.className = 'table-responsive-wrapper';
        tableContainer = document.createElement('div');
        tableContainer.className = 'trades-table';
        tableWrapper.appendChild(tableContainer);
    }

    const fragment = document.createDocumentFragment();

    for (const trade of tradesForDate) {
        const resultClass = trade.result ? escapeHTML(trade.result).toLowerCase().replace('/', '') : '';
        const card = document.createElement('div');
        card.className = 'trade-card';
        card.dataset.tradeId = trade.id;
        
        let imageUrl = null;
        if (trade.screenshot) {
            imageUrl = await getImageUrl(trade.screenshot);
        }

        let imageHtml = '';
        if (imageUrl) {
            imageHtml = `
            <div class="card-image-area">
                <img src="${imageUrl}" class="trade-screenshot-thumb trade-img-trigger" data-img-url="${imageUrl}" alt="Screenshot">
            </div>`;
        }

        let primaryLoc = trade.locations && trade.locations[0] && trade.locations[0].primary ? escapeHTML(trade.locations[0].primary) : '-';
        let subLoc1 = trade.locations && trade.locations[0] && trade.locations[0].sub1 ? escapeHTML(trade.locations[0].sub1) : '';
        let subLoc2 = trade.locations && trade.locations[0] && trade.locations[0].sub2 ? escapeHTML(trade.locations[0].sub2) : '';
        let subLoc = [subLoc1, subLoc2].filter(Boolean).join(' - ');

        if (isTableView) {
            const row = document.createElement('div');
            row.className = 'trade-row';
            row.dataset.tradeId = trade.id;
            
            let rowImageHtml = imageUrl 
                ? `<img src="${imageUrl}" class="row-thumb trade-img-trigger" data-img-url="${imageUrl}">`
                : `<div class="row-no-thumb"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>`;
            
            row.innerHTML = `
                <div class="row-main" style="display: flex; align-items: center; gap: 16px; width: 100%;">
                    <div class="row-chevron-wrapper" style="padding: 4px 8px; margin-left: -8px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Expand details"><svg class="row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; color: var(--text-muted);"><polyline points="9 18 15 12 9 6"></polyline></svg></div>
                    ${rowImageHtml}
                    <div class="row-col row-col-id" style="flex-direction: row; align-items: center; gap: 8px;">
                        <span class="row-primary">${escapeHTML(trade.number || '-')}</span>
                        ${trade.symbol ? `<span class="symbol-tag" style="margin:0;">${escapeHTML(trade.symbol)}</span>` : ''}
                    </div>
                    <div class="row-col row-col-setup">
                        <span class="row-primary" title="${escapeHTML(trade.setup || '-')}">${escapeHTML(trade.setup || '-')}</span>
                        <span class="row-secondary" title="${escapeHTML(trade.direction || '-')} ${trade.marketCondition ? '| ' + escapeHTML(trade.marketCondition) : ''}">${escapeHTML(trade.direction || '-')} ${trade.marketCondition ? '| ' + escapeHTML(trade.marketCondition) : ''}</span>
                    </div>
                    <div class="row-col row-col-loc">
                        <span class="row-primary">${primaryLoc}</span>
                        <span class="row-secondary" title="${subLoc}">${subLoc}</span>
                    </div>
                    <div class="row-col-res" style="margin-left: auto; display: flex; align-items: center;">
                        <span class="badge ${resultClass}">${escapeHTML(trade.result || '-')}</span>
                    </div>
                </div>
                <div class="expanded-content" style="display: none; width: 100%; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color);">
                    <div class="card-body">
                        <div class="card-group">
                            <span class="group-title">Location</span>
                            <div class="group-value">${formatMultiHierarchy(trade.locations)}</div>
                        </div>
                        <div class="card-group">
                            <span class="group-title">Market Condition</span>
                            <div class="group-value">${formatHierarchy(escapeHTML(trade.marketCondition))}</div>
                        </div>
                        <div class="card-group">
                            <span class="group-title">Setup</span>
                            <div class="group-value">${formatHierarchy(escapeHTML(trade.setup), escapeHTML(trade.direction))}</div>
                        </div>
                        ${appData.settings.features.evidence ? `
                        <div class="card-group">
                            <span class="group-title">Evidence</span>
                            <div class="group-value">${formatMultiHierarchy(trade.evidences)}</div>
                        </div>` : ''}
                        ${appData.settings.features.invalidation ? `
                        <div class="card-group">
                            <span class="group-title">Invalidation</span>
                            <div class="group-value">${formatMultiHierarchy(trade.invalidations)}</div>
                        </div>` : ''}
                        ${appData.settings.features.target ? `
                        <div class="card-group">
                            <span class="group-title">Target</span>
                            <div class="group-value">${formatHierarchy(escapeHTML(trade.target), escapeHTML(trade.targetSub1), escapeHTML(trade.targetSub2))}</div>
                        </div>` : ''}
                        ${(appData.settings.features.psychology && trade.psychology && trade.psychology.length > 0) ? `
                        <div class="card-group psych-group">
                            <span class="group-title">Psychology</span>
                            <div class="group-value">
                                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                    ${trade.psychology.map(p => `<span class="psych-pill-tag" style="padding-right: 8px;">${escapeHTML(p)}</span>`).join('')}
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        ${trade.notes ? `
                        <div class="card-group psych-group">
                            <span class="group-title">Notes</span>
                            <div class="group-value">
                                <div class="group-primary" style="font-weight: 400; font-size: 13px; white-space: pre-wrap; line-height: 1.5;">${escapeHTML(trade.notes)}</div>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
            tableContainer.appendChild(row);
        } else {
            card.innerHTML = `
                ${imageHtml}
                <div class="card-content-area">
                    <div class="card-header">
                        <div class="card-trade-id">
                            ${escapeHTML(trade.number || '-')}
                            ${trade.symbol ? `<span class="symbol-tag">${escapeHTML(trade.symbol)}</span>` : ''}
                        </div>
                        <span class="badge ${resultClass}">${escapeHTML(trade.result || '-')}</span>
                    </div>
                    <div class="card-body">
                        <div class="card-group">
                            <span class="group-title">Location</span>
                            <div class="group-value">${formatMultiHierarchy(trade.locations)}</div>
                        </div>
                        <div class="card-group">
                            <span class="group-title">Market Condition</span>
                            <div class="group-value">${formatHierarchy(escapeHTML(trade.marketCondition))}</div>
                        </div>
                        <div class="card-group">
                            <span class="group-title">Setup</span>
                            <div class="group-value">${formatHierarchy(escapeHTML(trade.setup), escapeHTML(trade.direction))}</div>
                        </div>
                        ${appData.settings.features.evidence ? `
                        <div class="card-group">
                            <span class="group-title">Evidence</span>
                            <div class="group-value">${formatMultiHierarchy(trade.evidences)}</div>
                        </div>` : ''}
                        ${appData.settings.features.invalidation ? `
                        <div class="card-group">
                            <span class="group-title">Invalidation</span>
                            <div class="group-value">${formatMultiHierarchy(trade.invalidations)}</div>
                        </div>` : ''}
                        ${appData.settings.features.target ? `
                        <div class="card-group">
                            <span class="group-title">Target</span>
                            <div class="group-value">${formatHierarchy(escapeHTML(trade.target), escapeHTML(trade.targetSub1), escapeHTML(trade.targetSub2))}</div>
                        </div>` : ''}
                        ${(appData.settings.features.psychology && trade.psychology && trade.psychology.length > 0) ? `
                        <div class="card-group psych-group">
                            <span class="group-title">Psychology</span>
                            <div class="group-value">
                                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                    ${trade.psychology.map(p => `<span class="psych-pill-tag" style="padding-right: 8px;">${escapeHTML(p)}</span>`).join('')}
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        ${trade.notes ? `
                        <div class="card-group psych-group">
                            <span class="group-title">Notes</span>
                            <div class="group-value">
                                <div class="group-primary" style="font-weight: 400; font-size: 13px; white-space: pre-wrap; line-height: 1.5;">${escapeHTML(trade.notes)}</div>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
            fragment.appendChild(card);
        }
    }
    
    if (isTableView && tableWrapper) {
        fragment.appendChild(tableWrapper);
    }
    
    tradesList.appendChild(fragment);

    if (tradesAnimation) {
        const items = [];
        if (dashboardToolbar && tradesAnimation === 'enter') items.push(dashboardToolbar);
        items.push(...tradesList.querySelectorAll(':scope > .trade-card, .trade-row'));
        animateItems(items, tradesAnimation);
    }
}

// --- Trade Modal Dynamic Dropdowns (Elements instead of IDs) ---

btnNewTrade.addEventListener('click', () => openTradeModal());
btnCloseModal.addEventListener('click', closeModal);
btnCancelModal.addEventListener('click', closeModal);

async function openTradeModal(tradeId = null) {
    tradeForm.reset();
    window.fpTDate.setDate(datePicker.value);
    
    pendingImageBlob = null;
    existingImageFilename = null;
    imageRemoved = false;
    showDropzone();
    

    if (tradeId) {
        document.getElementById('modal-title').innerText = 'Edit Trade';
        btnDeleteTrade.style.display = 'block';
        const trade = appData.trades.find(t => t.id === tradeId);
        
        document.getElementById('trade-id').value = trade.id;
        window.fpTDate.setDate(trade.date);
        document.getElementById('t-number').value = trade.number;
        tfInit(trade);
        document.getElementById('t-notes').value = trade.notes || '';
        
        if (trade.screenshot) {
            existingImageFilename = trade.screenshot;
            const url = await getImageUrl(trade.screenshot);
            if(url) {
                imagePreview.src = url;
                hideDropzone();
            }
        }
    } else {
        document.getElementById('modal-title').innerText = 'Add Trade';
        document.getElementById('trade-id').value = '';
        btnDeleteTrade.style.display = 'none';
        
        const todayTrades = appData.trades.filter(t => t.date === datePicker.value);
        document.getElementById('t-number').value = todayTrades.length + 1;
        
        tfInit(null);
        document.getElementById('t-notes').value = '';
    }

    if(!appData.settings.features) appData.settings.features = {evidence:true, invalidation:true, target:true, psychology:true};
    document.getElementById('section-evidence').style.display = appData.settings.features.evidence ? 'block' : 'none';
    document.getElementById('section-invalidation').style.display = appData.settings.features.invalidation ? 'block' : 'none';
    document.getElementById('section-target').style.display = appData.settings.features.target ? 'block' : 'none';
    document.getElementById('section-psychology').style.display = appData.settings.features.psychology ? 'block' : 'none';


        const autoShotBtn = document.getElementById('btn-auto-screenshot');
    if (autoShotBtn) {
        if (activeMediaStream && activeMediaStream.active) {
            autoShotBtn.style.display = 'block';
        } else {
            autoShotBtn.style.display = 'none';
        }

        const newAutoShotBtn = autoShotBtn.cloneNode(true);
        autoShotBtn.parentNode.replaceChild(newAutoShotBtn, autoShotBtn);

        newAutoShotBtn.addEventListener('click', async () => {
            const symbol = (tfState && tfState.symbol) || 'Unknown';
            const originalText = newAutoShotBtn.innerHTML;
            newAutoShotBtn.innerHTML = 'Capturing...';
            newAutoShotBtn.disabled = true;

            try {
                if (!hiddenVideoElement.videoWidth) throw new Error("Video stream not ready");
                
                const canvas = document.createElement('canvas');
                canvas.width = hiddenVideoElement.videoWidth;
                canvas.height = hiddenVideoElement.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(hiddenVideoElement, 0, 0, canvas.width, canvas.height);
                
                canvas.toBlob(async (blob) => {
                    if(!blob) throw new Error("Canvas to Blob failed");
                    const file = new File([blob], `${symbol}_screenshot_${Date.now()}.webp`, { type: 'image/webp' });
                    
                    await handleImageFile(file);
                    showToast('Screenshot captured!', 'success');
                    
                    newAutoShotBtn.innerHTML = originalText;
                    newAutoShotBtn.disabled = false;
                }, 'image/webp', 0.9);
                
            } catch (error) {
                alert(`Capture failed: ${error.message}`);
                newAutoShotBtn.innerHTML = originalText;
                newAutoShotBtn.disabled = false;
            }
        });
    }

    tradeModal.classList.add('active');
    setTimeout(() => { isFormDirty = false; }, 50);
    
    // Reset scroll to top AFTER modal is visible
    setTimeout(() => {
        const modalBody = document.querySelector('.modal-body');
        if (modalBody) modalBody.scrollTop = 0;
    }, 10);
}

function closeModal() {
    if (isFormDirty) {
        if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
            return;
        }
    }
    tradeModal.classList.remove('active');
    isFormDirty = false;
}

tradeModal.addEventListener('mousedown', (e) => {
    if (e.target === tradeModal) {
        closeModal();
    }
});

btnSaveTrade.addEventListener('click', async (e) => {
    e.preventDefault();
    if(!document.getElementById('t-date').value) return alert('Date is required');

    const missing = tfValidate();
    if (missing.length) {
        showToast(`Choose: ${missing.join(', ')}`, 'error');
        return;
    }

    const tradeId = document.getElementById('trade-id').value || crypto.randomUUID();
    
    let finalImageName = existingImageFilename;

    if (imageRemoved && existingImageFilename) {
        await deleteImageFromDir(existingImageFilename);
        finalImageName = null;
    }

    if (pendingImageBlob) {
        if (existingImageFilename && !imageRemoved) {
             await deleteImageFromDir(existingImageFilename); 
        }
        finalImageName = `trade_${tradeId}_${Date.now()}.webp`;
        await saveImageToDir(pendingImageBlob, finalImageName);
    }
    
    const tradeData = {
        id: tradeId,
        date: document.getElementById('t-date').value,
        number: document.getElementById('t-number').value,
        ...tfGetData(),
        notes: document.getElementById('t-notes').value,
        screenshot: finalImageName
    };

    const existingIndex = appData.trades.findIndex(t => t.id === tradeId);
    if (existingIndex >= 0) {
        appData.trades[existingIndex] = tradeData;
    } else {
        appData.trades.push(tradeData);
    }

    isFormDirty = false;
    closeModal();
    window.fpDatePicker.setDate(tradeData.date);
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
        isFormDirty = false;
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

function renderComplexSetting(title, configObj, type, onChange, toggleKey = null) {
    const container = document.createElement('div');
    container.className = 'setting-category-card';
    
    const headerWrapper = document.createElement('div');
    headerWrapper.style.display = 'flex';
    headerWrapper.style.justifyContent = 'space-between';
    headerWrapper.style.alignItems = 'center';
    headerWrapper.style.marginBottom = '16px';

    const header = document.createElement('h3');
    header.textContent = title;
    header.className = 'setting-cat-title';
    header.style.marginBottom = '0';
    headerWrapper.appendChild(header);

    const itemsWrapper = document.createElement('div');

    if (toggleKey) {
        if (!appData.settings.features) appData.settings.features = {};
        if (appData.settings.features[toggleKey] === undefined) appData.settings.features[toggleKey] = true;
        
        const isEnabled = appData.settings.features[toggleKey];
        const toggleBtn = document.createElement('button');
        toggleBtn.className = isEnabled ? 'btn-secondary btn-sm' : 'btn-primary btn-sm';
        toggleBtn.textContent = isEnabled ? 'Disable' : 'Enable';
        toggleBtn.onclick = () => {
            appData.settings.features[toggleKey] = !appData.settings.features[toggleKey];
            onChange();
            renderSettingsUI();
        };
        headerWrapper.appendChild(toggleBtn);
        if (!isEnabled) itemsWrapper.style.display = 'none';
    }

    container.appendChild(headerWrapper);
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
            dragHandle.innerHTML = DRAG_ICON_SVG;
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

function renderSimpleSetting(title, dataArray, onChange, toggleKey = null) {
    const container = document.createElement('div');
    container.className = 'setting-category-card';
    
    const headerWrapper = document.createElement('div');
    headerWrapper.style.display = 'flex';
    headerWrapper.style.justifyContent = 'space-between';
    headerWrapper.style.alignItems = 'center';
    headerWrapper.style.marginBottom = '16px';

    const header = document.createElement('h3');
    header.textContent = title;
    header.className = 'setting-cat-title';
    header.style.marginBottom = '0';
    headerWrapper.appendChild(header);
    
    container.appendChild(headerWrapper);

    const pillBox = createPillBox(dataArray, onChange);

    if (toggleKey) {
        if (!appData.settings.features) appData.settings.features = {};
        if (appData.settings.features[toggleKey] === undefined) appData.settings.features[toggleKey] = true;

        const isEnabled = appData.settings.features[toggleKey];
        const toggleBtn = document.createElement('button');
        toggleBtn.className = isEnabled ? 'btn-secondary btn-sm' : 'btn-primary btn-sm';
        toggleBtn.textContent = isEnabled ? 'Disable' : 'Enable';
        toggleBtn.onclick = () => {
            appData.settings.features[toggleKey] = !appData.settings.features[toggleKey];
            onChange();
            renderSettingsUI();
        };
        headerWrapper.appendChild(toggleBtn);
        if (!isEnabled) pillBox.style.display = 'none';
    }

    container.appendChild(pillBox);
    return container;
}

// Re-rendering rebuilds the whole settings page. Keep the scroll position so
// toggling a category (Enable/Disable) doesn't throw you back to the top.
function renderSettingsUI() {
    const scrollY = viewSettings.scrollTop;
    renderSettingsContent();
    viewSettings.scrollTop = scrollY;
}

function renderSettingsContent() {
    settingsContainer.innerHTML = '';
    
    if (!appData.settings.chartVisibility) {
        appData.settings.chartVisibility = {
            growth: true, winLoss: true, directionalBias: true, dayOfWeek: true,
            setup: true, invalidation: true, psychology: true, confluence: true,
            symbol: true, marketCond: true, location: true
        };
    }

    const tabsDiv = document.createElement('div');
    tabsDiv.className = 'settings-tabs';
    
    const tabJournal = document.createElement('button');
    tabJournal.className = `settings-tab-btn ${currentSettingsTab === 'journal' ? 'active' : ''}`;
    tabJournal.textContent = 'Journal';
    tabJournal.onclick = () => switchSettingsTab('journal');
    
    
    const tabChart = document.createElement('button');
    tabChart.className = `settings-tab-btn ${currentSettingsTab === 'chart' ? 'active' : ''}`;
    tabChart.textContent = 'Chart';
    tabChart.onclick = () => switchSettingsTab('chart');
    
    const tabScreenshot = document.createElement('button');
    tabScreenshot.className = `settings-tab-btn ${currentSettingsTab === 'screenshot' ? 'active' : ''}`;
    tabScreenshot.textContent = 'Screenshot';
    tabScreenshot.onclick = () => switchSettingsTab('screenshot');
    
    tabsDiv.appendChild(tabJournal);
    tabsDiv.appendChild(tabChart);
    tabsDiv.appendChild(tabScreenshot);
    settingsContainer.appendChild(tabsDiv);
    slidePillIndicator(tabsDiv, { journal: tabJournal, chart: tabChart, screenshot: tabScreenshot }[currentSettingsTab], 'settingsTabs');
    
    const onSettingsChange = async () => { await autoSave(); };

    if (currentSettingsTab === 'journal') {
        const banner = document.createElement('div');
        banner.className = 'info-banner';
        banner.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg><span><strong>Tip:</strong> Add a parameter by typing and pressing <strong>comma ( , )</strong> or <strong>Enter</strong>. You can easily drag & drop parameters and categories to reorder them!</span>`;
        settingsContainer.appendChild(banner);

        settingsContainer.appendChild(renderSimpleSetting('Symbol', appData.settings.symbol, onSettingsChange));
        // Same order as the add/edit trade form
        settingsContainer.appendChild(renderSimpleSetting('Market Condition', appData.settings.marketCondition, onSettingsChange));
        settingsContainer.appendChild(renderComplexSetting('Location', appData.settings.location, '3-level', onSettingsChange));
        settingsContainer.appendChild(renderComplexSetting('Setup', appData.settings.setup, '2-level', onSettingsChange));
        settingsContainer.appendChild(renderSimpleSetting('Direction', appData.settings.direction, onSettingsChange));
        settingsContainer.appendChild(renderComplexSetting('Evidence', appData.settings.evidence, '2-level', onSettingsChange, 'evidence'));
        settingsContainer.appendChild(renderComplexSetting('Invalidation', appData.settings.invalidation, '2-level', onSettingsChange, 'invalidation'));
        settingsContainer.appendChild(renderComplexSetting('Target', appData.settings.target, '3-level', onSettingsChange, 'target'));
        
        settingsContainer.appendChild(renderSimpleSetting('Psychology', appData.settings.psychology, onSettingsChange, 'psychology'));

                

        } else if (currentSettingsTab === 'screenshot') {
        // --- Auto-Screenshot Settings Block (Browser API) ---
        const screenshotContainer = document.createElement('div');
        screenshotContainer.className = 'setting-category-card';
        
        const scHeaderWrapper = document.createElement('div');
        scHeaderWrapper.style.display = 'flex';
        scHeaderWrapper.style.justifyContent = 'space-between';
        scHeaderWrapper.style.alignItems = 'center';
        
        const scHeaderInfo = document.createElement('div');
        scHeaderInfo.innerHTML = '<h3 class="setting-cat-title" style="margin-bottom: 0;">Auto-Screenshots</h3><p class="help-text" style="margin-top: 4px; margin-bottom: 0;">Connect a window for 1-click capturing during this session.</p>';
        scHeaderWrapper.appendChild(scHeaderInfo);

        const isConnected = (activeMediaStream && activeMediaStream.active);
        const scActionBtn = document.createElement('button');
        scActionBtn.className = isConnected ? 'btn-danger btn-sm' : 'btn-primary btn-sm';
        scActionBtn.textContent = isConnected ? 'Disconnect Window' : 'Connect Window';
        
        scHeaderWrapper.appendChild(scActionBtn);
        screenshotContainer.appendChild(scHeaderWrapper);

        const previewContainer = document.createElement('div');
        previewContainer.className = 'stream-preview-container';
        previewContainer.style.display = isConnected ? 'flex' : 'none';
        
        const videoWrapper = document.createElement('div');
        videoWrapper.className = 'video-wrapper';
        if (isConnected) {
            const previewVideo = document.createElement('video');
            previewVideo.srcObject = activeMediaStream;
            previewVideo.autoplay = true;
            previewVideo.muted = true;
            previewVideo.style.width = '100%';
            previewVideo.style.objectFit = 'cover';
            previewVideo.style.borderRadius = '4px';
            videoWrapper.appendChild(previewVideo);
        }
        
        previewContainer.appendChild(videoWrapper);
        screenshotContainer.appendChild(previewContainer);
        settingsContainer.appendChild(screenshotContainer);

        scActionBtn.onclick = async () => {
            if (isConnected) {
                activeMediaStream.getTracks().forEach(track => track.stop());
                activeMediaStream = null;
                hiddenVideoElement.srcObject = null;
                appData.settings.autoScreenshotEnabled = false;
                onSettingsChange();
                renderSettingsUI();
                updateScreenshotBanner();
                showToast('Window disconnected', 'info');
            } else {
                await connectScreenshotWindow();
            }
        };
        // --- End Auto-Screenshot Settings Block ---
    } else {
        const chartsConfig = [
            { key: 'growth', label: 'Execution Growth' },
            { key: 'winLoss', label: 'Overall Win/Loss Ratio' },
            { key: 'directionalBias', label: 'Directional Bias' },
            { key: 'dayOfWeek', label: 'Performance by Day' },
            { key: 'setup', label: 'Top 5 Setup Effectiveness' },
            { key: 'invalidation', label: 'Top 5 Invalidation Losses', depends: 'invalidation' },
            { key: 'psychology', label: 'Top 5 Psychology', depends: 'psychology' },
            { key: 'confluence', label: 'Confluence Amount vs Win Rate' },
            { key: 'symbol', label: 'Performance by Symbol' },
            { key: 'marketCond', label: 'Market Condition Analysis' },
            { key: 'location', label: 'Location Effectiveness Heatmap' }
        ];
        
        const banner = document.createElement('div');
        banner.className = 'info-banner';
        banner.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg><span><strong>Tip:</strong> Drag a chart by its <span class="inline-drag-icon">${DRAG_ICON_SVG}</span> handle to change the order on the Stats page.</span>`;
        settingsContainer.appendChild(banner);

        // Wrap inside a container with an 8px gap
        const chartsWrapper = document.createElement('div');
        chartsWrapper.style.display = 'flex';
        chartsWrapper.style.flexDirection = 'column';
        chartsWrapper.style.gap = '8px';

        // Sort rows by the saved chart order (settings.json -> chartOrder)
        const order = getChartOrder();
        const allConfig = [...chartsConfig, ...ccSettingsRows()];
        const sortedConfig = allConfig.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
        let draggedChartKey = null;

        // Add button sits at the top of the list
        const addChartBtn = document.createElement('button');
        addChartBtn.className = 'btn-secondary btn-sm add-level-1-btn';
        addChartBtn.textContent = '+ Add Custom Chart';
        addChartBtn.onclick = () => openCustomChartModal();
        chartsWrapper.appendChild(addChartBtn);

        sortedConfig.forEach(c => {
            if (c.depends && !appData.settings.features[c.depends]) return;

            const row = document.createElement('div');
            row.className = 'chart-toggle-row';

            // --- Drag & drop to reorder (handle only, like the category rows) ---
            row.ondragstart = (e) => {
                draggedChartKey = c.key;
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => row.classList.add('dragging-row'), 0);
            };
            row.ondragend = () => {
                draggedChartKey = null;
                row.draggable = false;
                row.classList.remove('dragging-row');
                chartsWrapper.querySelectorAll('.chart-toggle-row').forEach(r => r.classList.remove('row-drag-over'));
            };
            row.ondragover = (e) => {
                e.preventDefault();
                if (draggedChartKey && draggedChartKey !== c.key) row.classList.add('row-drag-over');
            };
            row.ondragleave = () => row.classList.remove('row-drag-over');
            row.ondrop = (e) => {
                e.preventDefault();
                row.classList.remove('row-drag-over');
                if (!draggedChartKey || draggedChartKey === c.key) return;
                const newOrder = getChartOrder();
                const dropIdx = newOrder.indexOf(c.key);
                newOrder.splice(newOrder.indexOf(draggedChartKey), 1);
                newOrder.splice(dropIdx, 0, draggedChartKey);
                appData.settings.chartOrder = newOrder;
                onSettingsChange();
                renderSettingsUI();
            };

            const leftDiv = document.createElement('div');
            leftDiv.className = 'chart-toggle-left';

            const dragHandle = document.createElement('div');
            dragHandle.innerHTML = DRAG_ICON_SVG;
            dragHandle.className = 'row-drag-handle';
            dragHandle.title = 'Drag to reorder chart';
            dragHandle.onmousedown = () => { row.draggable = true; };
            dragHandle.onmouseup = () => { row.draggable = false; };
            dragHandle.onmouseleave = () => { if (!draggedChartKey) row.draggable = false; };

            const label = document.createElement('span');
            label.className = 'chart-toggle-label';
            label.textContent = c.label;

            leftDiv.appendChild(dragHandle);
            leftDiv.appendChild(label);
            if (c.custom) {
                const tag = document.createElement('span');
                tag.className = 'chart-custom-tag';
                tag.textContent = 'Custom';
                leftDiv.appendChild(tag);
            }
            if (c.note) {
                const note = document.createElement('span');
                note.className = 'chart-toggle-note';
                note.textContent = c.note;
                leftDiv.appendChild(note);
            }

            const btn = document.createElement('button');
            const isEnabled = appData.settings.chartVisibility[c.key] !== false; 
            btn.className = isEnabled ? 'btn-secondary btn-sm' : 'btn-primary btn-sm';
            btn.textContent = isEnabled ? 'Disable' : 'Enable';
            btn.onclick = () => {
                appData.settings.chartVisibility[c.key] = !isEnabled;
                onSettingsChange();
                renderSettingsUI();
            };
            
            row.appendChild(leftDiv);
            if (c.custom) {
                const actions = document.createElement('div');
                actions.className = 'chart-toggle-actions';
                const editBtn = document.createElement('button');
                editBtn.className = 'btn-secondary btn-sm';
                editBtn.textContent = 'Edit';
                editBtn.onclick = () => openCustomChartModal(c.id);
                actions.appendChild(editBtn);
                actions.appendChild(btn);
                row.appendChild(actions);
            } else {
                row.appendChild(btn);
            }
            chartsWrapper.appendChild(row);
        });

        
        settingsContainer.appendChild(chartsWrapper);
    }
}


function getToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

function showToast(message, type = 'info') {
    const container = getToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${escapeHTML(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}


async function connectScreenshotWindow() {
    try {
        activeMediaStream = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: 'window' },
            audio: false
        });
        
        hiddenVideoElement.srcObject = activeMediaStream;
        
        activeMediaStream.getVideoTracks()[0].onended = () => {
            activeMediaStream = null;
            hiddenVideoElement.srcObject = null;
            if (currentSettingsTab === 'screenshot') renderSettingsUI();
            updateScreenshotBanner();
        };
        
        appData.settings.autoScreenshotEnabled = true;
        autoSave();
        
        if (currentSettingsTab === 'screenshot') renderSettingsUI();
        updateScreenshotBanner();
        hideScreenshotPromo();
        showToast('Window connected successfully!', 'success');
    } catch (err) {
        console.error("Screen share error:", err);
    }
}

function updateScreenshotBanner() {
    const banner = document.getElementById('screenshot-connect-banner');
    if (banner) {
        banner.onclick = connectScreenshotWindow;
        if (appData.settings.autoScreenshotEnabled && (!activeMediaStream || !activeMediaStream.active)) {
            banner.style.display = 'flex';
        } else {
            banner.style.display = 'none';
        }
    }
}


// --- Auto-Screenshot Promo Toast ---
// Shown once per app session when auto-screenshots were NOT active in a previous
// session (appData.settings.autoScreenshotEnabled is false/undefined).
// Never shown while the installation guide or the reconnect screen is visible.

const PROMO_TOAST_DURATION = 12000; // ms the toast stays visible (pauses on hover)
const PROMO_TOAST_DELAY = 1200;     // ms after the dashboard has loaded
let screenshotPromoShown = false;

function maybeShowScreenshotPromo() {
    if (screenshotPromoShown) return;
    if (!dirHandle || !fileConnected) return;                        // installation guide / reconnect screen
    if (appData.settings.autoScreenshotEnabled) return;              // dashboard banner handles this case
    if (activeMediaStream && activeMediaStream.active) return;       // already connected
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return;

    screenshotPromoShown = true;
    setTimeout(showScreenshotPromo, PROMO_TOAST_DELAY);
}

function showScreenshotPromo() {
    if (document.getElementById('screenshot-promo-toast')) return;
    if (activeMediaStream && activeMediaStream.active) return;

    const toast = document.createElement('div');
    toast.id = 'screenshot-promo-toast';
    toast.className = 'promo-toast';
    toast.setAttribute('role', 'status');
    toast.style.setProperty('--promo-duration', `${PROMO_TOAST_DURATION}ms`);
    toast.innerHTML = `
        <button type="button" class="promo-toast-close" title="Close" aria-label="Close">&times;</button>
        <div class="promo-toast-header">
            <div class="promo-toast-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            </div>
            <span class="promo-toast-title">Instant Chart Captures</span>
        </div>
        <p class="promo-toast-text">Save time journaling! Connect your charting app window for 1-click auto-screenshots on every trade.</p>
        <button type="button" class="btn-primary btn-sm promo-toast-btn">Connect Window</button>
        <div class="promo-toast-progress"></div>
    `;

    getToastContainer().appendChild(toast);

    toast.querySelector('.promo-toast-close').addEventListener('click', hideScreenshotPromo);
    toast.querySelector('.promo-toast-btn').addEventListener('click', () => {
        // Same action as "Connect Window" on the Settings > Screenshot tab
        connectScreenshotWindow();
        hideScreenshotPromo();
    });
    // The progress bar drives the auto-hide timer (pauses while hovering)
    toast.querySelector('.promo-toast-progress').addEventListener('animationend', hideScreenshotPromo);

    // Double rAF so the slide-in transition actually plays
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('visible')));
}

function hideScreenshotPromo() {
    const toast = document.getElementById('screenshot-promo-toast');
    if (!toast || toast.classList.contains('hiding')) return;
    toast.classList.add('hiding');
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 500);
}
