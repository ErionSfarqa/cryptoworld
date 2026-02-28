// PnL utilities
export function calculatePnl({ side, entryPrice, price, quantity }) {
    const entry = parseFloat(entryPrice);
    const current = parseFloat(price);
    const qty = parseFloat(quantity);

    if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(current) || current <= 0 || !Number.isFinite(qty) || qty <= 0) {
        return { pnlAbs: 0, pnlPct: 0 };
    }

    const normalized = String(side || '').toLowerCase();
    const isShort = normalized === 'sell' || normalized === 'short';
    const pnlAbs = isShort ? (entry - current) * qty : (current - entry) * qty;
    const base = entry * qty;
    const pnlPct = base > 0 ? (pnlAbs / base) * 100 : 0;

    return { pnlAbs, pnlPct };
}
