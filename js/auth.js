// Auth Module
import { getSupabase, getSession } from './supabase.js';
import { log } from './config.js';
import { showToast } from './ui.js';

const DEFAULT_BALANCE = 10000;

if (typeof window !== 'undefined') {
    window.DEBUG_LAYOUT = false;
    window.checkLayout = () => {
        const outlineClasses = ['outline', 'outline-1', 'outline-dashed', 'outline-accent/60'];
        document.querySelectorAll('*').forEach((el) => {
            el.classList.add(...outlineClasses);
            console.log(el.tagName, el.className, el.offsetHeight);
        });
    };
}

export async function checkDbSchema() {
    const sb = await getSupabase();
    const user = await getCurrentUser();
    if (!user) return;

    const { error } = await sb.from('profiles').select('cash_balance').eq('id', user.id).maybeSingle();

    if (error && error.message.includes('column')) {
        console.error('SCHEMA ERROR: cash_balance missing');
        showToast('DB schema is missing "cash_balance". Run supabase_migration.sql.', 'error', 15000);
        return false;
    }

    return true;
}

export function calcPasswordStrength(pw) {
    let score = 0;
    if (!pw) return { score: 0, label: '', level: 0 };

    if (pw.length >= 6) score++;
    if (pw.length >= 10) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    let level;
    let label;

    if (score <= 2) {
        level = 1;
        label = 'Weak';
    } else if (score <= 3) {
        level = 2;
        label = 'Fair';
    } else if (score <= 4) {
        level = 3;
        label = 'Strong';
    } else {
        level = 4;
        label = 'Very strong';
    }

    return { score, label, level };
}

export async function signUp(email, password) {
    const sb = await getSupabase();
    log('Signing up:', email);

    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;

    if (data.user) {
        try {
            await sb.from('profiles').upsert({
                id: data.user.id,
                email: data.user.email,
                cash_balance: DEFAULT_BALANCE,
                created_at: new Date().toISOString(),
            }, { onConflict: 'id' });

            log('Profile row created with $' + DEFAULT_BALANCE + ' demo balance');
        } catch (upsertError) {
            log('Profile insert failed (non-critical):', upsertError.message);
        }
    }

    return data;
}

export async function signIn(email, password) {
    const sb = await getSupabase();
    log('Signing in:', email);

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (data.user) {
        try {
            await sb.from('profiles').upsert({
                id: data.user.id,
                email: data.user.email,
                cash_balance: DEFAULT_BALANCE,
                created_at: new Date().toISOString(),
            }, { onConflict: 'id', ignoreDuplicates: true });
        } catch (upsertError) {
            log('Profile ensure failed (non-critical):', upsertError.message);
        }
    }

    return data;
}

export async function signOut() {
    const sb = await getSupabase();
    log('Signing out');

    const { error } = await sb.auth.signOut();
    if (error) throw error;

    window.location.href = '../auth/login.html';
}

export async function getCurrentUser() {
    const session = await getSession();
    return session?.user || null;
}

export async function getCashBalance() {
    const sb = await getSupabase();
    const user = await getCurrentUser();
    if (!user) return 0;

    const { data, error } = await sb.from('profiles').select('cash_balance').eq('id', user.id).single();

    if (error || !data) {
        log('Balance fetch failed, returning default');
        return DEFAULT_BALANCE;
    }

    return parseFloat(data.cash_balance) || DEFAULT_BALANCE;
}

export async function updateCashBalance(newBalance) {
    const sb = await getSupabase();
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await sb.from('profiles').update({ cash_balance: newBalance }).eq('id', user.id);
    if (error) throw error;

    log('Balance updated to $' + newBalance.toFixed(2));
}

export async function resetDemoBalance() {
    const sb = await getSupabase();
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await sb.from('profiles').update({ cash_balance: DEFAULT_BALANCE }).eq('id', user.id);
    if (error) throw error;

    log('Demo balance reset to $' + DEFAULT_BALANCE);
    return DEFAULT_BALANCE;
}
