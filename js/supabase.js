// Supabase Client
import { SUPABASE_URL, SUPABASE_ANON_KEY, log } from './config.js';

let _supabase = null;
let _initPromise = null;

function _init() {
    if (_initPromise) return _initPromise;

    _initPromise = new Promise((resolve, reject) => {
        if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'YOUR_ANON_KEY_HERE') {
            const warn = document.createElement('div');
            warn.className =
                'fixed top-0 left-0 right-0 z-[99999] bg-danger text-white font-semibold text-center px-5 py-3 font-body';
            warn.innerHTML = 'Supabase anon key is missing. Auth is disabled. Set SUPABASE_ANON_KEY in js/config.js.';
            document.body.prepend(warn);
            reject(new Error('Supabase anon key not configured'));
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        script.onload = () => {
            _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            log('Supabase client initialized');
            resolve(_supabase);
        };
        script.onerror = () => reject(new Error('Failed to load Supabase SDK'));
        document.head.appendChild(script);
    });

    return _initPromise;
}

export async function getSupabase() {
    if (_supabase) return _supabase;
    return _init();
}

export async function getSession() {
    const sb = await getSupabase();
    const { data: { session }, error } = await sb.auth.getSession();

    if (error) {
        log('getSession error:', error.message);
        return null;
    }

    return session;
}

export async function getUser() {
    const session = await getSession();
    return session?.user || null;
}

export async function onAuthStateChange(callback) {
    const sb = await getSupabase();
    sb.auth.onAuthStateChange((event, session) => {
        log('Auth state change:', event);
        callback(event, session);
    });
}
