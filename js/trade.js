// Trade JS
import { initRouteGuard } from './router.js';
import { signOut, getCurrentUser, getCashBalance, updateCashBalance, resetDemoBalance } from './auth.js';
import { getSupabase } from './supabase.js';
import { fetchPrice } from './api.binance.js';
import { formatPrice, formatCurrency, getQueryParam, normalizeSide, $ } from './utils.js';
import { calculatePnl } from './utils/pnl.js';
import { showToast, setButtonLoading } from './ui.js';
import { log } from './config.js';

const DEBUG = false;

let initialized = false;
let currentSymbol = 'BTCUSDT';
let currentPrice = 0;
let currentSide = 'BUY';
let cashBalance = 0;
let equity = 0;
let freeMargin = 0;
let usedMargin = 0;
let marginRequired = 0;

let priceIntervalId = null;
let tvScriptPromise = null;
let tradeWidget = null;
let chartResizeTimeoutId = null;
let orderInFlight = false;

const BUY_TAB_ACTIVE_CLASSES = ['text-success', 'border-b-success', 'hover:text-success'];
const SELL_TAB_ACTIVE_CLASSES = ['text-danger', 'border-b-danger', 'hover:text-danger'];
const ORDER_BTN_BUY_CLASSES = ['bg-success-gradient', 'hover:shadow-success-btn'];
const ORDER_BTN_SELL_CLASSES = ['bg-danger-gradient', 'hover:shadow-danger-btn'];
const TRADE_LAYOUT_GRID_CLASSES = ['grid', 'grid-cols-trade-layout', 'gap-8', 'max-lg:grid-cols-1'];
const TRADE_LAYOUT_FULLSCREEN_CLASSES = ['block', 'w-full', 'h-full'];
const CHART_FULLSCREEN_ADD_CLASSES = ['w-full', 'h-full', 'min-h-full', 'border-0', 'rounded-none'];
const CHART_FULLSCREEN_REMOVE_CLASSES = ['h-520', 'max-md:h-360', 'border', 'border-border', 'rounded-cw-md'];
const FULLSCREEN_SHELL_MOBILE_CLASSES = ['flex', 'flex-col', 'min-h-screen'];
const FULLSCREEN_LAYOUT_MOBILE_CLASSES = ['flex', 'flex-col', 'flex-1', 'min-h-0', 'w-full', 'h-full'];
const FULLSCREEN_CHART_MOBILE_CLASSES = ['flex-1', 'min-h-0'];
const FULLSCREEN_CHART_MOBILE_REMOVE_CLASSES = ['h-full', 'min-h-full'];
const FULLSCREEN_PANEL_MOBILE_CLASSES = ['flex-1', 'min-h-0', 'overflow-auto', 'bg-bg-card', 'border', 'border-border'];
const PANEL_FULLSCREEN_ADD_CLASSES = [
    'absolute', 'top-4', 'right-4', 'bottom-4', 'z-[21]', 'overflow-auto',
    'bg-bg-primary/74', 'border-white/15', 'backdrop-blur-18',
    'w-[min(360px,calc(100%-32px))]', 'max-h-[calc(100%-32px)]',
    'max-md:left-3', 'max-md:right-3', 'max-md:top-auto', 'max-md:bottom-3',
    'max-md:w-auto', 'max-md:max-h-[min(72vh,520px)]',
    'max-md:translate-y-[calc(100%-56px)]', 'max-md:transition-transform',
    'max-md:duration-250', 'max-md:ease-cw-ease', 'max-md:rounded-cw-lg',
];
const PANEL_FULLSCREEN_REMOVE_CLASSES = ['bg-bg-card', 'border-border'];
const PANEL_OPEN_CLASS = 'max-md:translate-y-0';
const PANEL_CLOSED_CLASS = 'max-md:translate-y-[calc(100%-56px)]';

function debugLog(...args) {
    if (DEBUG) {
        console.debug('[CW][trade]', ...args);
    }
}

function getErrorMessage(error) {
    return String(error?.message || '').toLowerCase();
}

function getRawErrorDetail(error) {
    if (!error) return '';
    if (typeof error === 'string') return error;

    const candidate = error.message || error.details || error.hint || error.error_description;
    if (candidate) return String(candidate);

    try {
        return JSON.stringify(error);
    } catch (_) {
        return String(error);
    }
}

function getErrorDetail(error) {
    return getRawErrorDetail(error).replace(/\s+/g, ' ').trim();
}

function hasMissingColumn(error, table, column) {
    const msg = getErrorMessage(error);
    const tableCol = `${table}.${column}`.toLowerCase();
    return (
        msg.includes(`column ${tableCol}`)
        || msg.includes(`column "${column.toLowerCase()}"`)
        || msg.includes(`'${column.toLowerCase()}' column`)
        || msg.includes(`column ${column.toLowerCase()}`)
    );
}

function isDuplicatePositionError(error) {
    const msg = getErrorMessage(error);
    return (
        error?.code === '23505'
        || (msg.includes('duplicate key') && msg.includes('positions'))
        || msg.includes('positions_user_id_symbol')
        || msg.includes('positions_user_symbol_open_idx')
    );
}

function normalizeSymbol(input) {
    const compact = String(input || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!compact) return '';
    return compact.endsWith('USDT') ? compact : `${compact}USDT`;
}

function isValidTradeSymbol(symbol) {
    return /^[A-Z0-9]{2,20}USDT$/.test(symbol);
}

const INVALID_ENTRY_PRICE_ERROR = 'Invalid entry price; cannot create position.';
const VALID_ORDER_STATUSES = new Set(['open', 'filled', 'cancelled']);

function getPositionEntryPrice(position) {
    const raw = position?.avg_entry ?? position?.entry_price ?? 0;
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : NaN;
}

function getPositionSize(position) {
    const raw = position?.size ?? position?.quantity ?? 0;
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : NaN;
}

function getPositionSide(position) {
    return String(position?.side || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
}

function parsePositiveNumber(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : NaN;
}

function requireValidEntryPrice(value) {
    const parsed = parsePositiveNumber(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(INVALID_ENTRY_PRICE_ERROR);
    }
    return parsed;
}

function getPositionLeverage(position, fallback = 30) {
    const parsed = parseFloat(position?.leverage ?? fallback);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeMargin(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

const normalizeOrderStatus = (status) => {
    if (status === null || status === undefined) return 'filled';
    const normalized = String(status).trim().toLowerCase();
    if (!normalized) return 'filled';
    return VALID_ORDER_STATUSES.has(normalized) ? normalized : 'filled';
};

function formatToastError(error, fallback = 'Order failed') {
    const message = String(error?.message || fallback).trim() || fallback;
    const details = String(error?.details || '').trim();

    if (!details) return message;
    if (message.toLowerCase().includes(details.toLowerCase())) return message;
    return `${message}: ${details}`;
}

function getUserFacingTradeError(error, fallback = 'Order failed') {
    const msg = getErrorMessage(error);
    const detail = getErrorDetail(error);

    if (
        hasMissingColumn(error, 'positions', 'entry_price')
        || hasMissingColumn(error, 'positions', 'avg_entry')
        || hasMissingColumn(error, 'orders', 'status')
        || msg.includes('schema cache')
        || error?.code === '42703'
    ) {
        return 'Trading schema is out of date. Run supabase_migration.sql, then refresh and retry.';
    }

    if (isDuplicatePositionError(error)) {
        return 'A duplicate open position was detected. Retry the order after refreshing.';
    }

    if (msg.includes('row-level security') || msg.includes('permission denied')) {
        return detail
            ? `Permission denied by database policy: ${detail}`
            : 'Permission denied by database policy. Log in again and retry.';
    }

    if (msg.includes('not authenticated')) {
        return 'Please log in to trade.';
    }

    if (detail) {
        return `${fallback}: ${detail}`;
    }

    return fallback;
}

function setTradeErrorActions(isVisible) {
    const actions = $('#tradeErrorActions');
    if (!actions) return;
    actions.classList.toggle('hidden', !isVisible);
}

function clearTradeError() {
    const errorEl = $('#tradeError');
    if (!errorEl) return;

    errorEl.classList.add('hidden');
    errorEl.textContent = '';
    setTradeErrorActions(false);
    clearTradeDebugPanel();
}

function getTradeDebugPanel() {
    const existing = $('#tradeDebug');
    if (existing) return existing;

    const errorEl = $('#tradeError');
    if (!errorEl || !errorEl.parentElement) return null;

    const panel = document.createElement('pre');
    panel.id = 'tradeDebug';
    panel.className = 'mt-2 text-xs-85 text-accent-light whitespace-pre-wrap opacity-85 hidden';
    errorEl.insertAdjacentElement('afterend', panel);
    return panel;
}

function clearTradeDebugPanel() {
    const debugPanel = $('#tradeDebug');
    if (!debugPanel) return;
    debugPanel.textContent = '';
    debugPanel.classList.add('hidden');
}

function setTradeDebugError(error, payload) {
    if (!DEBUG) return;

    const debugPanel = getTradeDebugPanel();
    if (!debugPanel) return;

    const details = [];
    if (payload) {
        let payloadText = '';
        try {
            payloadText = JSON.stringify(payload, null, 2);
        } catch (_) {
            payloadText = String(payload);
        }
        if (payloadText) details.push(`payload:\n${payloadText}`);
    }
    if (error?.details) details.push(`details: ${String(error.details)}`);
    if (error?.hint) details.push(`hint: ${String(error.hint)}`);
    if (!details.length) {
        debugPanel.textContent = '';
        debugPanel.classList.add('hidden');
        return;
    }

    debugPanel.textContent = details.join('\n');
    debugPanel.classList.remove('hidden');
}

function showTradeError(message, toastType = 'error', options = {}) {
    const safeMessage = String(message || 'Something went wrong.');
    const errorEl = $('#tradeError');
    const toastMessage = options?.toastMessage ? String(options.toastMessage) : safeMessage;
    const showActions = Boolean(options?.showActions);

    if (errorEl) {
        errorEl.textContent = safeMessage;
        errorEl.classList.remove('hidden');
    }

    setTradeErrorActions(showActions);
    showToast(toastMessage, toastType);

    if (options?.error) {
        setTradeDebugError(options.error, options?.debugPayload);
    } else {
        clearTradeDebugPanel();
    }
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
    return (legacyData || []).filter((position) => !position.status || position.status === 'open');
}

async function fetchOpenPositionBySymbol(sb, userId, symbol) {
    const scoped = sb.from('positions').select('*').eq('user_id', userId).eq('symbol', symbol).limit(1);
    const { data, error } = await scoped.eq('status', 'open');

    if (!error) {
        return (data && data.length > 0) ? data[0] : null;
    }

    if (!hasMissingColumn(error, 'positions', 'status')) {
        throw error;
    }

    const { data: legacyData, error: legacyError } = await sb
        .from('positions')
        .select('*')
        .eq('user_id', userId)
        .eq('symbol', symbol)
        .limit(1);

    if (legacyError) throw legacyError;
    return (legacyData && legacyData.length > 0) ? legacyData[0] : null;
}

async function insertPositionWithFallback(sb, payload) {
    const optionalColumns = [
        'side',
        'leverage',
        'margin_required',
        'status',
        'stop_loss',
        'take_profit',
        'size',
        'opened_at',
        'updated_at',
    ];

    const record = { ...payload };

    while (true) {
        const { data, error } = await sb.from('positions').insert(record).select('*').single();
        if (!error) return data || null;

        if (hasMissingColumn(error, 'positions', 'avg_entry') && 'avg_entry' in record) {
            if (!('entry_price' in record)) {
                record.entry_price = record.avg_entry;
            }
            delete record.avg_entry;
            continue;
        }

        if (hasMissingColumn(error, 'positions', 'entry_price') && 'entry_price' in record) {
            if (!('avg_entry' in record)) {
                record.avg_entry = record.entry_price;
            }
            delete record.entry_price;
            continue;
        }

        if (hasMissingColumn(error, 'positions', 'quantity') && 'quantity' in record) {
            record.size = record.quantity;
            delete record.quantity;
            continue;
        }

        const missingColumn = optionalColumns.find((key) => hasMissingColumn(error, 'positions', key));
        if (!missingColumn || !(missingColumn in record)) {
            throw error;
        }

        delete record[missingColumn];
    }
}

async function updatePositionWithFallback(sb, positionId, userId, payload) {
    const optionalColumns = [
        'side',
        'leverage',
        'margin_required',
        'status',
        'stop_loss',
        'take_profit',
        'size',
        'updated_at',
    ];

    const record = { ...payload };

    while (true) {
        const { data, error } = await sb
            .from('positions')
            .update(record)
            .eq('id', positionId)
            .eq('user_id', userId)
            .select('*')
            .single();

        if (!error) return data || null;

        if (hasMissingColumn(error, 'positions', 'avg_entry') && 'avg_entry' in record) {
            if (!('entry_price' in record)) {
                record.entry_price = record.avg_entry;
            }
            delete record.avg_entry;
            continue;
        }

        if (hasMissingColumn(error, 'positions', 'entry_price') && 'entry_price' in record) {
            if (!('avg_entry' in record)) {
                record.avg_entry = record.entry_price;
            }
            delete record.entry_price;
            continue;
        }

        if (hasMissingColumn(error, 'positions', 'quantity') && 'quantity' in record) {
            record.size = record.quantity;
            delete record.quantity;
            continue;
        }

        const missingColumn = optionalColumns.find((key) => hasMissingColumn(error, 'positions', key));
        if (!missingColumn || !(missingColumn in record)) {
            throw error;
        }

        delete record[missingColumn];
    }
}

async function applyBuyToExistingPosition(sb, existing, payload) {
    if (getPositionSide(existing) !== 'BUY') {
        throw new Error('Cannot add to a legacy short position. Close it first.');
    }

    const existingQty = getPositionSize(existing);
    if (!Number.isFinite(existingQty) || existingQty <= 0) {
        throw new Error('Existing position quantity is invalid.');
    }

    const existingAvg = requireValidEntryPrice(getPositionEntryPrice(existing));
    const newQty = existingQty + payload.quantity;
    const newAvg = requireValidEntryPrice(
        ((existingQty * existingAvg) + (payload.quantity * payload.entryPrice)) / newQty
    );

    const updated = await updatePositionWithFallback(sb, existing.id, payload.userId, {
        side: 'BUY',
        quantity: newQty,
        size: newQty,
        avg_entry: newAvg,
        entry_price: newAvg,
        leverage: payload.leverage,
        margin_required: normalizeMargin(existing.margin_required) + Math.max(payload.requiredMargin, 0),
        status: 'open',
        updated_at: payload.nowIso,
    });

    return { mode: 'update', row: updated, realizedPnl: 0 };
}

async function applySellToExistingPosition(sb, existing, payload) {
    if (getPositionSide(existing) !== 'BUY') {
        throw new Error('Cannot sell against a legacy short position. Close it first.');
    }

    const existingQty = getPositionSize(existing);
    if (!Number.isFinite(existingQty) || existingQty <= 0) {
        throw new Error('Existing position quantity is invalid.');
    }

    if (payload.quantity > (existingQty + 1e-12)) {
        throw new Error(`Sell quantity exceeds open position size (${existingQty}).`);
    }

    const avgEntry = requireValidEntryPrice(getPositionEntryPrice(existing));
    // Realized PnL for the sold quantity against the average entry.
    const { pnlAbs: realizedPnl } = calculatePnl({
        side: getPositionSide(existing),
        entryPrice: avgEntry,
        price: payload.entryPrice,
        quantity: payload.quantity,
    });
    const remainingQtyRaw = existingQty - payload.quantity;
    const remainingQty = remainingQtyRaw > 1e-12 ? remainingQtyRaw : 0;

    if (remainingQty > 0) {
        const marginRatio = remainingQty / existingQty;
        const updated = await updatePositionWithFallback(sb, existing.id, payload.userId, {
            side: 'BUY',
            quantity: remainingQty,
            size: remainingQty,
            avg_entry: avgEntry,
            entry_price: avgEntry,
            leverage: getPositionLeverage(existing, payload.leverage),
            margin_required: normalizeMargin(existing.margin_required) * marginRatio,
            status: 'open',
            updated_at: payload.nowIso,
        });

        return { mode: 'reduce', row: updated, realizedPnl };
    }

    const { error } = await sb
        .from('positions')
        .delete()
        .eq('id', existing.id)
        .eq('user_id', payload.userId);

    if (error) throw error;
    return { mode: 'delete', row: null, realizedPnl };
}

async function applyPositionChangeForOrder(sb, payload) {
    const existing = await fetchOpenPositionBySymbol(sb, payload.userId, payload.symbol);

    if (payload.side === 'SELL') {
        if (!existing) {
            throw new Error(`No open position to sell for ${payload.symbol}.`);
        }
        return applySellToExistingPosition(sb, existing, payload);
    }

    if (existing) {
        return applyBuyToExistingPosition(sb, existing, payload);
    }

    const createPayload = {
        user_id: payload.userId,
        symbol: payload.symbol,
        side: 'BUY',
        quantity: payload.quantity,
        size: payload.quantity,
        avg_entry: payload.entryPrice,
        entry_price: payload.entryPrice,
        leverage: payload.leverage,
        margin_required: Math.max(payload.requiredMargin, 0),
        status: 'open',
        opened_at: payload.nowIso,
        updated_at: payload.nowIso,
    };

    try {
        const inserted = await insertPositionWithFallback(sb, createPayload);
        return { mode: 'insert', row: inserted, realizedPnl: 0 };
    } catch (error) {
        if (!isDuplicatePositionError(error)) {
            throw error;
        }

        const concurrent = await fetchOpenPositionBySymbol(sb, payload.userId, payload.symbol);
        if (!concurrent) throw error;
        return applyBuyToExistingPosition(sb, concurrent, payload);
    }
}

async function insertOrderWithFallback(sb, payload) {
    const optionalColumns = ['total', 'leverage', 'type', 'pnl', 'created_at'];
    const record = { ...payload };
    record.status = normalizeOrderStatus(record.status);

    while (true) {
        const { error } = await sb.from('orders').insert(record);
        if (!error) return;

        const msg = getErrorMessage(error);
        const missingColumn = optionalColumns.find((key) => {
            return msg.includes(`column "${key}"`) || msg.includes(`column ${key}`);
        });

        if (!missingColumn || !(missingColumn in record)) {
            throw error;
        }

        delete record[missingColumn];
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

    const symbolFromQuery = normalizeSymbol(getQueryParam('symbol'));
    if (symbolFromQuery && isValidTradeSymbol(symbolFromQuery)) {
        currentSymbol = symbolFromQuery;
    }

    setupSymbolSelect(currentSymbol);

    await refreshAccountData();
    await initChart(currentSymbol);

    initControls();
    initResetBtn();
    setOrderButtonState();
    setFullscreenUiState(false);

    await updatePrice();
    startPricePolling();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('beforeunload', cleanup, { once: true });
}

function cleanup() {
    stopPricePolling();
    destroyTradeChart();

    if (chartResizeTimeoutId) {
        clearTimeout(chartResizeTimeoutId);
        chartResizeTimeoutId = null;
    }

    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    window.removeEventListener('resize', handleWindowResize);
}

function handleVisibilityChange() {
    if (document.hidden) {
        stopPricePolling();
        return;
    }

    startPricePolling();
}

function handleWindowResize() {
    if (!isTradeShellFullscreen()) return;
    applyFullscreenViewportMode();
}

function setupSymbolSelect(symbol) {
    const select = $('#symbolSelect');
    if (!select) return;

    const normalized = normalizeSymbol(symbol);
    if (!normalized) return;

    if (!select.querySelector(`option[value="${normalized}"]`)) {
        const option = document.createElement('option');
        option.value = normalized;
        option.textContent = normalized.replace('USDT', '') + ' / USDT';
        select.appendChild(option);
    }

    select.value = normalized;
}

async function refreshAccountData() {
    const sb = await getSupabase();
    const user = await getCurrentUser();
    if (!user) return;

    cashBalance = await getCashBalance();

    const positions = await fetchOpenPositions(sb, user.id);

    usedMargin = 0;
    if (positions && positions.length > 0) {
        positions.forEach((position) => {
            usedMargin += parseFloat(position.margin_required || 0);
        });
    }

    equity = cashBalance;
    freeMargin = Math.max(equity - usedMargin, 0);
    updateBalanceDisplay();
}

async function refreshBalanceState() {
    await refreshAccountData();
    updateCalculations();
}

function updateBalanceDisplay() {
    const balanceEl = $('#balanceDisplay');
    const freeMarginEl = $('#freeMarginDisplay');
    const usedMarginEl = $('#usedMarginDisplay');

    if (balanceEl) balanceEl.textContent = formatCurrency(cashBalance);
    if (freeMarginEl) freeMarginEl.textContent = `Free Margin: ${formatCurrency(freeMargin)}`;
    if (usedMarginEl) usedMarginEl.textContent = `Used Margin: ${formatCurrency(usedMargin)}`;
}

function initResetBtn() {
    const resetBtn = $('#resetBalanceBtn');
    if (!resetBtn) return;

    resetBtn.addEventListener('click', async () => {
        if (!confirm('Reset your demo balance to $10,000 and clear all positions?')) return;

        setButtonLoading(resetBtn, true);
        clearTradeError();

        try {
            const sb = await getSupabase();
            const user = await getCurrentUser();
            if (!user) throw new Error('Not authenticated');

            await sb.from('positions').delete().eq('user_id', user.id);
            await resetDemoBalance();

            await refreshBalanceState();
            showToast('Account reset successfully.', 'success');
        } catch (error) {
            debugLog('Reset error', error);
            showTradeError(getUserFacingTradeError(error, 'Failed to reset account'));
        } finally {
            setButtonLoading(resetBtn, false, 'Reset Demo Balance');
        }
    });
}

function destroyTradeChart() {
    try {
        if (tradeWidget && typeof tradeWidget.remove === 'function') {
            tradeWidget.remove();
        }
    } catch (error) {
        log('Trade chart cleanup warning:', error.message);
    }

    tradeWidget = null;

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

async function initChart(symbol) {
    const container = $('#tvChart');
    if (!container) return;

    const normalized = normalizeSymbol(symbol);
    if (!isValidTradeSymbol(normalized)) {
        throw new Error(`Invalid symbol format: ${symbol}`);
    }

    destroyTradeChart();

    const widgetHost = document.createElement('div');
    widgetHost.id = 'tradingview_widget_trade';
    widgetHost.className = 'w-full h-full';
    container.appendChild(widgetHost);

    try {
        await loadTradingViewScript();
        if (!window.TradingView) throw new Error('TradingView unavailable');

        tradeWidget = new window.TradingView.widget({
            container_id: 'tradingview_widget_trade',
            symbol: `BINANCE:${normalized}`,
            interval: '15',
            timezone: 'Etc/UTC',
            theme: 'dark',
            style: '1',
            locale: 'en',
            toolbar_bg: '#0a0e1a',
            enable_publishing: false,
            save_image: false,
            autosize: true,
            width: '100%',
            height: '100%',
            backgroundColor: '#0a0e1a',
            hide_side_toolbar: false,
        });

        debugLog('Trade chart initialized', { symbol: normalized });
    } catch (error) {
        debugLog('Trade chart init error', error);
        throw error;
    }
}

function queueChartResize() {
    if (chartResizeTimeoutId) {
        clearTimeout(chartResizeTimeoutId);
    }

    chartResizeTimeoutId = setTimeout(async () => {
        chartResizeTimeoutId = null;
        try {
            await initChart(currentSymbol);
        } catch (error) {
            debugLog('Chart resize/init failed', error);
        }
    }, 120);
}

function stopPricePolling() {
    if (!priceIntervalId) return;
    clearInterval(priceIntervalId);
    priceIntervalId = null;
}

async function startPricePolling() {
    stopPricePolling();

    await updatePrice();

    priceIntervalId = setInterval(async () => {
        if (!document.hidden) {
            await updatePrice();
        }
    }, 5000);
}

async function updatePrice() {
    try {
        const price = await fetchPrice(currentSymbol);
        if (!Number.isFinite(price) || price <= 0) {
            throw new Error(`Invalid price returned for ${currentSymbol}`);
        }

        currentPrice = price;
        const priceEl = $('#currentPrice');
        if (priceEl) priceEl.textContent = '$' + formatPrice(currentPrice);

        updateCalculations();
        return true;
    } catch (error) {
        debugLog('Price fetch error', {
            symbol: currentSymbol,
            error,
        });

        currentPrice = 0;
        const priceEl = $('#currentPrice');
        if (priceEl) priceEl.textContent = 'Price unavailable';

        updateCalculations();
        return false;
    }
}

function updateCalculations() {
    const qty = parseFloat($('#quantityInput')?.value);
    const leverage = parseFloat($('#leverageSelect')?.value) || 30;

    if (Number.isFinite(qty) && qty > 0 && Number.isFinite(currentPrice) && currentPrice > 0) {
        const notional = qty * currentPrice;
        marginRequired = notional / leverage;

        $('#estimatedTotal').textContent = formatCurrency(notional);
        $('#estimatedMargin').textContent = formatCurrency(marginRequired);

        const marginEl = $('#estimatedMargin');
        if (marginEl) {
            const overLimit = marginRequired > freeMargin;
            marginEl.classList.toggle('text-danger', overLimit);
            marginEl.classList.toggle('text-accent-light', !overLimit);
        }
    } else {
        marginRequired = 0;
        $('#estimatedTotal').textContent = '$0.00';
        $('#estimatedMargin').textContent = '$0.00';
    }
}

function setTabState(tab, isActive, activeClasses, inactiveClasses) {
    if (!tab) return;
    tab.classList.remove(...activeClasses, ...inactiveClasses);
    if (isActive) {
        tab.classList.add(...activeClasses);
    }
}

function setOrderButtonState() {
    const buyTab = $('#tabBuy');
    const sellTab = $('#tabSell');
    const orderBtn = $('#orderBtn');
    if (!buyTab || !sellTab || !orderBtn) return;

    if (currentSide === 'BUY') {
        setTabState(buyTab, true, BUY_TAB_ACTIVE_CLASSES, SELL_TAB_ACTIVE_CLASSES);
        setTabState(sellTab, false, SELL_TAB_ACTIVE_CLASSES, BUY_TAB_ACTIVE_CLASSES);
        orderBtn.classList.remove(...ORDER_BTN_SELL_CLASSES);
        orderBtn.classList.add(...ORDER_BTN_BUY_CLASSES);
        orderBtn.textContent = 'Buy / Long';
    } else {
        setTabState(sellTab, true, SELL_TAB_ACTIVE_CLASSES, BUY_TAB_ACTIVE_CLASSES);
        setTabState(buyTab, false, BUY_TAB_ACTIVE_CLASSES, SELL_TAB_ACTIVE_CLASSES);
        orderBtn.classList.remove(...ORDER_BTN_BUY_CLASSES);
        orderBtn.classList.add(...ORDER_BTN_SELL_CLASSES);
        orderBtn.textContent = 'Sell / Short';
    }
}

function getTradeFullscreenShell() {
    return $('#tradeFullscreenShell');
}

function isTradeShellFullscreen() {
    const shell = getTradeFullscreenShell();
    return Boolean(shell && document.fullscreenElement === shell);
}

function isMobileFullscreenSplit() {
    return isTradeShellFullscreen() && window.innerWidth <= 768;
}

function setPanelOpenState(panel, isOpen) {
    if (!panel) return;
    if (isMobileFullscreenSplit()) {
        panel.classList.remove(PANEL_OPEN_CLASS, PANEL_CLOSED_CLASS);
        return;
    }
    panel.classList.toggle(PANEL_OPEN_CLASS, isOpen);
    panel.classList.toggle(PANEL_CLOSED_CLASS, !isOpen);
}

function setFullscreenUiState(active) {
    const shell = getTradeFullscreenShell();
    const layout = $('#tradeLayout');
    const chart = $('#chartContainer');
    const panel = $('#tradePanel');
    const toggleBtn = $('#fullscreenOrderToggle');
    const exitBtn = $('#fullscreenExitBtn');

    if (!shell || !layout || !chart) return;

    if (!active) {
        shell.classList.remove('bg-bg-deep', 'w-full', 'h-full', ...FULLSCREEN_SHELL_MOBILE_CLASSES);
        layout.classList.remove(...TRADE_LAYOUT_FULLSCREEN_CLASSES, ...FULLSCREEN_LAYOUT_MOBILE_CLASSES);
        layout.classList.add(...TRADE_LAYOUT_GRID_CLASSES);
        chart.classList.remove(...CHART_FULLSCREEN_ADD_CLASSES, ...FULLSCREEN_CHART_MOBILE_CLASSES, ...FULLSCREEN_CHART_MOBILE_REMOVE_CLASSES);
        chart.classList.add(...CHART_FULLSCREEN_REMOVE_CLASSES);
        if (panel) {
            panel.classList.remove(...PANEL_FULLSCREEN_ADD_CLASSES, ...FULLSCREEN_PANEL_MOBILE_CLASSES, PANEL_OPEN_CLASS, PANEL_CLOSED_CLASS);
            panel.classList.add('bg-bg-card', 'border-border');
        }
        if (exitBtn) {
            exitBtn.classList.add('hidden');
            exitBtn.classList.remove('inline-flex', 'items-center', 'justify-center');
        }
        if (toggleBtn) {
            toggleBtn.classList.add('hidden');
            toggleBtn.classList.remove('max-md:inline-flex', 'items-center', 'justify-center');
            toggleBtn.textContent = 'Order Ticket';
            toggleBtn.setAttribute('aria-expanded', 'false');
        }
        return;
    }

    shell.classList.add('bg-bg-deep', 'w-full', 'h-full');
    layout.classList.remove(...TRADE_LAYOUT_GRID_CLASSES);
    layout.classList.add(...TRADE_LAYOUT_FULLSCREEN_CLASSES);
    chart.classList.remove(...CHART_FULLSCREEN_REMOVE_CLASSES);
    chart.classList.add(...CHART_FULLSCREEN_ADD_CLASSES);
    if (panel) {
        panel.classList.remove('bg-bg-card', 'border-border');
        panel.classList.add(...PANEL_FULLSCREEN_ADD_CLASSES);
    }
    if (exitBtn) {
        exitBtn.classList.remove('hidden');
        exitBtn.classList.add('inline-flex', 'items-center', 'justify-center');
    }

    applyFullscreenViewportMode();
}

function applyFullscreenViewportMode() {
    const shell = getTradeFullscreenShell();
    const layout = $('#tradeLayout');
    const chart = $('#chartContainer');
    const panel = $('#tradePanel');
    const toggleBtn = $('#fullscreenOrderToggle');

    if (!shell || !layout || !chart) return;

    if (window.innerWidth <= 768) {
        // Mobile fullscreen: split the screen 50/50 for chart + order panel.
        shell.classList.add(...FULLSCREEN_SHELL_MOBILE_CLASSES);
        layout.classList.remove(...TRADE_LAYOUT_FULLSCREEN_CLASSES);
        layout.classList.add(...FULLSCREEN_LAYOUT_MOBILE_CLASSES);
        chart.classList.remove(...FULLSCREEN_CHART_MOBILE_REMOVE_CLASSES);
        chart.classList.add(...FULLSCREEN_CHART_MOBILE_CLASSES);
        if (panel) {
            panel.classList.remove(...PANEL_FULLSCREEN_ADD_CLASSES, PANEL_OPEN_CLASS, PANEL_CLOSED_CLASS);
            panel.classList.add(...FULLSCREEN_PANEL_MOBILE_CLASSES);
        }
        if (toggleBtn) {
            toggleBtn.classList.add('hidden');
            toggleBtn.classList.remove('max-md:inline-flex', 'items-center', 'justify-center');
            toggleBtn.textContent = 'Order Ticket';
            toggleBtn.setAttribute('aria-expanded', 'true');
        }
        return;
    }

    shell.classList.remove(...FULLSCREEN_SHELL_MOBILE_CLASSES);
    layout.classList.remove(...FULLSCREEN_LAYOUT_MOBILE_CLASSES);
    layout.classList.add(...TRADE_LAYOUT_FULLSCREEN_CLASSES);
    chart.classList.remove(...FULLSCREEN_CHART_MOBILE_CLASSES);
    chart.classList.add(...CHART_FULLSCREEN_ADD_CLASSES);
    if (panel) {
        panel.classList.remove(...FULLSCREEN_PANEL_MOBILE_CLASSES);
        panel.classList.add(...PANEL_FULLSCREEN_ADD_CLASSES);
    }
    if (toggleBtn) {
        toggleBtn.classList.add('hidden');
        toggleBtn.classList.add('max-md:inline-flex', 'items-center', 'justify-center');
        toggleBtn.textContent = 'Order Ticket';
        toggleBtn.setAttribute('aria-expanded', 'true');
    }
    setPanelOpenState(panel, true);
}

async function requestTradeFullscreen() {
    const shell = getTradeFullscreenShell();
    if (!shell || !shell.requestFullscreen) return;

    if (document.fullscreenElement && document.fullscreenElement !== shell) {
        await document.exitFullscreen();
    }

    await shell.requestFullscreen();
}

async function exitTradeFullscreen() {
    if (document.fullscreenElement) {
        await document.exitFullscreen();
    }
}

function toggleFullscreenOrderPanel() {
    if (!isTradeShellFullscreen()) return;
    if (isMobileFullscreenSplit()) return;
    if (window.innerWidth > 768) return;

    const panel = $('#tradePanel');
    const toggleBtn = $('#fullscreenOrderToggle');
    if (!panel || !toggleBtn) return;

    const isOpen = !panel.classList.contains(PANEL_OPEN_CLASS);
    setPanelOpenState(panel, isOpen);
    toggleBtn.textContent = isOpen ? 'Close Ticket' : 'Open Ticket';
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
}

function handleFullscreenChange() {
    const active = isTradeShellFullscreen();
    setFullscreenUiState(active);

    // Keep TradingView fully resized when entering/leaving fullscreen or pressing Esc.
    queueChartResize();
}

function initControls() {
    const select = $('#symbolSelect');
    const search = $('#symbolSearch');
    const fsBtn = $('#fullscreenBtn');
    const fsExitBtn = $('#fullscreenExitBtn');
    const fsOrderToggle = $('#fullscreenOrderToggle');
    const buyTab = $('#tabBuy');
    const sellTab = $('#tabSell');
    const orderBtn = $('#orderBtn');
    const qtyInput = $('#quantityInput');
    const levSelect = $('#leverageSelect');

    if (select) {
        select.addEventListener('change', async () => {
            const normalized = normalizeSymbol(select.value);
            if (!isValidTradeSymbol(normalized)) {
                showTradeError('Invalid symbol selected.');
                return;
            }

            currentSymbol = normalized;
            clearTradeError();

            try {
                await initChart(currentSymbol);
            } catch (error) {
                showTradeError(getUserFacingTradeError(error, 'Failed to load chart'));
                return;
            }

            const hasPrice = await updatePrice();
            if (!hasPrice) {
                showTradeError(`Price unavailable for ${currentSymbol}. Check the symbol and retry.`, 'warning');
            }
        });
    }

    if (search) {
        search.addEventListener('keydown', async (event) => {
            if (event.key !== 'Enter') return;

            const normalized = normalizeSymbol(search.value);
            if (!isValidTradeSymbol(normalized)) {
                showTradeError('Enter a valid symbol, for example BTCUSDT or BTC/USDT.');
                return;
            }

            currentSymbol = normalized;
            setupSymbolSelect(currentSymbol);
            clearTradeError();

            try {
                await initChart(currentSymbol);
            } catch (error) {
                showTradeError(getUserFacingTradeError(error, 'Failed to load chart'));
                return;
            }

            const hasPrice = await updatePrice();
            if (!hasPrice) {
                showTradeError(`Symbol ${currentSymbol} is not available on Binance.`, 'warning');
                return;
            }

            search.value = '';
        });
    }

    if (fsBtn) {
        fsBtn.addEventListener('click', async () => {
            try {
                if (isTradeShellFullscreen()) {
                    await exitTradeFullscreen();
                } else {
                    await requestTradeFullscreen();
                }
            } catch (error) {
                showTradeError(getUserFacingTradeError(error, 'Fullscreen failed'));
            }
        });
    }

    if (fsExitBtn) {
        fsExitBtn.addEventListener('click', async () => {
            try {
                await exitTradeFullscreen();
            } catch (error) {
                showTradeError(getUserFacingTradeError(error, 'Failed to exit fullscreen'));
            }
        });
    }

    if (fsOrderToggle) {
        fsOrderToggle.addEventListener('click', toggleFullscreenOrderPanel);
    }

    if (buyTab) {
        buyTab.addEventListener('click', () => {
            currentSide = 'BUY';
            setOrderButtonState();
        });
    }

    if (sellTab) {
        sellTab.addEventListener('click', () => {
            currentSide = 'SELL';
            setOrderButtonState();
        });
    }

    if (qtyInput) qtyInput.addEventListener('input', updateCalculations);
    if (levSelect) levSelect.addEventListener('change', updateCalculations);
    if (orderBtn) orderBtn.addEventListener('click', submitOrder);
}

async function submitOrder(event) {
    if (event?.preventDefault) event.preventDefault();
    if (orderInFlight) return;

    const qty = parseFloat($('#quantityInput')?.value);
    const leverage = parseFloat($('#leverageSelect')?.value) || 30;
    const orderBtn = $('#orderBtn');

    clearTradeError();
    // Guard against double submits while the async trade request is in-flight.
    orderInFlight = true;
    if (orderBtn) setButtonLoading(orderBtn, true);

    try {
        if (!Number.isFinite(qty) || qty <= 0) {
            showTradeError('Please enter a valid units value.');
            return;
        }

        if (!Number.isFinite(leverage) || leverage <= 0) {
            showTradeError('Please select a valid leverage value.');
            return;
        }

        currentSymbol = normalizeSymbol(currentSymbol);
        if (!isValidTradeSymbol(currentSymbol)) {
            showTradeError('Invalid trade symbol. Use symbols like BTCUSDT or ETHUSDT.');
            return;
        }

        if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
            const hasPrice = await updatePrice();
            if (!hasPrice) {
                showTradeError(`Price is unavailable for ${currentSymbol}. Please check the symbol and try again.`, 'warning');
                return;
            }
        }

        const sb = await getSupabase();
        const user = await getCurrentUser();
        if (!user) {
            showTradeError('Please log in to trade.');
            return;
        }

        await refreshAccountData();
        const existingPosition = await fetchOpenPositionBySymbol(sb, user.id, currentSymbol);

        let executionPrice;
        try {
            executionPrice = requireValidEntryPrice(currentPrice);
        } catch (error) {
            showTradeError(error.message, 'error', { error });
            return;
        }

        const notional = qty * executionPrice;
        const requiredMargin = notional / leverage;

        if (!Number.isFinite(requiredMargin) || requiredMargin <= 0) {
            showTradeError('Calculated margin is invalid. Please verify quantity and leverage.');
            return;
        }

        if (currentSide === 'BUY' && requiredMargin > freeMargin) {
            showTradeError(
                `Insufficient free margin. Required: ${formatCurrency(requiredMargin)}. Available: ${formatCurrency(freeMargin)}.`
            );
            return;
        }

        let normalizedSide;
        try {
            normalizedSide = normalizeSide(currentSide);
        } catch (error) {
            showTradeError(error.message, 'error', { error });
            return;
        }

        const positionSide = normalizedSide === 'sell' ? 'SELL' : 'BUY';

        const positionPayload = {
            userId: user.id,
            symbol: currentSymbol,
            side: positionSide,
            quantity: qty,
            entryPrice: executionPrice,
            leverage,
            requiredMargin,
            nowIso: new Date().toISOString(),
        };

        const orderPayload = {
            user_id: user.id,
            symbol: currentSymbol,
            side: normalizedSide,
            quantity: qty,
            price: executionPrice,
            leverage,
            type: 'MARKET',
            status: normalizeOrderStatus('filled'),
            total: notional,
        };

        const debugPayload = {
            order: orderPayload,
            position: positionPayload,
        };

        debugLog('Submitting order', {
            symbol: currentSymbol,
            side: currentSide,
            normalizedSide,
            qty,
            price: executionPrice,
            leverage,
            notional,
            requiredMargin,
            freeMargin,
        });

        let openedPosition = null;
        const finalizeOrder = async (resolvedPosition) => {
            if (positionSide === 'SELL' && Number.isFinite(resolvedPosition?.realizedPnl)) {
                orderPayload.pnl = resolvedPosition.realizedPnl;
            } else {
                delete orderPayload.pnl;
            }

            try {
                await insertOrderWithFallback(sb, orderPayload);
            } catch (orderError) {
                // Best-effort rollback when a brand new row was inserted.
                if (resolvedPosition?.mode === 'insert' && resolvedPosition?.row?.id) {
                    const { error: rollbackError } = await sb
                        .from('positions')
                        .delete()
                        .eq('id', resolvedPosition.row.id)
                        .eq('user_id', user.id);

                    if (rollbackError) {
                        throw new Error(
                            `Order write failed: ${String(orderError?.message || orderError)}. `
                            + `Rollback failed: ${String(rollbackError?.message || rollbackError)}.`
                        );
                    }
                }
                throw orderError;
            }

            if (Number.isFinite(resolvedPosition?.realizedPnl) && resolvedPosition.realizedPnl !== 0) {
                // Apply realized PnL to demo balance after a close/reduce.
                const nextBalance = cashBalance + resolvedPosition.realizedPnl;
                try {
                    await updateCashBalance(nextBalance);
                    cashBalance = nextBalance;
                } catch (balanceError) {
                    debugLog('Balance update failed', balanceError);
                    showToast('Balance update delayed. Refresh if needed.', 'warning');
                }
            }

            const sideLabel = currentSide === 'BUY' ? 'Buy' : 'Sell';
            const entryLabel = formatPrice(executionPrice);
            showToast(
                `Order placed: ${sideLabel} ${currentSymbol} ${qty.toLocaleString()} @ $${entryLabel}`,
                'success'
            );

            if (resolvedPosition?.mode === 'delete' && Number.isFinite(resolvedPosition?.realizedPnl)) {
                const pnlValue = resolvedPosition.realizedPnl;
                showToast(
                    `Position closed: ${currentSymbol} ${formatCurrency(pnlValue)}`,
                    pnlValue >= 0 ? 'success' : 'warning'
                );
            }

            const qtyInput = $('#quantityInput');
            if (qtyInput) qtyInput.value = '';

            await refreshBalanceState();
        };

        try {
            if (existingPosition && positionSide === 'BUY') {
                openedPosition = await applyBuyToExistingPosition(sb, existingPosition, positionPayload);
            } else if (existingPosition && positionSide === 'SELL') {
                openedPosition = await applySellToExistingPosition(sb, existingPosition, positionPayload);
            } else {
                openedPosition = await applyPositionChangeForOrder(sb, positionPayload);
            }
            debugLog('Position write successful', openedPosition);

            await finalizeOrder(openedPosition);
        } catch (error) {
            debugLog('Trade failed', error);

            const isDuplicate = isDuplicatePositionError(error);
            if (isDuplicate) {
                try {
                    const fallback = await fetchOpenPositionBySymbol(sb, user.id, currentSymbol);
                    if (fallback) {
                        const recovered = positionSide === 'BUY'
                            ? await applyBuyToExistingPosition(sb, fallback, positionPayload)
                            : await applySellToExistingPosition(sb, fallback, positionPayload);
                        await finalizeOrder(recovered);
                        return;
                    }
                } catch (recoveryError) {
                    debugLog('Duplicate recovery failed', recoveryError);
                    error = recoveryError;
                }
            }
            const userMessage = isDuplicate
                ? `An open position already exists for ${currentSymbol}.`
                : getUserFacingTradeError(error, 'Order failed');
            const toastMessage = formatToastError(error, userMessage);
            showTradeError(userMessage, 'error', {
                toastMessage,
                error,
                debugPayload,
                showActions: isDuplicate,
            });
        }
    } finally {
        orderInFlight = false;
        if (orderBtn) {
            setButtonLoading(orderBtn, false, currentSide === 'BUY' ? 'Buy / Long' : 'Sell / Short');
        }
    }
}

init();

