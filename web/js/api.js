import { isDemoMode, handleDemoApi, initDemoToolbar } from './demo_mock.js';

export const API_URL = 'api.php';

let csrfToken = null;
let onUnauthorizedCallback = null;

export function setCsrfToken(token) {
    csrfToken = token;
}

export function getCsrfToken() {
    return csrfToken;
}

export function setOnUnauthorized(callback) {
    onUnauthorizedCallback = callback;
}

/**
 * Centralized fetch wrapper with CSRF injection, automatic 401 handling,
 * conflict reporting (409), and resilient timeouts.
 */
export async function apiFetch(action, opts = {}) {
    if (isDemoMode) {
        initDemoToolbar();
        try {
            return await handleDemoApi(action, opts);
        } catch (err) {
            if (err.status === 401 || err.message === 'auth') {
                if (typeof onUnauthorizedCallback === 'function') {
                    onUnauthorizedCallback(action);
                }
            }
            throw err;
        }
    }

    const headers = opts.headers ? { ...opts.headers } : {};

    if (opts.method === 'POST' && csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
    }

    const signal = opts.signal || (AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined);

    const res = await fetch(`${API_URL}?action=${action}`, { ...opts, headers, signal });

    if (res.status === 401) {
        if (typeof onUnauthorizedCallback === 'function') {
            onUnauthorizedCallback(action);
        }
        throw new Error('auth');
    }

    if (res.status === 409) {
        const lockData = await res.json();
        throw new Error(lockData.message || 'Action blocked by another user');
    }

    if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
    }

    const text = await res.text();
    if (!text || !text.trim()) {
        throw new Error('Empty response from server');
    }

    try {
        return JSON.parse(text);
    } catch (err) {
        throw new Error(`Invalid JSON: ${text.slice(0, 120)}`);
    }
}

/**
 * Fetch public application configuration.
 */
export async function fetchPublicConfig() {
    try {
        return await apiFetch('config');
    } catch (e) {
        return null;
    }
}
