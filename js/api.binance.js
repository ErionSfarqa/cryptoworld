//  Binance API Module 
import { BINANCE_BASE, log } from './config.js';

const MAX_RETRIES = 3;
const TIMEOUT_MS = 10000;

async function fetchWithRetry(url, retries = MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            log('Binance fetch OK:', url.split('?')[0]);
            return data;
        } catch (e) {
            log(`Binance fetch attempt ${i + 1} failed:`, e.message);
            if (i === retries - 1) throw new Error('Failed to fetch Binance data. Please try again.');
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

// Fetch 24hr ticker data for all symbols
export async function fetch24hrTickers() {
    const data = await fetchWithRetry(`${BINANCE_BASE}/ticker/24hr`);
    return data;
}

// Filter and sort USDT pairs
export function filterUSDTPairs(tickers) {
    return tickers
        .filter(t => t.symbol.endsWith('USDT'))
        .filter(t => !isLeveragedToken(t.symbol));
}

function isLeveragedToken(symbol) {
    const base = symbol.replace('USDT', '');
    return /UP$|DOWN$|BULL$|BEAR$/i.test(base);
}

export function sortByVolume(tickers) {
    return [...tickers].sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
}

export function sortByChange(tickers, asc = false) {
    return [...tickers].sort((a, b) => {
        const diff = parseFloat(a.priceChangePercent) - parseFloat(b.priceChangePercent);
        return asc ? diff : -diff;
    });
}

export function getTopByVolume(tickers, n = 30) {
    return sortByVolume(filterUSDTPairs(tickers)).slice(0, n);
}

export function getTopGainers(tickers, n = 20) {
    return sortByChange(filterUSDTPairs(tickers), false).slice(0, n);
}

export function getTopLosers(tickers, n = 20) {
    return sortByChange(filterUSDTPairs(tickers), true).slice(0, n);
}

// Fetch klines (candlestick data)
export async function fetchKlines(symbol = 'BTCUSDT', interval = '1h', limit = 200) {
    const data = await fetchWithRetry(
        `${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    return data.map(k => ({
        time: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: k[6],
    }));
}

// Fetch single ticker price
export async function fetchPrice(symbol = 'BTCUSDT') {
    const data = await fetchWithRetry(`${BINANCE_BASE}/ticker/price?symbol=${symbol}`);
    return parseFloat(data.price);
}

// Fetch multiple prices
export async function fetchPrices(symbols) {
    const all = await fetchWithRetry(`${BINANCE_BASE}/ticker/price`);
    const map = {};
    all.forEach(t => { map[t.symbol] = parseFloat(t.price); });
    const result = {};
    symbols.forEach(s => { if (map[s]) result[s] = map[s]; });
    return result;
}

