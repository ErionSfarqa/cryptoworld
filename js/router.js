//  Router / Route Guards 
import { getSession } from './supabase.js';
import { log } from './config.js';

const path = window.location.pathname;

export function isAppPage() {
    return path.includes('/app/');
}

export function isAuthPage() {
    return path.includes('/auth/');
}

export function isLandingPage() {
    return path === '/' || path.endsWith('/index.html') || path === '';
}

export async function initRouteGuard() {
    try {
        const session = await getSession();
        log('Route guard - path:', path, 'session:', !!session);

        if (isAppPage() && !session) {
            const next = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = '../auth/login.html?next=' + next;
            return false;
        }

        if (isAuthPage() && session) {
            window.location.href = '../app/dashboard.html';
            return false;
        }

        return true;
    } catch (e) {
        log('Route guard error:', e.message);
        // If supabase fails to load, allow page to continue but with limited functionality
        if (isAppPage()) {
            window.location.href = '../auth/login.html';
            return false;
        }
        return true;
    }
}

export function navigateTo(url) {
    window.location.href = url;
}


