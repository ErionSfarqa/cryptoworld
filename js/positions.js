// Positions JS
import { initRouteGuard } from './router.js';
import { signOut, getCurrentUser } from './auth.js';
import { getSupabase } from './supabase.js';
import { fetchPrice, fetchPrices } from './api.binance.js';
import { formatPrice, formatCurrency, formatPercent, cleanSymbol, normalizeSide, symbolIcon, $ } from './utils.js';
import { calculatePnl } from './utils/pnl.js';
import { showEmpty, showError, showToast, setButtonLoading } from './ui.js';
import { log } from './config.js';

let initialized = false;
let refreshIntervalId = null;
const VALID_ORDER_STATUSES = new Set(['open', 'filled', 'cancelled']);

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

function getPositionSize(position) {
    const raw = position?.size ?? position?.quantity ?? 0;
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : 0;
}

function getPositionSide(position) {
    const normalized = String(position?.side || '').toUpperCase();
    return normalized === 'SELL' || normalized === 'SHORT' ? 'SELL' : 'BUY';
}

const normalizeOrderStatus = (status) => {
    if (status === null || status === undefined) return 'filled';
    const normalized = String(status).trim().toLowerCase();
    if (!normalized) return 'filled';
    return VALID_ORDER_STATUSES.has(normalized) ? normalized : 'filled';
};

function getUserFacingPositionsError(error, fallback) {
    const msg = getErrorMessage(error);

    const missingCloseColumns = hasMissingColumn(error, 'positions', 'exit_price')
        || hasMissingColumn(error, 'positions', 'closed_at')
        || hasMissingColumn(error, 'positions', 'pnl')
        || hasMissingColumn(error, 'positions', 'opened_at');

    const missingCloseFunction = msg.includes('close_position') && msg.includes('does not exist');

    if (hasMissingColumn(error, 'positions', 'entry_price') || missingCloseColumns || missingCloseFunction || msg.includes('schema cache') || error?.code === '42703') {
        return 'Trading schema is out of date. Please run supabase_migration.sql.';
    }

    if (msg.includes('row-level security') || msg.includes('permission denied')) {
        return 'Permission denied. Please log in again.';
    }

    return fallback;
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

    await loadPositions();
    startAutoRefresh();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', cleanup, { once: true });
}

function cleanup() {
    stopAutoRefresh();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
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
    refreshIntervalId = setInterval(() => {
        loadPositions();
    }, 5000);
}

function stopAutoRefresh() {
    if (!refreshIntervalId) return;
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
}

async function loadPositions() {
    const panel = $('#positionsPanel');
    if (!panel) return;

    try {
        const sb = await getSupabase();
        const user = await getCurrentUser();
        if (!user) {
            showEmpty(panel, 'Log in to see positions');
            return;
        }

        const positions = await fetchOpenPositions(sb, user.id);
        if (!positions || positions.length === 0) {
            showEmpty(panel, 'No open positions. Start trading from the Trade page.');
            return;
        }

        positions.sort((a, b) => {
            const aTs = new Date(a.updated_at || a.created_at || 0).getTime();
            const bTs = new Date(b.updated_at || b.created_at || 0).getTime();
            return bTs - aTs;
        });

        const symbols = [...new Set(positions.map((p) => p.symbol))];
        const prices = await fetchPrices(symbols);
        renderPositions(positions, prices);
        log('Positions loaded:', positions.length);
    } catch (e) {
        log('Positions error:', e.message);
        showError(panel, getUserFacingPositionsError(e, 'Failed to load positions'), loadPositions);
    }
}

function renderPositions(positions, prices) {
    const panel = $('#positionsPanel');
    if (!panel) return;

    const headerRowClass = 'grid grid-cols-[1.5fr_0.5fr_1fr_1fr_1fr_1fr_1fr_80px] items-center px-6 py-3.5 border-b border-border text-xs-75 font-semibold text-text-muted uppercase tracking-cw-05';
    const rowClass = 'grid grid-cols-[1.5fr_0.5fr_1fr_1fr_1fr_1fr_1fr_80px] items-center px-6 py-3.5 border-b border-accent/6';
    const badgeBase = 'inline-flex items-center px-2.5 py-3px rounded-20 text-xs-75 font-semibold uppercase';
    const closeBtnClass = 'inline-flex items-center justify-center gap-2 font-body text-xs-85 font-semibold py-2 px-4 rounded-cw-sm cursor-pointer transition-all duration-250 ease-cw-ease relative overflow-hidden no-underline whitespace-nowrap bg-accent/10 text-accent-light border border-border hover:bg-accent/18 hover:border-border-hover hover:-translate-y-px';

    let html = `<div class="${headerRowClass}">
    <div>Symbol</div>
    <div>Side</div>
    <div>Units</div>
    <div>Entry</div>
    <div>Mark</div>
    <div>Margin</div>
    <div>PnL</div>
    <div></div>
  </div>`;

    positions.forEach((p) => {
        const base = cleanSymbol(p.symbol);
        const entry = getPositionEntryPrice(p);
        const current = prices[p.symbol] || entry;
        const qty = getPositionSize(p);
        const side = getPositionSide(p);
        const margin = parseFloat(p.margin_required || 0);

        const { pnlAbs, pnlPct } = calculatePnl({
            side,
            entryPrice: entry,
            price: current,
            quantity: qty,
        });

        const changeClass = pnlAbs >= 0 ? 'text-success' : 'text-danger';
        const badgeClass = side === 'BUY' ? 'bg-success/12 text-success' : 'bg-danger/12 text-danger';
        html += `<div class="${rowClass}">
      <div class="flex items-center gap-2">
        <div class="${symbolIcon(base)} w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs-7 text-white shrink-0">${base.slice(0, 2)}</div>
        <div class="text-xs-92 font-semibold">${base} <span class="text-xs-75 opacity-70 font-normal">${p.leverage || 30}x</span></div>
      </div>
      <div>
        <span class="${badgeBase} ${badgeClass}">${side}</span>
      </div>
      <div class="text-xs-9">${qty.toLocaleString()}</div>
      <div class="text-xs-85 text-text-muted">${formatPrice(entry)}</div>
      <div class="text-xs-85">${formatPrice(current)}</div>
      <div class="text-xs-85">${formatCurrency(margin)}</div>
      <div class="font-semibold ${changeClass}">
        ${formatCurrency(pnlAbs)}
        <div class="text-xs-7">${formatPercent(pnlPct)}</div>
      </div>
      <div>
        <button type="button" class="${closeBtnClass}" data-close-position data-position-id="${p.id}">Close</button>
      </div>
    </div>`;
    });

    panel.innerHTML = html;
    panel.querySelectorAll('[data-close-position]').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            const target = event.currentTarget;
            closePosition(target.dataset.positionId, target);
        });
    });
}

async function insertOrderWithFallback(sb, payload) {
    const optionalColumns = ['total', 'leverage', 'type', 'pnl'];
    const record = { ...payload };
    record.status = normalizeOrderStatus(record.status);

    while (true) {
        const { error } = await sb.from('orders').insert(record);
        if (!error) return;

        const msg = (error.message || '').toLowerCase();
        const missingColumn = optionalColumns.find((key) => {
            return msg.includes(`column "${key}"`) || msg.includes(`column ${key}`);
        });

        if (!missingColumn || !(missingColumn in record)) {
            throw error;
        }

        delete record[missingColumn];
    }
}

async function closePosition(positionId, btn) {
    if (!confirm('Close this position?')) return;
    setButtonLoading(btn, true);
    let symbol = 'position';

    try {
        const sb = await getSupabase();
        const user = await getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        const { data: pos, error: posError } = await sb
            .from('positions')
            .select('*')
            .eq('id', positionId)
            .eq('user_id', user.id)
            .single();
        if (posError || !pos) throw posError || new Error('Position not found');

        symbol = pos.symbol;
        const qty = getPositionSize(pos);
        const entry = getPositionEntryPrice(pos);
        const side = getPositionSide(pos);
        const price = await fetchPrice(symbol);

        if (!entry || entry <= 0) {
            throw new Error('Position entry price is unavailable');
        }

        if (!qty || qty <= 0) {
            throw new Error('Position size is unavailable');
        }

        if (!price || price <= 0) {
            throw new Error('Latest price is unavailable');
        }

        const { pnlAbs: expectedPnl } = calculatePnl({
            side,
            entryPrice: entry,
            price,
            quantity: qty,
        });

        const { data: closeData, error: closeError } = await sb.rpc('close_position', {
            p_position_id: positionId,
            p_exit_price: price,
        });
        if (closeError) throw closeError;

        const closeResult = Array.isArray(closeData) ? closeData[0] : closeData;
        if (!closeResult) throw new Error('No close result returned');

        const pnlValue = parseFloat(closeResult.pnl);
        const pnl = Number.isFinite(pnlValue) ? pnlValue : expectedPnl;

        try {
            const closeSide = normalizeSide(side === 'BUY' ? 'SELL' : 'BUY');
            await insertOrderWithFallback(sb, {
                user_id: user.id,
                symbol,
                side: closeSide,
                quantity: qty,
                price,
                leverage: pos.leverage || 30,
                type: 'MARKET',
                status: normalizeOrderStatus('filled'),
                total: qty * price,
                pnl,
            });
        } catch (orderError) {
            console.error('[CW] Failed to write close order history', {
                positionId,
                symbol,
                error: orderError,
            });
        }

        showToast(
            `Position closed: ${symbol} ${formatCurrency(pnl)}`,
            pnl >= 0 ? 'success' : 'warning'
        );
        await loadPositions();
    } catch (e) {
        console.error('[CW] Close position failed', {
            positionId,
            error: e,
        });
        log('Close failed:', e.message || e);
        const reason = getUserFacingPositionsError(e, 'Failed to close position');
        showToast(`Failed to close ${symbol}: ${reason}`, 'error');
    } finally {
        if (btn && btn.isConnected) {
            setButtonLoading(btn, false, 'Close');
        }
    }
}

init();

