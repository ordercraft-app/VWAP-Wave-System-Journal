// --- Rule check per setup ---
// Every setup has a short list of rules (plus rules for all setups). In Add
// Trade the trader marks each rule as followed or not in the Rules tab. The
// trade keeps a copy of the rules it was rated on (trade.ruleChecks), so later
// edits in Settings never change history. The grade (C to A+) comes from the
// number of Location confluences; nothing extra to fill in.
//
// Data:
//   settings.rules = { "_all": [{ id, phase, key, detail }], "<setup>": [...] }
//   settings.features.rules = true | false
//   trade.ruleChecks = [{ id, phase, key, detail, ok: true | false | null }]

// ---------- Release switch ----------
// false = rules are hidden for everyone and nothing is added to settings.json.
// true  = rules are visible for everyone.
const RULES_FEATURE_ENABLED = false;

// For testing while hidden: open the app once with ?rules=on (or ?rules=off).
// This browser remembers the choice; other people see nothing.
const RULES_FEATURE_KEY = 'vws-rules-feature';
const rulesFeatureOn = (() => {
    let override = null;
    try {
        const params = new URLSearchParams(window.location.search);
        const asked = (params.get('rules') || '').toLowerCase();
        if (asked === 'on' || asked === 'off') {
            localStorage.setItem(RULES_FEATURE_KEY, asked);
            params.delete('rules');
            const rest = params.toString();
            history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
        }
        override = localStorage.getItem(RULES_FEATURE_KEY);
    } catch (e) { /* storage blocked: use the default */ }
    if (override === 'on') return true;
    if (override === 'off') return false;
    return RULES_FEATURE_ENABLED;
})();

// Grade (C to A+, from the Location confluences) is separate from the rules:
// it is live for everyone. Set to false to hide it again (?rules=on still shows it).
const GRADE_FEATURE_ENABLED = true;
function rulesGradeOn() {
    return GRADE_FEATURE_ENABLED || rulesFeatureOn;
}

const RULE_PHASES = ['Context', 'Location', 'Entry', 'Risk'];
const RULES_ALL = '_all';

// Default rules: [phase, key, detail]. Key = what you scan, detail = a few words.
const DEFAULT_RULES = {
    '_all': [
        ['Context', 'Market condition', 'clear before entry'],
        ['Location', 'Planned level', 'price came to it, no chasing'],
        ['Risk', 'Stop & size', 'at invalidation, never widened']
    ],
    'Price Discovery Continuation': [
        ['Context', 'Accepted outside value', 'time or distance'],
        ['Context', 'VWAP sloping', 'in trade direction'],
        ['Location', 'Pullback', 'to the band or breakout level'],
        ['Entry', 'Strength', 'in trade direction']
    ],
    'Fade Value Area Extremes': [
        ['Context', 'Balance', 'flat VWAP, rotating in value'],
        ['Location', 'Edge of value', 'band, VAH/VAL or IB edge'],
        ['Entry', 'Rejection', 'no acceptance outside']
    ],
    'Return to Value': [
        ['Context', 'Prior acceptance', 'outside value'],
        ['Context', 'Back inside', 'broke into value'],
        ['Entry', 'Strength', 'toward VWAP or POC']
    ],
    'VWAP Bounce': [
        ['Context', 'Trend day', 'discovery, sloped VWAP'],
        ['Location', 'First pullback', 'to VWAP, IB mid or POC'],
        ['Entry', 'Strength', 'away from VWAP']
    ],
    'Madonna': [
        ['Context', 'IB complete', 'new high and low set'],
        ['Location', 'First touch', 'new IB high or low today'],
        ['Entry', 'Rejection', 'back into the IB']
    ],
    'VWAP/POC Scalps in Balance': [
        ['Context', 'Balance', 'price inside value'],
        ['Location', 'Centre', 'at VWAP or POC'],
        ['Entry', 'Confirmation', 'reclaim or rejection at the level'],
        ['Risk', 'Tight stop', 'small size']
    ],
    'Late Entry Continuation': [
        ['Context', 'Strong trend', 'no pullbacks to the bands'],
        ['Context', 'New distribution', 'building in trend direction'],
        ['Location', 'Its edge', 'of the new distribution'],
        ['Risk', 'Tight stop', 'just beyond structure']
    ],
    'Inside HTF Balance Fades': [
        ['Context', 'Inside HTF value', 'multi-day, weekly or monthly'],
        ['Location', 'HTF edge', 'weekly, monthly or composite'],
        ['Entry', 'Rejection', 'no push through'],
        ['Risk', 'Wide stop', 'reduced size']
    ],
    'IB Extension Fades': [
        ['Context', 'IB broken', 'and held'],
        ['Context', 'Flat VWAP', 'not accelerating'],
        ['Location', 'Extension', '50 % or 100 % of IB'],
        ['Entry', 'Stall', 'or rejection at the extension']
    ]
};

// ---------- Helpers ----------

function rulesIsObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Rules are on when the release switch allows it and the user hasn't disabled them
function rulesActive() {
    if (!rulesFeatureOn) return false;
    const f = appData.settings && appData.settings.features;
    return !(f && f.rules === false);
}

function rulesSlug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

let rulesIdCounter = 0;
function rulesNewId() {
    rulesIdCounter += 1;
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + rulesIdCounter;
}

// Setup names from Settings > Journal, in their order
function rulesSetupNames() {
    const cfg = appData.settings.setup;
    if (!rulesIsObject(cfg)) return [];
    const names = Object.keys(cfg).flatMap(cat => (Array.isArray(cfg[cat]) ? cfg[cat] : []))
        .map(s => String(s)).filter(s => s.trim() && s !== RULES_ALL);
    return names.filter((s, i) => names.indexOf(s) === i); // same setup in two categories: once
}

// Users without any setups still get the rules for all setups
function rulesNeedsSetup() {
    return rulesSetupNames().length > 0;
}

// Default rules for the setups this user has (names matched case-insensitive)
function rulesBuildDefaults() {
    const out = {};
    const own = rulesSetupNames();
    Object.keys(DEFAULT_RULES).forEach(name => {
        const target = name === RULES_ALL ? RULES_ALL : own.find(s => String(s).trim().toLowerCase() === name.toLowerCase());
        if (!target) return;
        out[target] = DEFAULT_RULES[name].map(([phase, key, detail]) => ({
            id: `d-${rulesSlug(name === RULES_ALL ? 'all' : name)}-${rulesSlug(key)}`, phase, key, detail
        }));
    });
    return out;
}

// Repairs a hand-edited or older rules object
function rulesEnsureShape() {
    const sets = appData.settings;
    if (!rulesIsObject(sets.rules)) sets.rules = {};
    Object.keys(sets.rules).forEach(scope => {
        const list = Array.isArray(sets.rules[scope]) ? sets.rules[scope] : [];
        sets.rules[scope] = list
            .filter(r => r && typeof r === 'object')
            .map(r => ({
                id: r.id ? String(r.id) : rulesNewId(),
                phase: RULE_PHASES.includes(r.phase) ? r.phase : RULE_PHASES[0],
                key: typeof r.key === 'string' ? r.key : String(r.key || ''),
                detail: typeof r.detail === 'string' ? r.detail : String(r.detail || '')
            }));
    });
    if (!Array.isArray(sets.rules[RULES_ALL])) sets.rules[RULES_ALL] = [];
}

// Called from migrateSettings(). Does nothing while the feature is hidden,
// so settings.json stays exactly as it was for everyone else.
function rulesMigrate() {
    if (!rulesFeatureOn) return;
    const sets = appData.settings;
    if (!sets.migrations) sets.migrations = {};
    if (!sets.migrations.defaultSetupRules) {
        if (!rulesIsObject(sets.rules)) sets.rules = rulesBuildDefaults();
        sets.migrations.defaultSetupRules = true;
    }
    if (!sets.features || typeof sets.features !== 'object') sets.features = {};
    if (typeof sets.features.rules !== 'boolean') sets.features.rules = true;
    rulesEnsureShape();
}

// The list that holds a setup's own rules (exact name first, then case-insensitive)
function rulesScopeKey(setup) {
    const rules = appData.settings.rules;
    if (!setup || setup === RULES_ALL || !rulesIsObject(rules)) return null;
    if (Array.isArray(rules[setup])) return setup;
    const lower = String(setup).trim().toLowerCase();
    return Object.keys(rules).find(k => k !== RULES_ALL && k.trim().toLowerCase() === lower) || null;
}

// Called when a list item is renamed in Settings (createPillBox). When it is a
// setup, its rules move along to the new name. Trades keep their own copy.
function rulesOnListRename(list, oldName, newName) {
    if (!rulesFeatureOn || !oldName || !newName || oldName === newName) return;
    const cfg = appData.settings.setup;
    if (!rulesIsObject(cfg) || !Object.values(cfg).includes(list)) return;
    const rules = appData.settings.rules;
    if (!rulesIsObject(rules) || !Array.isArray(rules[oldName]) || newName === RULES_ALL) return;
    // Same setup name still used in another category: leave the rules where they are
    if (rulesSetupNames().includes(oldName)) return;
    if (Array.isArray(rules[newName]) && rules[newName].length) return; // never overwrite existing rules
    rules[newName] = rules[oldName];
    delete rules[oldName];
}

// Where the rules show in Add Trade: 'tab' (Trade | Rules tabs, default) or
// 'inline' (a Rules section in the form, right under Direction).
function rulesInline() {
    return appData.settings.rulesLayout === 'inline';
}

// Rules for all setups + the setup's own rules, sorted by phase
function rulesForSetup(setup) {
    const rules = rulesIsObject(appData.settings.rules) ? appData.settings.rules : {};
    const scope = rulesScopeKey(setup);
    const all = (rules[RULES_ALL] || []).map(r => ({ ...r, all: true }));
    const own = scope ? rules[scope].map(r => ({ ...r, all: false })) : [];
    return rulesSortByPhase([...all, ...own]).filter(r => String(r.key || '').trim());
}

function rulesSortByPhase(list) {
    return RULE_PHASES.flatMap(ph => list.filter(r => r.phase === ph))
        .concat(list.filter(r => !RULE_PHASES.includes(r.phase)));
}

// ---------- Grade ----------
// 1 confluence = C, 2 = B, 3 or more = A; "+" when one of them is a
// higher-timeframe level (Weekly or Monthly VWAP, Composite profile).

const RULES_HTF_PATTERN = /\b(weekly|monthly|composite|htf)\b/i;

function rulesGrade(locations) {
    const locs = (Array.isArray(locations) ? locations : []).filter(l => l && l.primary);
    const n = locs.length;
    if (!n) return null;
    const htf = locs.some(l => [l.primary, l.sub1, l.sub2].some(v => v && RULES_HTF_PATTERN.test(String(v))));
    const base = n >= 3 ? 'A' : n === 2 ? 'B' : 'C';
    return { grade: base + (htf ? '+' : ''), base, htf, n };
}

function rulesGradeTitle(g) {
    return `${g.n} ${g.n === 1 ? 'confluence' : 'confluences'}${g.htf ? ', incl. a higher-timeframe level' : ''}`;
}

function rulesGradeBadgeHtml(g, extraClass = '') {
    if (!g) return '';
    return `<span class="rules-grade grade-${g.base.toLowerCase()} ${extraClass}" title="Grade: ${escapeHTML(rulesGradeTitle(g))}">${g.grade}</span>`;
}

// ---------- Scores ----------

function rulesTradeScore(trade) {
    const checks = trade && Array.isArray(trade.ruleChecks) ? trade.ruleChecks.filter(c => c && typeof c === 'object') : [];
    const ok = checks.filter(c => c.ok === true).length;
    const no = checks.filter(c => c.ok === false).length;
    return { total: checks.length, ok, no, rated: ok + no, broken: checks.filter(c => c.ok === false) };
}

const RULES_ICON_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
const RULES_ICON_X = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
const RULES_ICON_LOCK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>';
const RULES_ICON_PENCIL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';

// ---------- Dashboard: card badges ----------

// Grade belongs to Location (confluences), not to the rules: it shows whenever
// the feature is switched on, also when the user disabled rules in Settings.
function rulesCardBadgesHtml(trade) {
    if (!rulesGradeOn() || !trade) return '';
    const g = rulesGrade(trade.locations);
    const s = rulesTradeScore(trade);
    let html = rulesGradeBadgeHtml(g, 'is-small');
    if (rulesActive() && s.rated) {
        const tone = s.no === 0 ? 'is-ok' : 'is-broken';
        const title = s.no === 0 ? 'All rated rules followed' : `${s.no} ${s.no === 1 ? 'rule' : 'rules'} broken`;
        html += `<span class="rules-badge ${tone}" title="${title}">Rules ${s.ok}/${s.rated}</span>`;
    }
    return html;
}

// Extra card block listing the broken rules (only when there are any).
// Always the last, full-width block of the card, so it never moves the others.
function rulesCardGroupHtml(trade) {
    if (!rulesActive() || !trade) return '';
    const s = rulesTradeScore(trade);
    if (!s.no) return '';
    return `
        <div class="card-group psych-group rules-broken-group">
            <span class="group-title">${s.no === 1 ? 'Rule broken' : 'Rules broken'}</span>
            <div class="group-value">${s.broken.map(c => `<div class="rules-broken-line"><strong>${escapeHTML(c.key)}</strong>${c.detail ? ` · ${escapeHTML(c.detail)}` : ''}</div>`).join('')}</div>
        </div>`;
}

// ---------- Add Trade: Rules tab ----------

let rulesForm = { checks: {}, snapshot: [], tradeSetup: '', tab: 'trade', open: false };

// Called at the end of tfInit(): fresh state for the trade that was opened
function rulesFormInit(trade) {
    const snapshot = trade && Array.isArray(trade.ruleChecks) ? trade.ruleChecks.filter(c => c && c.id) : [];
    const checks = {};
    snapshot.forEach(c => { if (typeof c.ok === 'boolean') checks[c.id] = c.ok; });
    rulesForm = { checks, snapshot, tradeSetup: trade ? (trade.setup || '') : '', tab: 'trade', open: false };
    rulesFormSync();
}

// The rules shown for the setup picked in the form. When the setup is the one
// the trade was saved with, its stored copy wins (even for rules removed since).
function rulesFormList() {
    if (!tfState) return [];
    if (!tfState.setup) return rulesNeedsSetup() ? [] : rulesForSetup('');
    const current = rulesForSetup(tfState.setup);
    if (tfState.setup !== rulesForm.tradeSetup || !rulesForm.snapshot.length) return current;
    const snapById = {};
    rulesForm.snapshot.forEach(c => { snapById[c.id] = c; });
    const merged = current.map(r => snapById[r.id] ? { ...r, phase: snapById[r.id].phase || r.phase, key: snapById[r.id].key, detail: snapById[r.id].detail || '' } : r);
    rulesForm.snapshot.forEach(c => {
        if (!merged.some(r => r.id === c.id)) merged.push({ id: c.id, phase: c.phase, key: c.key, detail: c.detail || '', all: false, stored: true });
    });
    return rulesSortByPhase(merged).filter(r => String(r.key || '').trim());
}

// What gets saved on the trade. Without the feature the stored copy is kept as is.
function rulesGetTradeChecks(previousTrade) {
    const previous = previousTrade && Array.isArray(previousTrade.ruleChecks) ? previousTrade.ruleChecks : undefined;
    if (!rulesActive()) return previous;
    const list = rulesFormList();
    const rated = list.filter(r => typeof rulesForm.checks[r.id] === 'boolean');
    if (!rated.length) return undefined;
    return list.map(r => ({
        id: r.id, phase: r.phase, key: r.key, detail: r.detail || '',
        ok: typeof rulesForm.checks[r.id] === 'boolean' ? rulesForm.checks[r.id] : null
    }));
}

function rulesFormCounts(list) {
    const ok = list.filter(r => rulesForm.checks[r.id] === true).length;
    const no = list.filter(r => rulesForm.checks[r.id] === false).length;
    return { total: list.length, ok, no, rated: ok + no };
}

// Called after every change in the form (tfMarkDirty) and when it opens
function rulesFormSync() {
    rulesEnsureFormDom();
    if (!rulesGradeOn()) return;
    rulesUpdateGradeBadge();
    if (!rulesActive()) return;
    rulesUpdateTabBadge();
    if (rulesInline() || rulesForm.tab === 'rules') rulesRenderPanel();
}

function rulesEnsureFormDom() {
    const body = document.querySelector('#trade-modal .modal-body');
    const form = document.getElementById('trade-form');
    if (!body || !form) return;
    let tabs = document.getElementById('tf-tabs');
    let panel = document.getElementById('rules-panel');

    if (!rulesActive()) {
        if (tabs) tabs.remove();
        if (panel) panel.remove();
        form.hidden = false;
        rulesForm.tab = 'trade';
        return;
    }

    const inline = rulesInline();
    if (inline) {
        rulesForm.tab = 'trade';
        if (tabs) { tabs.remove(); tabs = null; }
    }

    if (!tabs && !inline) {
        tabs = document.createElement('div');
        tabs.id = 'tf-tabs';
        tabs.className = 'settings-tabs rules-form-tabs';
        tabs.setAttribute('role', 'tablist');
        tabs.innerHTML = `
            <button type="button" class="settings-tab-btn" role="tab" data-rules-tab="trade">Trade</button>
            <button type="button" class="settings-tab-btn" role="tab" data-rules-tab="rules">Rules<span class="rules-tab-count" id="rules-tab-count"></span></button>`;
        tabs.addEventListener('click', e => {
            const b = e.target.closest('[data-rules-tab]');
            if (b) rulesSetFormTab(b.dataset.rulesTab);
        });
        body.insertBefore(tabs, form);
    }
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'rules-panel';
        panel.className = 'rules-panel';
        panel.hidden = true;
        panel.addEventListener('click', rulesPanelClick);
    }
    // Inline: inside the form, right after Direction. Tab: after the form.
    const direction = document.getElementById('tf-sec-direction');
    if (inline && direction) {
        if (direction.nextElementSibling !== panel) direction.after(panel);
    } else if (form.nextElementSibling !== panel) {
        form.after(panel);
    }
    panel.classList.toggle('is-inline', inline);
    form.hidden = rulesForm.tab === 'rules';
    panel.hidden = !inline && rulesForm.tab !== 'rules';
    if (!tabs) return;
    tabs.querySelectorAll('[data-rules-tab]').forEach(b => {
        const on = b.dataset.rulesTab === rulesForm.tab;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
}

function rulesSetFormTab(tab) {
    rulesForm.tab = tab === 'rules' ? 'rules' : 'trade';
    rulesEnsureFormDom();
    if (rulesForm.tab === 'rules') rulesRenderPanel();
    const body = document.querySelector('#trade-modal .modal-body');
    if (body) body.scrollTop = 0;
}

function rulesUpdateTabBadge() {
    const el = document.getElementById('rules-tab-count');
    if (!el) return;
    const list = rulesFormList();
    const c = rulesFormCounts(list);
    el.className = 'rules-tab-count' + (c.rated === 0 ? '' : c.no === 0 ? ' is-ok' : ' is-broken');
    el.textContent = !tfState || (!tfState.setup && rulesNeedsSetup()) ? '–' : c.rated === 0 ? String(c.total) : `${c.ok}/${c.total}`;
}

// Grade badge in the Location header of the Trade tab
function rulesUpdateGradeBadge() {
    const head = document.querySelector('#tf-sec-location .chip-section-head');
    if (!head) return;
    let wrap = document.getElementById('tf-grade');
    if (!wrap) {
        wrap = document.createElement('span');
        wrap.id = 'tf-grade';
        wrap.className = 'rules-grade-wrap';
        head.appendChild(wrap);
    }
    const g = rulesGrade(tfState ? tfState.locations : []);
    wrap.innerHTML = g ? `<span class="rules-grade-note">Grade</span>${rulesGradeBadgeHtml(g)}` : '';
}

function rulesRenderPanel() {
    const panel = document.getElementById('rules-panel');
    if (!panel || !tfState) return;
    const st = tfState;
    if (rulesInline()) return rulesRenderInline(panel);
    const ctx = [st.direction, st.symbol, st.result].filter(Boolean).map(escapeHTML).join(' · ');

    let html = `
        <div class="rules-for">
            <div class="rules-for-text">
                <span class="rules-label">Rules for</span>
                <span class="rules-for-title">${st.setup ? escapeHTML(st.setup) : rulesNeedsSetup() ? 'No setup chosen' : 'All trades'}</span>
                ${ctx ? `<span class="rules-for-ctx">${ctx}</span>` : ''}
            </div>
            ${st.setup || rulesNeedsSetup() ? '<button type="button" class="btn-secondary btn-sm" data-rules-act="change">Change</button>' : ''}
        </div>`;

    const hasShot = imagePreviewContainer && imagePreviewContainer.style.display !== 'none' && imagePreview && imagePreview.getAttribute('src');
    if (hasShot) {
        html += `<div class="rules-shot"><img src="${escapeHTML(imagePreview.src)}" alt="Trade screenshot" title="Click to enlarge" data-rules-act="enlarge"></div>`;
    }

    if (!st.setup && rulesNeedsSetup()) {
        html += `
            <div class="rules-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                <strong>No setup chosen yet</strong>
                <span>The rules depend on the setup. Pick a setup on the Trade tab and its rules appear here, together with the rules for all setups.</span>
                <button type="button" class="btn-primary btn-sm" data-rules-act="change">Choose a setup</button>
            </div>`;
        panel.innerHTML = html;
        return;
    }

    const list = rulesFormList();
    if (!list.length) {
        html += `
            <div class="rules-empty">
                <strong>No rules for this setup yet</strong>
                <span>Add rules in Settings &gt; Rules. Rules for all setups show up here too.</span>
            </div>`;
        panel.innerHTML = html;
        return;
    }

    html += rulesListHtml(list, 'Rules');
    panel.innerHTML = html;
}

function rulesListHtml(list, label) {
    let html = '';
    const c = rulesFormCounts(list);
    const collapsed = c.ok === c.total && !rulesForm.open;
    const scoreText = c.rated === 0 ? 'Not rated' : `${c.ok}/${c.rated} followed`;
    const scoreTone = c.rated === 0 ? '' : c.no === 0 ? ' is-ok' : ' is-broken';

    html += `
        <div class="rules-head">
            <span class="rules-label">${label}</span>
            <span class="rules-head-actions">
                <span class="rules-score${scoreTone}">${scoreText}</span>
                <button type="button" class="btn-secondary btn-sm rules-all-btn" data-rules-act="all">All followed</button>
                <button type="button" class="btn-secondary btn-sm" data-rules-act="reset">Reset</button>
            </span>
        </div>
        <div class="rules-box">`;

    if (collapsed) {
        html += `
            <div class="rules-all-ok">
                <span>All ${c.total} rules followed</span>
                <button type="button" class="btn-secondary btn-sm" data-rules-act="open">Show rules</button>
            </div>`;
    } else {
        let n = 0;
        RULE_PHASES.forEach(ph => {
            const items = list.filter(r => r.phase === ph);
            if (!items.length) return;
            const pc = rulesFormCounts(items);
            html += `<div class="rules-phase"><div class="rules-phase-head"><span>${ph}</span><span class="rules-phase-score${pc.rated ? (pc.no ? ' is-broken' : ' is-ok') : ''}">${pc.rated ? `${pc.ok}/${pc.total}` : ''}</span></div>`;
            items.forEach(r => {
                n += 1;
                const v = rulesForm.checks[r.id];
                const state = v === true ? 'is-ok' : v === false ? 'is-no' : '';
                html += `
                    <div class="rule-row ${state}" data-rule-id="${escapeHTML(r.id)}">
                        <span class="rule-bar"></span>
                        <span class="rule-num">${n <= 9 ? n : ''}</span>
                        <span class="rule-text"><strong>${escapeHTML(r.key)}</strong>${r.detail ? `<span>${escapeHTML(r.detail)}</span>` : ''}</span>
                        <span class="rule-btns">
                            <button type="button" class="rule-btn rule-btn-ok" data-rules-act="ok" aria-label="Followed: ${escapeHTML(r.key)}" aria-pressed="${v === true}">${RULES_ICON_CHECK}</button>
                            <button type="button" class="rule-btn rule-btn-no" data-rules-act="no" aria-label="Not followed: ${escapeHTML(r.key)}" aria-pressed="${v === false}">${RULES_ICON_X}</button>
                        </span>
                    </div>`;
            });
            html += '</div>';
        });
    }
    html += `</div><p class="rules-tip">Tip: click All followed, then only mark the exceptions. Keys 1–9 toggle a rule. Skipped rules don't count.</p>`;
    return html;
}

// Inline layout: a Rules section in the trade form, right under Direction
function rulesRenderInline(panel) {
    const st = tfState;
    const label = `Rules${st.setup ? ` <span class="rules-label-note">· ${escapeHTML(st.setup)}</span>` : ''}`;
    if (!st.setup && rulesNeedsSetup()) {
        panel.innerHTML = `<div class="rules-head"><span class="rules-label">Rules</span></div><div class="rules-inline-note">Pick a setup above to see its rules, together with the rules for all setups.</div>`;
        return;
    }
    const list = rulesFormList();
    if (!list.length) {
        panel.innerHTML = `<div class="rules-head"><span class="rules-label">${label}</span></div><div class="rules-inline-note">No rules for this setup yet. Add them in Settings &gt; Rules.</div>`;
        return;
    }
    panel.innerHTML = rulesListHtml(list, label);
}


function rulesPanelClick(e) {
    const el = e.target.closest('[data-rules-act]');
    if (!el) return;
    const act = el.dataset.rulesAct;
    if (act === 'change') {
        rulesSetFormTab('trade');
        const sec = document.getElementById('tf-sec-setup');
        if (sec) sec.scrollIntoView({ block: 'center' });
        return;
    }
    if (act === 'enlarge') { openImageViewer(el.src); return; }
    if (act === 'open') { rulesForm.open = true; rulesRenderPanel(); return; }
    const list = rulesFormList();
    if (act === 'all') {
        list.forEach(r => { rulesForm.checks[r.id] = true; });
        rulesForm.open = false;
    } else if (act === 'reset') {
        list.forEach(r => { delete rulesForm.checks[r.id]; });
        rulesForm.open = false;
    } else if (act === 'ok' || act === 'no') {
        const row = el.closest('[data-rule-id]');
        if (!row) return;
        const id = row.dataset.ruleId;
        const val = act === 'ok';
        if (rulesForm.checks[id] === val) delete rulesForm.checks[id];
        else rulesForm.checks[id] = val;
        rulesForm.open = true; // stay open while marking
    } else {
        return;
    }
    tfMarkDirty(); // re-renders the panel through rulesFormSync()
}

// Number keys 1–9 cycle a rule: not rated → followed → not followed → not rated
document.addEventListener('keydown', e => {
    if (!rulesActive() || (!rulesInline() && rulesForm.tab !== 'rules')) return;
    const modal = document.getElementById('trade-modal');
    if (!modal || !modal.classList.contains('active')) return;

    // Alt+S with required fields missing: go back to the Trade tab so the hints are visible
    if (!rulesInline() && e.altKey && e.code === 'KeyS' && typeof tfMissing === 'function' && tfMissing().length) {
        rulesSetFormTab('trade');
        return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const a = document.activeElement;
    if (a && (['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) || a.isContentEditable)) return;
    if (!/^[1-9]$/.test(e.key)) return;
    const list = rulesFormList();
    const r = list[Number(e.key) - 1];
    if (!r) return;
    e.preventDefault();
    const v = rulesForm.checks[r.id];
    if (v === undefined) rulesForm.checks[r.id] = true;
    else if (v === true) rulesForm.checks[r.id] = false;
    else delete rulesForm.checks[r.id];
    rulesForm.open = true;
    tfMarkDirty();
}, true);

// ---------- Settings: Rules tab ----------

let rulesSettingsScope = RULES_ALL;
let rulesDraggedId = null;
let rulesSaveTimer = null;

function rulesSaveSoon(onChange) {
    clearTimeout(rulesSaveTimer);
    rulesSaveTimer = setTimeout(() => onChange(), 400);
}

function renderRulesSettings(container, onChange) {
    const sets = appData.settings;
    if (!sets.features) sets.features = {};
    if (typeof sets.features.rules !== 'boolean') sets.features.rules = true;
    rulesEnsureShape();
    const enabled = sets.features.rules;

    const banner = document.createElement('div');
    banner.className = 'info-banner';
    banner.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg><span><strong>Tip:</strong> Each rule has a short <strong>key</strong> (what you scan) and a <strong>detail</strong>. Rules are grouped by phase in Add Trade. Editing a rule never changes trades you already logged.</span>`;
    container.appendChild(banner);

    const card = document.createElement('div');
    card.className = 'setting-category-card rules-settings';
    const head = document.createElement('div');
    head.className = 'rules-settings-head';
    head.innerHTML = '<h3 class="setting-cat-title" style="margin-bottom: 0;">Rules</h3>';
    const toggle = document.createElement('button');
    toggle.className = enabled ? 'btn-secondary btn-sm' : 'btn-primary btn-sm';
    toggle.textContent = enabled ? 'Disable' : 'Enable';
    toggle.onclick = () => {
        sets.features.rules = !enabled;
        onChange();
        renderSettingsUI();
    };
    head.appendChild(toggle);
    card.appendChild(head);
    container.appendChild(card);

    if (enabled) {
        // Tab (default) or inline in the Add Trade form
        const asTab = !rulesInline();
        const row = document.createElement('div');
        row.className = 'rules-layout-row';
        row.innerHTML = `<div class="rules-layout-text"><span class="rules-layout-title">Show rules as a tab in Add Trade</span><span class="rules-layout-note">${asTab ? 'On: Add Trade has two tabs, Trade and Rules.' : 'Off: the rules show inline in the trade form, right under Direction.'}</span></div>`;
        const btn = document.createElement('button');
        btn.className = asTab ? 'btn-secondary btn-sm' : 'btn-primary btn-sm';
        btn.textContent = asTab ? 'Disable' : 'Enable';
        btn.onclick = () => {
            sets.rulesLayout = asTab ? 'inline' : 'tab';
            onChange();
            renderSettingsUI();
        };
        row.appendChild(btn);
        card.appendChild(row);
    }

    if (!enabled) {
        const p = document.createElement('p');
        p.className = 'rules-off-note';
        p.textContent = 'Rules are off. They are hidden in Add Trade and rule stats are hidden on the Stats page. Your rules are kept.';
        card.appendChild(p);
        return;
    }

    // Which list to edit: all setups or one setup
    const setups = rulesSetupNames();
    const scopes = [RULES_ALL, ...setups];
    if (!scopes.includes(rulesSettingsScope)) rulesSettingsScope = RULES_ALL;
    const scope = rulesSettingsScope;
    const scopeKey = scope === RULES_ALL ? RULES_ALL : (rulesScopeKey(scope) || scope);

    const scopeWrap = document.createElement('div');
    scopeWrap.className = 'rules-scope';
    scopeWrap.innerHTML = '<span class="rules-label">Rules for</span>';
    const chips = document.createElement('div');
    chips.className = 'chip-row';
    scopes.forEach(s => {
        const k = s === RULES_ALL ? RULES_ALL : rulesScopeKey(s);
        const count = k && Array.isArray(sets.rules[k]) ? sets.rules[k].length : 0;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip rules-scope-chip' + (s === scope ? ' is-selected' : '');
        b.setAttribute('aria-pressed', s === scope ? 'true' : 'false');
        b.innerHTML = `${escapeHTML(s === RULES_ALL ? 'All setups' : s)}<span class="rules-chip-count">${count}</span>`;
        b.onclick = () => { rulesSettingsScope = s; renderSettingsUI(); };
        chips.appendChild(b);
    });
    scopeWrap.appendChild(chips);
    const note = document.createElement('span');
    note.className = 'rules-scope-note';
    note.textContent = scope === RULES_ALL
        ? 'These rules are checked on every trade, whatever the setup.'
        : `Shown together with the rules for all setups when you pick ${scope}. Setups come from the Setup list on the Journal tab.`;
    scopeWrap.appendChild(note);
    card.appendChild(scopeWrap);

    const list = () => {
        if (!Array.isArray(sets.rules[scopeKey])) sets.rules[scopeKey] = [];
        return sets.rules[scopeKey];
    };
    const globals = scope === RULES_ALL ? [] : (sets.rules[RULES_ALL] || []);

    RULE_PHASES.forEach(ph => {
        const box = document.createElement('div');
        box.className = 'rules-set-phase';
        const bh = document.createElement('div');
        bh.className = 'rules-set-phase-head';
        bh.innerHTML = `<span>${ph}</span>`;
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'btn-secondary btn-sm';
        add.textContent = '+ Add rule';
        add.onclick = () => {
            const r = { id: rulesNewId(), phase: ph, key: '', detail: '' };
            list().push(r);
            onChange();
            renderSettingsUI();
            const input = settingsContainer.querySelector(`[data-rule-row="${CSS.escape(r.id)}"] .rules-key-input`);
            if (input) input.focus();
        };
        bh.appendChild(add);
        box.appendChild(bh);

        // Rules for all setups, read-only here (edit them under All setups)
        globals.filter(r => r.phase === ph).forEach(r => {
            const row = document.createElement('div');
            row.className = 'rules-set-row is-locked';
            row.innerHTML = `
                <span class="rules-lock" title="Defined in All setups">${RULES_ICON_LOCK}</span>
                <span class="rules-locked-field is-key">${escapeHTML(r.key)}</span>
                <span class="rules-locked-field">${escapeHTML(r.detail)}</span>
                <span class="rules-all-tag">All setups</span>
                <button type="button" class="rules-icon-btn" title="Edit in All setups" aria-label="Edit in All setups">${RULES_ICON_PENCIL}</button>`;
            row.querySelector('button').onclick = () => { rulesSettingsScope = RULES_ALL; renderSettingsUI(); };
            box.appendChild(row);
        });

        const own = list().filter(r => r.phase === ph);
        if (!own.length && !globals.some(r => r.phase === ph)) {
            const empty = document.createElement('span');
            empty.className = 'rules-set-empty';
            empty.textContent = 'No rules in this phase.';
            box.appendChild(empty);
        }

        own.forEach(r => {
            const row = document.createElement('div');
            row.className = 'rules-set-row';
            row.dataset.ruleRow = r.id;
            row.innerHTML = `
                <span class="row-drag-handle" title="Drag to reorder">${DRAG_ICON_SVG}</span>
                <input type="text" class="linear-input rules-key-input" aria-label="Rule key" placeholder="Key, e.g. Rejection" maxlength="40">
                <input type="text" class="linear-input rules-detail-input" aria-label="Rule detail" placeholder="Detail, e.g. no acceptance outside" maxlength="60">
                <select class="linear-input rules-phase-select" aria-label="Phase">${RULE_PHASES.map(p => `<option value="${p}"${p === r.phase ? ' selected' : ''}>${p}</option>`).join('')}</select>
                <button type="button" class="rules-icon-btn rules-delete" title="Delete rule" aria-label="Delete rule">&times;</button>`;
            const keyIn = row.querySelector('.rules-key-input');
            const detIn = row.querySelector('.rules-detail-input');
            keyIn.value = r.key;
            detIn.value = r.detail;
            keyIn.oninput = () => { r.key = keyIn.value; rulesSaveSoon(onChange); };
            detIn.oninput = () => { r.detail = detIn.value; rulesSaveSoon(onChange); };
            row.querySelector('.rules-phase-select').onchange = (e) => {
                r.phase = e.target.value;
                onChange();
                renderSettingsUI();
            };
            row.querySelector('.rules-delete').onclick = () => {
                const arr = list();
                arr.splice(arr.indexOf(r), 1);
                onChange();
                renderSettingsUI();
            };

            // Drag & drop within the phase (handle only)
            const handle = row.querySelector('.row-drag-handle');
            handle.onmousedown = () => { row.draggable = true; };
            handle.onmouseup = () => { row.draggable = false; };
            row.ondragstart = (e) => {
                rulesDraggedId = r.id;
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => row.classList.add('dragging-row'), 0);
            };
            row.ondragend = () => {
                rulesDraggedId = null;
                row.draggable = false;
                row.classList.remove('dragging-row');
                card.querySelectorAll('.row-drag-over').forEach(x => x.classList.remove('row-drag-over'));
            };
            row.ondragover = (e) => {
                const dragged = list().find(x => x.id === rulesDraggedId);
                if (!dragged || dragged.phase !== ph || dragged.id === r.id) return;
                e.preventDefault();
                row.classList.add('row-drag-over');
            };
            row.ondragleave = () => row.classList.remove('row-drag-over');
            row.ondrop = (e) => {
                e.preventDefault();
                row.classList.remove('row-drag-over');
                const arr = list();
                const from = arr.findIndex(x => x.id === rulesDraggedId);
                if (from < 0 || arr[from].id === r.id) return;
                const [moved] = arr.splice(from, 1);
                arr.splice(arr.indexOf(r), 0, moved);
                onChange();
                renderSettingsUI();
            };
            box.appendChild(row);
        });
        card.appendChild(box);
    });

    const foot = document.createElement('div');
    foot.className = 'rules-settings-foot';
    foot.innerHTML = '<span>Keep a key to 1–3 words and the detail to about 5. Drag to reorder.</span>';
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'btn-secondary btn-sm';
    restore.textContent = 'Restore default rules';
    restore.onclick = () => {
        if (!confirm('Replace all your rules with the default rules? Trades you already logged keep their rules.')) return;
        sets.rules = rulesBuildDefaults();
        rulesEnsureShape();
        onChange();
        renderSettingsUI();
        showToast('Default rules restored', 'success');
    };
    foot.appendChild(restore);
    card.appendChild(foot);
}

// ---------- Stats: Rules tab ----------

let rulesStatsTab = 'overview';
let rulesStatsTrades = [];

function rulesSetupStatsDom() {
    if (!rulesFeatureOn) return;
    const view = document.getElementById('view-stats');
    const filters = view && view.querySelector('.stats-filters');
    const grid = view && view.querySelector('.stats-grid');
    if (!filters || !grid || document.getElementById('stats-tabs')) return;

    const tabs = document.createElement('div');
    tabs.id = 'stats-tabs';
    tabs.className = 'settings-tabs stats-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.innerHTML = `
        <button type="button" class="settings-tab-btn active" role="tab" data-stats-tab="overview">Overview</button>
        <button type="button" class="settings-tab-btn" role="tab" data-stats-tab="rules">Rules</button>`;
    tabs.addEventListener('click', e => {
        const b = e.target.closest('[data-stats-tab]');
        if (!b || b.dataset.statsTab === rulesStatsTab) return;
        rulesStatsTab = b.dataset.statsTab;
        // Re-render everything: charts drawn while hidden need their real size
        renderStatsDashboard();
    });
    filters.before(tabs);

    const rulesView = document.createElement('div');
    rulesView.id = 'rules-stats';
    rulesView.className = 'rules-stats';
    rulesView.hidden = true;
    grid.after(rulesView);
}

// Called at the end of renderStatsDashboard() with the filtered trades
function rulesRenderStats(trades) {
    if (!rulesFeatureOn) return;
    rulesSetupStatsDom();
    const tabs = document.getElementById('stats-tabs');
    const rulesView = document.getElementById('rules-stats');
    if (!tabs || !rulesView) return;

    const active = rulesActive();
    if (!active) rulesStatsTab = 'overview';
    tabs.hidden = !active;
    const onRules = rulesStatsTab === 'rules';
    tabs.querySelectorAll('[data-stats-tab]').forEach(b => b.classList.toggle('active', b.dataset.statsTab === rulesStatsTab));
    if (active) slidePillIndicator(tabs, tabs.querySelector('.active'), 'statsTabs');

    const view = document.getElementById('view-stats');
    view.querySelector('.kpi-grid').hidden = onRules;
    view.querySelector('.stats-grid').hidden = onRules;
    const addBtn = document.getElementById('btn-stats-add-chart');
    if (addBtn) addBtn.hidden = onRules;
    rulesView.hidden = !onRules;

    rulesStatsTrades = trades || [];
    RULES_CHART_IDS.forEach(id => destroyChart(id));
    if (!onRules) { rulesView.innerHTML = ''; return; }
    rulesDrawStats(rulesView, rulesStatsTrades);
}

const RULES_CHART_IDS = ['rulesTrendChart', 'rulesFollowChart', 'rulesBrokenChart', 'rulesPhaseChart'];

function rulesSortChrono(trades) {
    return [...trades].sort((a, b) => (a.date || '').localeCompare(b.date || '') || ((parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0)));
}

function rulesPct(a, b) {
    return b > 0 ? Math.round((a / b) * 1000) / 10 : 0;
}

// ISO week number, used to group the trend line per week
function rulesIsoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return { year: t.getUTCFullYear(), week: Math.ceil(((t - yearStart) / 86400000 + 1) / 7) };
}

function rulesDrawStats(el, trades) {
    const rated = rulesSortChrono(trades.filter(t => rulesTradeScore(t).rated > 0));
    const ratedScores = rated.map(t => ({ t, s: rulesTradeScore(t) }));

    if (!rated.length) {
        el.innerHTML = `
            <div class="stat-card rules-stats-empty">
                <strong>No rated trades in this period</strong>
                <span>Mark the rules in the Rules tab when you add or edit a trade. Your discipline stats show up here.</span>
            </div>`;
        return;
    }

    // KPIs
    const okSum = ratedScores.reduce((a, x) => a + x.s.ok, 0);
    const ratedSum = ratedScores.reduce((a, x) => a + x.s.rated, 0);
    const allOk = ratedScores.filter(x => x.s.no === 0);
    let streak = 0, best = 0, run = 0;
    ratedScores.forEach(x => { run = x.s.no === 0 ? run + 1 : 0; best = Math.max(best, run); });
    streak = run;

    // Trend: per week, per day when one week is picked, per trade when one day is picked
    const fW = filterWeek ? filterWeek.value : 'all';
    const fD = filterDay ? filterDay.value : 'all';
    const per = fD !== 'all' ? 'trade' : fW !== 'all' ? 'day' : 'week';
    const buckets = [];
    const bucketOf = {};
    ratedScores.forEach((x, i) => {
        let key, label;
        if (per === 'trade') { key = String(i); label = `#${x.t.number || i + 1}`; }
        else if (per === 'day') { key = x.t.date; const d = parseLocalDate(x.t.date); label = d ? d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }) : x.t.date; }
        else { const d = parseLocalDate(x.t.date) || new Date(x.t.date); const w = rulesIsoWeek(d); key = `${w.year}-${w.week}`; label = `W${w.week}`; }
        if (!bucketOf[key]) { bucketOf[key] = { label, ok: 0, rated: 0, trades: [] }; buckets.push(bucketOf[key]); }
        bucketOf[key].ok += x.s.ok;
        bucketOf[key].rated += x.s.rated;
        bucketOf[key].trades.push(x.t);
    });

    el.innerHTML = `
        <div class="kpi-grid">
            <div class="stat-card kpi-card"><h3>Rules Followed</h3><div class="kpi-value">${rulesPct(okSum, ratedSum)}%</div><div class="kpi-sub">${okSum} of ${ratedSum} rule checks</div></div>
            <div class="stat-card kpi-card"><h3>Trades all rules followed</h3><div class="kpi-value">${allOk.length}<span class="kpi-of"> / ${rated.length}</span></div><div class="kpi-sub">${Math.round(rulesPct(allOk.length, rated.length))}% of rated trades</div></div>
            <div class="stat-card kpi-card"><h3>Clean Streak</h3><div class="kpi-value">${streak}</div><div class="kpi-sub">all rules followed in a row · best ${best}</div></div>
        </div>
        <div class="rules-stats-grid">
            <div class="stat-card chart-span-3">
                <div class="rules-card-head"><h3 class="card-title">Discipline vs Results</h3><span class="rules-card-note">per ${per}</span></div>
                ${buckets.length > 1 ? '<div class="chart-wrapper"><canvas id="rulesTrendChart"></canvas></div>' : '<div class="rules-chart-empty">Not enough data for a trend. Pick a longer period.</div>'}
            </div>
            <div class="stat-card"><h3 class="card-title">Win rate: rules followed vs broken</h3><div class="chart-wrapper"><canvas id="rulesFollowChart"></canvas></div></div>
            <div class="stat-card"><h3 class="card-title">Top 5 broken rules</h3><div class="chart-wrapper"><canvas id="rulesBrokenChart"></canvas></div></div>
            <div class="stat-card"><h3 class="card-title">Rules followed per phase</h3><div class="chart-wrapper"><canvas id="rulesPhaseChart"></canvas></div></div>
            <div class="stat-card chart-span-3"><h3 class="card-title">Setup discipline</h3><div id="rules-setup-table"></div></div>
        </div>`;

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const colors = { win: '#44BD1E', loss: '#ee354e', accent: '#386af5', grey: isLight ? '#C1C8D1' : '#2b2c30' };
    const pctTip = { callbacks: { label: c => `${c.dataset.label ? c.dataset.label + ': ' : ''}${c.parsed.y ?? c.parsed.x}%` } };
    const round = { topLeft: 12, topRight: 12, bottomLeft: 12, bottomRight: 12 };

    // 1. Trend
    if (buckets.length > 1) {
        const discipline = buckets.map(b => rulesPct(b.ok, b.rated));
        const winRate = buckets.map(b => Number(getWinRateData(b.trades).winRate));
        chartInstances.rulesTrendChart = new Chart(document.getElementById('rulesTrendChart'), {
            type: 'line',
            data: {
                labels: buckets.map(b => b.label),
                datasets: [
                    { label: 'Rules followed', data: discipline, borderColor: colors.accent, backgroundColor: 'rgba(56, 106, 245, 0.1)', fill: true, tension: 0.3, pointRadius: 0, pointHoverRadius: 4 },
                    { label: 'Win rate', data: winRate, borderColor: colors.win, backgroundColor: 'transparent', fill: false, tension: 0.3, pointRadius: 0, pointHoverRadius: 4 }
                ]
            },
            options: {
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: { y: { display: false, min: 0, max: 100 } },
                plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle' } }, tooltip: pctTip }
            }
        });
    }

    // 2. Win rate followed vs broken
    const followedTrades = allOk.map(x => x.t);
    const brokenTrades = ratedScores.filter(x => x.s.no > 0).map(x => x.t);
    chartInstances.rulesFollowChart = new Chart(document.getElementById('rulesFollowChart'), {
        type: 'bar',
        data: {
            labels: [`All followed · ${followedTrades.length}`, `Rule broken · ${brokenTrades.length}`],
            datasets: [{ label: 'Win rate', data: [Number(getWinRateData(followedTrades).winRate), Number(getWinRateData(brokenTrades).winRate)], backgroundColor: [colors.win, colors.loss], borderRadius: round, borderSkipped: false, maxBarThickness: 56 }]
        },
        options: { maintainAspectRatio: false, scales: { y: { display: false, min: 0, max: 100 } }, plugins: { legend: { display: false }, tooltip: pctTip } }
    });

    // 3. Top 5 broken rules (by key, so "Rejection" in two setups counts together)
    const brokenCount = {};
    ratedScores.forEach(x => x.s.broken.forEach(c => { const k = String(c.key || '').trim() || 'Unnamed rule'; brokenCount[k] = (brokenCount[k] || 0) + 1; }));
    const topBroken = Object.entries(brokenCount).sort((a, b) => b[1] - a[1]).slice(0, TOP_CHART_SLOTS);
    const padded = padChartSlots(topBroken.map(x => x[0]), topBroken.map(x => x[1]));
    chartInstances.rulesBrokenChart = new Chart(document.getElementById('rulesBrokenChart'), {
        type: 'bar',
        data: { labels: padded.labels, datasets: [{ label: 'Times broken', data: padded.values, backgroundColor: colors.loss, borderRadius: round, borderSkipped: false }] },
        options: { clip: false, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { display: false, beginAtZero: true }, y: { afterFit: alignTopChartRows } }, plugins: { legend: { display: false } } }
    });

    // 4. Per phase
    const phaseVals = RULE_PHASES.map(ph => {
        let ok = 0, n = 0;
        ratedScores.forEach(x => (x.t.ruleChecks || []).forEach(c => {
            if (!c || c.phase !== ph || typeof c.ok !== 'boolean') return;
            n += 1; if (c.ok) ok += 1;
        }));
        return n ? rulesPct(ok, n) : null;
    });
    chartInstances.rulesPhaseChart = new Chart(document.getElementById('rulesPhaseChart'), {
        type: 'bar',
        data: { labels: RULE_PHASES, datasets: [{ label: 'Rules followed', data: phaseVals, backgroundColor: colors.accent, borderRadius: round, borderSkipped: false, maxBarThickness: 40 }] },
        options: { maintainAspectRatio: false, scales: { y: { display: false, min: 0, max: 100 } }, plugins: { legend: { display: false }, tooltip: pctTip } }
    });

    // 5. Setup discipline (table with bars)
    const bySetup = {};
    ratedScores.forEach(x => {
        const k = x.t.setup || 'No setup';
        if (!bySetup[k]) bySetup[k] = { ok: 0, rated: 0, trades: [] };
        bySetup[k].ok += x.s.ok; bySetup[k].rated += x.s.rated; bySetup[k].trades.push(x.t);
    });
    const setupRows = Object.entries(bySetup)
        .map(([name, v]) => ({ name, score: rulesPct(v.ok, v.rated), win: getWinRateData(v.trades).winRate, n: v.trades.length }))
        .sort((a, b) => b.n - a.n || b.score - a.score);
    document.getElementById('rules-setup-table').innerHTML = `
        <div class="rules-setup-table">
            <div class="rules-setup-row is-head"><span>Setup</span><span>Rules followed</span><span>Score</span><span>Win rate</span><span>Trades</span></div>
            ${setupRows.map(r => `
            <div class="rules-setup-row">
                <span class="rules-setup-name" title="${escapeHTML(r.name)}">${escapeHTML(r.name)}</span>
                <span class="rules-setup-bar"><span style="width: ${r.score}%"></span></span>
                <span>${Math.round(r.score)}%</span>
                <span>${Math.round(Number(r.win))}%</span>
                <span class="is-muted">${r.n}</span>
            </div>`).join('')}
        </div>`;

}

// ---------- Overview: Win Rate by Grade ----------
// Replaces "Confluence Amount vs Win Rate" on the Overview tab while the
// feature is on (same chart key, so order and visibility stay as they were).
// Grade belongs to Location, so this chart doesn't depend on the rules switch.
const RULES_GRADES = ['C', 'C+', 'B', 'B+', 'A', 'A+'];
const RULES_GRADE_MIN_TRADES = 3; // fewer trades in a grade: faded bar (small sample)

function rulesDrawGradeChart(canvasId, trades, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const card = canvas.closest('.stat-card');
    const title = card && (card.querySelector('.card-title-text') || card.querySelector('.card-title'));
    if (title && !title.querySelector('.card-drag-handle')) title.textContent = 'Win Rate by Grade';

    const byGrade = {};
    RULES_GRADES.forEach(g => { byGrade[g] = []; });
    trades.forEach(t => { const g = rulesGrade(t.locations); if (g) byGrade[g.grade].push(t); });
    const count = g => byGrade[g].length;
    const enough = g => count(g) >= RULES_GRADE_MIN_TRADES;
    const faded = color + '59'; // same colour at 35 % for small samples

    destroyChart(canvasId);
    chartInstances[canvasId] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: RULES_GRADES.map(g => [g, count(g) ? String(count(g)) : '–']),
            // Every grade with trades gets a bar; fewer than 3 trades shows faded.
            // minBarLength keeps a 0 % grade visible as a small stub.
            datasets: [{ label: 'Win Rate %', data: RULES_GRADES.map(g => count(g) ? Number(getWinRateData(byGrade[g]).winRate) : null), backgroundColor: RULES_GRADES.map(g => enough(g) ? color : faded), borderRadius: { topLeft: 12, topRight: 12, bottomLeft: 12, bottomRight: 12 }, borderSkipped: false, maxBarThickness: 40, minBarLength: 6 }]
        },
        options: {
            maintainAspectRatio: false,
            scales: { y: { display: false, beginAtZero: true, max: 100 }, x: { ticks: { callback(v) { return this.getLabelForValue(v); } } } },
            plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => `Grade ${RULES_GRADES[items[0].dataIndex]}`, label: c => { const n = count(RULES_GRADES[c.dataIndex]); return `Win rate: ${c.parsed.y}% (${n} ${n === 1 ? 'trade' : 'trades'}${n < RULES_GRADE_MIN_TRADES ? ', small sample' : ''})`; } } } }
        }
    });
}

// ---------- Start ----------

document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.toggle('rules-on', rulesFeatureOn);
    document.documentElement.classList.toggle('grade-on', rulesGradeOn());
    if (!rulesFeatureOn) return;
    rulesSetupStatsDom();
    if (!RULES_FEATURE_ENABLED) {
        let shown = false;
        try { shown = sessionStorage.getItem('vws-rules-test-notice') === '1'; sessionStorage.setItem('vws-rules-test-notice', '1'); } catch (e) {}
        if (!shown) setTimeout(() => showToast('Rules are on in this browser only (test mode). Open the app with ?rules=off to hide them again.'), 1200);
    }
});
