// --- Chart.js Settings & Stats Dashboard ---
let chartInstances = {};
Chart.defaults.color = '#888888';
Chart.defaults.font.family = 'Aspekta';
Chart.defaults.scale.grid.color = '#2D2E33';
Chart.defaults.elements.bar.borderSkipped = false;
Chart.defaults.elements.bar.borderRadius = 10;

function getWinRateData(tradesArray) {
    const wins = tradesArray.filter(t => t.result === 'WIN').length;
    const losses = tradesArray.filter(t => t.result === 'LOST').length;
    const be = tradesArray.filter(t => t.result === 'B/E').length;
    const total = wins + losses + be;
    const winRate = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : 0;
    return { wins, losses, be, total, winRate };
}

function groupByAttribute(trades, attributeKey) {
    return trades.reduce((acc, trade) => {
        const key = trade[attributeKey] || 'Unknown';
        if (!acc[key]) acc[key] = [];
        acc[key].push(trade);
        return acc;
    }, {});
}

function destroyChart(chartId) {
    if (chartInstances[chartId]) {
        chartInstances[chartId].destroy();
    }
}

let filtersInitialized = false;

function getWeekOfMonth(date) {
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    let firstDayWeekday = firstDayOfMonth.getDay(); 
    firstDayWeekday = firstDayWeekday === 0 ? 7 : firstDayWeekday; 
    const offsetDate = date.getDate() + firstDayWeekday - 1;
    return Math.ceil(offsetDate / 7);
}

function populateFilterSelect(el, options, selectedVal) {
    if(!el) return;
    el.innerHTML = '';
    options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.val;
        o.textContent = opt.text;
        if(String(opt.val) === String(selectedVal)) o.selected = true;
        el.appendChild(o);
    });
}

function updateDependentFilters() {
    if (!filterYear || !filterMonth || !filterWeek || !filterDay) return;
    const y = parseInt(filterYear.value);
    const m = filterMonth.value === 'all' ? 'all' : parseInt(filterMonth.value);
    
    let weekVal = filterWeek.value || 'all';
    let weekOptions = [{val: 'all', text: 'All Weeks'}];
    if (m !== 'all') {
        const lastDay = new Date(y, m, 0);
        const maxWeeks = getWeekOfMonth(lastDay);
        for(let i=1; i<=maxWeeks; i++) {
            weekOptions.push({val: i, text: `Week ${i}`});
        }
    }
    if(!weekOptions.find(o => String(o.val) === String(weekVal))) weekVal = 'all';
    populateFilterSelect(filterWeek, weekOptions, weekVal);
    
    let dayVal = filterDay.value || 'all';
    let dayOptions = [{val: 'all', text: 'All Days'}];
    if (filterWeek.value === 'all') {
        if (m !== 'all') {
            const daysInMonth = new Date(y, m, 0).getDate();
            for(let i=1; i<=daysInMonth; i++) {
                dayOptions.push({val: i, text: `${i}`});
            }
        }
    } else {
        dayOptions.push(
            {val: 1, text: 'Monday'}, {val: 2, text: 'Tuesday'}, {val: 3, text: 'Wednesday'},
            {val: 4, text: 'Thursday'}, {val: 5, text: 'Friday'}, {val: 6, text: 'Saturday'}, {val: 0, text: 'Sunday'}
        );
    }
    if(!dayOptions.find(o => String(o.val) === String(dayVal))) dayVal = 'all';
    populateFilterSelect(filterDay, dayOptions, dayVal);
}

function initFilters() {
    if(filtersInitialized) return;
    if (!filterYear || !filterMonth || !filterWeek || !filterDay) return;

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    
    let years = new Set(appData.trades.map(t => t.date ? parseInt(t.date.substring(0,4)) : currentYear));
    years.add(currentYear);
    years = Array.from(years).sort((a,b) => b - a);
    
    populateFilterSelect(filterYear, years.map(y => ({val: y, text: y})), currentYear);
    
    const months = [
        {val: 'all', text: 'All Months'}, {val: 1, text: 'January'}, {val: 2, text: 'February'}, {val: 3, text: 'March'},
        {val: 4, text: 'April'}, {val: 5, text: 'May'}, {val: 6, text: 'June'}, {val: 7, text: 'July'}, 
        {val: 8, text: 'August'}, {val: 9, text: 'September'}, {val: 10, text: 'October'}, {val: 11, text: 'November'}, {val: 12, text: 'December'}
    ];
    populateFilterSelect(filterMonth, months, currentMonth);
    
    updateDependentFilters();
    
    filterYear.addEventListener('change', () => { updateDependentFilters(); renderStatsDashboard(); });
    filterMonth.addEventListener('change', () => { filterWeek.value = 'all'; updateDependentFilters(); renderStatsDashboard(); });
    filterWeek.addEventListener('change', () => { filterDay.value = 'all'; updateDependentFilters(); renderStatsDashboard(); });
    filterDay.addEventListener('change', () => { renderStatsDashboard(); });
    
    filtersInitialized = true;
}

function renderStatsDashboard() {
    initFilters();

    const fY = filterYear.value;
    const fM = filterMonth.value;
    const fW = filterWeek.value;
    const fD = filterDay.value;

    const trades = appData.trades.filter(t => {
        if(!t.date) return false;
        const d = new Date(t.date);
        const tY = d.getFullYear();
        const tM = d.getMonth() + 1;
        const tD = d.getDate();
        const tW = getWeekOfMonth(d);
        const tDayOfWeek = d.getDay();
        
        if (String(tY) !== fY) return false;
        if (fM !== 'all' && String(tM) !== fM) return false;
        if (fW !== 'all' && String(tW) !== fW) return false;
        
        if (fD !== 'all') {
            if (fW === 'all') {
                if (String(tD) !== fD) return false;
            } else {
                if (String(tDayOfWeek) !== fD) return false;
            }
        }
        return true;
    });

    const colors = { win: '#51dc26', loss: '#ee354e', be: '#2b2c30', accent: '#386af5' };

    Chart.defaults.scale.grid.display = false;
    Chart.defaults.scale.grid.drawBorder = false;

    // KPI's
    const overallStats = getWinRateData(trades);
    document.getElementById('kpi-total').innerText = overallStats.total;
    document.getElementById('kpi-winrate').innerText = `${overallStats.winRate}%`;
    document.getElementById('kpi-ratio').innerText = overallStats.losses > 0 ? (overallStats.wins / overallStats.losses).toFixed(2) : overallStats.wins;

    if (!appData.settings.chartVisibility) appData.settings.chartVisibility = {};

    function handleChartRender(chartId, visibilityKey, drawFunction) {
        let isVisible = appData.settings.chartVisibility[visibilityKey] !== false;
        
        if (visibilityKey === 'psychology' && !appData.settings.features?.psychology) isVisible = false;
        if (visibilityKey === 'invalidation' && !appData.settings.features?.invalidation) isVisible = false;

        const el = document.getElementById(chartId);
        if (el) {
            const card = el.closest('.stat-card');
            if (card) {
                card.style.display = isVisible ? 'flex' : 'none';
            }
        }

        if (isVisible) {
            drawFunction();
        } else {
            destroyChart(chartId);
        }
    }

    // 1. Growth Chart
    handleChartRender('growthChart', 'growth', () => {
        let currentScore = 0;
        let growthData = [];
        let tooltipsInfo = [];
        let sortedTrades = [...trades].sort((a, b) => {
            const dateDiff = new Date(a.date) - new Date(b.date);
            if (dateDiff !== 0) return dateDiff;
            return (a.number || 0) - (b.number || 0);
        });
        let growthLabels = ['Start'];
        growthData.push(0);
        tooltipsInfo.push({ date: '-', result: '-', setup: '-' });

        sortedTrades.forEach(t => {
            if (t.result === 'WIN') currentScore += 1;
            else if (t.result === 'LOST') currentScore -= 1;
            growthLabels.push(t.date);
            growthData.push(currentScore);
            tooltipsInfo.push({ date: t.date, result: t.result, setup: t.setup });
        });

        destroyChart('growthChart');
        chartInstances['growthChart'] = new Chart(document.getElementById('growthChart'), {
            type: 'line',
            data: {
                labels: growthLabels,
                datasets: [{
                    label: 'Growth',
                    data: growthData,
                    borderColor: colors.accent,
                    segment: { borderColor: ctx => ctx.p1.parsed.y < 0 ? colors.loss : colors.accent },
                    fill: { target: 'origin', above: 'rgba(56, 106, 245, 0.1)', below: 'rgba(238, 53, 78, 0.15)' },
                    borderWidth: 2, tension: 0.4, pointRadius: 0, pointHitRadius: 0, pointHoverRadius: 0,
                }]
            },
            options: { 
                maintainAspectRatio: false, interaction: { mode: 'index', intersect: false, },
                scales: { 
                    x: { display: false },
                    y: { display: true, border: { display: false }, ticks: { display: false }, grid: { color: (ctx) => ctx.tick.value === 0 ? 'rgba(255,255,255,0.1)' : 'transparent' } } 
                }, 
                plugins: { legend: { display: false }, tooltip: { enabled: false } } 
            }
        });
    });

    // 2. Win/Loss
    handleChartRender('winLossChart', 'winLoss', () => {
        destroyChart('winLossChart');
        chartInstances['winLossChart'] = new Chart(document.getElementById('winLossChart'), {
            type: 'doughnut',
            data: {
                labels: ['Wins', 'Losses', 'B/E'],
                datasets: [{ data: [overallStats.wins, overallStats.losses, overallStats.be], backgroundColor: [colors.win, colors.loss, colors.be], borderWidth: 0 }]
            },
            options: { maintainAspectRatio: false, cutout: '80%', layout: { padding: { top: 30, left: 30, right: 30, bottom: 10 } }, plugins: { legend: { position: 'bottom', labels: { color: '#888', usePointStyle: true, pointStyle: 'circle', padding: 36 } } } }
        });
    });

    // Bar Charts Helper
    function renderBarChart(chartId, attribute, horizontal = false, hideAxis = false, maxItems = null) {
        const grouped = groupByAttribute(trades, attribute);
        let stats = Object.keys(grouped).map(label => {
            const wData = getWinRateData(grouped[label]);
            return { label: label, winRate: parseFloat(wData.winRate), total: wData.total };
        });
        
        stats.sort((a, b) => {
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            return b.total - a.total;
        });

        if (maxItems !== null) {
            stats = stats.slice(0, maxItems);
        }

        const labels = stats.map(s => s.label);
        const winRates = stats.map(s => s.winRate);
        
        const scales = horizontal 
            ? { x: { display: !hideAxis, beginAtZero: true, max: 100 }, y: { display: true } }
            : { y: { display: !hideAxis, beginAtZero: true, max: 100 }, x: { display: true } };

        destroyChart(chartId);
        chartInstances[chartId] = new Chart(document.getElementById(chartId), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{ label: 'Win Rate %', data: winRates, backgroundColor: colors.accent, borderRadius: {topLeft: 12, topRight: 12, bottomLeft: 12, bottomRight: 12}, borderSkipped: false }]
            },
            options: { clip: false, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x', scales: scales, plugins: { legend: { display: false } } }
        });
    }

    // 3. Symbol
    handleChartRender('symbolChart', 'symbol', () => renderBarChart('symbolChart', 'symbol', false, true, 5));

    // 4. Setup
    handleChartRender('setupChart', 'setup', () => {
        const setupGroup = groupByAttribute(trades, 'setup');
        const setupStats = Object.keys(setupGroup).map(setup => {
            const stats = getWinRateData(setupGroup[setup]);
            return { setup: setup, winRate: parseFloat(stats.winRate), total: stats.total };
        });
        setupStats.sort((a, b) => {
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            return b.total - a.total;
        });
        const top5Setups = setupStats.slice(0, 5);
        destroyChart('setupChart');
        chartInstances['setupChart'] = new Chart(document.getElementById('setupChart'), {
            type: 'bar',
            data: {
                labels: top5Setups.map(s => s.setup),
                datasets: [{ label: 'Win Rate %', data: top5Setups.map(s => s.winRate), backgroundColor: colors.accent, borderRadius: {topLeft: 12, topRight: 12, bottomLeft: 12, bottomRight: 12}, borderSkipped: false }]
            },
            options: { clip: false, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { display: false, beginAtZero: true, max: 100 }, y: { display: true } }, plugins: { legend: { display: false } } }
        });
    });

    // 5. Market Condition
    handleChartRender('marketCondChart', 'marketCond', () => renderBarChart('marketCondChart', 'marketCondition', false, true));

    // 6. Directional Bias
    handleChartRender('directionChart', 'directionalBias', () => {
        const dirGroup = groupByAttribute(trades, 'direction');
        const dirLabels = ['Long', 'Short'];
        const dirWins = dirLabels.map(l => dirGroup[l] ? getWinRateData(dirGroup[l]).wins : 0);
        destroyChart('directionChart');
        chartInstances['directionChart'] = new Chart(document.getElementById('directionChart'), {
            type: 'doughnut',
            data: { labels: dirLabels, datasets: [{ data: dirWins, backgroundColor: [colors.accent, '#2b2c30'], borderWidth: 0 }] },
            options: { maintainAspectRatio: false, cutout: '80%', layout: { padding: { top: 30, left: 30, right: 30, bottom: 10 } }, plugins: { legend: { position: 'bottom', labels: { color: '#888', usePointStyle: true, pointStyle: 'circle', padding: 36 } } } }
        });
    });

    // 7. Psychology
    handleChartRender('psychologyChart', 'psychology', () => {
        const psychGroup = {};
        trades.forEach(t => { (t.psychology || []).forEach(p => { if(!psychGroup[p]) psychGroup[p] = []; psychGroup[p].push(t); }); });
        const psychStats = Object.keys(psychGroup).map(p => ({ psych: p, total: psychGroup[p].length }));
        psychStats.sort((a, b) => b.total - a.total);
        const top5Psych = psychStats.slice(0, 5);
        destroyChart('psychologyChart');
        chartInstances['psychologyChart'] = new Chart(document.getElementById('psychologyChart'), {
            type: 'bar',
            data: {
                labels: top5Psych.map(s => s.psych),
                datasets: [{ label: 'Count', data: top5Psych.map(s => s.total), backgroundColor: colors.accent, borderRadius: {topLeft: 12, topRight: 12, bottomLeft: 12, bottomRight: 12}, borderSkipped: false }]
            },
            options: { clip: false, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { display: false, beginAtZero: true }, y: { display: true } }, plugins: { legend: { display: false } } }
        });
    });

    // 8. Invalidation
    handleChartRender('invalidationChart', 'invalidation', () => {
        const lostTrades = trades.filter(t => t.result === 'LOST');
        let invCounts = {};
        lostTrades.forEach(t => { (t.invalidations || []).forEach(inv => { const invName = inv.sub ? inv.sub : (inv.primary || inv); invCounts[invName] = (invCounts[invName] || 0) + 1; }); });
        const sortedInvs = Object.entries(invCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        destroyChart('invalidationChart');
        chartInstances['invalidationChart'] = new Chart(document.getElementById('invalidationChart'), {
            type: 'bar',
            data: {
                labels: sortedInvs.map(i => i[0]),
                datasets: [{ label: 'Loss Count', data: sortedInvs.map(i => i[1]), backgroundColor: colors.loss, borderRadius: {topLeft: 12, topRight: 12, bottomLeft: 12, bottomRight: 12}, borderSkipped: false }]
            },
            options: { clip: false, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { display: false }, y: { display: true } }, plugins: { legend: { display: false } } }
        });
    });

    // 9. Day of Week
    handleChartRender('dayOfWeekChart', 'dayOfWeek', () => {
        const daysMap = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
        const dayGroups = { 'Mon':[], 'Tue':[], 'Wed':[], 'Thu':[], 'Fri':[], 'Sat':[], 'Sun':[] };
        trades.forEach(t => { const day = daysMap[new Date(t.date).getDay()]; if(dayGroups[day]) dayGroups[day].push(t); });
        const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const dayWinRates = dayLabels.map(d => dayGroups[d].length > 0 ? getWinRateData(dayGroups[d]).winRate : 0);
        destroyChart('dayOfWeekChart');
        chartInstances['dayOfWeekChart'] = new Chart(document.getElementById('dayOfWeekChart'), {
            type: 'line',
            data: { labels: dayLabels, datasets: [{ label: 'Win Rate %', data: dayWinRates, borderColor: colors.accent, tension: 0.3, fill: true, backgroundColor: 'rgba(56, 106, 245, 0.1)' }] },
            options: { maintainAspectRatio: false, scales: { y: { display: false, beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } }
        });
    });

    // 10. Confluence Rate
    handleChartRender('confluenceChart', 'confluence', () => {
        const confGroups = { '1': [], '2': [], '3': [], '4+': [] };
        trades.forEach(t => {
            if (t.result === 'WIN' || t.result === 'LOST') {
                const count = (t.locations || []).length;
                if(count === 1) confGroups['1'].push(t);
                else if(count === 2) confGroups['2'].push(t);
                else if(count === 3) confGroups['3'].push(t);
                else if(count >= 4) confGroups['4+'].push(t);
            }
        });
        destroyChart('confluenceChart');
        chartInstances['confluenceChart'] = new Chart(document.getElementById('confluenceChart'), {
            type: 'bar',
            data: {
                labels: Object.keys(confGroups),
                datasets: [{ label: 'Win Rate %', data: Object.keys(confGroups).map(k => getWinRateData(confGroups[k]).winRate), backgroundColor: colors.win, borderRadius: {topLeft: 12, topRight: 12, bottomLeft: 12, bottomRight: 12}, borderSkipped: false }]
            },
            options: { maintainAspectRatio: false, scales: { y: { display: false, beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } }
        });
    });

    // 11. Location Heatmap
    handleChartRender('locationChart', 'location', () => {
        let locStats = {};
        trades.forEach(t => {
            (t.locations || []).forEach(loc => {
                const primary = loc.primary || 'Unknown';
                if(!locStats[primary]) locStats[primary] = { win: 0, loss: 0, be: 0 };
                if(t.result === 'WIN') locStats[primary].win++;
                if(t.result === 'LOST') locStats[primary].loss++;
                if(t.result === 'B/E') locStats[primary].be++;
            });
        });
        let locArray = Object.keys(locStats).map(key => {
            const w = locStats[key].win;
            const l = locStats[key].loss;
            const be = locStats[key].be;
            const total = w + l + be;
            const winPct = total > 0 ? (w / total) * 100 : 0;
            const lossPct = total > 0 ? (l / total) * 100 : 0;
            const bePct = total > 0 ? (be / total) * 100 : 0;
            return { label: key, winPct: winPct, lossPct: lossPct, bePct: bePct, total: total };
        });
        locArray.sort((a, b) => {
            if (b.winPct !== a.winPct) return b.winPct - a.winPct;
            return b.total - a.total;
        });
        const sortedLocLabels = locArray.map(item => item.label);
        const sortedLocWins = locArray.map(item => parseFloat(item.winPct.toFixed(1)));
        const sortedLocLosses = locArray.map(item => parseFloat(item.lossPct.toFixed(1)));
        const sortedLocBE = locArray.map(item => parseFloat(item.bePct.toFixed(1)));
        
        destroyChart('locationChart');
        chartInstances['locationChart'] = new Chart(document.getElementById('locationChart'), {
            type: 'bar',
            data: {
                labels: sortedLocLabels,
                datasets: [
                    { label: 'Wins', data: sortedLocWins, backgroundColor: colors.win, borderRadius: {topLeft: 12, topRight: 12, bottomLeft: 12, bottomRight: 12}, borderSkipped: false, borderWidth: 3, borderColor: '#141517' },
                    { label: 'Losses', data: sortedLocLosses, backgroundColor: colors.loss, borderRadius: {topLeft: 12, topRight: 12, bottomLeft: 12, bottomRight: 12}, borderSkipped: false, borderWidth: 3, borderColor: '#141517' },
                    { label: 'B/E', data: sortedLocBE, backgroundColor: colors.be, borderRadius: {topLeft: 12, topRight: 12, bottomLeft: 12, bottomRight: 12}, borderSkipped: false, borderWidth: 3, borderColor: '#141517' }
                ]
            },
            options: { 
                clip: false, maintainAspectRatio: false, indexAxis: 'y', 
                scales: { x: { stacked: true, max: 100, display: false }, y: { stacked: true } },
                plugins: { 
                    legend: { position: 'bottom', labels: { color: '#888', usePointStyle: true, pointStyle: 'circle' } },
                    tooltip: { callbacks: { label: function(context) { return context.dataset.label + ': ' + context.parsed.x + '%'; } } }
                }
            }
        });
    });
}
