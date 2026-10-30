// --- Sharing trades for review ---
// The user collects up to 10 trades (each with a screenshot) in "Your shares",
// then shares them with one link. The link works for 5 days. Anyone with the
// link can leave a review; reviews are copied into the trade in the journal,
// so they stay after the link has expired.
//
// Share state lives in share.json in the journal folder (not in settings.json,
// because people pass settings files around and this one holds secret keys).

// ---------- Release switch ----------
// false = sharing is hidden for everyone (all buttons and entry points),
//         but everything still exists and works behind the scenes.
// true  = sharing is visible for everyone.
const SHARE_FEATURE_ENABLED = false;

// For testing while hidden: open the app once with ?share=on (or ?share=off).
// This browser remembers the choice; other people see nothing.
const SHARE_FEATURE_KEY = 'vws-share-feature';
const shareFeatureOn = (() => {
    let override = null;
    try {
        const params = new URLSearchParams(window.location.search);
        const asked = (params.get('share') || '').toLowerCase();
        if (asked === 'on' || asked === 'off') {
            localStorage.setItem(SHARE_FEATURE_KEY, asked);
            params.delete('share');
            const rest = params.toString();
            history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
        }
        override = localStorage.getItem(SHARE_FEATURE_KEY);
    } catch (e) { /* storage blocked: use the default */ }
    if (override === 'on') return true;
    if (override === 'off') return false;
    return SHARE_FEATURE_ENABLED;
})();
document.documentElement.classList.toggle('share-off', !shareFeatureOn);

const SHARE_API = 'https://api.vwsjournal.com';
const SHARE_MAX_TRADES = 10;
const SHARE_OWNER_EXTRA_DAYS = 9; // reviews stay fetchable for the owner 9 days after the link expires
const SHARE_DAY_MS = 24 * 60 * 60 * 1000;
const SHARE_IMAGE_MAX_WIDTH = 1920;
const SHARE_MAX_NAME = 40;

// Optional parts of a trade the user can leave out. featureKey = switch in Settings.
const SHARE_OPTIONAL = [
    { key: 'evidence', label: 'Evidence', featureKey: 'evidence' },
    { key: 'invalidation', label: 'Invalidation', featureKey: 'invalidation' },
    { key: 'target', label: 'Target', featureKey: 'target' },
    { key: 'psychology', label: 'Psychology', featureKey: 'psychology' },
    { key: 'notes', label: 'Notes', featureKey: null }
];

const VERDICT_LABELS = {
    follows: 'Follows the system',
    not_follows: "Doesn't follow the system"
};

let shareState = defaultShareState();
let shareBusy = false;
let shareViewUrls = [];
let shareSyncTimer = null;
let lastShareSync = 0;

function defaultShareState() {
    return {
        version: 1,
        selection: [],
        ownerName: '',         // shown to reviewers as "shared by"
        include: { evidence: true, invalidation: true, target: true, psychology: false, notes: false },
        active: null,          // { id, key, link, createdAt, expiresAt, tradeIds }
        past: [],              // ended shares whose reviews can still be fetched
        removedReviewIds: []   // reviews the user removed, so a sync doesn't bring them back
    };
}

// ---------- storage ----------

async function loadShareState() {
    shareState = defaultShareState();
    if (!dirHandle) return;
    try {
        const handle = await dirHandle.getFileHandle('share.json');
        const text = await (await handle.getFile()).text();
        const saved = text ? JSON.parse(text) : {};
        if (saved && typeof saved === 'object') {
            shareState.selection = Array.isArray(saved.selection) ? saved.selection.filter(x => typeof x === 'string') : [];
            shareState.include = { ...shareState.include, ...(saved.include || {}) };
            shareState.ownerName = typeof saved.ownerName === 'string' ? saved.ownerName.slice(0, SHARE_MAX_NAME) : '';
            shareState.active = saved.active && saved.active.id ? saved.active : null;
            shareState.past = Array.isArray(saved.past) ? saved.past.filter(p => p && p.id && p.key) : [];
            shareState.removedReviewIds = Array.isArray(saved.removedReviewIds) ? saved.removedReviewIds : [];
        }
    } catch (e) {
        // No share.json yet: start empty
    }
    retireExpiredShare();
    updateSharesButton();
    syncReviews(true);
}

async function saveShareState() {
    if (!dirHandle || !fileConnected) return;
    try {
        const handle = await dirHandle.getFileHandle('share.json', { create: true });
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(shareState, null, 2));
        await writable.close();
    } catch (e) {
        console.error('Could not save share.json', e);
    }
}

// An expired link moves to "past": its reviews can still be fetched for a while
function retireExpiredShare() {
    const now = Date.now();
    if (shareState.active && shareState.active.expiresAt <= now) {
        const a = shareState.active;
        shareState.past.push({ id: a.id, key: a.key, expiresAt: a.expiresAt });
        shareState.active = null;
        saveShareState();
    }
    const before = shareState.past.length;
    shareState.past = shareState.past.filter(p => p.expiresAt + SHARE_OWNER_EXTRA_DAYS * SHARE_DAY_MS > now);
    if (shareState.past.length !== before) saveShareState();
}

// ---------- selection ----------

function shareableTrade(trade) {
    return !!(trade && trade.screenshot);
}

// Selected trades that still exist and still have a screenshot
function getSelectedTrades() {
    const byId = new Map(appData.trades.map(t => [t.id, t]));
    const trades = shareState.selection.map(id => byId.get(id)).filter(shareableTrade);
    if (trades.length !== shareState.selection.length) {
        shareState.selection = trades.map(t => t.id);
        saveShareState();
    }
    return trades;
}

function isTradeSelected(tradeId) {
    return shareState.selection.includes(tradeId);
}

function toggleTradeShare(tradeId) {
    const trade = appData.trades.find(t => t.id === tradeId);
    if (!shareableTrade(trade)) {
        showToast('Add a screenshot to share this trade', 'error');
        return;
    }
    if (isTradeSelected(tradeId)) {
        shareState.selection = shareState.selection.filter(id => id !== tradeId);
    } else {
        if (getSelectedTrades().length >= SHARE_MAX_TRADES) {
            showToast(`You can share up to ${SHARE_MAX_TRADES} trades at once`, 'error');
            return;
        }
        shareState.selection.push(tradeId);
    }
    saveShareState();
    refreshShareUI();
}

function addTradesToShares(ids) {
    ids.forEach(id => { if (!isTradeSelected(id)) shareState.selection.push(id); });
    saveShareState();
    refreshShareUI();
}

function plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// "Share day": add the trades of the date picked in the calendar
function shareDay() {
    if (!shareFeatureOn) return;
    const date = datePicker.value;
    const dayTrades = appData.trades.filter(t => t.date === date);
    const withShot = dayTrades.filter(shareableTrade);
    const skipped = dayTrades.length - withShot.length;
    const candidates = withShot.filter(t => !isTradeSelected(t.id));
    const free = SHARE_MAX_TRADES - getSelectedTrades().length;
    const skippedNote = skipped ? ` ${plural(skipped, 'trade')} without a screenshot ${skipped === 1 ? 'was' : 'were'} skipped.` : '';

    if (!withShot.length) {
        showToast('None of the trades on this day has a screenshot', 'error');
        return;
    }
    if (!candidates.length) {
        showToast('All trades of this day with a screenshot are already in your shares');
        return;
    }
    if (free <= 0) {
        showToast(`You can share up to ${SHARE_MAX_TRADES} trades at once`, 'error');
        return;
    }
    if (candidates.length <= free) {
        addTradesToShares(candidates.map(t => t.id));
        showToast(`${plural(candidates.length, 'trade')} added to your shares.${skippedNote}`, 'success');
        return;
    }
    openPickTradesDialog(candidates, free, skippedNote);
}

// ---------- dialogs ----------

function openShareDialog({ title, bodyHtml, footerHtml, wide = false, onReady }) {
    closeShareDialog();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay share-dialog-overlay';
    overlay.id = 'share-dialog';
    overlay.innerHTML = `
        <div class="share-dialog ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title">
            <div class="share-dialog-header">
                <h2 id="share-dialog-title">${escapeHTML(title)}</h2>
                <button type="button" class="close-btn" data-close aria-label="Close">&times;</button>
            </div>
            <div class="share-dialog-body">${bodyHtml}</div>
            ${footerHtml ? `<div class="share-dialog-footer">${footerHtml}</div>` : ''}
        </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
        if (e.target === overlay || e.target.closest('[data-close]')) closeShareDialog();
    });
    requestAnimationFrame(() => overlay.classList.add('active'));
    if (onReady) onReady(overlay);
    const focusable = overlay.querySelector('input, button:not([data-close])');
    if (focusable) focusable.focus();
    return overlay;
}

function closeShareDialog() {
    const old = document.getElementById('share-dialog');
    if (old) old.remove();
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('share-dialog')) closeShareDialog();
});

function openPickTradesDialog(candidates, free, skippedNote) {
    const rows = candidates.map(t => `
        <label class="share-pick-row">
            <input type="checkbox" value="${escapeHTML(t.id)}">
            <span class="share-pick-main">
                <span class="share-pick-title">${escapeHTML(t.number || '-')} ${t.symbol ? `<span class="symbol-tag">${escapeHTML(t.symbol)}</span>` : ''}</span>
                <span class="share-pick-sub">${escapeHTML(t.setup || '-')}${t.direction ? `, ${escapeHTML(t.direction)}` : ''}</span>
            </span>
            <span class="badge ${resultClassFor(t.result)}">${escapeHTML(t.result || '-')}</span>
        </label>`).join('');

    openShareDialog({
        title: 'Choose trades to share',
        bodyHtml: `
            <p class="share-dialog-lead">This day has ${plural(candidates.length, 'trade')} with a screenshot. You have room for ${free} more.${escapeHTML(skippedNote)}</p>
            <div class="share-pick-list">${rows}</div>`,
        footerHtml: `
            <span class="share-pick-count" id="share-pick-count">0/${free} selected</span>
            <div class="share-dialog-actions">
                <button type="button" class="btn-secondary" data-close>Cancel</button>
                <button type="button" class="btn-primary" id="share-pick-add" disabled>Add to shares</button>
            </div>`,
        onReady: overlay => {
            const boxes = [...overlay.querySelectorAll('.share-pick-row input')];
            const count = overlay.querySelector('#share-pick-count');
            const addBtn = overlay.querySelector('#share-pick-add');
            const update = () => {
                const n = boxes.filter(b => b.checked).length;
                count.textContent = `${n}/${free} selected`;
                boxes.forEach(b => {
                    b.disabled = !b.checked && n >= free;
                    b.closest('.share-pick-row').classList.toggle('is-disabled', b.disabled);
                });
                addBtn.disabled = n === 0;
            };
            boxes.forEach(b => b.addEventListener('change', update));
            addBtn.addEventListener('click', () => {
                const ids = boxes.filter(b => b.checked).map(b => b.value);
                addTradesToShares(ids);
                closeShareDialog();
                showToast(`${plural(ids.length, 'trade')} added to your shares`, 'success');
            });
        }
    });
}

function resultClassFor(result) {
    return result ? escapeHTML(result).toLowerCase().replace('/', '') : '';
}

// ---------- buttons on trade cards and rows ----------

// Called from renderDashboard (ui.js)
function shareReviewsButtonHtml(trade) {
    if (!shareFeatureOn) return '';
    const reviews = Array.isArray(trade.reviews) ? trade.reviews : [];
    if (!reviews.length) return '';
    const hasNew = reviews.some(r => r.isNew);
    return `<button type="button" class="trade-text-btn reviews-btn ${hasNew ? 'has-new' : ''}" data-share-action="reviews" data-trade-id="${escapeHTML(trade.id)}">${plural(reviews.length, 'review')}</button>`;
}

function shareToggleButtonHtml(trade) {
    if (!shareFeatureOn) return '';
    if (!shareableTrade(trade)) {
        return `<button type="button" class="trade-text-btn" disabled title="Add a screenshot to share this trade">Add to shares</button>`;
    }
    const selected = isTradeSelected(trade.id);
    return `<button type="button" class="trade-text-btn ${selected ? 'is-selected' : ''}" data-share-action="toggle" data-trade-id="${escapeHTML(trade.id)}" aria-pressed="${selected}">${selected ? 'Remove from shares' : 'Add to shares'}</button>`;
}

// Small label on trades that are part of the active share
function sharedLabelHtml(trade) {
    if (!shareFeatureOn) return '';
    const a = shareState.active;
    if (!a || a.expiresAt <= Date.now() || !a.tradeIds.includes(trade.id)) return '';
    return '<span class="shared-label">Shared</span>';
}

// Banner on the dashboard while a share is live
function updateShareBanner() {
    const banner = document.getElementById('share-active-banner');
    if (!banner) return;
    if (!shareFeatureOn) { banner.hidden = true; return; }
    retireExpiredShare();
    const a = shareState.active;
    if (!a || !dirHandle || !fileConnected) {
        banner.hidden = true;
        banner.innerHTML = '';
        return;
    }
    const reviews = reviewCountForShare(a.id);
    banner.innerHTML = `
        <span class="share-banner-status">Live share</span>
        <span class="share-banner-text">${plural(a.tradeIds.length, 'trade')} shared, ${plural(reviews, 'review')}, ${escapeHTML(timeLeftLabel(a.expiresAt).toLowerCase())}.</span>
        <span class="share-banner-actions">
            <button type="button" class="btn-secondary btn-sm" data-banner="copy">Copy link</button>
            <button type="button" class="btn-secondary btn-sm" data-banner="open">View share</button>
        </span>`;
    banner.hidden = false;
    banner.querySelector('[data-banner="copy"]').addEventListener('click', copyShareLink);
    banner.querySelector('[data-banner="open"]').addEventListener('click', openShareView);
}

// Handle those buttons before the card's own click (which opens the trade)
function setupShareCardClicks() {
    tradesList.addEventListener('click', e => {
        const btn = e.target.closest('[data-share-action]');
        if (!btn) return;
        e.stopPropagation();
        e.preventDefault();
        const id = btn.dataset.tradeId;
        if (btn.dataset.shareAction === 'toggle') toggleTradeShare(id);
        if (btn.dataset.shareAction === 'reviews') openReviewsDialog(id);
    }, true);
}

// Update buttons in place, without re-rendering the whole dashboard
function refreshShareUI() {
    updateSharesButton();
    updateShareBanner();
    document.querySelectorAll('[data-share-action="toggle"]').forEach(btn => {
        const selected = isTradeSelected(btn.dataset.tradeId);
        btn.classList.toggle('is-selected', selected);
        btn.setAttribute('aria-pressed', selected);
        btn.textContent = selected ? 'Remove from shares' : 'Add to shares';
    });
    if (isShareViewOpen()) renderShareView();
}

function updateSharesButton() {
    const badge = document.getElementById('shares-badge');
    const btn = document.getElementById('btn-your-shares');
    if (!badge || !btn) return;
    const n = (dirHandle && fileConnected) ? getSelectedTrades().length : 0;
    badge.textContent = `${n}/${SHARE_MAX_TRADES}`;
    btn.classList.toggle('is-full', n >= SHARE_MAX_TRADES);
    btn.setAttribute('aria-label', `Your shares, ${n} of ${SHARE_MAX_TRADES} selected`);
}

// ---------- "Your shares" page ----------

function isShareViewOpen() {
    const v = document.getElementById('view-share');
    return !!v && v.classList.contains('active');
}

function openShareView() {
    if (!shareFeatureOn) return;
    document.querySelectorAll('.main-content .view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-share').classList.add('active');
    document.querySelectorAll('.sidebar-nav .btn-icon').forEach(b => b.classList.remove('active'));
    const nav = document.querySelector('.sidebar-nav');
    if (nav) nav.classList.add('no-active');
    document.getElementById('btn-your-shares').classList.add('active');
    renderShareView();
    document.getElementById('view-share').scrollTop = 0;
    syncReviews();
}

function closeShareViewState() {
    const btn = document.getElementById('btn-your-shares');
    if (btn) btn.classList.remove('active');
    const nav = document.querySelector('.sidebar-nav');
    if (nav) nav.classList.remove('no-active');
}

function revokeShareViewUrls() {
    shareViewUrls.forEach(u => URL.revokeObjectURL(u));
    shareViewUrls = [];
}

async function readScreenshotFile(filename) {
    const imgDir = await dirHandle.getDirectoryHandle('img');
    const handle = await imgDir.getFileHandle(filename);
    return handle.getFile();
}

async function screenshotUrl(filename) {
    try {
        const url = URL.createObjectURL(await readScreenshotFile(filename));
        shareViewUrls.push(url);
        return url;
    } catch (e) {
        return null;
    }
}

function formatShareDate(dateStr) {
    const d = new Date(`${dateStr}T12:00:00`);
    if (isNaN(d)) return escapeHTML(dateStr || '');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeLeftLabel(expiresAt) {
    const ms = expiresAt - Date.now();
    if (ms <= 0) return 'Expired';
    if (ms >= SHARE_DAY_MS) return `${plural(Math.ceil(ms / SHARE_DAY_MS), 'day')} left`;
    const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
    return `${plural(hours, 'hour')} left`;
}

function availableOptional() {
    const features = (appData.settings && appData.settings.features) || {};
    return SHARE_OPTIONAL.filter(o => !o.featureKey || features[o.featureKey] !== false);
}

function reviewCountForShare(shareId) {
    return appData.trades.reduce((n, t) => n + (t.reviews || []).filter(r => r.shareId === shareId).length, 0);
}

function shareBlockedReason(tradeCount) {
    if (shareState.active) return 'You can share again when your active share has expired or is cancelled.';
    if (!tradeCount) return 'Add trades to share them.';
    if (!shareState.ownerName.trim()) return 'Add your name so reviewers know whose trades these are.';
    return '';
}

function updateShareSubmitState() {
    const reason = shareBlockedReason(getSelectedTrades().length);
    const btn = document.getElementById('btn-do-share');
    const note = document.getElementById('share-blocked');
    if (btn && !shareBusy) btn.disabled = !!reason;
    if (note) { note.textContent = reason; note.hidden = !reason; }
}

async function renderShareView() {
    const container = document.getElementById('share-view-content');
    if (!container) return;
    retireExpiredShare();
    revokeShareViewUrls();

    const trades = getSelectedTrades();
    const active = shareState.active;
    const optional = availableOptional();

    let activeHtml = '';
    if (active) {
        const reviews = reviewCountForShare(active.id);
        activeHtml = `
            <section class="setting-category-card share-section share-active">
                <div class="share-section-head">
                    <h2>Active share</h2>
                    <span class="share-countdown">${escapeHTML(timeLeftLabel(active.expiresAt))}</span>
                </div>
                <p class="share-active-meta">${plural(active.tradeIds.length, 'trade')} shared${active.ownerName ? ` as ${escapeHTML(active.ownerName)}` : ''}, ${plural(reviews, 'review')} so far.</p>
                <div class="share-link-row">
                    <input type="text" class="linear-input share-link-input" id="share-link-input" value="${escapeHTML(active.link)}" readonly aria-label="Share link">
                    <button type="button" class="btn-primary" id="btn-copy-share-link">Copy link</button>
                    <a class="btn-secondary share-open-link" href="${escapeHTML(active.link)}" target="_blank" rel="noopener">Open</a>
                </div>
                <div class="share-active-footer">
                    <p class="help-text">Reviews are saved in your journal, also after the link expires.</p>
                    <button type="button" class="btn-danger" id="btn-cancel-share">Cancel share</button>
                </div>
            </section>`;
    }

    const rowsHtml = trades.map(t => `
        <div class="share-trade-row" data-trade-id="${escapeHTML(t.id)}">
            <div class="share-trade-thumb" data-shot="${escapeHTML(t.screenshot)}"></div>
            <div class="share-trade-main">
                <span class="share-trade-title">${escapeHTML(t.number || '-')} ${t.symbol ? `<span class="symbol-tag">${escapeHTML(t.symbol)}</span>` : ''}</span>
                <span class="share-trade-sub">${escapeHTML(t.setup || '-')}${t.direction ? `, ${escapeHTML(t.direction)}` : ''}</span>
            </div>
            <span class="share-trade-date">${formatShareDate(t.date)}</span>
            <span class="badge ${resultClassFor(t.result)}">${escapeHTML(t.result || '-')}</span>
            <button type="button" class="trade-text-btn" data-remove-share="${escapeHTML(t.id)}">Remove</button>
        </div>`).join('');

    const listHtml = trades.length ? `<div class="share-trade-list">${rowsHtml}</div>` : `
        <div class="empty-state share-empty">
            <p>No trades selected yet.</p>
            <p class="help-text">Use <strong>Add to shares</strong> on a trade, or <strong>Share day</strong> on the dashboard. Only trades with a screenshot can be shared.</p>
        </div>`;

    const togglesHtml = optional.map(o => `
        <label class="share-toggle">
            <input type="checkbox" data-include="${o.key}" ${shareState.include[o.key] ? 'checked' : ''}>
            <span>${o.label}</span>
        </label>`).join('');

    const blockedReason = shareBlockedReason(trades.length);

    container.innerHTML = `
        ${activeHtml}
        <section class="setting-category-card share-section">
            <div class="share-section-head">
                <h2>Selected trades</h2>
                <span class="share-count">${trades.length} of ${SHARE_MAX_TRADES}</span>
                ${trades.length ? '<button type="button" class="trade-text-btn share-clear" id="btn-clear-shares">Clear all</button>' : ''}
            </div>
            ${listHtml}
        </section>
        <section class="setting-category-card share-section">
            <div class="share-section-head"><h2>What to share</h2></div>
            <div class="share-name-row">
                <label for="share-owner-name">Your name</label>
                <input type="text" id="share-owner-name" class="linear-input" maxlength="${SHARE_MAX_NAME}" placeholder="Shown to reviewers" value="${escapeHTML(shareState.ownerName)}" autocomplete="name">
            </div>
            <p class="help-text share-always">Always shared: date, symbol, market condition, location, setup, direction, result and screenshot.</p>
            ${togglesHtml ? `<p class="share-also-label">Also share</p><div class="share-toggles">${togglesHtml}</div>` : ''}
        </section>
        <section class="share-submit">
            <p class="help-text">The link works for 5 days. Anyone with the link can see these trades and leave a review.</p>
            <div class="share-submit-actions">
                <span class="share-blocked" id="share-blocked" ${blockedReason ? '' : 'hidden'}>${escapeHTML(blockedReason)}</span>
                <button type="button" class="btn-secondary" id="btn-preview-share" ${trades.length ? '' : 'disabled'}>Preview</button>
                <button type="button" class="btn-primary" id="btn-do-share" ${blockedReason || shareBusy ? 'disabled' : ''}>${shareBusy ? 'Sharing…' : 'Share'}</button>
            </div>
        </section>`;

    // Thumbnails (read from the journal folder)
    for (const el of container.querySelectorAll('.share-trade-thumb')) {
        const url = await screenshotUrl(el.dataset.shot);
        if (url) el.innerHTML = `<img src="${url}" alt="">`;
    }

    bindShareViewEvents(container);
}

function bindShareViewEvents(container) {
    container.querySelectorAll('[data-remove-share]').forEach(btn => btn.addEventListener('click', () => {
        shareState.selection = shareState.selection.filter(id => id !== btn.dataset.removeShare);
        saveShareState();
        refreshShareUI();
    }));
    const clear = container.querySelector('#btn-clear-shares');
    if (clear) clear.addEventListener('click', () => {
        shareState.selection = [];
        saveShareState();
        refreshShareUI();
    });
    container.querySelectorAll('[data-include]').forEach(box => box.addEventListener('change', () => {
        shareState.include[box.dataset.include] = box.checked;
        saveShareState();
    }));
    const nameInput = container.querySelector('#share-owner-name');
    if (nameInput) {
        nameInput.addEventListener('input', () => {
            shareState.ownerName = nameInput.value.slice(0, SHARE_MAX_NAME);
            updateShareSubmitState();
        });
        nameInput.addEventListener('change', () => {
            shareState.ownerName = nameInput.value.trim().slice(0, SHARE_MAX_NAME);
            saveShareState();
        });
    }
    const preview = container.querySelector('#btn-preview-share');
    if (preview) preview.addEventListener('click', openPreviewDialog);
    const doShare = container.querySelector('#btn-do-share');
    if (doShare) doShare.addEventListener('click', createShare);
    const copy = container.querySelector('#btn-copy-share-link');
    if (copy) copy.addEventListener('click', copyShareLink);
    const cancel = container.querySelector('#btn-cancel-share');
    if (cancel) cancel.addEventListener('click', cancelActiveShare);
}

async function copyShareLink() {
    if (!shareState.active) return;
    try {
        await navigator.clipboard.writeText(shareState.active.link);
        showToast('Link copied', 'success');
    } catch (e) {
        const input = document.getElementById('share-link-input');
        if (input) { input.select(); document.execCommand('copy'); showToast('Link copied', 'success'); }
    }
}

// ---------- what gets shared ----------

function buildSharedTrade(trade, imageUrl) {
    const optional = availableOptional().map(o => o.key);
    const on = key => optional.includes(key) && !!shareState.include[key];
    const shared = {
        id: trade.id,
        date: trade.date || '',
        number: trade.number || '',
        symbol: trade.symbol || '',
        direction: trade.direction || '',
        setup: trade.setup || '',
        marketCondition: trade.marketCondition || '',
        locations: trade.locations || [],
        result: trade.result || '',
        image: imageUrl
    };
    if (on('evidence')) shared.evidences = trade.evidences || [];
    if (on('invalidation')) shared.invalidations = trade.invalidations || [];
    if (on('target')) Object.assign(shared, { target: trade.target || '', targetSub1: trade.targetSub1 || '', targetSub2: trade.targetSub2 || '' });
    if (on('psychology')) shared.psychology = trade.psychology || [];
    if (on('notes')) shared.notes = trade.notes || '';
    return shared;
}

// Same layout the reviewer sees, used for the preview
function sharedTradeHtml(t, imgSrc) {
    const multi = items => (items && items.length)
        ? items.map(i => `<div class="multi-item"><div class="group-primary">${escapeHTML(i.primary)}</div>${[i.sub1, i.sub2, i.sub].filter(Boolean).length ? `<div class="group-secondary">${escapeHTML([i.sub1, i.sub2, i.sub].filter(Boolean).join(' - '))}</div>` : ''}</div>`).join('<div class="multi-divider"></div>')
        : '<div class="group-primary">-</div>';
    const single = (p, ...subs) => `<div class="group-primary">${escapeHTML(p || '-')}</div>${subs.filter(Boolean).length ? `<div class="group-secondary">${escapeHTML(subs.filter(Boolean).join(' - '))}</div>` : ''}`;
    const group = (title, inner, full = false) => `<div class="card-group ${full ? 'psych-group' : ''}"><span class="group-title">${title}</span><div class="group-value">${inner}</div></div>`;

    return `
        <article class="share-preview-trade">
            ${imgSrc ? `<img class="share-preview-shot" src="${imgSrc}" alt="Screenshot">` : ''}
            <div class="card-header">
                <div class="card-trade-id">${escapeHTML(t.number || '-')} ${t.symbol ? `<span class="symbol-tag">${escapeHTML(t.symbol)}</span>` : ''}<span class="share-preview-date">${formatShareDate(t.date)}</span></div>
                <span class="badge ${resultClassFor(t.result)}">${escapeHTML(t.result || '-')}</span>
            </div>
            <div class="card-body">
                ${group('Location', multi(t.locations))}
                ${group('Market Condition', single(t.marketCondition))}
                ${group('Setup', single(t.setup, t.direction))}
                ${t.evidences ? group('Evidence', multi(t.evidences)) : ''}
                ${t.invalidations ? group('Invalidation', multi(t.invalidations)) : ''}
                ${t.target !== undefined ? group('Target', single(t.target, t.targetSub1, t.targetSub2)) : ''}
                ${t.psychology && t.psychology.length ? group('Psychology', `<div class="share-pill-list">${t.psychology.map(p => `<span class="psych-pill-tag">${escapeHTML(p)}</span>`).join('')}</div>`, true) : ''}
                ${t.notes ? group('Notes', `<div class="share-notes">${escapeHTML(t.notes)}</div>`, true) : ''}
            </div>
        </article>`;
}

async function openPreviewDialog() {
    const trades = getSelectedTrades();
    if (!trades.length) return;
    const parts = [];
    for (const t of trades) parts.push(sharedTradeHtml(buildSharedTrade(t, ''), await screenshotUrl(t.screenshot)));
    openShareDialog({
        title: 'Preview',
        wide: true,
        bodyHtml: `<p class="share-dialog-lead">This is what reviewers see${shareState.ownerName.trim() ? `, shared by ${escapeHTML(shareState.ownerName.trim())}` : ''}. Each trade also gets a review form.</p>${parts.join('')}`,
        footerHtml: `<span></span><div class="share-dialog-actions"><button type="button" class="btn-secondary" data-close>Close</button></div>`
    });
}

// ---------- sharing ----------

async function shareFetch(path, options = {}) {
    let res;
    try {
        res = await fetch(SHARE_API + path, options);
    } catch (e) {
        throw new Error('No connection to the share service. Check your internet connection and try again.');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
        const err = new Error((data && data.error) || `Share service error (${res.status})`);
        err.status = res.status;
        throw err;
    }
    return data;
}

// Screenshots wider than 1920 px are scaled down; small WebP files go as they are
async function prepareScreenshot(file) {
    const isWebp = file.type === 'image/webp' || /\.webp$/i.test(file.name);
    const bitmap = await createImageBitmap(file);
    const tooWide = bitmap.width > SHARE_IMAGE_MAX_WIDTH;
    if (isWebp && !tooWide && file.size <= 1500000) {
        bitmap.close && bitmap.close();
        return new Blob([file], { type: 'image/webp' });
    }
    const scale = Math.min(1, SHARE_IMAGE_MAX_WIDTH / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close && bitmap.close();
    return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not prepare a screenshot')), 'image/webp', 0.85));
}

function setShareProgress(text) {
    const btn = document.getElementById('btn-do-share');
    if (btn) { btn.textContent = text; btn.disabled = true; }
}

async function createShare() {
    if (shareBusy || shareState.active) return;
    const trades = getSelectedTrades();
    const ownerName = shareState.ownerName.trim().slice(0, SHARE_MAX_NAME);
    if (!trades.length) return;
    if (!ownerName) { updateShareSubmitState(); return; }
    shareState.ownerName = ownerName;
    shareBusy = true;
    let started = null;
    try {
        setShareProgress('Sharing…');
        started = await shareFetch('/shares', { method: 'POST' });
        const auth = { 'Authorization': `Bearer ${started.key}` };

        const shared = [];
        for (let i = 0; i < trades.length; i++) {
            setShareProgress(`Uploading ${i + 1} of ${trades.length}…`);
            let file;
            try {
                file = await readScreenshotFile(trades[i].screenshot);
            } catch (e) {
                throw new Error(`The screenshot of trade ${trades[i].number || i + 1} could not be found in your journal folder.`);
            }
            const blob = await prepareScreenshot(file);
            const up = await shareFetch('/upload', {
                method: 'POST',
                headers: { ...auth, 'X-Share-Id': started.id, 'Content-Type': blob.type || 'image/webp' },
                body: blob
            });
            shared.push(buildSharedTrade(trades[i], up.url));
        }

        setShareProgress('Creating link…');
        await shareFetch(`/shares/${started.id}`, {
            method: 'PUT',
            headers: { ...auth, 'Content-Type': 'application/json' },
            body: JSON.stringify({ version: 1, sharedBy: ownerName, trades: shared })
        });

        const link = new URL(`review/#${started.id}`, window.location.href).href;
        shareState.active = {
            id: started.id,
            key: started.key,
            link,
            createdAt: started.createdAt,
            expiresAt: started.expiresAt,
            ownerName,
            tradeIds: trades.map(t => t.id)
        };
        shareState.selection = [];
        await saveShareState();
        shareBusy = false;
        refreshShareUI();
        pendingTradesAnimation = null;
        renderDashboard();
        showToast('Shared. Copy the link and send it to your reviewers.', 'success');
    } catch (err) {
        shareBusy = false;
        // Remove what was already uploaded
        if (started) {
            shareFetch(`/shares/${started.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${started.key}` } }).catch(() => {});
        }
        showToast(err.message || 'Sharing failed', 'error');
        refreshShareUI();
    }
}

async function cancelActiveShare() {
    const active = shareState.active;
    if (!active) return;
    const ok = await appConfirm({ title: 'Cancel this share?', message: 'The link stops working and the shared screenshots and reviews are deleted online. Reviews you already received stay in your journal.', cancelText: 'Keep share', confirmText: 'Cancel share', icon: 'trash' });
    if (!ok) return;
    await syncReviews(true);
    try {
        await shareFetch(`/shares/${active.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${active.key}` } });
    } catch (err) {
        showToast(`Could not cancel the share: ${err.message}`, 'error');
        return;
    }
    shareState.active = null;
    shareState.past = shareState.past.filter(p => p.id !== active.id);
    await saveShareState();
    refreshShareUI();
    pendingTradesAnimation = null;
    renderDashboard();
    showToast('Share cancelled. The link no longer works.', 'success');
}

// ---------- reviews ----------

// Copy new reviews from the share service into the trades of the journal
async function syncReviews(force = false, minGapMs = 60 * 1000) {
    if (!shareFeatureOn || !dirHandle || !fileConnected) return;
    if (!force && Date.now() - lastShareSync < minGapMs) return;
    lastShareSync = Date.now();
    retireExpiredShare();

    const sources = [];
    if (shareState.active) sources.push(shareState.active);
    sources.push(...shareState.past);
    if (!sources.length) return;

    let changed = false;
    const removed = new Set(shareState.removedReviewIds);
    for (const src of sources) {
        let data;
        try {
            data = await shareFetch(`/shares/${src.id}/reviews`, { headers: { 'Authorization': `Bearer ${src.key}` } });
        } catch (err) {
            if (err.status === 410 || err.status === 403) {
                // Gone online: stop asking
                if (shareState.active && shareState.active.id === src.id && err.status === 410) shareState.active = null;
                shareState.past = shareState.past.filter(p => p.id !== src.id);
                saveShareState();
            }
            continue;
        }
        for (const r of data.reviews || []) {
            const localId = `${src.id}:${r.id}`;
            if (removed.has(localId)) continue;
            const trade = appData.trades.find(t => t.id === r.tradeId);
            if (!trade) continue;
            if (!Array.isArray(trade.reviews)) trade.reviews = [];
            if (trade.reviews.some(x => x.id === localId)) continue;
            trade.reviews.push({
                id: localId,
                shareId: src.id,
                name: String(r.name || ''),
                verdict: r.verdict,
                text: String(r.text || ''),
                createdAt: r.createdAt,
                isNew: true
            });
            changed = true;
        }
    }

    if (changed) {
        appData.trades.forEach(t => { if (Array.isArray(t.reviews)) t.reviews.sort((a, b) => a.createdAt - b.createdAt); });
        await autoSave();
        if (viewDashboard.classList.contains('active') && !document.getElementById('trade-modal').classList.contains('active')) {
            pendingTradesAnimation = null;
            renderDashboard();
        }
        if (isShareViewOpen()) renderShareView();
        updateShareBanner();
    }
}

// Dashboard opened or other day picked: check soon, but not more than every 15 seconds
function syncReviewsSoon() {
    syncReviews(false, 15 * 1000);
}

function formatReviewTime(ms) {
    const d = new Date(ms);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function reviewsListHtml(reviews) {
    return reviews.map(r => `
        <div class="review-item" data-review-id="${escapeHTML(r.id)}">
            <div class="review-item-head">
                <span class="review-name">${escapeHTML(r.name)}</span>
                <span class="verdict-tag ${r.verdict === 'follows' ? 'follows' : 'not-follows'}">${escapeHTML(VERDICT_LABELS[r.verdict] || r.verdict)}</span>
                <span class="review-time">${escapeHTML(formatReviewTime(r.createdAt))}</span>
            </div>
            ${r.text ? `<p class="review-text">${escapeHTML(r.text)}</p>` : ''}
            <button type="button" class="trade-text-btn review-remove" data-remove-review="${escapeHTML(r.id)}">Remove</button>
        </div>`).join('');
}

function openReviewsDialog(tradeId) {
    const trade = appData.trades.find(t => t.id === tradeId);
    if (!trade || !Array.isArray(trade.reviews) || !trade.reviews.length) return;

    const follows = trade.reviews.filter(r => r.verdict === 'follows').length;
    const notFollows = trade.reviews.length - follows;
    const render = () => `
        <p class="share-dialog-lead">${escapeHTML(trade.number || '-')} ${trade.symbol ? `<span class="symbol-tag">${escapeHTML(trade.symbol)}</span>` : ''} ${escapeHTML(trade.setup || '')}, ${formatShareDate(trade.date)}</p>
        <div class="review-summary">
            <span class="verdict-tag follows">${follows} ${VERDICT_LABELS.follows.toLowerCase()}</span>
            <span class="verdict-tag not-follows">${notFollows} ${VERDICT_LABELS.not_follows.toLowerCase()}</span>
        </div>
        <div class="review-list">${reviewsListHtml(trade.reviews)}</div>`;

    openShareDialog({
        title: plural(trade.reviews.length, 'review'),
        bodyHtml: render(),
        onReady: overlay => {
            overlay.querySelectorAll('[data-remove-review]').forEach(btn => btn.addEventListener('click', () => removeReview(trade, btn.dataset.removeReview)));
        }
    });

    // Opened: no longer new
    if (trade.reviews.some(r => r.isNew)) {
        trade.reviews.forEach(r => { delete r.isNew; });
        autoSave();
        document.querySelectorAll(`.reviews-btn[data-trade-id="${CSS.escape(trade.id)}"]`).forEach(b => b.classList.remove('has-new'));
    }
}

async function removeReview(trade, localId) {
    if (!(await appConfirm({ title: 'Remove this review?', message: 'It is removed from this trade in your journal.', confirmText: 'Remove', icon: 'trash' }))) return;
    const review = trade.reviews.find(r => r.id === localId);
    trade.reviews = trade.reviews.filter(r => r.id !== localId);
    if (!shareState.removedReviewIds.includes(localId)) shareState.removedReviewIds.push(localId);
    await saveShareState();
    await autoSave();

    // Also remove it online while the share still exists
    if (review) {
        const src = [shareState.active, ...shareState.past].find(s => s && s.id === review.shareId);
        if (src) {
            const onlineId = localId.split(':')[1];
            shareFetch(`/shares/${src.id}/reviews/${onlineId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${src.key}` } }).catch(() => {});
        }
    }

    pendingTradesAnimation = null;
    renderDashboard();
    if (trade.reviews.length) openReviewsDialog(trade.id);
    else closeShareDialog();
}

// ---------- start ----------

document.addEventListener('DOMContentLoaded', () => {
    ['btn-your-shares', 'btn-share-day'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.hidden = !shareFeatureOn;
    });
    if (shareFeatureOn && !SHARE_FEATURE_ENABLED) {
        let shown = false;
        try { shown = sessionStorage.getItem('vws-share-test-notice') === '1'; sessionStorage.setItem('vws-share-test-notice', '1'); } catch (e) {}
        if (!shown) setTimeout(() => showToast('Sharing is on in this browser only (test mode). Open the app with ?share=off to hide it again.'), 800);
    }
    setupShareCardClicks();
    const btnShares = document.getElementById('btn-your-shares');
    if (btnShares) btnShares.addEventListener('click', openShareView);
    const btnShareDay = document.getElementById('btn-share-day');
    if (btnShareDay) btnShareDay.addEventListener('click', shareDay);
    updateSharesButton();

    // Fetch new reviews when the user comes back to the app, and every 5 minutes
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncReviews(); });
    shareSyncTimer = setInterval(() => { if (!document.hidden) syncReviews(true); }, 5 * 60 * 1000);
});
