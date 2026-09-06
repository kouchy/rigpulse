/**
 * RigPulse — Authentication & Session Manager (js/auth.js)
 */

import { API_URL, apiFetch, setCsrfToken, setOnUnauthorized } from './api.js';
import { state } from './state.js';
import { elements, updateUserRoleUI, setOfflineMode, dismissCyberLoader } from './ui.js';

let onAuthSuccessCallback = null;
let onLogoutCallback = null;

export function initAuth({ onAuthSuccess, onLogout }) {
    onAuthSuccessCallback = onAuthSuccess;
    onLogoutCallback = onLogout;

    // Register 401 unauth handler with transient glitch protection
    setOnUnauthorized(async (action) => {
        if (elements.lockScreen && elements.lockScreen.style.display === 'flex') {
            return;
        }

        // Authoritative status check or initial auth failure -> lock immediately
        if (action === 'status' || !state.authenticated) {
            showLockScreen(false);
            return;
        }

        // For background telemetry (sysinfo, sunshine, etc.), confirm session status before locking
        try {
            await apiFetch('status');
        } catch (e) {
            if (e.message === 'auth' || e.status === 401) {
                showLockScreen(false);
            }
        }
    });

    // Form submit listener
    if (elements.lockForm) {
        elements.lockForm.addEventListener('submit', handleLogin);
    }

    // Logout button listener
    if (elements.logoutToggle) {
        elements.logoutToggle.addEventListener('click', logout);
    }
}

export function showLockScreen(forceReset = false) {
    const isAlreadyLocked = elements.lockScreen && elements.lockScreen.style.display === 'flex';

    state.authenticated = false;
    state.userRole = 'user';
    setCsrfToken(null);
    dismissCyberLoader();

    if (typeof onLogoutCallback === 'function') {
        onLogoutCallback();
    }

    if (elements.lockScreen) elements.lockScreen.style.display = 'flex';
    if (elements.mainContainer) elements.mainContainer.style.display = 'none';
    if (elements.refreshToggle) elements.refreshToggle.style.display = 'none';
    if (elements.gpuToggleBtn) elements.gpuToggleBtn.style.display = 'none';
    if (elements.historyToggle) elements.historyToggle.style.display = 'none';
    if (elements.diagnosticsToggle) elements.diagnosticsToggle.style.display = 'none';
    if (elements.logoutToggle) elements.logoutToggle.style.display = 'none';

    if (elements.lockTitle) {
        if (state.targetName) {
            elements.lockTitle.textContent = `${state.targetName.toUpperCase()} ACCESS IS RESTRICTED`;
        } else {
            apiFetch('config').then(cfg => {
                if (cfg && cfg.target && cfg.target.name) {
                    state.targetName = cfg.target.name;
                    if (elements.lockTitle) {
                        elements.lockTitle.textContent = `${cfg.target.name.toUpperCase()} ACCESS IS RESTRICTED`;
                    }
                }
            }).catch(() => {});
        }
    }

    if (!isAlreadyLocked || forceReset) {
        if (elements.lockPassword) elements.lockPassword.value = '';
        if (elements.lockError) {
            elements.lockError.textContent = '';
            elements.lockError.className = 'lock-error';
        }
        if (elements.lockSubmit) {
            elements.lockSubmit.disabled = false;
            const submitText = elements.lockSubmit.querySelector('.lock-submit-text');
            if (submitText) submitText.textContent = 'AUTHENTICATE';
        }
        if (elements.lockPassword) elements.lockPassword.focus();
    }
}

export function onAuthenticated() {
    state.authenticated = true;
    dismissCyberLoader();
    if (elements.lockScreen) elements.lockScreen.style.display = 'none';
    if (elements.mainContainer) elements.mainContainer.style.display = 'flex';

    updateUserRoleUI();

    if (state.isOffline) {
        setOfflineMode(false);
    }

    if (typeof onAuthSuccessCallback === 'function') {
        onAuthSuccessCallback();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const password = elements.lockPassword ? elements.lockPassword.value : '';
    if (!password) return;

    if (elements.lockSubmit) {
        elements.lockSubmit.disabled = true;
        const textSpan = elements.lockSubmit.querySelector('.lock-submit-text');
        if (textSpan) textSpan.textContent = 'VERIFYING…';
    }
    if (elements.lockError) {
        elements.lockError.textContent = '';
        elements.lockError.className = 'lock-error';
    }

    try {
        const data = await apiFetch('auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        });

        if (data.success) {
            if (data.csrf_token) setCsrfToken(data.csrf_token);
            if (data.role) state.userRole = data.role;

            if (elements.lockError) {
                elements.lockError.textContent = '✓ Access granted' + (state.userRole === 'admin' ? ' (Admin)' : '');
                elements.lockError.className = 'lock-error success';
            }

            setTimeout(() => {
                onAuthenticated();
            }, 500);
        } else {
            if (elements.lockError) {
                elements.lockError.textContent = data.message || 'Authentication failed';
                if (data.remaining !== undefined && data.remaining <= 2) {
                    elements.lockError.textContent += ` (${data.remaining} attempts remaining)`;
                }
                elements.lockError.className = 'lock-error visible';
            }
            if (elements.lockPassword) {
                elements.lockPassword.value = '';
                elements.lockPassword.focus();
            }
        }
    } catch (err) {
        if (elements.lockError) {
            elements.lockError.textContent = 'Failed to reach API';
            elements.lockError.className = 'lock-error visible';
        }
    }

    if (elements.lockSubmit) {
        elements.lockSubmit.disabled = false;
        const textSpan = elements.lockSubmit.querySelector('.lock-submit-text');
        if (textSpan) textSpan.textContent = 'AUTHENTICATE';
    }
}

export async function logout() {
    try {
        await apiFetch('logout', { method: 'POST' });
    } catch (err) { /* ignore */ }
    showLockScreen(true);
}
