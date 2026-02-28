// Markets JS
import { initRouteGuard } from './router.js';
import { signOut, getCurrentUser } from './auth.js';
import { getSupabase } from './supabase.js';
import { fetch24hrTickers, getTopByVolume, getTopGainers, getTopLosers } from './api.binance.js';
import { formatPrice, formatPercent, formatCurrency, cleanSymbol, symbolIcon, $, $$, debounce } from './utils.js';
import { showEmpty, showError, showToast } from './ui.js';
import { log } from './config.js';

let initialized = false;
let allTickers = [];
let watchlistSymbols = new Set();
let currentFilter = 'volume';
let refreshIntervalId = null;
let loadInFlight = false;

function formatTime(value) {
    const date = value instanceof Date ? value : new Date();
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function updateLastUpdated(value) {
    const label = $('#marketsLastUpdated');
    if (label) {
        label.textContent = `Last updated: ${formatTime(value)}`;
    }
}

async function init() {
    if (initialized) return;
    initialized = true;

    const allowed = await initRouteGuard();
    if (!allowed) return;

    const logoutBtn = $('#logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            signOut();
        });
    }

    await loadWatchlistSymbols();

    const filterTabs = $$('#filterTabs [data-filter]');
    filterTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            filterTabs.forEach((node) => {
                node.classList.remove('bg-accent/15', 'text-accent-light', 'hover:text-accent-light');
            });
            tab.classList.add('bg-accent/15', 'text-accent-light', 'hover:text-accent-light');
            currentFilter = tab.dataset.filter;
            renderMarkets();
        });
    });

    const searchInput = $('#searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => renderMarkets(), 250));
    }

    await loadTickers();
    startAutoRefresh();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', cleanup, { once: true });
}

async function loadWatchlistSymbols() {
    try {
        const sb = await getSupabase();
        const user = await getCurrentUser();
        if (!user) return;

        const { data } = await sb.from('watchlist').select('symbol').eq('user_id', user.id);
        if (data) {
            data.forEach((item) => watchlistSymbols.add(item.symbol));
        }

        log('Watchlist symbols loaded:', watchlistSymbols.size);
    } catch (error) {
        log('Watchlist load error:', error.message);
    }
}

async function loadTickers() {
    const panel = $('#marketsPanel');
    if (loadInFlight) return;
    loadInFlight = true;

    try {
        allTickers = await fetch24hrTickers();
        renderMarkets();
        updateLastUpdated(new Date());
        log('Tickers loaded:', allTickers.length);
    } catch (_) {
        showError(panel, 'Failed to load market data', loadTickers);
    } finally {
        loadInFlight = false;
    }
}

function handleVisibilityChange() {
    if (document.hidden) {
        stopAutoRefresh();
    } else {
        startAutoRefresh();
    }
}

function startAutoRefresh() {
    stopAutoRefresh();
    // Refresh market data on a timer without full page reload.
    refreshIntervalId = setInterval(() => {
        if (!document.hidden) {
            loadTickers();
        }
    }, 10000);
}

function stopAutoRefresh() {
    if (!refreshIntervalId) return;
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
}

function cleanup() {
    stopAutoRefresh();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
}

function renderMarkets() {
    const panel = $('#marketsPanel');
    if (!panel) return;

    const searchInput = $('#searchInput');
    const search = (searchInput?.value || '').trim().toUpperCase();

    let filtered;
    switch (currentFilter) {
        case 'gainers':
            filtered = getTopGainers(allTickers, 50);
            break;
        case 'losers':
            filtered = getTopLosers(allTickers, 50);
            break;
        default:
            filtered = getTopByVolume(allTickers, 50);
            break;
    }

    if (search) {
        filtered = filtered.filter((ticker) => {
            return ticker.symbol.includes(search) || cleanSymbol(ticker.symbol).includes(search);
        });
    }

    if (filtered.length === 0) {
        showEmpty(panel, 'No markets found');
        return;
    }

    const headerRowClass = 'grid grid-cols-market-row max-md:grid-cols-market-row-sm items-center px-6 py-3 border-b border-border text-xs-78 font-semibold text-text-muted uppercase tracking-cw-05';
    const rowClass = 'grid grid-cols-market-row max-md:grid-cols-market-row-sm items-center px-6 py-3 border-b border-accent/6 cursor-pointer transition-colors duration-200 ease-cw-ease hover:bg-accent/4';
    const watchBtnBase = 'text-text-muted cursor-pointer text-base-1 p-1 transition-[color,transform] duration-200 ease-cw-ease hover:text-warning hover:scale-[1.15]';

    let html = `<div class="${headerRowClass}">
    <div>Symbol</div>
    <div>Price</div>
    <div>24h Change</div>
    <div class="max-md:hidden">Volume</div>
    <div></div>
  </div>`;

    filtered.forEach((ticker) => {
        const base = cleanSymbol(ticker.symbol);
        const pct = parseFloat(ticker.priceChangePercent);
        const isWatched = watchlistSymbols.has(ticker.symbol);

        const changeClass = pct >= 0 ? 'text-success' : 'text-danger';
        html += `<div class="${rowClass}" data-symbol="${ticker.symbol}" data-market-row>
      <div class="flex items-center gap-2">
        <div class="${symbolIcon(base)} w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs-7 text-white shrink-0">${base.slice(0, 2)}</div>
        <div><div class="text-xs-92 font-semibold">${base}</div><div class="text-xs-78 text-text-muted">${ticker.symbol}</div></div>
      </div>
      <div class="text-xs-92 font-semibold">$${formatPrice(ticker.lastPrice)}</div>
      <div class="text-xs-85 font-semibold ${changeClass}">${formatPercent(pct)}</div>
      <div class="text-xs-85 text-text-secondary max-md:hidden">${formatCurrency(ticker.quoteVolume)}</div>
      <button class="${watchBtnBase} ${isWatched ? 'text-warning' : ''}" data-watchlist-btn data-symbol="${ticker.symbol}" title="${isWatched ? 'Remove from watchlist' : 'Add to watchlist'}">
        ${isWatched ? '&#9733;' : '&#9734;'}
      </button>
    </div>`;
    });

    panel.innerHTML = html;

    panel.querySelectorAll('[data-market-row]').forEach((row) => {
        row.addEventListener('click', (event) => {
            if (event.target.closest('[data-watchlist-btn]')) return;
            window.location.href = './trade.html?symbol=' + row.dataset.symbol;
        });
    });

    panel.querySelectorAll('[data-watchlist-btn]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleWatchlist(button.dataset.symbol, button);
        });
    });
}

async function toggleWatchlist(symbol, button) {
    try {
        const sb = await getSupabase();
        const user = await getCurrentUser();
        if (!user) {
            showToast('Please log in', 'warning');
            return;
        }

        if (watchlistSymbols.has(symbol)) {
            await sb.from('watchlist').delete().eq('user_id', user.id).eq('symbol', symbol);
            watchlistSymbols.delete(symbol);
            button.classList.remove('text-warning');
            button.innerHTML = '&#9734;';
            button.title = 'Add to watchlist';
            showToast(cleanSymbol(symbol) + ' removed from watchlist', 'info');
        } else {
            await sb.from('watchlist').insert({ user_id: user.id, symbol });
            watchlistSymbols.add(symbol);
            button.classList.add('text-warning');
            button.innerHTML = '&#9733;';
            button.title = 'Remove from watchlist';
            showToast(cleanSymbol(symbol) + ' added to watchlist', 'success');
        }
    } catch (error) {
        log('Watchlist update failed:', error.message);
        showToast('Watchlist update failed. Please try again.', 'error');
    }
}

init();

