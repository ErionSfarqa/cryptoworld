// Dashboard JS
import { initRouteGuard } from './router.js';
import { signOut, getCurrentUser, getCashBalance, resetDemoBalance } from './auth.js';
import { getSupabase } from './supabase.js';
import { fetch24hrTickers, fetchPrices } from './api.binance.js';
import { formatPrice, formatPercent, formatCurrency, formatTime, cleanSymbol, symbolIcon, $ } from './utils.js';
import { showEmpty, showError, showToast, setButtonLoading } from './ui.js';
import { log } from './config.js';

let tvScriptPromise = null;
let dashboardWidget = null;
let dashboardSymbol = 'BTCUSDT';
let refreshInterval = null;

function getErrorMessage(error) {
    return (error?.message || '').toLowerCase();
}

function hasMissingColumn(error, table, column) {
    const msg = getErrorMessage(error);
    const tableCol = `${table}.${column}`.toLowerCase();
    return (
        msg.includes(`column ${tableCol}`) ||
        msg.includes(`column "${column.toLowerCase()}"`) ||
        msg.includes(`'${column.toLowerCase()}' column`) ||
        msg.includes(`column ${column.toLowerCase()}`)
    );
}

function getPositionEntryPrice(position) {
    const raw = position?.entry_price ?? position?.avg_entry ?? 0;
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : 0;
}

function getPositionSide(position) {
    return position?.side === 'SELL' ? 'SELL' : 'BUY';
}

async function fetchOpenPositions(sb, userId) {
    const scoped = sb.from('positions').select('*').eq('user_id', userId);
    const { data, error } = await scoped.eq('status', 'open');
    if (!error) return data || [];

    if (!hasMissingColumn(error, 'positions', 'status')) {
        throw error;
    }

    const { data: legacyData, error: legacyError } = await sb
        .from('positions')
        .select('*')
        .eq('user_id', userId);

    if (legacyError) throw legacyError;
    return legacyData || [];
}

async function init() {
    const allowed = await initRouteGuard();
    if (!allowed) return;

    const logoutBtn = $('#logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            signOut();
        });
    }

    const user = await getCurrentUser();
    if (user) {
        const emailEl = $('#userEmail');
        if (emailEl) emailEl.textContent = user.email;
    }

    const resetBtn = $('#resetBalanceBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (!confirm('Reset your demo balance to $10,000 and close all open positions?')) return;

            setButtonLoading(resetBtn, true);
            try {
                const sb = await getSupabase();
                const currentUser = await getCurrentUser();
                if (!currentUser) throw new Error('Not authenticated');

                await sb.from('positions').delete().eq('user_id', currentUser.id);
                const balance = await resetDemoBalance();

                $('#statBalance').textContent = formatCurrency(balance);
                $('#statPortfolio').textContent = formatCurrency(balance);
                $('#statPositions').textContent = '0';
                $('#statPnl').textContent = '$0.00';
                setStatPnlColor(0);

                showToast('Demo balance and positions reset!', 'success');
                log('Demo balance and positions reset');
            } catch (e) {
                log('Reset error:', e.message);
                showToast('Failed to reset account. Please try again.', 'error');
            } finally {
                setButtonLoading(resetBtn, false, 'Reset Demo Balance');
            }
        });
    }

    initDashboardChartControls();
    await initDashboardChart(dashboardSymbol);

    await Promise.all([
        loadBalance(),
        loadWatchlist(),
        loadRecentTrades(),
        loadStats(),
    ]);

    startAutoRefresh();

    window.addEventListener('beforeunload', cleanup, { once: true });
}

function startAutoRefresh() {
    stopAutoRefresh();
    refreshInterval = setInterval(async () => {
        if (document.hidden) return;
        await Promise.all([
            loadBalance(),
            loadStats(),
        ]);
    }, 10000);
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

function cleanup() {
    stopAutoRefresh();
    cleanupDashboardChart();
}

function cleanupDashboardChart() {
    try {
        if (dashboardWidget && typeof dashboardWidget.remove === 'function') {
            dashboardWidget.remove();
        }
    } catch (e) {
        log('Dashboard chart cleanup warning:', e.message);
    }

    dashboardWidget = null;
    const container = $('#dashboardTvChart');
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

async function initDashboardChart(symbol = 'BTCUSDT') {
    const container = $('#dashboardTvChart');
    if (!container) return;

    dashboardSymbol = symbol;
    cleanupDashboardChart();

    const host = document.createElement('div');
    host.id = 'tradingview_widget_dashboard';
    host.className = 'w-full h-full';
    container.appendChild(host);

    const height = window.innerWidth <= 768 ? 320 : 420;

    try {
        await loadTradingViewScript();
        if (!window.TradingView) throw new Error('TradingView unavailable');

        dashboardWidget = new window.TradingView.widget({
            container_id: 'tradingview_widget_dashboard',
            symbol: 'BINANCE:' + symbol,
            interval: '15',
            timezone: 'Etc/UTC',
            theme: 'dark',
            style: '1',
            locale: 'en',
            toolbar_bg: '#0a0e1a',
            enable_publishing: false,
            hide_top_toolbar: false,
            save_image: false,
            width: '100%',
            height,
            backgroundColor: '#0a0e1a',
        });

        log('Dashboard chart initialized:', symbol);
    } catch (e) {
        log('Dashboard chart init error:', e.message);
    }
}

function initDashboardChartControls() {
    const select = $('#dashboardSymbolSelect');
    if (!select) return;

    select.addEventListener('change', () => {
        initDashboardChart(select.value);
    });
}

async function loadBalance() {
    try {
        const balance = await getCashBalance();
        const el = $('#statBalance');
        if (el) el.textContent = formatCurrency(balance);
        log('Balance loaded:', balance);
    } catch (e) {
        log('Balance load error:', e.message);
    }
}

function setStatPnlColor(value) {
    const pnlEl = $('#statPnl');
    if (!pnlEl) return;
    pnlEl.classList.remove('text-success', 'text-danger', 'text-text-primary');
    if (value > 0) {
        pnlEl.classList.add('text-success');
    } else if (value < 0) {
        pnlEl.classList.add('text-danger');
    } else {
        pnlEl.classList.add('text-text-primary');
    }
}

async function loadStats() {
    try {
        const sb = await getSupabase();
        const user = await getCurrentUser();
        if (!user) return;

        const positions = await fetchOpenPositions(sb, user.id);

        const posCount = positions?.length || 0;
        $('#statPositions').textContent = String(posCount);

        const { data: orders } = await sb.from('orders').select('id').eq('user_id', user.id);
        $('#statTrades').textContent = String(orders?.length || 0);

        if (positions && positions.length > 0) {
            const symbols = [...new Set(positions.map((p) => p.symbol))];
            const prices = await fetchPrices(symbols);

            let totalPnl = 0;
            positions.forEach((p) => {
                const entry = getPositionEntryPrice(p);
                const current = prices[p.symbol] || entry;
                const qty = parseFloat(p.quantity);
                const side = getPositionSide(p);

                if (side === 'SELL') {
                    totalPnl += (entry - current) * qty;
                } else {
                    totalPnl += (current - entry) * qty;
                }
            });

            $('#statPnl').textContent = formatCurrency(totalPnl);
            setStatPnlColor(totalPnl);

            const cash = await getCashBalance();
            $('#statPortfolio').textContent = formatCurrency(cash + totalPnl);
        } else {
            const cash = await getCashBalance();
            $('#statPortfolio').textContent = formatCurrency(cash);
            $('#statPnl').textContent = '$0.00';
            setStatPnlColor(0);
        }

        log('Dashboard stats loaded');
    } catch (e) {
        log('Stats error:', e.message);
    }
}

async function loadWatchlist() {
    const panel = $('#watchlistPanel');
    try {
        const sb = await getSupabase();
        const user = await getCurrentUser();
        if (!user) {
            showEmpty(panel, 'Log in to see watchlist');
            return;
        }

        const { data: watchlist } = await sb.from('watchlist').select('symbol').eq('user_id', user.id);
        if (!watchlist || watchlist.length === 0) {
            showEmpty(panel, 'No items in watchlist. Add symbols from the Markets page.');
            return;
        }

        const tickers = await fetch24hrTickers();
        const tickerMap = {};
        tickers.forEach((t) => {
            tickerMap[t.symbol] = t;
        });

        panel.innerHTML = '';
        watchlist.forEach((w) => {
            const t = tickerMap[w.symbol];
            if (!t) return;

            const base = cleanSymbol(t.symbol);
            const pct = parseFloat(t.priceChangePercent);
            const row = document.createElement('div');
            row.className = 'grid grid-cols-[2fr_1.5fr_1fr] items-center px-6 py-3 border-b border-accent/6 cursor-pointer transition-colors duration-200 ease-cw-ease hover:bg-accent/4';
            const changeClass = pct >= 0 ? 'text-success' : 'text-danger';
            row.innerHTML = `
        <div class="flex items-center gap-2">
          <div class="${symbolIcon(base)} w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs-7 text-white shrink-0">${base.slice(0, 2)}</div>
          <div><div class="text-xs-92 font-semibold">${base}</div><div class="text-xs-78 text-text-muted">${t.symbol}</div></div>
        </div>
        <div class="text-xs-92 font-semibold">$${formatPrice(t.lastPrice)}</div>
        <div class="text-xs-85 font-semibold ${changeClass}">${formatPercent(pct)}</div>
      `;

            row.addEventListener('click', () => {
                window.location.href = './trade.html?symbol=' + t.symbol;
            });
            panel.appendChild(row);
        });

        log('Watchlist loaded:', watchlist.length, 'items');
    } catch (e) {
        log('Watchlist error:', e.message);
        showError(panel, 'Failed to load watchlist', loadWatchlist);
    }
}

async function loadRecentTrades() {
    const panel = $('#recentTradesPanel');
    try {
        const sb = await getSupabase();
        const user = await getCurrentUser();
        if (!user) {
            showEmpty(panel, 'Log in to see trades');
            return;
        }

        const { data: orders } = await sb
            .from('orders')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5);

        if (!orders || orders.length === 0) {
            showEmpty(panel, 'No trades yet. Start trading from the Trade page.');
            return;
        }

        const tableClass = 'w-full border-collapse';
        const thClass = 'px-4 py-3 text-left text-xs-78 font-semibold text-text-muted uppercase tracking-cw-05 font-body whitespace-nowrap border-b border-border';
        const tdClass = 'px-4 py-3.5 text-xs-9 whitespace-nowrap border-b border-accent/6';
        const rowClass = 'hover:bg-accent/4';
        const badgeBase = 'inline-flex items-center px-2.5 py-3px rounded-20 text-xs-75 font-semibold uppercase';

        let html = `<table class="${tableClass}"><thead><tr>
          <th class="${thClass}">Symbol</th>
          <th class="${thClass}">Side</th>
          <th class="${thClass}">Qty</th>
          <th class="${thClass}">Price</th>
          <th class="${thClass}">Time</th>
        </tr></thead><tbody>`;
        orders.forEach((o) => {
            const sideLabel = String(o.side || '').toUpperCase();
            const badgeClass = sideLabel === 'BUY' ? 'bg-success/12 text-success' : 'bg-danger/12 text-danger';
            html += `<tr class="${rowClass}">
        <td class="${tdClass}">${cleanSymbol(o.symbol)}</td>
        <td class="${tdClass}"><span class="${badgeBase} ${badgeClass}">${sideLabel}</span></td>
        <td class="${tdClass}">${o.quantity}</td>
        <td class="${tdClass}">$${formatPrice(o.price)}</td>
        <td class="${tdClass}">${formatTime(o.created_at)}</td>
      </tr>`;
        });
        html += '</tbody></table>';
        panel.innerHTML = html;

        log('Recent trades loaded:', orders.length);
    } catch (e) {
        log('Recent trades error:', e.message);
        showError(panel, 'Failed to load trades', loadRecentTrades);
    }
}

init();

