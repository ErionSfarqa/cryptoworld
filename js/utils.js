//  Utils 
export function formatCurrency(n, decimals = 2) {
    if (n == null || isNaN(n)) return '$0.00';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
    return '$' + Number(n).toFixed(decimals);
}

export function formatPrice(n) {
    if (n == null || isNaN(n)) return '0.00';
    const num = Number(n);
    if (num >= 1000) return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (num >= 1) return num.toFixed(4);
    if (num >= 0.01) return num.toFixed(6);
    return num.toFixed(8);
}

export function formatPercent(n) {
    if (n == null || isNaN(n)) return '0.00%';
    const sign = Number(n) >= 0 ? '+' : '';
    return sign + Number(n).toFixed(2) + '%';
}

export function formatTime(ts) {
    return new Date(ts).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

export function formatDate(ts) {
    return new Date(ts).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
    });
}

export function debounce(fn, ms = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function throttle(fn, ms = 200) {
    let last = 0;
    return (...args) => {
        const now = Date.now();
        if (now - last >= ms) { last = now; fn(...args); }
    };
}

export function $(sel, parent = document) {
    return parent.querySelector(sel);
}

export function $$(sel, parent = document) {
    return [...parent.querySelectorAll(sel)];
}

export function createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
        if (k === 'className') el.className = v;
        else if (k === 'innerHTML') el.innerHTML = v;
        else if (k === 'textContent') el.textContent = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
        else el.setAttribute(k, v);
    });
    children.forEach(c => {
        if (typeof c === 'string') el.appendChild(document.createTextNode(c));
        else if (c) el.appendChild(c);
    });
    return el;
}

export function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

export function setQueryParam(name, value) {
    const url = new URL(window.location);
    url.searchParams.set(name, value);
    window.history.replaceState({}, '', url);
}

export function classIf(condition, cls) {
    return condition ? cls : '';
}

export function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

export function normalizeSide(inputSide) {
    const raw = String(inputSide ?? '').trim().toLowerCase();
    if (!raw) throw new Error('Invalid side value. Must be buy or sell.');
    if (raw === 'buy' || raw === 'long') return 'buy';
    if (raw === 'sell' || raw === 'short') return 'sell';
    throw new Error('Invalid side value. Must be buy or sell.');
}

// Crypto symbol helpers
export function cleanSymbol(s) {
    return s.replace('USDT', '');
}

export function isLeveragedToken(symbol) {
    return /UP|DOWN|BULL|BEAR/i.test(symbol.replace('USDT', ''));
}

export function symbolIcon(base) {
    // Returns a Tailwind background class for token placeholders
    const colors = {
        BTC: 'bg-token-btc', ETH: 'bg-token-eth', BNB: 'bg-token-bnb', SOL: 'bg-token-sol',
        XRP: 'bg-token-xrp', ADA: 'bg-token-ada', DOGE: 'bg-token-doge', DOT: 'bg-token-dot',
        AVAX: 'bg-token-avax', MATIC: 'bg-token-matic', LINK: 'bg-token-link', UNI: 'bg-token-uni',
        SHIB: 'bg-token-shib', LTC: 'bg-token-ltc', ATOM: 'bg-token-atom', FIL: 'bg-token-fil',
        APT: 'bg-token-apt', ARB: 'bg-token-arb', OP: 'bg-token-op', NEAR: 'bg-token-near',
        TRX: 'bg-token-trx', PEPE: 'bg-token-pepe', WIF: 'bg-token-wif', SUI: 'bg-token-sui',
    };
    return colors[base] || 'bg-token-default';
}


