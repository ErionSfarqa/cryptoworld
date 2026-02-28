//  History JS 
import { initRouteGuard } from './router.js';
import { signOut, getCurrentUser } from './auth.js';
import { getSupabase } from './supabase.js';
import { formatPrice, formatCurrency, formatPercent, formatTime, cleanSymbol, $, $$, debounce } from './utils.js';
import { calculatePnl } from './utils/pnl.js';
import { showEmpty, showError } from './ui.js';
import { log } from './config.js';

let allOrders = [];
let currentSideFilter = 'all';

function getOrderTotal(order) {
    const explicitTotal = parseFloat(order?.total);
    if (Number.isFinite(explicitTotal)) return explicitTotal;

    const qty = parseFloat(order?.quantity) || 0;
    const price = parseFloat(order?.price) || 0;
    return qty * price;
}

function getOrderPnl(order) {
    const pnlRaw = parseFloat(order?.pnl);
    if (!Number.isFinite(pnlRaw)) {
        return { pnlAbs: null, pnlPct: null };
    }

    const qty = parseFloat(order?.quantity);
    const exitPrice = parseFloat(order?.price);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(exitPrice) || exitPrice <= 0) {
        return { pnlAbs: pnlRaw, pnlPct: 0 };
    }

    const orderSide = String(order?.side || '').toLowerCase();
    const positionSide = orderSide === 'buy' ? 'sell' : 'buy';
    const entryPrice = orderSide === 'buy'
        ? exitPrice + (pnlRaw / qty)
        : exitPrice - (pnlRaw / qty);

    const { pnlAbs, pnlPct } = calculatePnl({
        side: positionSide,
        entryPrice,
        price: exitPrice,
        quantity: qty,
    });

    return {
        pnlAbs: Number.isFinite(pnlAbs) ? pnlAbs : pnlRaw,
        pnlPct: Number.isFinite(pnlPct) ? pnlPct : 0,
    };
}

async function init() {
    const allowed = await initRouteGuard();
    if (!allowed) return;

    $('#logoutBtn').addEventListener('click', (e) => { e.preventDefault(); signOut(); });

    // Side filter
    const sideTabs = $$('#sideFilter [data-side]');
    sideTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            sideTabs.forEach((node) => {
                node.classList.remove('bg-accent/15', 'text-accent-light', 'hover:text-accent-light');
            });
            tab.classList.add('bg-accent/15', 'text-accent-light', 'hover:text-accent-light');
            currentSideFilter = tab.dataset.side;
            renderOrders();
        });
    });

    // Symbol filter
    $('#filterSymbol').addEventListener('input', debounce(renderOrders, 250));

    await loadOrders();
}

async function loadOrders() {
    const panel = $('#historyPanel');
    try {
        const sb = await getSupabase();
        const user = await getCurrentUser();
        if (!user) { showEmpty(panel, 'Log in to see trade history'); return; }

        const { data, error } = await sb.from('orders')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        allOrders = data || [];
        renderOrders();
        log('Orders loaded:', allOrders.length);
    } catch (e) {
        log('History error:', e.message);
        showError(panel, 'Failed to load trade history', loadOrders);
    }
}

function renderOrders() {
    const panel = $('#historyPanel');
    const symbolFilter = ($('#filterSymbol').value || '').trim().toUpperCase();
    const normalizedSideFilter = currentSideFilter === 'all' ? 'all' : String(currentSideFilter).toUpperCase();

    let filtered = allOrders;
    if (normalizedSideFilter !== 'all') {
        filtered = filtered.filter(o => String(o.side || '').toUpperCase() === normalizedSideFilter);
    }
    if (symbolFilter) {
        filtered = filtered.filter(o => o.symbol.includes(symbolFilter) || cleanSymbol(o.symbol).includes(symbolFilter));
    }

    if (filtered.length === 0) {
        showEmpty(panel, allOrders.length === 0 ? 'No trades yet. Start trading from the Trade page.' : 'No trades match your filters.');
        return;
    }

    const tableClass = 'w-full border-collapse';
    const thClass = 'px-4 py-3 text-left text-xs-78 font-semibold text-text-muted uppercase tracking-cw-05 font-body whitespace-nowrap border-b border-border';
    const tdClass = 'px-4 py-3.5 text-xs-9 whitespace-nowrap border-b border-accent/6';
    const rowClass = 'hover:bg-accent/4';
    const badgeBase = 'inline-flex items-center px-2.5 py-3px rounded-20 text-xs-75 font-semibold uppercase';

    let html = `<table class="${tableClass}">
    <thead><tr>
      <th class="${thClass}">Symbol</th>
      <th class="${thClass}">Side</th>
      <th class="${thClass}">Quantity</th>
      <th class="${thClass}">Price</th>
      <th class="${thClass}">Total</th>
      <th class="${thClass}">PnL</th>
      <th class="${thClass}">Time</th>
    </tr></thead><tbody>`;

    filtered.forEach(o => {
        const total = getOrderTotal(o);
        const sideLabel = String(o.side || '').toUpperCase();
        const badgeClass = sideLabel === 'BUY' ? 'bg-success/12 text-success' : 'bg-danger/12 text-danger';
        const pnlInfo = getOrderPnl(o);
        const pnlClass = pnlInfo.pnlAbs == null ? 'text-text-muted' : (pnlInfo.pnlAbs >= 0 ? 'text-success' : 'text-danger');
        const pnlDisplay = pnlInfo.pnlAbs == null
            ? '--'
            : `${formatCurrency(pnlInfo.pnlAbs)}<div class="text-xs-7">${formatPercent(pnlInfo.pnlPct)}</div>`;

        html += `<tr class="${rowClass}">
      <td class="${tdClass}"><strong>${cleanSymbol(o.symbol)}</strong><br><span class="text-xs-75 text-text-muted">${o.symbol}</span></td>
      <td class="${tdClass}"><span class="${badgeBase} ${badgeClass}">${sideLabel}</span></td>
      <td class="${tdClass}">${o.quantity}</td>
      <td class="${tdClass}">$${formatPrice(o.price)}</td>
      <td class="${tdClass}">${formatCurrency(total)}</td>
      <td class="${tdClass} ${pnlClass}">${pnlDisplay}</td>
      <td class="${tdClass}">${formatTime(o.created_at)}</td>
    </tr>`;
    });

    html += '</tbody></table>';
    panel.innerHTML = html;
}

init();

