// --- Trade Form (chip based) ---
// Builds the add/edit trade form from appData.settings, so everything the
// user adds, removes or reorders in Settings shows up here automatically.
// The saved trade object keeps the exact same shape as before.

const TF_RESULTS = ['WIN', 'LOST', 'B/E'];
const TF_RESULT_TONES = { 'WIN': 'win', 'LOST': 'loss', 'B/E': 'be' };
const TF_COLLAPSE_AFTER = 12; // chips shown before a "+ more" chip appears
const TF_REQUIRED = ['symbol', 'marketCondition', 'result', 'setup', 'direction'];

let tfState = null;

function tfEmptyState() {
    return {
        symbol: '',
        marketCondition: '',
        result: '',
        setup: '',
        setupCategory: '',
        direction: '',
        locations: [],
        locPath: { primary: '', sub1: '' },
        evidences: [],
        invalidations: [],
        target: { primary: '', sub1: '', sub2: '' },
        psychology: [],
        carried: {},
        expanded: {}
    };
}

// ---------- Init / read-out ----------

function tfInit(trade = null) {
    tfState = tfEmptyState();

    if (trade) {
        tfState.symbol = trade.symbol || '';
        tfState.marketCondition = trade.marketCondition || '';
        tfState.result = trade.result || '';
        tfState.setup = trade.setup || '';
        // Use the stored category, unless the setup was moved to another one in Settings
        const storedCat = trade.setupCategory || '';
        const stillThere = storedCat && (tfSetupConfig()[storedCat] || []).includes(tfState.setup);
        tfState.setupCategory = stillThere ? storedCat : (tfFindSetupCategory(tfState.setup) || storedCat);
        tfState.direction = trade.direction || '';
        tfState.locations = (trade.locations || [])
            .filter(l => l && l.primary)
            .map(l => ({ primary: l.primary, sub1: l.sub1 || '', sub2: l.sub2 || '' }));
        tfState.evidences = (trade.evidences || [])
            .filter(e => e && e.primary)
            .map(e => ({ primary: e.primary, sub: e.sub || '' }));
        tfState.invalidations = (trade.invalidations || [])
            .filter(i => i && i.primary)
            .map(i => ({ primary: i.primary, sub: i.sub || '' }));
        tfState.target = {
            primary: trade.target || '',
            sub1: trade.targetSub1 || '',
            sub2: trade.targetSub2 || ''
        };
        tfState.psychology = [...(trade.psychology || [])];
        if (tfState.locations.length) {
            tfState.locPath = { primary: tfState.locations[0].primary, sub1: tfState.locations[0].sub1 };
        }
    } else {
        tfApplySmartDefaults();
    }

    tfClearAllMissing();
    tfRenderAll();
}

// Symbol and market condition rarely change within a session:
// take them over from the latest trade on the same day.
function tfApplySmartDefaults() {
    const sets = appData.settings;
    const date = document.getElementById('t-date').value;
    const sameDay = appData.trades
        .filter(t => t.date === date)
        .sort((a, b) => (parseInt(b.number, 10) || 0) - (parseInt(a.number, 10) || 0));
    const previous = sameDay[0];

    ['symbol', 'marketCondition'].forEach(field => {
        const options = sets[field] || [];
        if (previous && previous[field] && options.includes(previous[field])) {
            tfState[field] = previous[field];
            tfState.carried[field] = true;
        } else if (options.length === 1) {
            tfState[field] = options[0];
        }
    });

    // A list with a single option needs no tap
    const directions = sets.direction || [];
    if (directions.length === 1) tfState.direction = directions[0];
    const setups = tfAllSetups();
    if (setups.length === 1) {
        tfState.setup = setups[0].item;
        tfState.setupCategory = setups[0].cat;
    }
}

function tfGetData() {
    const st = tfState;
    return {
        result: st.result,
        symbol: st.symbol,
        locations: st.locations.map(l => ({ ...l })),
        marketCondition: st.marketCondition,
        setup: st.setup,
        setupCategory: st.setup ? st.setupCategory : '',
        direction: st.direction,
        evidences: st.evidences.map(e => ({ ...e })),
        invalidations: st.invalidations.map(i => ({ ...i })),
        target: st.target.primary,
        targetSub1: st.target.sub1,
        targetSub2: st.target.sub2,
        psychology: [...st.psychology]
    };
}

// Returns the list of missing required sections (empty = valid)
function tfValidate() {
    const sets = appData.settings;
    const labels = { symbol: 'Symbol', marketCondition: 'Market Condition', result: 'Result', setup: 'Setup', direction: 'Direction' };
    const missing = TF_REQUIRED.filter(field => {
        const hasOptions = field === 'result'
            || (field === 'setup' ? tfAllSetups().length > 0 : (sets[field] || []).length > 0);
        return hasOptions && !tfState[field];
    });

    tfClearAllMissing();
    missing.forEach(field => {
        const sec = document.getElementById(`tf-sec-${field}`);
        if (sec) sec.classList.add('is-missing');
    });

    if (missing.length) {
        const first = document.getElementById(`tf-sec-${missing[0]}`);
        if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return missing.map(f => labels[f]);
}

function tfClearMissing(field) {
    const sec = document.getElementById(`tf-sec-${field}`);
    if (sec) sec.classList.remove('is-missing');
}

function tfClearAllMissing() {
    document.querySelectorAll('.chip-section.is-missing').forEach(s => s.classList.remove('is-missing'));
}

// ---------- Rendering helpers ----------

function tfMarkDirty() {
    isFormDirty = true;
}

function tfChip({ id, label, selected = false, tone = '', legacy = false, hasPicks = false, extraClass = '', onClick }) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = ['chip',
        selected ? 'is-selected' : '',
        tone ? `chip-${tone}` : '',
        legacy ? 'is-legacy' : '',
        hasPicks ? 'has-picks' : '',
        extraClass].filter(Boolean).join(' ');
    b.textContent = label;
    b.dataset.chipId = id;
    b.setAttribute('aria-pressed', selected ? 'true' : 'false');
    if (legacy) b.title = 'No longer in your settings';
    b.addEventListener('click', onClick);
    return b;
}

// Re-renders one section and keeps keyboard focus on the same chip
function tfRender(containerId, buildFn) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const active = document.activeElement;
    const focusId = active && el.contains(active) ? active.dataset.chipId : null;
    el.innerHTML = '';
    buildFn(el);
    if (focusId) {
        const again = el.querySelector(`[data-chip-id="${CSS.escape(focusId)}"]`);
        if (again) again.focus();
    }
}

// Adds values that are stored on the trade but no longer exist in settings
function tfWithLegacy(options, selectedValues) {
    const list = [...(options || [])];
    const legacy = new Set();
    selectedValues.filter(Boolean).forEach(v => {
        if (!list.includes(v)) {
            list.push(v);
            legacy.add(v);
        }
    });
    return { list, legacy };
}

// A wrapping row of chips, collapsed to TF_COLLAPSE_AFTER when the list is long
function tfChipRow(container, key, options, isSelected, onPick, rerender, opts = {}) {
    const row = document.createElement('div');
    row.className = 'chip-row' + (opts.sub ? ' is-sub' : '');

    const { list, legacy } = opts.legacyValues
        ? tfWithLegacy(options, opts.legacyValues)
        : { list: [...(options || [])], legacy: new Set() };

    let visible = list;
    let hidden = 0;
    if (!tfState.expanded[key] && list.length > TF_COLLAPSE_AFTER + 2) {
        visible = list.filter((v, i) => i < TF_COLLAPSE_AFTER || isSelected(v));
        hidden = list.length - visible.length;
    }

    visible.forEach(v => {
        row.appendChild(tfChip({
            id: `${key}::${v}`,
            label: v,
            selected: isSelected(v),
            tone: opts.tone ? opts.tone(v) : '',
            legacy: legacy.has(v),
            hasPicks: opts.hasPicks ? opts.hasPicks(v) : false,
            onClick: () => onPick(v)
        }));
    });

    if (hidden > 0) {
        row.appendChild(tfChip({
            id: `${key}::__more`,
            label: `+ ${hidden} more`,
            extraClass: 'chip-more',
            onClick: () => {
                tfState.expanded[key] = true;
                rerender();
            }
        }));
    }

    container.appendChild(row);
    return row;
}

function tfEmptyHint(container, text) {
    const p = document.createElement('p');
    p.className = 'chip-empty';
    p.textContent = text;
    container.appendChild(p);
}

// ---------- Single-choice sections ----------

function tfRenderSingle(field, options, toneFn) {
    const rerender = () => tfRenderSingle(field, options, toneFn);
    tfRender(`tf-${field}`, el => {
        const opts = field === 'result' ? options : (appData.settings[field] || []);
        if (!opts.length) {
            tfEmptyHint(el, 'Add options for this in Settings.');
            return;
        }
        tfChipRow(el, field, opts,
            v => tfState[field] === v,
            v => {
                tfState[field] = tfState[field] === v ? '' : v;
                tfState.carried[field] = false;
                tfMarkDirty();
                tfClearMissing(field);
                rerender();
                tfUpdateNote(field);
            },
            rerender,
            { tone: toneFn, legacyValues: [tfState[field]] }
        );
    });
    tfUpdateNote(field);
}

function tfUpdateNote(field) {
    const note = document.getElementById(`tf-note-${field}`);
    if (!note) return;
    note.textContent = tfState.carried[field] ? 'From previous trade' : '';
}

// ---------- Setup: grouped, single choice ----------
// settings shape: { Category: [setup, setup] }; the trade stores the setup
// name (as before) plus setupCategory.

function tfSetupConfig() {
    const cfg = appData.settings.setup;
    return cfg && !Array.isArray(cfg) ? cfg : {};
}

function tfAllSetups() {
    const cfg = tfSetupConfig();
    return Object.keys(cfg).flatMap(cat => (Array.isArray(cfg[cat]) ? cfg[cat] : []).map(item => ({ cat, item })));
}

function tfFindSetupCategory(name) {
    if (!name) return '';
    const hit = tfAllSetups().find(s => s.item === name);
    return hit ? hit.cat : '';
}

function tfRenderSetup() {
    tfRender('tf-setup', el => {
        const cfg = tfSetupConfig();
        const st = tfState;
        const cats = Object.keys(cfg).filter(cat => Array.isArray(cfg[cat]) && cfg[cat].length);

        // A stored setup that is no longer in settings stays visible
        const known = st.setup && tfAllSetups().some(s => s.item === st.setup && (!st.setupCategory || s.cat === st.setupCategory));
        const legacyCat = st.setup && !known ? (st.setupCategory || 'Not in settings') : '';
        if (legacyCat && !cats.includes(legacyCat)) cats.push(legacyCat);

        if (!cats.length) {
            tfEmptyHint(el, 'Add setups in Settings.');
            return;
        }

        cats.forEach(cat => {
            const group = document.createElement('div');
            group.className = 'chip-group';
            const label = document.createElement('span');
            label.className = 'chip-group-label';
            label.textContent = cat;
            group.appendChild(label);

            const items = Array.isArray(cfg[cat]) ? cfg[cat] : [];
            const legacyValues = cat === legacyCat ? [st.setup] : [];
            tfChipRow(group, `setup::${cat}`, items,
                item => st.setup === item && (st.setupCategory === cat || (!st.setupCategory && cat === legacyCat) || (!st.setupCategory && !legacyCat)),
                item => {
                    const same = st.setup === item && st.setupCategory === cat;
                    st.setup = same ? '' : item;
                    st.setupCategory = same ? '' : cat;
                    tfMarkDirty();
                    tfClearMissing('setup');
                    tfRenderSetup();
                },
                tfRenderSetup,
                { legacyValues }
            );
            el.appendChild(group);
        });
    });
}

// ---------- Multi-choice: psychology ----------

function tfRenderPsychology() {
    tfRender('tf-psychology', el => {
        const opts = appData.settings.psychology || [];
        if (!opts.length && !tfState.psychology.length) {
            tfEmptyHint(el, 'Add psychology states in Settings.');
            return;
        }
        tfChipRow(el, 'psychology', opts,
            v => tfState.psychology.includes(v),
            v => {
                const has = tfState.psychology.includes(v);
                tfState.psychology = has ? tfState.psychology.filter(p => p !== v) : [...tfState.psychology, v];
                tfMarkDirty();
                tfRenderPsychology();
            },
            tfRenderPsychology,
            { legacyValues: tfState.psychology }
        );
    });
}

// ---------- Multi-choice grouped: evidence & invalidation ----------
// settings shape: { Category: [item, item] }, stored as [{ primary, sub }]

function tfRenderGrouped(field, settingsKey) {
    const rerender = () => tfRenderGrouped(field, settingsKey);
    tfRender(`tf-${field}`, el => {
        const config = appData.settings[settingsKey] || {};
        const picks = tfState[field];
        const isPicked = (cat, item) => picks.some(p => p.primary === cat && (p.sub || '') === item);
        const toggle = (cat, item) => {
            tfState[field] = isPicked(cat, item)
                ? picks.filter(p => !(p.primary === cat && (p.sub || '') === item))
                : [...picks, { primary: cat, sub: item }];
            tfMarkDirty();
            rerender();
        };

        // Categories from settings, plus categories only found on this trade
        const cats = Object.keys(config);
        picks.forEach(p => { if (!cats.includes(p.primary)) cats.push(p.primary); });

        if (!cats.length) {
            tfEmptyHint(el, 'Add categories for this in Settings.');
            return;
        }

        cats.forEach(cat => {
            const group = document.createElement('div');
            group.className = 'chip-group';

            const label = document.createElement('span');
            label.className = 'chip-group-label';
            label.textContent = cat;
            group.appendChild(label);

            const items = Array.isArray(config[cat]) ? config[cat] : [];
            const storedItems = picks.filter(p => p.primary === cat).map(p => p.sub || '');

            if (!items.length && !storedItems.some(Boolean)) {
                // Category without items: the category itself is the choice
                const row = document.createElement('div');
                row.className = 'chip-row';
                row.appendChild(tfChip({
                    id: `${field}::${cat}::`,
                    label: cat,
                    selected: isPicked(cat, ''),
                    legacy: !(cat in config),
                    onClick: () => toggle(cat, '')
                }));
                group.appendChild(row);
            } else {
                const row = tfChipRow(group, `${field}::${cat}`, items,
                    item => isPicked(cat, item),
                    item => toggle(cat, item),
                    rerender,
                    { legacyValues: storedItems }
                );
                if (!(cat in config)) row.querySelectorAll('.chip').forEach(c => c.classList.add('is-legacy'));
            }
            el.appendChild(group);
        });
    });
}

// ---------- Location: cascade with multiple picks (confluence) ----------
// Picking an item on the deepest available level adds a location tag.

function tfRenderLocation() {
    tfRender('tf-location', el => {
        const tree = appData.settings.location || {};
        const st = tfState;
        const sameLoc = (l, p, s1, s2) => l.primary === p && (l.sub1 || '') === s1 && (l.sub2 || '') === s2;
        const hasLoc = (p, s1, s2) => st.locations.some(l => sameLoc(l, p, s1, s2));
        const toggleLoc = (p, s1, s2) => {
            st.locations = hasLoc(p, s1, s2)
                ? st.locations.filter(l => !sameLoc(l, p, s1, s2))
                : [...st.locations, { primary: p, sub1: s1, sub2: s2 }];
            tfMarkDirty();
            tfRenderLocation();
        };

        // Chosen confluences
        const tags = document.createElement('div');
        tags.className = 'chip-tags';
        if (!st.locations.length) {
            const hint = document.createElement('span');
            hint.className = 'chip-empty';
            hint.textContent = 'No location yet. Tap through the levels below; every last-level pick adds one.';
            tags.appendChild(hint);
        }
        st.locations.forEach((l, i) => {
            const text = [l.primary, l.sub1, l.sub2].filter(Boolean).join(' › ');
            const tag = document.createElement('span');
            tag.className = 'chip-tag';
            const span = document.createElement('span');
            span.textContent = text;
            const rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'chip-tag-remove';
            rm.dataset.chipId = `loctag::${text}`;
            rm.setAttribute('aria-label', `Remove ${text}`);
            rm.innerHTML = '&times;';
            rm.addEventListener('click', () => {
                st.locations = st.locations.filter((_, j) => j !== i);
                tfMarkDirty();
                tfRenderLocation();
            });
            tag.appendChild(span);
            tag.appendChild(rm);
            tags.appendChild(tag);
        });
        el.appendChild(tags);

        const primaries = Object.keys(tree);
        if (!primaries.length) {
            tfEmptyHint(el, 'Add location categories in Settings.');
            return;
        }

        const picker = document.createElement('div');
        picker.className = 'chip-cascade';

        // Level 1
        tfChipRow(picker, 'loc-p', primaries,
            p => st.locPath.primary === p || (!(tree[p] && (tree[p].sub1 || []).length) && hasLoc(p, '', '')),
            p => {
                const sub1 = (tree[p] && tree[p].sub1) || [];
                if (!sub1.length) {
                    st.locPath = { primary: p, sub1: '' };
                    toggleLoc(p, '', '');
                } else {
                    st.locPath = { primary: st.locPath.primary === p ? '' : p, sub1: '' };
                    tfRenderLocation();
                }
            },
            tfRenderLocation,
            { hasPicks: p => st.locations.some(l => l.primary === p) }
        );

        // Level 2
        const cfg = tree[st.locPath.primary];
        const sub1 = (cfg && cfg.sub1) || [];
        const sub2 = (cfg && cfg.sub2) || [];
        if (st.locPath.primary && sub1.length) {
            const p = st.locPath.primary;
            tfChipRow(picker, `loc-s1::${p}`, sub1,
                s => sub2.length ? st.locPath.sub1 === s : hasLoc(p, s, ''),
                s => {
                    if (!sub2.length) {
                        toggleLoc(p, s, '');
                    } else {
                        st.locPath.sub1 = st.locPath.sub1 === s ? '' : s;
                        tfRenderLocation();
                    }
                },
                tfRenderLocation,
                { sub: true, hasPicks: s => sub2.length > 0 && st.locations.some(l => l.primary === p && l.sub1 === s) }
            );
        }

        // Level 3
        if (st.locPath.primary && st.locPath.sub1 && sub2.length) {
            const p = st.locPath.primary;
            const s1 = st.locPath.sub1;
            tfChipRow(picker, `loc-s2::${p}::${s1}`, sub2,
                s2 => hasLoc(p, s1, s2),
                s2 => toggleLoc(p, s1, s2),
                tfRenderLocation,
                { sub: true }
            );
        }

        el.appendChild(picker);
    });
}

// ---------- Target: cascade with a single pick ----------

function tfRenderTarget() {
    tfRender('tf-target', el => {
        const tree = appData.settings.target || {};
        const t = tfState.target;
        const primaries = Object.keys(tree);
        if (!primaries.length && !t.primary) {
            tfEmptyHint(el, 'Add target categories in Settings.');
            return;
        }

        const picker = document.createElement('div');
        picker.className = 'chip-cascade';

        tfChipRow(picker, 'tgt-p', primaries,
            p => t.primary === p,
            p => {
                tfState.target = t.primary === p ? { primary: '', sub1: '', sub2: '' } : { primary: p, sub1: '', sub2: '' };
                tfMarkDirty();
                tfRenderTarget();
            },
            tfRenderTarget,
            { legacyValues: [t.primary] }
        );

        const cfg = tree[t.primary] || {};
        const sub1 = cfg.sub1 || [];
        const sub2 = cfg.sub2 || [];

        if (t.primary && (sub1.length || t.sub1)) {
            tfChipRow(picker, `tgt-s1::${t.primary}`, sub1,
                s => t.sub1 === s,
                s => {
                    t.sub1 = t.sub1 === s ? '' : s;
                    t.sub2 = '';
                    tfMarkDirty();
                    tfRenderTarget();
                },
                tfRenderTarget,
                { sub: true, legacyValues: [t.sub1] }
            );
        }

        if (t.primary && t.sub1 && (sub2.length || t.sub2)) {
            tfChipRow(picker, `tgt-s2::${t.primary}::${t.sub1}`, sub2,
                s => t.sub2 === s,
                s => {
                    t.sub2 = t.sub2 === s ? '' : s;
                    tfMarkDirty();
                    tfRenderTarget();
                },
                tfRenderTarget,
                { sub: true, legacyValues: [t.sub2] }
            );
        }

        el.appendChild(picker);
    });
}

// ---------- All ----------

function tfRenderAll() {
    tfRenderSingle('symbol');
    tfRenderSingle('marketCondition');
    tfRenderSingle('result', TF_RESULTS, v => TF_RESULT_TONES[v] || '');
    tfRenderLocation();
    tfRenderSetup();
    tfRenderSingle('direction');
    tfRenderGrouped('evidences', 'evidence');
    tfRenderGrouped('invalidations', 'invalidation');
    tfRenderTarget();
    tfRenderPsychology();
}

// Typing in date, trade # or notes also counts as an unsaved change
document.getElementById('trade-form').addEventListener('input', tfMarkDirty);
