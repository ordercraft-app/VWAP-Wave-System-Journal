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

// --- Dashboard Rendering ---

async function renderDashboard() {
    renderWeeklyCalendar();
    revokeObjectUrls();
    tradesList.innerHTML = '';
    if(dashboardToolbar) dashboardToolbar.style.display = 'none';
    
    if (dirHandle && !fileConnected) {
        tradesList.innerHTML = `
            <div class="empty-state" style="max-width: 400px; margin: 40px auto; padding: 32px; border: 1px solid var(--border-color); border-radius: 16px; background: var(--bg-panel); box-shadow: 0 12px 24px rgba(0,0,0,0.2);">
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
            <div class="empty-state" style="max-width: 440px; margin: 40px auto; padding: 32px; border: 1px solid var(--border-color); border-radius: 16px; background: var(--bg-panel); box-shadow: 0 12px 24px rgba(0,0,0,0.2);">
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
    "features": { "evidence": true, "invalidation": true, "target": true, "psychology": true },
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

    updateScreenshotBanner();
    if(dashboardToolbar) dashboardToolbar.style.display = 'flex';
    if(!appData.settings.viewMode) appData.settings.viewMode = 'card';
    btnViewCard.classList.toggle('active', appData.settings.viewMode === 'card');
    btnViewTable.classList.toggle('active', appData.settings.viewMode === 'table');
    
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
    window.fpTDate.setDate(datePicker.value);
    
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
        window.fpTDate.setDate(trade.date);
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
            const symbol = document.getElementById('t-symbol').value || 'Unknown';
            const originalText = newAutoShotBtn.innerHTML;
            newAutoShotBtn.innerHTML = '⏳ Capturing...';
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

function renderSettingsUI() {
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
    tabJournal.onclick = () => { currentSettingsTab = 'journal'; renderSettingsUI(); };
    
    
    const tabChart = document.createElement('button');
    tabChart.className = `settings-tab-btn ${currentSettingsTab === 'chart' ? 'active' : ''}`;
    tabChart.textContent = 'Chart';
    tabChart.onclick = () => { currentSettingsTab = 'chart'; renderSettingsUI(); };
    
    const tabScreenshot = document.createElement('button');
    tabScreenshot.className = `settings-tab-btn ${currentSettingsTab === 'screenshot' ? 'active' : ''}`;
    tabScreenshot.textContent = 'Screenshot';
    tabScreenshot.onclick = () => { currentSettingsTab = 'screenshot'; renderSettingsUI(); };
    
    tabsDiv.appendChild(tabJournal);
    tabsDiv.appendChild(tabChart);
    tabsDiv.appendChild(tabScreenshot);
    settingsContainer.appendChild(tabsDiv);
    
    const onSettingsChange = async () => { await autoSave(); };

    if (currentSettingsTab === 'journal') {
        const banner = document.createElement('div');
        banner.className = 'info-banner';
        banner.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg><span><strong>Tip:</strong> Add a parameter by typing and pressing <strong>comma ( , )</strong> or <strong>Enter</strong>. You can easily drag & drop parameters and categories to reorder them!</span>`;
        settingsContainer.appendChild(banner);

        settingsContainer.appendChild(renderSimpleSetting('Symbol', appData.settings.symbol, onSettingsChange));
        settingsContainer.appendChild(renderComplexSetting('Location', appData.settings.location, '3-level', onSettingsChange));
        settingsContainer.appendChild(renderSimpleSetting('Market Condition', appData.settings.marketCondition, onSettingsChange));
        settingsContainer.appendChild(renderSetupCombined(onSettingsChange));
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
        
        // Wrap inside a container with an 8px gap
        const chartsWrapper = document.createElement('div');
        chartsWrapper.style.display = 'flex';
        chartsWrapper.style.flexDirection = 'column';
        chartsWrapper.style.gap = '8px';

        chartsConfig.forEach(c => {
            if (c.depends && !appData.settings.features[c.depends]) return; 
            
            const row = document.createElement('div');
            row.className = 'chart-toggle-row';
            
            const label = document.createElement('span');
            label.className = 'chart-toggle-label';
            label.textContent = c.label;
            
            const btn = document.createElement('button');
            const isEnabled = appData.settings.chartVisibility[c.key] !== false; 
            btn.className = isEnabled ? 'btn-secondary btn-sm' : 'btn-primary btn-sm';
            btn.textContent = isEnabled ? 'Disable' : 'Enable';
            btn.onclick = () => {
                appData.settings.chartVisibility[c.key] = !isEnabled;
                onSettingsChange();
                renderSettingsUI();
            };
            
            row.appendChild(label);
            row.appendChild(btn);
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
        <p class="promo-toast-text">Save time journaling! Connect your TradingView window for 1-click auto-screenshots on every trade.</p>
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
