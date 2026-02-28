// Landing Page JS
import { fetch24hrTickers, fetchKlines, getTopByVolume } from './api.binance.js';
import { formatPrice, formatPercent, cleanSymbol, symbolIcon, $ } from './utils.js';
import { initRevealAnimations } from './ui.js';
import { log } from './config.js';

let initialized = false;
let seaTimelines = [];
let currentCanvasSymbol = 'BTCUSDT';
let currentTvSymbol = 'BTCUSDT';
let canvasRefreshInterval = null;
let canvasRefreshInFlight = false;
let tvScriptPromise = null;
let tradingViewWidget = null;

function waitForGsap() {
    return new Promise((resolve) => {
        if (window.gsap) return resolve(window.gsap);

        const check = setInterval(() => {
            if (window.gsap) {
                clearInterval(check);
                resolve(window.gsap);
            }
        }, 50);

        setTimeout(() => {
            clearInterval(check);
            resolve(null);
        }, 5000);
    });
}

async function initHeroAnimations() {
    const gsap = await waitForGsap();
    if (!gsap) {
        log('GSAP not loaded, skipping animations');
        return;
    }

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('#heroBadge', { y: 30, opacity: 0, duration: 0.6 })
        .from('#heroTitle', { y: 40, opacity: 0, duration: 0.7 }, '-=0.3')
        .from('#heroSub', { y: 30, opacity: 0, duration: 0.6 }, '-=0.35')
        .from('#heroCtas', { y: 20, opacity: 0, duration: 0.5 }, '-=0.25')
        .from('#heroRight', { x: 60, opacity: 0, duration: 0.8 }, '-=0.5')
        .from('#heroTagline', { y: 20, opacity: 0, duration: 0.5 }, '-=0.3')
        .from('#heroEmailForm', { y: 20, opacity: 0, duration: 0.5 }, '-=0.25');

    gsap.to('#heroWidget', {
        y: -8,
        duration: 2.5,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
    });

    gsap.to('#ctaCard', {
        boxShadow: '0 0 60px rgba(99, 102, 241, 0.3), 0 8px 32px rgba(0,0,0,0.5)',
        duration: 2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
    });

    log('Hero animations initialized');
}

async function initHeroWidget() {
    try {
        const tickers = await fetch24hrTickers();
        const targets = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'];
        const rows = document.querySelectorAll('#heroWidgetRows [data-widget-row]');

        targets.forEach((sym, i) => {
            const t = tickers.find((x) => x.symbol === sym);
            if (!t || !rows[i]) return;

            const priceEl = rows[i].querySelector('[data-widget-price]');
            if (priceEl) priceEl.textContent = '$' + formatPrice(t.lastPrice);
            const pct = parseFloat(t.priceChangePercent);
            const changeEl = rows[i].querySelector('[data-widget-change]');
            if (changeEl) {
                changeEl.textContent = formatPercent(pct);
                changeEl.classList.toggle('text-success', pct >= 0);
                changeEl.classList.toggle('text-danger', pct < 0);
            }
        });

        log('Hero widget data loaded');
    } catch (e) {
        log('Hero widget data failed:', e.message);
    }
}

function initHeroEmail() {
    const form = $('#heroEmailForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = $('#heroEmail').value.trim();
        if (email) {
            window.location.href = './auth/signup.html?email=' + encodeURIComponent(email);
        }
    });
}

function clearSeaRows(seaRows) {
    seaRows.querySelectorAll('[data-sea-row]').forEach((row) => row.remove());
    seaTimelines.forEach((tl) => tl.kill());
    seaTimelines = [];
}

async function initCryptoSea() {
    const gsap = await waitForGsap();

    try {
        const seaRows = $('#seaRows');
        if (!seaRows) {
            log('Crypto sea container missing');
            return;
        }

        // Ensure the section is visible if it was hidden
        const portfolioSection = $('#portfolioSection');
        if (portfolioSection) portfolioSection.classList.remove('hidden');

        clearSeaRows(seaRows);

        const fadeLeft = seaRows.querySelector('[data-sea-fade="left"]');
        const fadeRight = seaRows.querySelector('[data-sea-fade="right"]');
        if (!fadeLeft || !fadeRight) {
            log('Crypto sea fade layers missing');
            return;
        }

        const tickers = await fetch24hrTickers();
        const top = getTopByVolume(tickers, 40);
        if (!top.length) {
            log('No tickers for crypto sea');
            return;
        }

        const rowCount = 4;
        const chipsPerRow = Math.ceil(top.length / rowCount);

        for (let r = 0; r < rowCount; r++) {
            const rowEl = document.createElement('div');
            rowEl.className = 'flex gap-4 overflow-hidden relative py-2';
            rowEl.dataset.seaRow = 'true';

            const inner = document.createElement('div');
            inner.className = 'flex gap-4 will-change-transform';

            const start = r * chipsPerRow;
            const end = Math.min(start + chipsPerRow, top.length);
            const rowData = top.slice(start, end);
            const doubled = [...rowData, ...rowData];

            doubled.forEach((t) => {
                const base = cleanSymbol(t.symbol);
                const pct = parseFloat(t.priceChangePercent);
                const chip = document.createElement('div');
                chip.className = 'flex items-center gap-2 py-3 px-5 bg-bg-card border border-border rounded-cw-md whitespace-nowrap shrink-0 transition-colors duration-300 cursor-default hover:border-border-hover hover:bg-bg-card-hover';
                const changeClass = pct >= 0 ? 'text-success' : 'text-danger';
                chip.innerHTML = `
          <div class="${symbolIcon(base)} w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs-7 text-white">${base.slice(0, 2)}</div>
          <span class="text-xs-88 font-semibold text-text-primary">${base}</span>
          <span class="text-xs-82 text-text-secondary ml-2">$${formatPrice(t.lastPrice)}</span>
          <span class="text-xs-78 font-semibold ml-1 ${changeClass}">${formatPercent(pct)}</span>
        `;
                inner.appendChild(chip);
            });

            rowEl.appendChild(inner);
            seaRows.insertBefore(rowEl, fadeLeft);

            if (gsap) {
                const totalWidth = inner.scrollWidth / 2;
                const speed = 40 + (r * 8);
                const duration = totalWidth / speed;
                const direction = r % 2 === 0 ? -1 : 1;

                if (direction === 1) {
                    gsap.set(inner, { x: -totalWidth });
                }

                const tl = gsap.timeline({ repeat: -1 });
                tl.to(inner, {
                    x: direction === -1 ? -totalWidth : 0,
                    duration,
                    ease: 'none',
                });

                seaTimelines.push(tl);
                rowEl.addEventListener('mouseenter', () => tl.pause());
                rowEl.addEventListener('mouseleave', () => tl.resume());
            }
        }

        log('Crypto sea initialized with', top.length, 'tokens');
    } catch (e) {
        log('Crypto sea error:', e.message);
        // Ensure section stays visible even on error
        const portfolioSection = $('#portfolioSection');
        if (portfolioSection) portfolioSection.classList.remove('hidden');
    }
}

function destroyTradingView() {
    try {
        if (tradingViewWidget && typeof tradingViewWidget.remove === 'function') {
            tradingViewWidget.remove();
        }
    } catch (e) {
        log('TradingView destroy warning:', e.message);
    }

    tradingViewWidget = null;

    const container = $('#tvChart');
    if (container) container.innerHTML = '';
}

function loadTradingViewScript() {
    if (window.TradingView) return Promise.resolve();
    if (tvScriptPromise) return tvScriptPromise;

    tvScriptPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-tradingview-script="true"]');
        if (existing) {
            if (window.TradingView) {
                resolve();
                return;
            }

            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('TradingView script failed to load')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/tv.js';
        script.async = true;
        script.dataset.tradingviewScript = 'true';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('TradingView script failed to load'));
        document.head.appendChild(script);
    });

    return tvScriptPromise;
}

async function initTradingView(symbol = 'BTCUSDT') {
    const container = $('#tvChart');
    if (!container) return;

    currentTvSymbol = symbol;
    destroyTradingView();

    const widgetHost = document.createElement('div');
    widgetHost.id = 'tradingview_widget';
    widgetHost.className = 'w-full h-full';
    container.appendChild(widgetHost);

    const height = window.innerWidth <= 480 ? 320 : window.innerWidth <= 768 ? 420 : 520;

    try {
        await loadTradingViewScript();
        if (!window.TradingView) throw new Error('TradingView unavailable after script load');

        tradingViewWidget = new window.TradingView.widget({
            container_id: 'tradingview_widget',
            symbol: 'BINANCE:' + symbol,
            interval: '60',
            timezone: 'Etc/UTC',
            theme: 'dark',
            style: '1',
            locale: 'en',
            toolbar_bg: '#0a0e1a',
            enable_publishing: false,
            hide_top_toolbar: false,
            hide_legend: false,
            save_image: false,
            width: '100%',
            height,
            backgroundColor: '#0a0e1a',
            gridColor: 'rgba(99, 102, 241, 0.06)',
        });

        log('TradingView initialized:', symbol);
    } catch (e) {
        log('TradingView init error:', e.message);
    }
}

function initTVControls() {
    const select = $('#tvSymbolSelect');
    const search = $('#tvSymbolSearch');
    const fsBtn = $('#tvFullscreenBtn');
    const tvContainer = $('#tvContainer');

    if (select) {
        select.addEventListener('change', () => {
            initTradingView(select.value);
        });
    }

    if (search) {
        search.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;

            const sym = search.value.trim().toUpperCase();
            if (!sym) return;

            initTradingView(sym.includes('USDT') ? sym : sym + 'USDT');
        });
    }

    if (fsBtn && tvContainer) {
        fsBtn.addEventListener('click', () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                tvContainer.requestFullscreen().catch(() => { });
            }
        });
    }
}

async function initCanvasCharts(symbol = currentCanvasSymbol) {
    const priceCanvas = $('#priceCanvas');
    const volumeCanvas = $('#volumeCanvas');
    if (!priceCanvas || !volumeCanvas) return;

    currentCanvasSymbol = symbol;

    try {
        const klines = await fetchKlines(symbol, '1h', 200);
        drawPriceChart(priceCanvas, klines);
        drawVolumeChart(volumeCanvas, klines);
        log('Canvas charts rendered for', symbol);
    } catch (e) {
        log('Canvas charts error:', e.message);
        drawError(priceCanvas, 'Failed to load price data');
        drawError(volumeCanvas, 'Failed to load volume data');
    }
}

function drawPriceChart(canvas, klines) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const prices = klines.map((k) => k.close);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const padding = { top: 20, bottom: 30, left: 10, right: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(99, 102, 241, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
    }

    const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.8)');
    gradient.addColorStop(1, 'rgba(139, 92, 246, 0.8)');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    prices.forEach((p, i) => {
        const x = padding.left + (i / (prices.length - 1)) * chartW;
        const y = padding.top + chartH - ((p - min) / range) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const fillGradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
    fillGradient.addColorStop(0, 'rgba(99, 102, 241, 0.15)');
    fillGradient.addColorStop(1, 'rgba(99, 102, 241, 0.01)');

    ctx.lineTo(padding.left + chartW, h - padding.bottom);
    ctx.lineTo(padding.left, h - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = fillGradient;
    ctx.fill();

    ctx.fillStyle = '#6b7194';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const val = max - (range / 4) * i;
        const y = padding.top + (chartH / 4) * i;
        ctx.fillText('$' + formatPrice(val), w - padding.right - 4, y - 4);
    }
}

function drawVolumeChart(canvas, klines) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const volumes = klines.map((k) => k.volume);
    const maxVol = Math.max(...volumes);
    const padding = { top: 20, bottom: 30, left: 10, right: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const barW = Math.max(1, (chartW / volumes.length) - 1);

    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, w, h);

    volumes.forEach((v, i) => {
        const barH = (v / maxVol) * chartH;
        const x = padding.left + (i / volumes.length) * chartW;
        const y = padding.top + chartH - barH;

        const isUp = klines[i].close >= klines[i].open;
        ctx.fillStyle = isUp ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)';
        ctx.fillRect(x, y, barW, barH);
    });
}

function drawError(canvas, msg) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#6b7194';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(msg, rect.width / 2, rect.height / 2);
}

function startCanvasAutoRefresh() {
    stopCanvasAutoRefresh();

    canvasRefreshInterval = setInterval(async () => {
        if (document.hidden || canvasRefreshInFlight) return;

        canvasRefreshInFlight = true;
        try {
            await initCanvasCharts(currentCanvasSymbol);
        } finally {
            canvasRefreshInFlight = false;
        }
    }, 5000);
}

function stopCanvasAutoRefresh() {
    if (!canvasRefreshInterval) return;
    clearInterval(canvasRefreshInterval);
    canvasRefreshInterval = null;
}

function initChartControls() {
    const select = $('#chartSymbolSelect');
    if (!select) return;

    select.addEventListener('change', () => {
        initCanvasCharts(select.value);
    });
}

function cleanup() {
    stopCanvasAutoRefresh();
    destroyTradingView();

    seaTimelines.forEach((tl) => tl.kill());
    seaTimelines = [];
}

async function init() {
    if (initialized) return;
    initialized = true;

    log('Landing page initializing...');

    initHeroEmail();
    initHeroAnimations();
    initRevealAnimations();

    initHeroWidget();
    initCryptoSea();

    await initTradingView(currentTvSymbol);
    initTVControls();

    await initCanvasCharts(currentCanvasSymbol);
    initChartControls();
    startCanvasAutoRefresh();

    // Auto-refresh hero widget too
    setInterval(() => {
        if (!document.hidden) initHeroWidget();
    }, 10000);

    window.addEventListener('beforeunload', cleanup, { once: true });

    log('Landing page initialization complete');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

