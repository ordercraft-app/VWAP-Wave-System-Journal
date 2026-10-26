// Review page for a shared link: vwsjournal.com/review/#<share id>
(function () {
    const API = 'https://api.vwsjournal.com';
    const NAME_KEY = 'vws-reviewer-name';
    const MAX_TEXT = 500;
    const MAX_NAME = 40;
    const DAY = 24 * 60 * 60 * 1000;
    const VERDICTS = {
        follows: 'Follows the system',
        not_follows: "Doesn't follow the system"
    };

    const main = document.getElementById('review-main');
    const countdown = document.getElementById('review-countdown');
    const shareId = (location.hash || '').replace('#', '').trim().toLowerCase();

    let share = null;
    let reviews = [];

    // ---------- helpers ----------

    function esc(v) {
        if (v === null || v === undefined) return '';
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function plural(n, w) { return `${n} ${w}${n === 1 ? '' : 's'}`; }
    function resultClass(r) { return r ? esc(r).toLowerCase().replace('/', '') : ''; }
    function getName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } }
    function setName(v) { try { localStorage.setItem(NAME_KEY, v); } catch (e) {} }

    function formatDate(dateStr) {
        const d = new Date(`${dateStr}T12:00:00`);
        if (isNaN(d)) return esc(dateStr || '');
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
    function formatTime(ms) {
        const d = new Date(ms);
        if (isNaN(d)) return '';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
            d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    function timeLeft(expiresAt) {
        const ms = expiresAt - Date.now();
        if (ms <= 0) return 'Expired';
        if (ms >= DAY) return `Open for ${plural(Math.ceil(ms / DAY), 'more day')}`;
        return `Open for ${plural(Math.max(1, Math.floor(ms / 3600000)), 'more hour')}`;
    }

    function toast(message, type) {
        const box = document.getElementById('toast-container');
        const el = document.createElement('div');
        el.className = `toast ${type || ''}`;
        el.innerHTML = `<span>${esc(message)}</span>`;
        box.appendChild(el);
        setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 300); }, 3000);
    }

    function showMessage(title, text) {
        countdown.hidden = true;
        main.innerHTML = `
            <div class="review-message">
                <h1>${esc(title)}</h1>
                <p>${esc(text)}</p>
            </div>`;
    }

    async function api(path, options) {
        let res;
        try { res = await fetch(API + path, options); }
        catch (e) { throw Object.assign(new Error('No connection. Check your internet connection and try again.'), { status: 0 }); }
        let data = null;
        try { data = await res.json(); } catch (e) {}
        if (!res.ok) throw Object.assign(new Error((data && data.error) || `Error ${res.status}`), { status: res.status });
        return data;
    }

    // ---------- rendering ----------

    function multi(items) {
        if (!items || !items.length) return '<div class="group-primary">-</div>';
        return items.map(i => {
            const subs = [i.sub1, i.sub2, i.sub].filter(Boolean).join(' - ');
            return `<div class="multi-item"><div class="group-primary">${esc(i.primary)}</div>${subs ? `<div class="group-secondary">${esc(subs)}</div>` : ''}</div>`;
        }).join('<div class="multi-divider"></div>');
    }
    function single(p, ...subs) {
        const s = subs.filter(Boolean).join(' - ');
        return `<div class="group-primary">${esc(p || '-')}</div>${s ? `<div class="group-secondary">${esc(s)}</div>` : ''}`;
    }
    function group(title, inner, full) {
        return `<div class="card-group ${full ? 'psych-group' : ''}"><span class="group-title">${title}</span><div class="group-value">${inner}</div></div>`;
    }

    function reviewsHtml(tradeId) {
        const list = reviews.filter(r => r.tradeId === tradeId);
        if (!list.length) return '<p class="review-none">No reviews yet. Be the first.</p>';
        return `<div class="review-list">${list.map(r => `
            <div class="review-item">
                <div class="review-item-head">
                    <span class="review-name">${esc(r.name)}</span>
                    <span class="verdict-tag ${r.verdict === 'follows' ? 'follows' : 'not-follows'}">${esc(VERDICTS[r.verdict] || r.verdict)}</span>
                    <span class="review-time">${esc(formatTime(r.createdAt))}</span>
                </div>
                ${r.text ? `<p class="review-text">${esc(r.text)}</p>` : ''}
            </div>`).join('')}</div>`;
    }

    function tradeHtml(t, index) {
        const count = reviews.filter(r => r.tradeId === t.id).length;
        return `
            <article class="review-trade" id="trade-${index + 1}" data-trade-id="${esc(t.id)}">
                <button type="button" class="review-shot-btn" data-zoom="${esc(t.image)}" aria-label="Enlarge screenshot">
                    <img src="${esc(t.image)}" alt="Screenshot of trade ${esc(t.number || index + 1)}" loading="${index < 2 ? 'eager' : 'lazy'}">
                </button>
                <div class="card-header">
                    <div class="card-trade-id">${esc(t.number || '-')} ${t.symbol ? `<span class="symbol-tag">${esc(t.symbol)}</span>` : ''}<span class="review-date">${formatDate(t.date)}</span></div>
                    <span class="badge ${resultClass(t.result)}">${esc(t.result || '-')}</span>
                </div>
                <div class="card-body">
                    ${group('Location', multi(t.locations))}
                    ${group('Market Condition', single(t.marketCondition))}
                    ${group('Setup', single(t.setup, t.direction))}
                    ${t.evidences ? group('Evidence', multi(t.evidences)) : ''}
                    ${t.invalidations ? group('Invalidation', multi(t.invalidations)) : ''}
                    ${t.target !== undefined ? group('Target', single(t.target, t.targetSub1, t.targetSub2)) : ''}
                    ${t.psychology && t.psychology.length ? group('Psychology', `<div class="share-pill-list">${t.psychology.map(p => `<span class="psych-pill-tag">${esc(p)}</span>`).join('')}</div>`, true) : ''}
                    ${t.notes ? group('Notes', `<div class="share-notes">${esc(t.notes)}</div>`, true) : ''}
                </div>
                <section class="review-block">
                    <h2 class="review-block-title" data-count>${plural(count, 'review')}</h2>
                    <div data-reviews>${reviewsHtml(t.id)}</div>
                    <div class="review-form" data-form>
                        <div class="review-verdicts" role="group" aria-label="Does this trade follow the VWAP Wave System?">
                            <button type="button" class="verdict-btn follows" data-verdict="follows" aria-pressed="false">${VERDICTS.follows}</button>
                            <button type="button" class="verdict-btn not-follows" data-verdict="not_follows" aria-pressed="false">${VERDICTS.not_follows}</button>
                        </div>
                        <textarea class="linear-input" maxlength="${MAX_TEXT}" placeholder="Add a comment (optional)" aria-label="Comment"></textarea>
                        <div class="review-form-foot">
                            <span class="review-chars"><span data-chars>0</span>/${MAX_TEXT}</span>
                            <button type="button" class="btn-primary review-post" disabled>Post review</button>
                        </div>
                        <p class="review-form-error" role="alert"></p>
                    </div>
                </section>
            </article>`;
    }

    function render() {
        const trades = share.trades || [];
        countdown.textContent = timeLeft(share.expiresAt);
        countdown.hidden = false;
        const sharedBy = String(share.sharedBy || '').trim().slice(0, MAX_NAME);
        if (sharedBy) document.title = `Trades from ${sharedBy} - VWAP Wave System Journal`;
        main.innerHTML = `
            <section class="review-intro">
                <h1>${sharedBy ? `${esc(sharedBy)} shared ${plural(trades.length, 'trade')} for review` : `${plural(trades.length, 'trade')} shared for review`}</h1>
                <p>Look at each trade and say whether it follows the VWAP Wave System. A short comment on why helps the trader most. Everyone with this link can see the reviews.</p>
            </section>
            <div class="review-name-row">
                <label for="reviewer-name">Your name</label>
                <input type="text" id="reviewer-name" class="linear-input" maxlength="${MAX_NAME}" placeholder="Shown with your reviews" value="${esc(getName())}" autocomplete="nickname">
            </div>
            ${trades.map(tradeHtml).join('')}`;
        bind();
    }

    function refreshTradeReviews(tradeId) {
        const card = main.querySelector(`.review-trade[data-trade-id="${CSS.escape(tradeId)}"]`);
        if (!card) return;
        const count = reviews.filter(r => r.tradeId === tradeId).length;
        card.querySelector('[data-count]').textContent = plural(count, 'review');
        card.querySelector('[data-reviews]').innerHTML = reviewsHtml(tradeId);
    }

    // ---------- interaction ----------

    function bind() {
        const nameInput = document.getElementById('reviewer-name');
        nameInput.addEventListener('input', () => setName(nameInput.value.trim()));

        main.querySelectorAll('[data-zoom]').forEach(btn => btn.addEventListener('click', () => openViewer(btn.dataset.zoom)));

        main.querySelectorAll('[data-form]').forEach(form => {
            const card = form.closest('.review-trade');
            const tradeId = card.dataset.tradeId;
            const verdictBtns = [...form.querySelectorAll('[data-verdict]')];
            const textarea = form.querySelector('textarea');
            const chars = form.querySelector('[data-chars]');
            const post = form.querySelector('.review-post');
            const error = form.querySelector('.review-form-error');
            let verdict = null;

            verdictBtns.forEach(b => b.addEventListener('click', () => {
                verdict = b.dataset.verdict;
                verdictBtns.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
                post.disabled = false;
                error.textContent = '';
            }));
            textarea.addEventListener('input', () => { chars.textContent = textarea.value.length; });

            post.addEventListener('click', async () => {
                const name = nameInput.value.trim();
                if (!name) {
                    error.textContent = 'Add your name at the top of the page first.';
                    nameInput.focus();
                    return;
                }
                if (!verdict) { error.textContent = 'Choose whether the trade follows the system.'; return; }
                post.disabled = true;
                post.textContent = 'Posting…';
                error.textContent = '';
                try {
                    const data = await api(`/shares/${shareId}/reviews`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tradeId, name, verdict, text: textarea.value.trim() })
                    });
                    setName(name);
                    reviews.push(data.review);
                    refreshTradeReviews(tradeId);
                    textarea.value = '';
                    chars.textContent = '0';
                    verdict = null;
                    verdictBtns.forEach(x => x.setAttribute('aria-pressed', 'false'));
                    toast('Review posted', 'success');
                    post.textContent = 'Post review';
                } catch (err) {
                    post.textContent = 'Post review';
                    post.disabled = false;
                    if (err.status === 410) { showMessage('This link has expired', 'The trader shared these trades for 5 days, or cancelled the share. Ask them for a new link.'); return; }
                    error.textContent = err.message || 'Posting failed. Try again.';
                }
            });
        });
    }

    const viewer = document.getElementById('review-viewer');
    const viewerImg = document.getElementById('review-viewer-img');
    function openViewer(src) {
        viewerImg.src = src;
        viewer.hidden = false;
        viewer.querySelector('.review-viewer-close').focus();
    }
    function closeViewer() { viewer.hidden = true; viewerImg.src = ''; }
    viewer.addEventListener('click', e => { if (e.target !== viewerImg) closeViewer(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !viewer.hidden) closeViewer(); });

    // New reviews from others when the page gets focus again
    async function refreshReviews() {
        if (!share) return;
        try {
            const data = await api(`/shares/${shareId}/reviews`);
            const known = new Set(reviews.map(r => r.id));
            const fresh = (data.reviews || []).filter(r => !known.has(r.id));
            if (!fresh.length) return;
            reviews = data.reviews;
            new Set(fresh.map(r => r.tradeId)).forEach(refreshTradeReviews);
        } catch (e) {
            if (e.status === 410) showMessage('This link has expired', 'The trader shared these trades for 5 days, or cancelled the share. Ask them for a new link.');
        }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshReviews(); });

    // ---------- start ----------

    async function start() {
        if (!/^[a-f0-9]{16}$/.test(shareId)) {
            showMessage('This link is incomplete', 'Copy the full link from the trader again. It ends with a code of 16 characters.');
            return;
        }
        try {
            const [shareData, reviewData] = await Promise.all([
                api(`/shares/${shareId}`),
                api(`/shares/${shareId}/reviews`)
            ]);
            share = shareData;
            reviews = reviewData.reviews || [];
            render();
        } catch (err) {
            if (err.status === 410 || err.status === 404) {
                showMessage('This link has expired', 'The trader shared these trades for 5 days, or cancelled the share. Ask them for a new link.');
            } else {
                showMessage('The shared trades could not be loaded', err.message || 'Try again in a moment.');
            }
        }
    }

    window.addEventListener('hashchange', () => location.reload());
    start();
})();
