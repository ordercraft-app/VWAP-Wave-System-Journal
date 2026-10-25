// --- Connection gate ---
// While no journal folder is connected, the whole app is locked behind this
// popup. Three versions:
//   new         - first visit: connect a folder (settings file optional)
//   reconnect   - folder known, but Chrome needs permission again
//   unsupported - browser can't access folders (Safari, Firefox, mobile)

let gateVariant = null;

function isGateOpen() {
    const gate = document.getElementById('connect-gate');
    return !!gate && gate.classList.contains('active');
}

function gateSupported() {
    return typeof window.showDirectoryPicker === 'function';
}

function updateConnectionGate() {
    const connected = !!dirHandle && fileConnected;
    if (connected) return hideConnectionGate();
    const variant = !gateSupported() ? 'unsupported' : (dirHandle ? 'reconnect' : 'new');
    showConnectionGate(variant);
}

// Everything except the gate (and toasts) becomes unreachable: no clicks,
// no keyboard focus, hidden from screen readers.
function setAppInert(on) {
    document.querySelectorAll('body > *').forEach(el => {
        if (el.id === 'connect-gate' || el.id === 'toast-container' || el.tagName === 'SCRIPT') return;
        if (on) el.setAttribute('inert', '');
        else el.removeAttribute('inert');
    });
}

function gateIcon(name) {
    const icons = {
        folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
        lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
        monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
        refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>'
    };
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

function gateContent(variant) {
    const privacy = `
        <div class="gate-note">${gateIcon('lock')}<span>Everything stays in this folder on your own computer. No account, no cloud.</span></div>`;

    if (variant === 'unsupported') {
        return `
            <div class="gate-icon">${gateIcon('monitor')}</div>
            <h2 id="connect-gate-title">Open this page in Chrome or Edge</h2>
            <p class="gate-lead">The VWAP Wave System Journal saves your trades in a folder on your computer. That only works in Google Chrome or Microsoft Edge on a desktop or laptop, not in Safari, Firefox or on a phone.</p>
            <div class="gate-url">vwsjournal.com</div>
            ${privacy}`;
    }

    if (variant === 'reconnect') {
        const name = dirHandle && dirHandle.name ? `<strong>${escapeHTML(dirHandle.name)}</strong>` : 'your journal folder';
        return `
            <div class="gate-icon">${gateIcon('refresh')}</div>
            <h2 id="connect-gate-title">Welcome back</h2>
            <p class="gate-lead">Chrome needs your permission again to open ${name}. One click and you pick up where you left off.</p>
            <button type="button" id="btn-restore-conn" class="btn-primary gate-primary">Reconnect Folder</button>
            <button type="button" id="btn-gate-other" class="gate-link">Use a different folder</button>
            <p class="gate-error" id="gate-error" role="alert"></p>
            ${privacy}`;
    }

    return `
        <div class="gate-icon">${gateIcon('folder')}</div>
        <p class="gate-eyebrow">VWAP Wave System Journal</p>
        <h2 id="connect-gate-title">Set up your journal</h2>
        <p class="gate-lead">Pick a folder on your computer. Every trade you log is saved there, so you're ready in under a minute.</p>
        <ol class="gate-steps">
            <li>Create an empty folder, for example <strong>VWAP Journal</strong>.</li>
            <li>Click <strong>Connect Folder</strong>, select that folder and allow access.</li>
        </ol>
        <button type="button" id="btn-initial-load" class="btn-primary gate-primary">Connect Folder</button>
        <p class="gate-error" id="gate-error" role="alert"></p>
        ${privacy}
        <details class="gate-more">
            <summary>Already have a settings file?</summary>
            <p>Put your <code>settings.json</code> in the folder before you connect it, and the journal uses your own lists. Want a fresh copy of the default settings to start from?</p>
            <button type="button" id="btn-download-template" class="btn-secondary btn-sm">Download Settings File</button>
        </details>
        <details class="gate-more">
            <summary>Install as a desktop app (optional)</summary>
            <p>In Chrome, open the menu (three dots, top right), choose <strong>Cast, save and share</strong> and then <strong>Install page as app...</strong></p>
            <img src="install-guide.png" alt="Chrome menu with Install page as app" class="gate-img">
        </details>`;
}

function showConnectionGate(variant) {
    let gate = document.getElementById('connect-gate');
    if (!gate) {
        gate = document.createElement('div');
        gate.id = 'connect-gate';
        gate.className = 'gate-overlay';
        gate.setAttribute('role', 'dialog');
        gate.setAttribute('aria-modal', 'true');
        gate.setAttribute('aria-labelledby', 'connect-gate-title');
        gate.innerHTML = '<div class="gate-card" tabindex="-1"></div>';
        document.body.appendChild(gate);
        gate.addEventListener('keydown', gateTrapFocus);
    }

    if (gateVariant !== variant || !gate.classList.contains('active')) {
        gateVariant = variant;
        const card = gate.querySelector('.gate-card');
        card.innerHTML = gateContent(variant);
        bindGateButtons();
    }

    setAppInert(true);
    gate.classList.add('active');
    requestAnimationFrame(() => {
        const first = gate.querySelector('.gate-primary') || gate.querySelector('.gate-card');
        if (first && !gate.contains(document.activeElement)) first.focus();
    });
}

function hideConnectionGate() {
    const gate = document.getElementById('connect-gate');
    setAppInert(false);
    if (gate) gate.classList.remove('active');
    gateVariant = null;
}

function gateShowError(msg) {
    const el = document.getElementById('gate-error');
    if (el) el.textContent = msg;
}

async function gatePickFolder() {
    try {
        const newHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        dirHandle = newHandle;
        fileConnected = true;
        try { await saveHandleToDB(dirHandle); } catch (e) { /* only affects remembering the folder */ }
        await loadDataFromFile();
        updateConnectionGate();
    } catch (err) {
        if (err && err.name === 'AbortError') return; // user closed the folder picker
        console.error('Connecting folder failed:', err);
        gateShowError('That folder could not be opened. Please try again, or choose another folder.');
    }
}

function bindGateButtons() {
    const connect = document.getElementById('btn-initial-load');
    if (connect) connect.addEventListener('click', gatePickFolder);

    const other = document.getElementById('btn-gate-other');
    if (other) other.addEventListener('click', gatePickFolder);

    const restore = document.getElementById('btn-restore-conn');
    if (restore) restore.addEventListener('click', async () => {
        try {
            if (await verifyPermission(dirHandle, true)) {
                fileConnected = true;
                await loadDataFromFile();
                updateConnectionGate();
            } else {
                gateShowError('Access was not allowed. Click Reconnect Folder and choose Allow.');
            }
        } catch (err) {
            console.error('Reconnecting failed:', err);
            gateShowError('The folder could not be opened. Choose it again with "Use a different folder".');
        }
    });

    const download = document.getElementById('btn-download-template');
    if (download) download.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(getDefaultSettings(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'settings.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    });
}

// Keep Tab / Shift+Tab inside the popup; Escape does nothing here
function gateTrapFocus(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }
    if (e.key !== 'Tab') return;
    const gate = document.getElementById('connect-gate');
    const focusables = [...gate.querySelectorAll('button, summary, a[href], [tabindex="0"]')].filter(el => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
