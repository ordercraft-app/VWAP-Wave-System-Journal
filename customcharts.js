// --- Custom Charts ---
// Users build their own charts in Settings > Charts. A chart is a small
// config object saved in settings.json (settings.customCharts). Every field
// list is read from the user's own settings and trades, so charts keep
// working when items are added, renamed, reordered or removed.

const CC_VIEWS = [
    { key: 'number', label: 'Single number', desc: 'One result for the trades you pick' },
    { key: 'bar', label: 'Bar chart', desc: 'Compare across one field' },
    { key: 'heatmap', label: 'Heatmap', desc: 'Compare two fields at once' }
];
const CC_METRICS = [
    { key: 'winRate', label: 'Win rate' },
    { key: 'count', label: 'Number of trades' }
];
const CC_MIN_TRADES = [1, 3, 5, 10];
const CC_SIZES = [
    { key: 1, label: 'Small' },
    { key: 2, label: 'Medium' },
    { key: 3, label: 'Full width' }
];
const CC_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CC_MAX_BARS = 12;
const CC_MAX_HEAT = 12;

let ccState = null;
let ccDirty = false;

// ---------- Fields (dimensions) ----------
// get(trade) always returns an array of strings: a trade can have several
// locations, evidences, invalidations and psychology states.

function ccPath(parts) {
    return parts.filter(Boolean).join(' › ');
}

function ccTradeDay(t) {
    if (!t.date) return '';
    const [y, m, d] = String(t.date).split('-').map(Number);
    const js = new Date(y, (m || 1) - 1, d || 1).getDay(); // 0 = Sunday
    return CC_DAYS[(js + 6) % 7];
}

function ccObjectKeys(obj) {
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? Object.keys(obj) : [];
}

function ccFlatten(obj) {
    return ccObjectKeys(obj).flatMap(k => (Array.isArray(obj[k]) && obj[k].length ? obj[k] : [k]));
}

const CC_FIELDS = [
    { key: 'symbol', label: 'Symbol', get: t => [t.symbol], options: s => s.symbol || [] },
    { key: 'marketCondition', label: 'Market Condition', get: t => [t.marketCondition], options: s => s.marketCondition || [] },
    { key: 'result', label: 'Result', get: t => [t.result], options: () => ['WIN', 'LOST', 'B/E'], filterOnly: true },
    { key: 'setupCategory', label: 'Setup Category',
        get: t => [t.setupCategory || (typeof tfFindSetupCategory === 'function' ? tfFindSetupCategory(t.setup) : '')],
        options: s => ccObjectKeys(s.setup) },
    { key: 'setup', label: 'Setup', get: t => [t.setup], options: s => ccFlatten(s.setup) },
    { key: 'direction', label: 'Direction', get: t => [t.direction], options: s => s.direction || [] },
    { key: 'locationType', label: 'Location Type', get: t => (t.locations || []).map(l => l && l.primary), options: s => ccObjectKeys(s.location) },
    { key: 'location', label: 'Location', get: t => (t.locations || []).map(l => l && ccPath([l.primary, l.sub1, l.sub2])), options: () => [] },
    { key: 'evidence', label: 'Evidence', feature: 'evidence', get: t => (t.evidences || []).map(e => e && (e.sub || e.primary)), options: s => ccFlatten(s.evidence) },
    { key: 'invalidation', label: 'Invalidation', feature: 'invalidation', get: t => (t.invalidations || []).map(i => i && (i.sub || i.primary)), options: s => ccFlatten(s.invalidation) },
    { key: 'target', label: 'Target', feature: 'target', get: t => [ccPath([t.target, t.targetSub1, t.targetSub2])], options: () => [] },
    { key: 'psychology', label: 'Psychology', feature: 'psychology', get: t => t.psychology || [], options: s => s.psychology || [] },
    { key: 'dayOfWeek', label: 'Day of Week', get: t => [ccTradeDay(t)], options: () => CC_DAYS }
];

function ccField(key) {
    return CC_FIELDS.find(f => f.key === key) || null;
}

function ccFeatureOn(field) {
    if (!field || !field.feature) return true;
    const features = appData.settings.features || {};
    return features[field.feature] !== false;
}

function ccValues(trade, field) {
    let vals = [];
    try { vals = field.get(trade) || []; } catch (e) { vals = []; }
    return [...new Set(vals.filter(v => v !== undefined && v !== null && String(v).trim() !== '').map(String))];
}

// Settings order first, then values that only exist in trades (renamed or removed items)
function ccFieldOptions(field) {
    let fromSettings = [];
    try { fromSettings = (field.options(appData.settings) || []).map(String); } catch (e) { fromSettings = []; }
    const extra = new Set();
    appData.trades.forEach(t => ccValues(t, field).forEach(v => { if (!fromSettings.includes(v)) extra.add(v); }));
    return { list: [...new Set(fromSettings)], extra: [...extra] };
}

// ---------- Config ----------

function ccNewId() {
    return 'cc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function ccKey(id) {
    return `custom:${id}`;
}

function ccNormalize(c) {
    const view = CC_VIEWS.some(v => v.key === c.view) ? c.view : 'number';
    return {
        id: c.id || ccNewId(),
        title: typeof c.title === 'string' ? c.title : '',
        view,
        metric: CC_METRICS.some(m => m.key === c.metric) ? c.metric : 'winRate',
        groupBy: c.groupBy || '',
        rowsBy: c.rowsBy || '',
        colsBy: c.colsBy || '',
        filters: (Array.isArray(c.filters) ? c.filters : [])
            .filter(f => f && f.field)
            .map(f => ({ field: f.field, exclude: !!f.exclude, values: Array.isArray(f.values) ? f.values.map(String) : [] })),
        minTrades: CC_MIN_TRADES.includes(Number(c.minTrades)) ? Number(c.minTrades) : 3,
        size: [1, 2, 3].includes(Number(c.size)) ? Number(c.size) : (view === 'number' ? 1 : 2)
    };
}

function ccGetCharts() {
    if (!Array.isArray(appData.settings.customCharts)) appData.settings.customCharts = [];
    appData.settings.customCharts = appData.settings.customCharts.filter(c => c && typeof c === 'object').map(ccNormalize);
    return appData.settings.customCharts;
}

function ccCustomKeys() {
    return ccGetCharts().map(c => ccKey(c.id));
}

function ccFieldsUsed(c) {
    const keys = c.filters.filter(f => f.values.length).map(f => f.field);
    if (c.view === 'bar') keys.push(c.groupBy);
    if (c.view === 'heatmap') keys.push(c.rowsBy, c.colsBy);
    return [...new Set(keys.filter(Boolean))];
}

// Why a chart can't be drawn right now (null = fine)
function ccProblem(c) {
    const used = ccFieldsUsed(c);
    const unknown = used.find(k => !ccField(k));
    if (unknown) return 'This chart uses a field that no longer exists. Edit it to fix this.';
    const off = used.map(ccField).find(f => !ccFeatureOn(f));
    if (off) return `This chart uses ${off.label}, which is turned off in Settings.`;
    if (c.view === 'bar' && !c.groupBy) return 'Choose what to split the bars by.';
    if (c.view === 'heatmap' && (!c.rowsBy || !c.colsBy)) return 'Choose a field for the rows and the columns.';
    if (c.view === 'heatmap' && c.rowsBy === c.colsBy) return 'Rows and columns need two different fields.';
    return null;
}

function ccAutoTitle(c) {
    const metric = c.metric === 'count' ? 'Trades' : 'Win rate';
    const label = k => (ccField(k) ? ccField(k).label : '…');
    if (c.view === 'bar') return `${metric} by ${c.groupBy ? label(c.groupBy) : '…'}`;
    if (c.view === 'heatmap') return `${metric} by ${c.rowsBy ? label(c.rowsBy) : '…'} and ${c.colsBy ? label(c.colsBy) : '…'}`;
    const picked = c.filters.filter(f => f.values.length && !f.exclude).flatMap(f => f.values);
    return picked.length ? `${metric}: ${picked.slice(0, 3).join(', ')}${picked.length > 3 ? '…' : ''}` : `${metric}: all trades`;
}

function ccTitle(c) {
    return (c.title || '').trim() || ccAutoTitle(c);
}

function ccFilterSummary(c) {
    return c.filters.filter(f => f.values.length && ccField(f.field)).map(f => {
        const vals = f.values.length > 2 ? `${f.values.slice(0, 2).join(', ')} +${f.values.length - 2}` : f.values.join(', ');
        return `${ccField(f.field).label} ${f.exclude ? 'is not' : 'is'} ${vals}`;
    });
}

// ---------- Calculation ----------

function ccApplyFilters(trades, c) {
    const active = c.filters.filter(f => f.values.length && ccField(f.field));
    return trades.filter(t => active.every(f => {
        const vals = ccValues(t, ccField(f.field));
        const hit = vals.some(v => f.values.includes(v));
        return f.exclude ? !hit : hit;
    }));
}

function ccStats(trades) {
    const s = getWinRateData(trades);
    return { wins: s.wins, losses: s.losses, be: s.be, total: s.total, winRate: parseFloat(s.winRate) || 0 };
}

function ccMetricValue(stats, c) {
    return c.metric === 'count' ? stats.total : stats.winRate;
}

function ccFormat(value, c) {
    return c.metric === 'count' ? String(value) : `${Math.round(value * 10) / 10}%`;
}

function ccGroup(trades, field) {
    const groups = new Map();
    trades.forEach(t => ccValues(t, field).forEach(v => {
        if (!groups.has(v)) groups.set(v, []);
        groups.get(v).push(t);
    }));
    return groups;
}

// Orders group labels like the settings lists, then the rest alphabetically
function ccOrderLabels(labels, field) {
    const { list } = ccFieldOptions(field);
    return [...labels].sort((a, b) => {
        const ia = list.indexOf(a), ib = list.indexOf(b);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 1e6 : ia) - (ib === -1 ? 1e6 : ib);
        return a.localeCompare(b);
    });
}

function ccColors() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return {
        win: '#44BD1E',
        loss: '#ee354e',
        be: isLight ? '#C1C8D1' : '#2b2c30',
        accent: '#386af5',
        muted: isLight ? '#C1C8D1' : '#3B434C'
    };
}

// ---------- Rendering (shared by the Stats page and the modal preview) ----------

function ccEmpty(body, text) {
    const p = document.createElement('p');
    p.className = 'cc-empty';
    p.textContent = text;
    body.appendChild(p);
}

function ccRenderInto(body, c, trades, chartId) {
    destroyChart(chartId);
    delete chartInstances[chartId];
    body.innerHTML = '';

    const problem = ccProblem(c);
    if (problem) return ccEmpty(body, problem);

    const filtered = ccApplyFilters(trades, c);
    if (!filtered.length) return ccEmpty(body, 'No trades match this chart in the selected period.');

    if (c.view === 'number') return ccRenderNumber(body, c, filtered);
    if (c.view === 'bar') return ccRenderBar(body, c, filtered, chartId);
    if (c.view === 'heatmap') return ccRenderHeatmap(body, c, filtered);
}

function ccRenderNumber(body, c, trades) {
    const s = ccStats(trades);
    const colors = ccColors();
    const wrap = document.createElement('div');
    wrap.className = 'cc-number';

    const big = document.createElement('div');
    big.className = 'cc-number-value';
    big.textContent = ccFormat(ccMetricValue(s, c), c);
    if (c.metric === 'winRate') big.style.color = s.winRate >= 50 ? colors.win : colors.loss;
    wrap.appendChild(big);

    const sub = document.createElement('div');
    sub.className = 'cc-number-sub';
    sub.textContent = c.metric === 'winRate'
        ? `win rate over ${s.total} ${s.total === 1 ? 'trade' : 'trades'}`
        : `${s.total === 1 ? 'trade matches' : 'trades match'} this chart`;
    wrap.appendChild(sub);

    if (s.total < c.minTrades) {
        const warn = document.createElement('div');
        warn.className = 'cc-number-sub cc-low';
        warn.textContent = `Fewer than ${c.minTrades} trades, so take this with a grain of salt.`;
        wrap.appendChild(warn);
    }

    const bar = document.createElement('div');
    bar.className = 'cc-split-bar';
    [['wins', colors.win], ['be', colors.be], ['losses', colors.loss]].forEach(([k, color]) => {
        if (!s[k]) return;
        const seg = document.createElement('span');
        seg.style.flex = String(s[k]);
        seg.style.background = color;
        bar.appendChild(seg);
    });
    wrap.appendChild(bar);

    const legend = document.createElement('div');
    legend.className = 'cc-split-legend';
    legend.textContent = `${s.wins} win · ${s.be} B/E · ${s.losses} lost`;
    wrap.appendChild(legend);

    body.appendChild(wrap);
}

function ccRenderBar(body, c, trades, chartId) {
    const field = ccField(c.groupBy);
    const colors = ccColors();
    const groups = ccGroup(trades, field);
    if (!groups.size) return ccEmpty(body, `None of these trades have a ${field.label.toLowerCase()}.`);

    let rows = [...groups.entries()].map(([label, ts]) => {
        const s = ccStats(ts);
        return { label, s, value: ccMetricValue(s, c), enough: s.total >= c.minTrades };
    });
    rows.sort((a, b) => (b.enough - a.enough) || (b.value - a.value) || (b.s.total - a.s.total));
    const hiddenCount = Math.max(0, rows.length - CC_MAX_BARS);
    rows = rows.slice(0, CC_MAX_BARS);

    const wrapper = document.createElement('div');
    wrapper.className = 'chart-wrapper cc-bar-wrapper';
    wrapper.style.height = `${Math.max(200, rows.length * 40 + 20)}px`;
    const canvas = document.createElement('canvas');
    wrapper.appendChild(canvas);
    body.appendChild(wrapper);

    if (hiddenCount) {
        const more = document.createElement('p');
        more.className = 'cc-note';
        more.textContent = `${hiddenCount} more not shown. Add a filter to narrow it down.`;
        body.appendChild(more);
    }
    if (rows.some(r => !r.enough)) {
        const note = document.createElement('p');
        note.className = 'cc-note';
        note.textContent = `Grey bars have fewer than ${c.minTrades} trades.`;
        body.appendChild(note);
    }

    chartInstances[chartId] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: rows.map(r => r.label),
            datasets: [{
                data: rows.map(r => r.value),
                backgroundColor: rows.map(r => (r.enough ? (c.metric === 'winRate' ? colors.accent : colors.accent) : colors.muted)),
                borderRadius: 12,
                borderSkipped: false,
                maxBarThickness: 28
            }]
        },
        options: {
            clip: false,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: { display: false, beginAtZero: true, max: c.metric === 'winRate' ? 100 : undefined, grid: { display: false } },
                y: { display: true, afterFit: alignTopChartRows, border: { display: false }, grid: { display: false } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const r = rows[ctx.dataIndex];
                            const n = `${r.s.total} ${r.s.total === 1 ? 'trade' : 'trades'}`;
                            return c.metric === 'winRate' ? ` Win rate ${ccFormat(r.value, c)} (${n})` : ` ${n}`;
                        }
                    }
                }
            }
        }
    });
}

function ccHeatColor(value, c, maxCount) {
    if (c.metric === 'count') {
        const a = maxCount ? 0.12 + 0.5 * (value / maxCount) : 0.12;
        return `color-mix(in srgb, #386af5 ${Math.round(a * 100)}%, transparent)`;
    }
    const strength = Math.min(1, Math.abs(value - 50) / 50);
    const pct = Math.round(10 + strength * 45);
    if (value > 50) return `color-mix(in srgb, #44BD1E ${pct}%, transparent)`;
    if (value < 50) return `color-mix(in srgb, #ee354e ${pct}%, transparent)`;
    return 'var(--bg-input)';
}

function ccRenderHeatmap(body, c, trades) {
    const rowField = ccField(c.rowsBy);
    const colField = ccField(c.colsBy);

    const rowGroups = ccGroup(trades, rowField);
    const colLabelsAll = ccOrderLabels([...ccGroup(trades, colField).keys()], colField);
    let rowLabels = ccOrderLabels([...rowGroups.keys()], rowField);
    if (!rowLabels.length || !colLabelsAll.length) return ccEmpty(body, 'These trades have nothing to compare on those fields yet.');

    const cut = rowLabels.length > CC_MAX_HEAT || colLabelsAll.length > CC_MAX_HEAT;
    rowLabels = rowLabels.slice(0, CC_MAX_HEAT);
    const colLabels = colLabelsAll.slice(0, CC_MAX_HEAT);

    const cells = rowLabels.map(r => colLabels.map(col => {
        const ts = rowGroups.get(r).filter(t => ccValues(t, colField).includes(col));
        const s = ccStats(ts);
        return { s, value: ccMetricValue(s, c) };
    }));
    const maxCount = Math.max(1, ...cells.flat().map(x => x.s.total));

    const scroll = document.createElement('div');
    scroll.className = 'cc-heat-scroll';
    const table = document.createElement('table');
    table.className = 'cc-heat';

    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const corner = document.createElement('th');
    corner.textContent = '';
    hr.appendChild(corner);
    colLabels.forEach(col => {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = col;
        hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rowLabels.forEach((r, ri) => {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = r;
        tr.appendChild(th);
        colLabels.forEach((col, ci) => {
            const { s, value } = cells[ri][ci];
            const td = document.createElement('td');
            if (!s.total) {
                td.className = 'is-empty';
                td.textContent = '–';
                td.title = 'No trades';
            } else if (s.total < c.minTrades) {
                td.className = 'is-low';
                td.innerHTML = `<span class="cc-heat-val">${escapeHTML(ccFormat(value, c))}</span><span class="cc-heat-n">${s.total}</span>`;
                td.title = `${s.total} ${s.total === 1 ? 'trade' : 'trades'}, fewer than ${c.minTrades}`;
            } else {
                td.style.background = ccHeatColor(value, c, maxCount);
                td.innerHTML = `<span class="cc-heat-val">${escapeHTML(ccFormat(value, c))}</span><span class="cc-heat-n">${s.total}</span>`;
                td.title = `${r} / ${col}: ${s.total} ${s.total === 1 ? 'trade' : 'trades'}`;
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    scroll.appendChild(table);
    body.appendChild(scroll);

    const note = document.createElement('p');
    note.className = 'cc-note';
    note.textContent = `Small number = trades in that cell. Faded cells have fewer than ${c.minTrades}.${cut ? ` Showing the first ${CC_MAX_HEAT} rows and columns.` : ''}`;
    body.appendChild(note);
}

// ---------- Stats page ----------

function ccEnsureStatsCards() {
    const grid = document.querySelector('.stats-grid');
    if (!grid) return;
    const charts = ccGetCharts();
    const keys = charts.map(c => ccKey(c.id));

    grid.querySelectorAll('.cc-card').forEach(card => {
        if (!keys.includes(card.dataset.chartKey)) {
            destroyChart(`cc-${card.dataset.chartKey}`);
            card.remove();
        }
    });

    charts.forEach(c => {
        const key = ccKey(c.id);
        let card = grid.querySelector(`.cc-card[data-chart-key="${CSS.escape(key)}"]`);
        if (!card) {
            card = document.createElement('div');
            card.className = 'stat-card cc-card';
            card.dataset.chartKey = key;
            card.innerHTML = `
                <div class="cc-card-head">
                    <h3 class="card-title"></h3>
                    <button type="button" class="cc-edit-btn" title="Edit chart">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    </button>
                </div>
                <div class="cc-filters"></div>
                <div class="cc-body"></div>`;
            card.querySelector('.cc-edit-btn').addEventListener('click', () => openCustomChartModal(card.dataset.chartId));
            grid.appendChild(card);
        }
        card.dataset.chartId = c.id;
        card.querySelector('.cc-edit-btn').setAttribute('aria-label', `Edit chart: ${ccTitle(c)}`);
        card.classList.remove('chart-span-2', 'chart-span-3');
        if (c.size === 2) card.classList.add('chart-span-2');
        if (c.size === 3) card.classList.add('chart-span-3');
    });
}

function ccIsVisible(c) {
    const vis = appData.settings.chartVisibility || {};
    if (vis[ccKey(c.id)] === false) return false;
    return !ccFieldsUsed(c).map(ccField).some(f => f && !ccFeatureOn(f));
}

function ccRenderStatsCards(trades) {
    ccEnsureStatsCards();
    ccGetCharts().forEach(c => {
        const key = ccKey(c.id);
        const card = document.querySelector(`.cc-card[data-chart-key="${CSS.escape(key)}"]`);
        if (!card) return;
        const visible = ccIsVisible(c);
        card.style.display = visible ? 'flex' : 'none';
        if (!visible) {
            destroyChart(`cc-${key}`);
            return;
        }
        card.querySelector('.card-title').textContent = ccTitle(c);
        const filters = card.querySelector('.cc-filters');
        filters.innerHTML = '';
        ccFilterSummary(c).forEach(text => {
            const tag = document.createElement('span');
            tag.className = 'cc-filter-tag';
            tag.textContent = text;
            filters.appendChild(tag);
        });
        filters.style.display = filters.children.length ? 'flex' : 'none';
        ccRenderInto(card.querySelector('.cc-body'), c, trades, `cc-${key}`);
    });
}

// ---------- Settings list helpers ----------

function ccSettingsRows() {
    return ccGetCharts().map(c => ({
        key: ccKey(c.id),
        label: ccTitle(c),
        custom: true,
        id: c.id,
        note: (() => {
            const off = ccFieldsUsed(c).map(ccField).find(f => f && !ccFeatureOn(f));
            return off ? `Hidden while ${off.label} is turned off` : '';
        })()
    }));
}

// ---------- Modal ----------

function ccEnsureModal() {
    if (document.getElementById('cc-modal')) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'cc-modal';
    overlay.innerHTML = `
        <div class="modal-content linear-modal" role="dialog" aria-modal="true" aria-labelledby="cc-modal-title">
            <div class="modal-header">
                <h2 id="cc-modal-title">Add Custom Chart</h2>
                <button class="close-btn" id="cc-close" aria-label="Close">&times;</button>
            </div>
            <div class="modal-body" id="cc-modal-body">
                <div class="form-group">
                    <label for="cc-name">Chart name</label>
                    <input type="text" id="cc-name" class="linear-input" maxlength="80">
                </div>

                <div class="chip-section">
                    <div class="chip-section-head"><span>Chart type</span></div>
                    <div id="cc-view" class="cc-view-tiles"></div>
                </div>

                <div class="chip-section">
                    <div class="chip-section-head"><span>Show</span></div>
                    <div id="cc-metric" class="chip-box"></div>
                </div>

                <div class="chip-section" id="cc-sec-split">
                    <div class="chip-section-head"><span id="cc-split-title">Split by</span><span class="chip-section-note" id="cc-split-note"></span></div>
                    <div id="cc-split" class="chip-box"></div>
                </div>

                <div class="chip-section">
                    <div class="chip-section-head"><span>Which trades</span><span class="chip-section-note">All filters must match</span></div>
                    <div id="cc-filters"></div>
                </div>

                <div class="chip-split">
                    <div class="chip-section">
                        <div class="chip-section-head"><span>Minimum trades</span></div>
                        <div id="cc-min" class="chip-box"></div>
                    </div>
                    <div class="chip-section">
                        <div class="chip-section-head"><span>Width on Stats page</span></div>
                        <div id="cc-size" class="chip-box"></div>
                    </div>
                </div>

                <div class="chip-section">
                    <div class="chip-section-head"><span>Preview</span><span class="chip-section-note">Uses all your trades</span></div>
                    <div class="chip-box cc-preview">
                        <h3 class="card-title" id="cc-preview-title"></h3>
                        <div class="cc-filters" id="cc-preview-filters"></div>
                        <div class="cc-body" id="cc-preview-body"></div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <div style="display: flex; gap: 12px;">
                    <button class="btn-primary" id="cc-save">Save Chart</button>
                    <button class="btn-secondary" id="cc-cancel">Cancel</button>
                </div>
                <button class="btn-danger" id="cc-delete" style="display:none;">Delete</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('mousedown', e => { if (e.target === overlay) ccClose(); });
    overlay.querySelector('#cc-close').addEventListener('click', ccClose);
    overlay.querySelector('#cc-cancel').addEventListener('click', ccClose);
    overlay.querySelector('#cc-save').addEventListener('click', ccSave);
    overlay.querySelector('#cc-delete').addEventListener('click', ccDelete);
    overlay.querySelector('#cc-name').addEventListener('input', e => {
        ccState.title = e.target.value;
        ccDirty = true;
        ccRenderPreview();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) ccClose();
    });
}

function openCustomChartModal(id = null) {
    ccEnsureModal();
    const existing = id ? ccGetCharts().find(c => c.id === id) : null;
    ccState = existing
        ? JSON.parse(JSON.stringify(existing))
        : ccNormalize({ view: 'bar', metric: 'winRate', groupBy: 'setup', filters: [], minTrades: 3, size: 2 });
    ccState.isNew = !existing;
    ccState.ui = { adding: false, expanded: {} };

    document.getElementById('cc-modal-title').textContent = existing ? 'Edit Custom Chart' : 'Add Custom Chart';
    document.getElementById('cc-delete').style.display = existing ? 'block' : 'none';
    document.getElementById('cc-name').value = ccState.title;

    ccRenderModal();
    document.getElementById('cc-modal').classList.add('active');
    ccDirty = false;
    setTimeout(() => {
        document.getElementById('cc-modal-body').scrollTop = 0;
        document.getElementById('cc-name').focus();
    }, 50);
}

function ccClose() {
    if (ccDirty && !confirm('You have unsaved changes. Are you sure you want to close?')) return;
    destroyChart('cc-preview');
    document.getElementById('cc-modal').classList.remove('active');
    ccDirty = false;
}

function ccChange(patch) {
    Object.assign(ccState, patch);
    ccDirty = true;
    ccRenderModal();
}

function ccFieldsFor(purpose) {
    return CC_FIELDS.filter(f => ccFeatureOn(f) && (purpose === 'filter' || !f.filterOnly));
}

function ccChipList(container, idPrefix, items, isSelected, onPick, opts = {}) {
    const row = document.createElement('div');
    row.className = 'chip-row';
    const key = idPrefix;
    let visible = items;
    let hidden = 0;
    if (!ccState.ui.expanded[key] && items.length > 14) {
        visible = items.filter((it, i) => i < 12 || isSelected(it.value));
        hidden = items.length - visible.length;
    }
    visible.forEach(it => {
        row.appendChild(tfChip({
            id: `${idPrefix}::${it.value}`,
            label: it.label,
            selected: isSelected(it.value),
            legacy: !!it.legacy,
            tone: opts.tone || '',
            onClick: () => onPick(it.value)
        }));
    });
    if (hidden) {
        row.appendChild(tfChip({
            id: `${idPrefix}::__more`,
            label: `+ ${hidden} more`,
            extraClass: 'chip-more',
            onClick: () => { ccState.ui.expanded[key] = true; ccRenderModal(); }
        }));
    }
    container.appendChild(row);
}

function ccRenderModal() {
    const c = ccState;

    // Chart type tiles
    tfRender('cc-view', el => {
        CC_VIEWS.forEach(v => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'cc-view-tile' + (c.view === v.key ? ' is-selected' : '');
            b.dataset.chipId = `view::${v.key}`;
            b.setAttribute('aria-pressed', c.view === v.key ? 'true' : 'false');
            b.innerHTML = `${ccViewIcon(v.key)}<span class="cc-view-label">${escapeHTML(v.label)}</span><span class="cc-view-desc">${escapeHTML(v.desc)}</span>`;
            b.addEventListener('click', () => {
                const patch = { view: v.key };
                if (v.key === 'number') patch.size = 1;
                else if (c.size === 1) patch.size = 2;
                ccChange(patch);
            });
            el.appendChild(b);
        });
    });

    // Metric
    tfRender('cc-metric', el => {
        ccChipList(el, 'metric', CC_METRICS.map(m => ({ value: m.key, label: m.label })),
            v => c.metric === v, v => ccChange({ metric: v }));
    });

    // Split by / rows & columns
    const splitSec = document.getElementById('cc-sec-split');
    splitSec.style.display = c.view === 'number' ? 'none' : 'block';
    document.getElementById('cc-split-title').textContent = c.view === 'heatmap' ? 'Compare' : 'Split by';
    document.getElementById('cc-split-note').textContent = c.view === 'bar' ? 'One bar per value' : '';
    const groupable = ccFieldsFor('group').map(f => ({ value: f.key, label: f.label }));
    tfRender('cc-split', el => {
        if (c.view === 'bar') {
            ccChipList(el, 'groupBy', groupable, v => c.groupBy === v, v => ccChange({ groupBy: v }));
        } else if (c.view === 'heatmap') {
            [['rowsBy', 'Rows'], ['colsBy', 'Columns']].forEach(([prop, label]) => {
                const group = document.createElement('div');
                group.className = 'chip-group';
                const l = document.createElement('span');
                l.className = 'chip-group-label';
                l.textContent = label;
                group.appendChild(l);
                const other = prop === 'rowsBy' ? c.colsBy : c.rowsBy;
                ccChipList(group, prop, groupable.filter(g => g.value !== other),
                    v => c[prop] === v, v => ccChange({ [prop]: v }));
                el.appendChild(group);
            });
        }
    });

    ccRenderFilters();

    tfRender('cc-min', el => {
        ccChipList(el, 'min', CC_MIN_TRADES.map(n => ({ value: n, label: String(n) })),
            v => c.minTrades === v, v => ccChange({ minTrades: v }));
    });
    tfRender('cc-size', el => {
        ccChipList(el, 'size', CC_SIZES.map(s => ({ value: s.key, label: s.label })),
            v => c.size === v, v => ccChange({ size: v }));
    });

    document.getElementById('cc-name').placeholder = ccAutoTitle(c);
    ccRenderPreview();
}

function ccRenderFilters() {
    const c = ccState;
    tfRender('cc-filters', el => {
        c.filters.forEach((f, idx) => {
            const field = ccField(f.field);
            const box = document.createElement('div');
            box.className = 'chip-box cc-filter';

            const head = document.createElement('div');
            head.className = 'cc-filter-head';
            const name = document.createElement('span');
            name.className = 'cc-filter-name';
            name.textContent = field ? field.label : f.field;
            head.appendChild(name);

            const seg = document.createElement('div');
            seg.className = 'cc-seg';
            seg.setAttribute('role', 'group');
            seg.setAttribute('aria-label', 'Include or exclude');
            [[false, 'is'], [true, 'is not']].forEach(([ex, label]) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'cc-seg-btn' + (f.exclude === ex ? ' is-selected' : '');
                b.textContent = label;
                b.dataset.chipId = `seg::${idx}::${label}`;
                b.setAttribute('aria-pressed', f.exclude === ex ? 'true' : 'false');
                b.addEventListener('click', () => { f.exclude = ex; ccDirty = true; ccRenderModal(); });
                seg.appendChild(b);
            });
            head.appendChild(seg);

            const rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'chip-tag-remove cc-filter-remove';
            rm.innerHTML = '&times;';
            rm.setAttribute('aria-label', `Remove ${field ? field.label : ''} filter`);
            rm.dataset.chipId = `rm::${idx}`;
            rm.addEventListener('click', () => { c.filters.splice(idx, 1); ccDirty = true; ccRenderModal(); });
            head.appendChild(rm);
            box.appendChild(head);

            if (!field) {
                ccEmpty(box, 'This field no longer exists. Remove this filter.');
            } else if (!ccFeatureOn(field)) {
                ccEmpty(box, `${field.label} is turned off in Settings, so this filter is ignored.`);
            } else {
                const { list, extra } = ccFieldOptions(field);
                const items = [
                    ...list.map(v => ({ value: v, label: v })),
                    ...extra.map(v => ({ value: v, label: v }))
                ];
                // Values picked earlier that no longer exist anywhere stay visible
                f.values.forEach(v => { if (!items.some(i => i.value === v)) items.push({ value: v, label: v, legacy: true }); });
                if (!items.length) {
                    ccEmpty(box, `No ${field.label.toLowerCase()} values yet. Log a few trades first.`);
                } else {
                    ccChipList(box, `filter::${idx}`, items, v => f.values.includes(v), v => {
                        f.values = f.values.includes(v) ? f.values.filter(x => x !== v) : [...f.values, v];
                        ccDirty = true;
                        ccRenderModal();
                    }, { tone: f.exclude ? 'loss' : '' });
                    if (!f.values.length) {
                        const hint = document.createElement('p');
                        hint.className = 'cc-note';
                        hint.textContent = 'Pick one or more. Any of them counts as a match.';
                        box.appendChild(hint);
                    }
                }
            }
            el.appendChild(box);
        });

        const used = c.filters.map(f => f.field);
        const available = ccFieldsFor('filter').filter(f => !used.includes(f.key));
        if (c.ui.adding) {
            const box = document.createElement('div');
            box.className = 'chip-box cc-filter-picker';
            const p = document.createElement('p');
            p.className = 'cc-note';
            p.textContent = 'Filter on:';
            box.appendChild(p);
            ccChipList(box, 'addfilter', available.map(f => ({ value: f.key, label: f.label })), () => false, key => {
                c.filters.push({ field: key, exclude: false, values: [] });
                c.ui.adding = false;
                ccDirty = true;
                ccRenderModal();
            });
            el.appendChild(box);
        }

        if (!c.filters.length && !c.ui.adding) {
            const p = document.createElement('p');
            p.className = 'cc-note';
            p.textContent = 'No filters: the chart uses all trades in the selected period.';
            el.appendChild(p);
        }

        if (available.length) {
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'btn-secondary btn-sm cc-add-filter';
            add.dataset.chipId = 'addfilter-btn';
            add.textContent = c.ui.adding ? 'Cancel' : '+ Add filter';
            add.addEventListener('click', () => { c.ui.adding = !c.ui.adding; ccRenderModal(); });
            el.appendChild(add);
        }
    });
}

function ccRenderPreview() {
    const c = ccState;
    document.getElementById('cc-preview-title').textContent = ccTitle(c);
    const filters = document.getElementById('cc-preview-filters');
    filters.innerHTML = '';
    ccFilterSummary(c).forEach(text => {
        const tag = document.createElement('span');
        tag.className = 'cc-filter-tag';
        tag.textContent = text;
        filters.appendChild(tag);
    });
    filters.style.display = filters.children.length ? 'flex' : 'none';
    ccRenderInto(document.getElementById('cc-preview-body'), c, appData.trades, 'cc-preview');
}

function ccViewIcon(key) {
    const common = 'width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"';
    if (key === 'number') return `<svg ${common}><rect x="3" y="5" width="22" height="18" rx="4" stroke="currentColor" stroke-width="1.6"/><path d="M9 18V10l-2 1.5M13.5 11a2 2 0 1 1 3 1.7L13.5 18h4M20 10h2.5l-1.6 3a2 2 0 1 1-1.4 3.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    if (key === 'bar') return `<svg ${common}><rect x="4" y="6" width="18" height="4" rx="2" fill="currentColor"/><rect x="4" y="12" width="13" height="4" rx="2" fill="currentColor" opacity=".7"/><rect x="4" y="18" width="8" height="4" rx="2" fill="currentColor" opacity=".45"/></svg>`;
    return `<svg ${common}><rect x="4" y="4" width="6" height="6" rx="1.5" fill="currentColor"/><rect x="11" y="4" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4"/><rect x="18" y="4" width="6" height="6" rx="1.5" fill="currentColor" opacity=".7"/><rect x="4" y="11" width="6" height="6" rx="1.5" fill="currentColor" opacity=".55"/><rect x="11" y="11" width="6" height="6" rx="1.5" fill="currentColor"/><rect x="18" y="11" width="6" height="6" rx="1.5" fill="currentColor" opacity=".3"/><rect x="4" y="18" width="6" height="6" rx="1.5" fill="currentColor" opacity=".3"/><rect x="11" y="18" width="6" height="6" rx="1.5" fill="currentColor" opacity=".7"/><rect x="18" y="18" width="6" height="6" rx="1.5" fill="currentColor"/></svg>`;
}

// After saving or deleting, redraw the page the user is on
function ccRefreshViews() {
    if (typeof viewStats !== 'undefined' && viewStats.classList.contains('active')) renderStatsDashboard();
    if (typeof viewSettings !== 'undefined' && viewSettings.classList.contains('active') && currentSettingsTab === 'chart') renderSettingsUI();
}

async function ccSave() {
    const c = ccState;
    const problem = ccProblem({ ...c, filters: c.filters });
    if (problem && !/turned off/.test(problem)) {
        showToast(problem, 'error');
        return;
    }
    const clean = ccNormalize({
        ...c,
        title: (c.title || '').trim(),
        filters: c.filters.filter(f => f.values.length)
    });

    const charts = ccGetCharts();
    const idx = charts.findIndex(x => x.id === clean.id);
    if (idx >= 0) {
        charts[idx] = clean;
    } else {
        charts.push(clean);
        const order = getChartOrder();
        if (!order.includes(ccKey(clean.id))) order.push(ccKey(clean.id));
        appData.settings.chartOrder = order;
        if (!appData.settings.chartVisibility) appData.settings.chartVisibility = {};
        appData.settings.chartVisibility[ccKey(clean.id)] = true;
    }

    ccDirty = false;
    ccClose();
    await autoSave();
    ccRefreshViews();
    showToast(idx >= 0 ? 'Chart updated' : 'Chart added to your Stats page', 'success');
}

async function ccDelete() {
    const c = ccState;
    if (!confirm(`Delete the chart "${ccTitle(c)}"?`)) return;
    const key = ccKey(c.id);
    appData.settings.customCharts = ccGetCharts().filter(x => x.id !== c.id);
    if (Array.isArray(appData.settings.chartOrder)) appData.settings.chartOrder = appData.settings.chartOrder.filter(k => k !== key);
    if (appData.settings.chartVisibility) delete appData.settings.chartVisibility[key];
    destroyChart(`cc-${key}`);
    ccDirty = false;
    ccClose();
    ccEnsureStatsCards();
    await autoSave();
    ccRefreshViews();
    showToast('Chart deleted', 'info');
}
