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
//   settings.advancedRules = { unlocked: true, defaults: { "<setup>": [[phase, key, detail]] } }
//     (only after a valid code: the default rules for the advanced setups are not
//     in this file, they come from api.vwsjournal.com/unlock)

// ---------- Release switch ----------
// false = rules are hidden for everyone and nothing is added to settings.json.
// true  = rules are visible for everyone.
const RULES_FEATURE_ENABLED = true;

// Per-browser override for testing: open the app once with ?rules=on or ?rules=off.
// This browser remembers the choice; other people are not affected.
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
    ]
};

// The advanced setups: their default rules unlock with a code. The code is
// checked by api.vwsjournal.com, which then sends the rules. Neither the code
// nor these rules are in the app. Rules people add themselves are never locked.
const RULES_ADVANCED = ['Madonna', 'VWAP/POC Scalps in Balance', 'Late Entry Continuation', 'Inside HTF Balance Fades', 'IB Extension Fades'];
const RULES_UNLOCK_API = 'https://api.vwsjournal.com/unlock'; // share-API Worker, route POST /unlock

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
    const lists = rulesDefaultLists();
    Object.keys(lists).forEach(name => {
        const target = name === RULES_ALL ? RULES_ALL : own.find(s => String(s).trim().toLowerCase() === name.toLowerCase());
        if (!target) return;
        out[target] = lists[name].map(([phase, key, detail]) => ({
            id: `d-${rulesSlug(name === RULES_ALL ? 'all' : name)}-${rulesSlug(key)}`, phase, key, detail
        }));
    });
    return out;
}

// Built-in defaults plus, once unlocked, the advanced setup defaults
function rulesDefaultLists() {
    const out = { ...DEFAULT_RULES };
    if (rulesAdvancedUnlocked()) {
        const d = appData.settings.advancedRules.defaults;
        Object.keys(d).forEach(name => { if (Array.isArray(d[name])) out[name] = d[name]; });
    }
    return out;
}

// ---------- Advanced setup rules (unlock code) ----------

function rulesAdvancedUnlocked() {
    const a = appData.settings && appData.settings.advancedRules;
    return rulesIsObject(a) && a.unlocked === true && rulesIsObject(a.defaults);
}

function rulesIsAdvancedSetup(name) {
    const n = String(name || '').trim().toLowerCase();
    return !!n && RULES_ADVANCED.some(a => a.toLowerCase() === n);
}

// A setup whose default rules still need the code
function rulesAdvancedLocked(name) {
    return rulesIsAdvancedSetup(name) && !rulesAdvancedUnlocked();
}

// Without the code, the default rules of the advanced setups are taken out of
// settings.json (rules people added themselves have other ids and stay).
// Trades keep their own copy of the rules they were rated on.
function rulesRemoveAdvancedDefaults() {
    const rules = appData.settings.rules;
    if (!rulesIsObject(rules)) return;
    const prefixes = RULES_ADVANCED.map(n => `d-${rulesSlug(n)}-`);
    Object.keys(rules).forEach(k => {
        if (!Array.isArray(rules[k])) return;
        rules[k] = rules[k].filter(r => !(r && typeof r.id === 'string' && prefixes.some(p => r.id.startsWith(p))));
    });
}

// Only keeps what we expect from the server: known setups, [phase, key, detail]
function rulesCleanAdvancedDefaults(raw) {
    if (!rulesIsObject(raw)) return null;
    const out = {};
    Object.keys(raw).forEach(name => {
        const canon = RULES_ADVANCED.find(a => a.toLowerCase() === String(name).trim().toLowerCase());
        if (!canon || !Array.isArray(raw[name])) return;
        const list = raw[name].map(r => Array.isArray(r) ? r : (r && typeof r === 'object' ? [r.phase, r.key, r.detail] : null))
            .filter(r => r && RULE_PHASES.includes(r[0]) && typeof r[1] === 'string' && r[1].trim())
            .map(([phase, key, detail]) => [phase, key.trim().slice(0, 40), String(detail || '').trim().slice(0, 60)]);
        if (list.length) out[canon] = list;
    });
    return Object.keys(out).length ? out : null;
}

// Asks api.vwsjournal.com to check the code. Only the code is sent.
// Result: { status: 'ok', defaults } | { status: 'invalid' } | { status: 'limit' } | { status: 'network' }
async function rulesUnlockRequest(code) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 12000) : null;
    try {
        const res = await fetch(RULES_UNLOCK_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
            signal: ctrl ? ctrl.signal : undefined
        });
        if (res.status === 401 || res.status === 403) return { status: 'invalid' };
        if (res.status === 429) return { status: 'limit' };
        if (!res.ok) return { status: 'network' };
        const data = await res.json();
        const defaults = rulesCleanAdvancedDefaults(data && data.rules);
        return defaults ? { status: 'ok', defaults } : { status: 'network' };
    } catch (e) {
        return { status: 'network' };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

// Adds the advanced setup defaults to the setups this user has (once) and saves
async function rulesApplyAdvancedUnlock(defaults) {
    const sets = appData.settings;
    sets.advancedRules = { unlocked: true, defaults };
    rulesEnsureShape();
    const own = rulesSetupNames();
    Object.keys(defaults).forEach(name => {
        const target = own.find(s => s.trim().toLowerCase() === name.toLowerCase());
        if (!target) return;
        const key = rulesScopeKey(target) || target;
        const arr = Array.isArray(sets.rules[key]) ? sets.rules[key] : [];
        const add = defaults[name]
            .map(([phase, k, detail]) => ({ id: `d-${rulesSlug(name)}-${rulesSlug(k)}`, phase, key: k, detail }))
            .filter(r => !arr.some(x => x.id === r.id));
        sets.rules[key] = [...add, ...arr];
    });
    if (typeof autoSave === 'function') await autoSave();
}

// Runs the check and returns the status; on success the rules are added and saved
async function rulesTryUnlock(code) {
    const c = String(code || '').trim();
    if (!c) return 'empty';
    const r = await rulesUnlockRequest(c);
    if (r.status !== 'ok') return r.status;
    await rulesApplyAdvancedUnlock(r.defaults);
    return 'ok';
}

const RULES_UNLOCK_MSG = {
    empty: ['is-error', 'Enter your code first.'],
    invalid: ['is-error', 'That code doesn’t work. Check the spelling and try again.'],
    limit: ['is-warn', 'Too many tries. Wait an hour and try again.'],
    network: ['is-warn', 'Couldn’t check the code. Check your connection and try again.']
};
const RULES_SPINNER = '<span class="rules-spin" aria-hidden="true"></span>';

// Shared by the row in Settings and the popup: busy state, messages, result
async function rulesRunUnlock(input, button, msg, label) {
    input.classList.remove('is-error');
    msg.className = 'rules-unlock-msg';
    msg.textContent = '';
    input.disabled = true;
    button.disabled = true;
    button.innerHTML = `${RULES_SPINNER}Checking…`;
    const status = await rulesTryUnlock(input.value);
    input.disabled = false;
    button.disabled = false;
    button.textContent = label;
    if (status === 'ok') {
        showToast('Advanced setup rules unlocked', 'success');
        return true;
    }
    const [cls, text] = RULES_UNLOCK_MSG[status] || RULES_UNLOCK_MSG.network;
    msg.className = `rules-unlock-msg ${cls}`;
    msg.textContent = text;
    if (cls === 'is-error') input.classList.add('is-error');
    input.focus();
    return false;
}

// Popup from the Rules tab in Add Trade ("Enter code")
function rulesOpenUnlockDialog() {
    if (document.getElementById('app-dialog')) return;
    const previousFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.id = 'app-dialog';
    overlay.className = 'app-dialog-overlay';
    overlay.innerHTML = `
        <div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-text">
            <span class="app-dialog-icon is-neutral">${RULES_ICON_LOCK.replace('width="12" height="12"', 'width="18" height="18"')}</span>
            <div class="app-dialog-copy">
                <h2 id="app-dialog-title">Unlock advanced setup rules</h2>
                <p id="app-dialog-text">Enter your code to add the default rules for the ${RULES_ADVANCED.length} advanced setups. Rules you made yourself stay as they are.</p>
                <div class="rules-unlock-field">
                    <input type="text" class="linear-input" placeholder="Enter code" aria-label="Code" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="60">
                    <span class="rules-unlock-msg" role="status"></span>
                </div>
            </div>
            <div class="app-dialog-actions">
                <button type="button" class="btn-secondary" data-dialog="cancel">Cancel</button>
                <button type="button" class="btn-primary rules-unlock-btn" data-dialog="ok">Unlock</button>
            </div>
        </div>`;
    const input = overlay.querySelector('input');
    const ok = overlay.querySelector('[data-dialog="ok"]');
    const msg = overlay.querySelector('.rules-unlock-msg');
    let busy = false;
    const close = () => {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        if (previousFocus && typeof previousFocus.focus === 'function' && document.contains(previousFocus)) {
            try { previousFocus.focus({ preventScroll: true }); } catch (e) {}
        }
    };
    const submit = async () => {
        if (busy) return;
        busy = true;
        const done = await rulesRunUnlock(input, ok, msg, 'Unlock');
        busy = false;
        if (!done) return;
        close();
        if (typeof tfMarkDirty === 'function') rulesFormSync();
        const settingsView = document.getElementById('view-settings');
        if (settingsView && settingsView.classList.contains('active') && typeof renderSettingsUI === 'function') renderSettingsUI();
    };
    // Captures keys while open, so the app's shortcuts don't fire; typing still works
    const onKey = (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); if (!busy) close(); return; }
        if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
        if (e.key === 'Tab') {
            const items = [input, ...overlay.querySelectorAll('button')].filter(el => !el.disabled);
            const i = items.indexOf(document.activeElement);
            e.preventDefault();
            items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
            return;
        }
        if (e.altKey || e.ctrlKey || e.metaKey) { if (!['a', 'c', 'v', 'x', 'z'].includes(e.key.toLowerCase())) e.preventDefault(); }
    };
    overlay.addEventListener('mousedown', e => { if (e.target === overlay && !busy) close(); });
    overlay.querySelector('[data-dialog="cancel"]').addEventListener('click', () => { if (!busy) close(); });
    ok.addEventListener('click', submit);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    input.focus();
}

// Small card under the rules in Add Trade when the setup's defaults are locked
function rulesLockCardHtml(setup) {
    return `
        <div class="rules-lock-card">
            <span class="rules-lock-icon">${RULES_ICON_LOCK.replace('width="12" height="12"', 'width="16" height="16"')}</span>
            <span class="rules-lock-text"><strong>${escapeHTML(setup)} has default rules too</strong><span>They unlock with a code. Rules you add yourself always show here.</span></span>
            <button type="button" class="btn-secondary btn-sm" data-rules-act="unlock">Enter code</button>
        </div>`;
}

// Settings > Rules: the code row (or the "Unlocked" badge)
function rulesUnlockRowEl() {
    const row = document.createElement('div');
    row.className = 'rules-layout-row rules-unlock-row';
    if (rulesAdvancedUnlocked()) {
        row.innerHTML = `<div class="rules-layout-text"><span class="rules-layout-title">Advanced setup rules</span><span class="rules-layout-note">Unlocked. The default rules for the ${RULES_ADVANCED.length} advanced setups are in your list.</span></div><span class="rules-unlocked">${RULES_ICON_CHECK}Unlocked</span>`;
        return row;
    }
    row.innerHTML = `
        <div class="rules-layout-text"><span class="rules-layout-title">Advanced setup rules</span><span class="rules-layout-note">Have a code? It adds the default rules for the ${RULES_ADVANCED.length} advanced setups.</span><span class="rules-unlock-msg" role="status"></span></div>
        <div class="rules-unlock-form">
            <input type="text" class="linear-input rules-unlock-input" placeholder="Enter code" aria-label="Code for the advanced setup rules" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="60">
            <button type="button" class="btn-primary btn-sm rules-unlock-btn">Unlock</button>
        </div>`;
    const input = row.querySelector('input');
    const btn = row.querySelector('button');
    const msg = row.querySelector('.rules-unlock-msg');
    let busy = false;
    const submit = async () => {
        if (busy) return;
        busy = true;
        const done = await rulesRunUnlock(input, btn, msg, 'Unlock');
        busy = false;
        if (done) renderSettingsUI();
    };
    btn.onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
    return row;
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
    if (!rulesAdvancedUnlocked()) rulesRemoveAdvancedDefaults();
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
    const lock = rulesAdvancedLocked(st.setup) ? rulesLockCardHtml(st.setup) : '';
    if (!list.length) {
        html += lock || `
            <div class="rules-empty">
                <strong>No rules for this setup yet</strong>
                <span>Add rules in Settings &gt; Rules. Rules for all setups show up here too.</span>
            </div>`;
        panel.innerHTML = html;
        return;
    }

    html += rulesListHtml(list, 'Rules', lock);
    panel.innerHTML = html;
}

function rulesListHtml(list, label, extra = '') {
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
    html += `</div>${extra}<p class="rules-tip">Tip: click All followed, then only mark the exceptions. Keys 1–9 toggle a rule. Skipped rules don't count.</p>`;
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
    const lock = rulesAdvancedLocked(st.setup) ? rulesLockCardHtml(st.setup) : '';
    if (!list.length) {
        panel.innerHTML = `<div class="rules-head"><span class="rules-label">${label}</span></div>${lock || '<div class="rules-inline-note">No rules for this setup yet. Add them in Settings &gt; Rules.</div>'}`;
        return;
    }
    panel.innerHTML = rulesListHtml(list, label, lock);
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
    if (act === 'unlock') { rulesOpenUnlockDialog(); return; }
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
    if (document.getElementById('app-dialog')) return; // a confirmation popup is open
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
        // Tab (default) or inline in the Add Trade form: two small previews to pick from
        const current = rulesInline() ? 'inline' : 'tab';
        const row = document.createElement('div');
        row.className = 'rules-layout-row';
        row.innerHTML = `<div class="rules-layout-text"><span class="rules-layout-title">Rules layout in Add Trade</span><span class="rules-layout-note">Own tab: Trade and Rules tabs at the top. In the form: a Rules section below Direction.</span></div>`;
        const picks = document.createElement('div');
        picks.className = 'rules-layout-picks';
        picks.setAttribute('role', 'radiogroup');
        picks.setAttribute('aria-label', 'Rules layout in Add Trade');
        [['tab', 'Own tab'], ['inline', 'In the form']].forEach(([value, label]) => {
            const on = current === value;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'rules-layout-pick' + (on ? ' is-active' : '');
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-checked', on ? 'true' : 'false');
            const preview = value === 'tab'
                ? '<span class="rlp-tabs"><span></span><span class="rlp-accent"></span></span><span class="rlp-bar"></span><span class="rlp-bar"></span><span class="rlp-bar"></span>'
                : '<span class="rlp-bar"></span><span class="rlp-bar"></span><span class="rlp-block"></span><span class="rlp-bar"></span>';
            b.innerHTML = `<span class="rlp-thumb" aria-hidden="true">${preview}</span><span class="rlp-label">${label}</span>`;
            b.onclick = () => {
                if (on) return;
                sets.rulesLayout = value;
                onChange();
                renderSettingsUI();
            };
            picks.appendChild(b);
        });
        row.appendChild(picks);
        card.appendChild(row);
        card.appendChild(rulesUnlockRowEl());
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
        const lock = s !== RULES_ALL && rulesAdvancedLocked(s) ? `<span class="rules-chip-lock" title="Default rules unlock with a code">${RULES_ICON_LOCK}</span>` : '';
        b.innerHTML = `${escapeHTML(s === RULES_ALL ? 'All setups' : s)}${lock}<span class="rules-chip-count">${count}</span>`;
        b.onclick = () => { rulesSettingsScope = s; renderSettingsUI(); };
        chips.appendChild(b);
    });
    scopeWrap.appendChild(chips);
    const note = document.createElement('span');
    note.className = 'rules-scope-note';
    note.textContent = scope === RULES_ALL
        ? 'These rules are checked on every trade, whatever the setup.'
        : rulesAdvancedLocked(scope)
            ? `${scope} has default rules too: they unlock with a code. You can always add your own rules.`
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
    restore.onclick = async () => {
        if (!(await appConfirm({ title: 'Restore the default rules?', message: 'All your rules are replaced by the default rules. Trades you already logged keep their own rules.', confirmText: 'Restore defaults', tone: 'primary', icon: 'undo' }))) return;
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

// Charts on Stats > Rules. The 3 numbers at the top are fixed (like on Overview);
// these can be reordered (drag) and switched off in Settings > Chart > Rules.
// Saved in settings.rulesChartOrder / settings.rulesChartVisibility (only once changed).
const RULES_CHARTS = [
    { key: 'trend', label: 'Discipline vs Results', title: 'Discipline vs Results', span: 3 },
    { key: 'follow', label: 'Win Rate: Rules Followed vs Broken', title: 'Win rate: rules followed vs broken' },
    { key: 'broken', label: 'Top 5 Broken Rules', title: 'Top 5 broken rules' },
    { key: 'phase', label: 'Rules Followed per Phase', title: 'Rules followed per phase' },
    { key: 'setups', label: 'Setup Discipline', title: 'Setup discipline', span: 3 }
];

function rulesChartOrder() {
    const keys = RULES_CHARTS.map(c => c.key);
    const saved = Array.isArray(appData.settings.rulesChartOrder) ? appData.settings.rulesChartOrder : [];
    const order = saved.filter((k, i) => keys.includes(k) && saved.indexOf(k) === i);
    keys.forEach(k => { if (!order.includes(k)) order.push(k); });
    return order;
}

function rulesChartVisible(key) {
    const v = appData.settings.rulesChartVisibility;
    return !(v && v[key] === false);
}

function rulesChartCardsHtml(per, hasTrend) {
    return rulesChartOrder().map(key => {
        const c = RULES_CHARTS.find(x => x.key === key);
        if (!c || !rulesChartVisible(key)) return '';
        if (key === 'trend' && !hasTrend) return ''; // too little data for a line: hide the card
        const span = c.span === 3 ? ' chart-span-3' : '';
        const body = key === 'setups' ? '<div id="rules-setup-table"></div>'
            : `<div class="chart-wrapper"><canvas id="${{ trend: 'rulesTrendChart', follow: 'rulesFollowChart', broken: 'rulesBrokenChart', phase: 'rulesPhaseChart' }[key]}"></canvas></div>`;
        const head = key === 'trend'
            ? `<div class="rules-card-head"><h3 class="card-title">${c.title}</h3><span class="rules-card-note">per ${per}</span></div>`
            : `<h3 class="card-title">${c.title}</h3>`;
        return `<div class="stat-card${span}" data-chart-key="${key}">${head}${body}</div>`;
    }).join('');
}

// Drag & drop the chart cards, same as on Overview (charts.js); saves rulesChartOrder
let rulesDraggedCard = null;
function rulesSetupGridDrag(grid) {
    if (!grid) return;
    grid.querySelectorAll('.stat-card[data-chart-key]').forEach(card => {
        card.draggable = true;
        card.classList.add('is-orderable');
        if (typeof addCardDragHandle === 'function') addCardDragHandle(card);
    });
    grid.addEventListener('dragstart', e => {
        const card = e.target.closest && e.target.closest('.stat-card.is-orderable');
        if (!card || e.target.closest('button, a, input, select, textarea')) return;
        rulesDraggedCard = card;
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', card.dataset.chartKey); } catch (err) {}
        requestAnimationFrame(() => card.classList.add('is-dragging'));
    });
    grid.addEventListener('dragover', e => {
        if (!rulesDraggedCard) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const target = e.target.closest('.stat-card.is-orderable');
        if (!target || target === rulesDraggedCard) return;
        const r = target.getBoundingClientRect();
        const wide = r.width > grid.clientWidth * 0.7;
        const before = wide ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
        const ref = before ? target : target.nextSibling;
        if (ref !== rulesDraggedCard && rulesDraggedCard.nextSibling !== ref) grid.insertBefore(rulesDraggedCard, ref);
    });
    grid.addEventListener('drop', e => { if (rulesDraggedCard) e.preventDefault(); });
    grid.addEventListener('dragend', async () => {
        if (!rulesDraggedCard) return;
        rulesDraggedCard.classList.remove('is-dragging');
        rulesDraggedCard = null;
        const shown = [...grid.querySelectorAll('.stat-card.is-orderable')].map(c => c.dataset.chartKey);
        const old = rulesChartOrder();
        // Hidden charts keep their place relative to the others
        const next = [...shown];
        old.forEach((k, i) => { if (!next.includes(k)) next.splice(Math.min(i, next.length), 0, k); });
        if (JSON.stringify(old) !== JSON.stringify(next)) {
            appData.settings.rulesChartOrder = next;
            RULES_CHART_IDS.forEach(id => { if (chartInstances[id]) { try { chartInstances[id].resize(); } catch (err) {} } });
            await autoSave();
        }
    });
}

// ---------- Settings > Chart: Stats | Rules sub-tabs ----------

let rulesChartSettingsTab = 'stats';

// Called at the top of the Chart tab in Settings. Shows the sub-tabs while the
// rules are on. Returns true when it rendered the Rules list (Stats code is skipped).
function rulesChartSettingsTabs(container, onChange) {
    if (!rulesActive()) { rulesChartSettingsTab = 'stats'; return false; }
    const tabs = document.createElement('div');
    tabs.className = 'settings-tabs chart-sub-tabs';
    const mk = (key, label) => {
        const b = document.createElement('button');
        b.className = `settings-tab-btn ${rulesChartSettingsTab === key ? 'active' : ''}`;
        b.textContent = label;
        b.onclick = () => {
            if (rulesChartSettingsTab === key) return;
            rulesChartSettingsTab = key;
            renderSettingsUI();
            animateItems(settingsContainer.querySelectorAll(':scope > .info-banner, .chart-toggle-row'), 'enter');
        };
        tabs.appendChild(b);
        return b;
    };
    const bStats = mk('stats', 'Stats');
    const bRules = mk('rules', 'Rules');
    container.appendChild(tabs);
    slidePillIndicator(tabs, rulesChartSettingsTab === 'rules' ? bRules : bStats, 'chartSubTabs');
    if (rulesChartSettingsTab !== 'rules') return false;
    renderRulesChartSettings(container, onChange);
    return true;
}

// Same rows as the Stats list: drag handle, name, Enable / Disable
function renderRulesChartSettings(container, onChange) {
    const sets = appData.settings;
    const banner = document.createElement('div');
    banner.className = 'info-banner';
    banner.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg><span><strong>Tip:</strong> Drag a chart by its <span class="inline-drag-icon">${DRAG_ICON_SVG}</span> handle to change the order on the Stats page (Rules tab).</span>`;
    container.appendChild(banner);

    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '8px';
    let dragged = null;

    rulesChartOrder().forEach(key => {
        const c = RULES_CHARTS.find(x => x.key === key);
        const row = document.createElement('div');
        row.className = 'chart-toggle-row';
        row.ondragstart = (e) => {
            dragged = key;
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => row.classList.add('dragging-row'), 0);
        };
        row.ondragend = () => {
            dragged = null;
            row.draggable = false;
            row.classList.remove('dragging-row');
            wrap.querySelectorAll('.chart-toggle-row').forEach(r => r.classList.remove('row-drag-over'));
        };
        row.ondragover = (e) => {
            e.preventDefault();
            if (dragged && dragged !== key) row.classList.add('row-drag-over');
        };
        row.ondragleave = () => row.classList.remove('row-drag-over');
        row.ondrop = (e) => {
            e.preventDefault();
            row.classList.remove('row-drag-over');
            if (!dragged || dragged === key) return;
            const order = rulesChartOrder();
            const dropIdx = order.indexOf(key);
            order.splice(order.indexOf(dragged), 1);
            order.splice(dropIdx, 0, dragged);
            sets.rulesChartOrder = order;
            onChange();
            renderSettingsUI();
        };

        const left = document.createElement('div');
        left.className = 'chart-toggle-left';
        const handle = document.createElement('div');
        handle.innerHTML = DRAG_ICON_SVG;
        handle.className = 'row-drag-handle';
        handle.title = 'Drag to reorder chart';
        handle.onmousedown = () => { row.draggable = true; };
        handle.onmouseup = () => { row.draggable = false; };
        handle.onmouseleave = () => { if (!dragged) row.draggable = false; };
        const label = document.createElement('span');
        label.className = 'chart-toggle-label';
        label.textContent = c.label;
        left.appendChild(handle);
        left.appendChild(label);

        const on = rulesChartVisible(key);
        const btn = document.createElement('button');
        btn.className = on ? 'btn-secondary btn-sm' : 'btn-primary btn-sm';
        btn.textContent = on ? 'Disable' : 'Enable';
        btn.onclick = () => {
            if (!sets.rulesChartVisibility || typeof sets.rulesChartVisibility !== 'object') sets.rulesChartVisibility = {};
            sets.rulesChartVisibility[key] = !on;
            onChange();
            renderSettingsUI();
        };
        row.appendChild(left);
        row.appendChild(btn);
        wrap.appendChild(row);
    });
    container.appendChild(wrap);
}

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
        <div class="rules-stats-grid" id="rules-stats-grid">${rulesChartCardsHtml(per, buckets.length > 1)}</div>`;
    rulesSetupGridDrag(document.getElementById('rules-stats-grid'));

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const colors = { win: '#44BD1E', loss: '#ee354e', accent: '#386af5', grey: isLight ? '#C1C8D1' : '#2b2c30' };
    const pctTip = { callbacks: { label: c => `${c.dataset.label ? c.dataset.label + ': ' : ''}${c.parsed.y ?? c.parsed.x}%` } };
    const round = { topLeft: 12, topRight: 12, bottomLeft: 12, bottomRight: 12 };

    // 1. Trend
    if (buckets.length > 1) {
        const discipline = buckets.map(b => rulesPct(b.ok, b.rated));
        const winRate = buckets.map(b => Number(getWinRateData(b.trades).winRate));
        if (document.getElementById('rulesTrendChart')) chartInstances.rulesTrendChart = new Chart(document.getElementById('rulesTrendChart'), {
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
    if (document.getElementById('rulesFollowChart')) chartInstances.rulesFollowChart = new Chart(document.getElementById('rulesFollowChart'), {
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
    if (document.getElementById('rulesBrokenChart')) chartInstances.rulesBrokenChart = new Chart(document.getElementById('rulesBrokenChart'), {
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
    if (document.getElementById('rulesPhaseChart')) chartInstances.rulesPhaseChart = new Chart(document.getElementById('rulesPhaseChart'), {
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
    const setupTable = document.getElementById('rules-setup-table');
    if (setupTable) setupTable.innerHTML = `
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
