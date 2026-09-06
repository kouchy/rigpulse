/**
 * RigPulse — Application Orchestrator & Master Controller (js/app.js)
 */

import { API_URL, apiFetch, setCsrfToken } from './api.js';
import { state } from './state.js';
import {
    elements,
    showMessage,
    setOfflineMode,
    updateDiagnosticsButtonState,
    updateUserRoleUI,
    hideSysinfoPanel,
    dismissCyberLoader
} from './ui.js';
import { initAuth, showLockScreen, onAuthenticated } from './auth.js';
import { initPower, isWakeUpAction, exitBootingMode, stopSendingAction, hideShutdownModal } from './power.js';
import {
    initSunshine,
    checkSunshine,
    hideSunshineBar,
    setClientIsLocal,
    clientIsLocal,
    sunshineIsRunning,
    updateSunshinePingUI,
    measureSunshinePing
} from './sunshine.js';
import { initHistory, closeHistory } from './history.js';
import {
    initDiagnostics,
    applyConfiguredDefaultGpuMode,
    closeDiagnostics,
    checkUptime,
    checkSysinfo,
    updateMetricBtnUI,
    updatePipelineBtnUI,
    stopDiagPipeline,
    startDiagPipeline,
    renderPingSparkline
} from './diagnostics.js';
import {
    initHero,
    setHeroName,
    setHeroDomain,
    setHeroState,
    triggerRadiationPulse
} from './hero.js';

let statusRequestId = 0;
let lastResumeTime = 0;

// ─── Master Polling Routine ───────────────────────────────────
async function checkStatus() {
    if (state.isOffline) return;

    const reqId = ++statusRequestId;
    const t0 = performance.now();
    try {
        const data = await apiFetch('status');
        if (reqId !== statusRequestId) return;

        const pingMs = Math.round(performance.now() - t0);
        if (data.csrf_token) setCsrfToken(data.csrf_token);
        if (data.role && data.role !== state.userRole) {
            state.userRole = data.role;
            updateUserRoleUI();
        }
        if (data.client_is_local !== undefined) {
            const wasLocal = clientIsLocal;
            setClientIsLocal(Boolean(data.client_is_local));
            if (wasLocal !== clientIsLocal && state.machineIsUp && sunshineIsRunning) {
                measureSunshinePing(true).then(() => {
                    updateSunshinePingUI();
                    if (state.diagnosticsOpen) renderPingSparkline();
                });
            }
        }
        state.lastPowerAction = data.last_power_action || null;

        if (state.isOffline) {
            setOfflineMode(false);
            if (elements.powerBtn) elements.powerBtn.disabled = false;
        }
        updateUI(data.status === 'up', data.ip, data.ssh_ready || false, pingMs);
    } catch (e) {
        if (reqId !== statusRequestId) return;
        if (e.message === 'auth') return;
        enterOfflineMode();
    }
}

function updateUI(isUp, ip, sshUp, pingMs) {
    const wasMachineUp = state.machineIsUp;
    const wasSshReady = state.sshReady;
    state.machineIsUp = isUp;
    state.sshReady = sshUp;
    updateDiagnosticsButtonState();
    if (!isUp && state.diagnosticsOpen) closeDiagnostics();

    if (state.isBooting && isUp && sshUp) exitBootingMode(true);

    const isFullyUp = !state.isBooting && isUp;

    const statusText = isFullyUp
        ? 'ONLINE'
        : state.isBooting
            ? (state.bootIsWakeUp ? 'WAKING UP…' : 'BOOTING…')
            : (isUp ? 'STARTING…' : 'OFFLINE');

    const panelClass = isFullyUp
        ? 'up'
        : state.isBooting
            ? 'booting'
            : (isUp ? 'booting' : 'down');

    if (elements.statusPanel) {
        elements.statusPanel.className = 'status-panel ' + panelClass;
    }
    if (elements.statusDot) {
        elements.statusDot.className = 'status-dot ' + panelClass;
    }
    if (elements.statusValue) elements.statusValue.textContent = statusText;

    const effectiveAction = state.sendingAction || state.lastPowerAction;
    const isSleeping = !isUp && !state.isBooting && isWakeUpAction(effectiveAction);
    setHeroState(isFullyUp, state.isBooting, isSleeping);
    if (!wasMachineUp && isFullyUp) {
        triggerRadiationPulse();
    }

    if (isUp && ip) {
        if (elements.statusIp) {
            elements.statusIp.style.display = 'inline-block';
            elements.statusIp.textContent = ip;
        }
    } else {
        if (elements.statusIp) elements.statusIp.style.display = 'none';
    }

    if ((!isUp || !sshUp) && elements.statusUptime) {
        elements.statusUptime.style.display = 'none';
    }

    // Power buttons state management
    if (!state.isBooting && elements.powerBtn) {
        const btnText = elements.powerBtn.querySelector('.wol-btn-text');
        const sleepBtnText = elements.sleepBtn ? elements.sleepBtn.querySelector('.wol-btn-text') : null;

        if (!isUp) {
            if (state.sendingAction === 'wol') {
                if (elements.sshNotice) elements.sshNotice.style.display = 'none';
                if (elements.sleepBtn) elements.sleepBtn.style.display = 'none';
                if (elements.powerBtn) {
                    elements.powerBtn.style.display = 'flex';
                    elements.powerBtn.classList.add('sending');
                }
            } else {
                const effectiveAction = state.sendingAction || state.lastPowerAction;
                stopSendingAction();
                if (elements.sshNotice) elements.sshNotice.style.display = 'none';
                if (elements.sleepBtn) elements.sleepBtn.style.display = 'none';
                if (elements.powerBtn) {
                    elements.powerBtn.style.display = 'flex';
                    elements.powerBtn.className = 'wol-btn';
                    elements.powerBtn.disabled = false;
                    elements.powerBtn.dataset.mode = 'wol';
                    if (btnText) btnText.textContent = isWakeUpAction(effectiveAction) ? 'WAKE UP' : 'POWER ON';
                    elements.powerBtn.title = state.targetName ? `Send Wake-on-LAN to ${state.targetName}` : 'Power on host';
                }
            }
        } else if (!sshUp) {
            if (state.sendingAction === 'sleep') {
                if (elements.powerBtn) elements.powerBtn.style.display = 'none';
                if (elements.sleepBtn) {
                    elements.sleepBtn.style.display = 'flex';
                    elements.sleepBtn.classList.add('sending');
                }
            } else if (state.sendingAction === 'shutdown') {
                if (elements.sleepBtn) elements.sleepBtn.style.display = 'none';
                if (elements.powerBtn) {
                    elements.powerBtn.style.display = 'flex';
                    elements.powerBtn.classList.add('sending');
                }
            } else {
                if (elements.sleepBtn) elements.sleepBtn.style.display = 'none';
                if (elements.powerBtn) elements.powerBtn.style.display = 'flex';

                const isShuttingDown = state.lastPowerAction === 'shutdown' || state.lastPowerAction === 'sleep' || wasSshReady;

                if (isShuttingDown) {
                    if (elements.sshNotice) elements.sshNotice.style.display = 'none';
                    elements.powerBtn.className = 'wol-btn shutdown-btn';
                    elements.powerBtn.disabled = true;
                } else {
                    if (elements.sshNotice) elements.sshNotice.style.display = 'flex';
                    elements.powerBtn.className = 'wol-btn shutdown-btn';
                    elements.powerBtn.disabled = true;
                    elements.powerBtn.dataset.mode = 'shutdown';
                    if (btnText) btnText.textContent = 'POWER OFF';
                    elements.powerBtn.title = state.targetName ? `Waiting for ${state.targetName} SSH bridge…` : 'Starting SSH…';
                }
            }
        } else {
            if (elements.sshNotice) elements.sshNotice.style.display = 'none';

            if (state.sendingAction === 'shutdown') {
                if (elements.sleepBtn) elements.sleepBtn.style.display = 'none';
                if (elements.powerBtn) {
                    elements.powerBtn.style.display = 'flex';
                    elements.powerBtn.classList.add('sending');
                }
            } else if (state.sendingAction === 'sleep') {
                if (elements.powerBtn) elements.powerBtn.style.display = 'none';
                if (elements.sleepBtn) {
                    elements.sleepBtn.style.display = 'flex';
                    elements.sleepBtn.classList.add('sending');
                }
            } else {
                if (elements.powerBtn) {
                    elements.powerBtn.style.display = 'flex';
                    elements.powerBtn.classList.remove('sending');
                    elements.powerBtn.className = 'wol-btn shutdown-btn';
                    elements.powerBtn.disabled = false;
                    elements.powerBtn.dataset.mode = 'shutdown';
                    if (btnText) btnText.textContent = 'POWER OFF';
                    elements.powerBtn.title = state.targetName ? `Power off ${state.targetName}` : 'Power off';
                }
                if (elements.sleepBtn) {
                    elements.sleepBtn.style.display = 'flex';
                    elements.sleepBtn.classList.remove('sending');
                    elements.sleepBtn.disabled = false;
                    elements.sleepBtn.className = 'wol-btn sleep-btn';
                    if (sleepBtnText) sleepBtnText.textContent = 'SLEEP';
                    elements.sleepBtn.title = state.targetName ? `Suspend ${state.targetName} to RAM (S3 Sleep)` : 'Sleep (S3)';
                }
            }
        }
    }

    // Sunshine Bar Visibility & Polling
    const sunshineControls = document.getElementById('sunshine-controls');
    if (!isUp) {
        hideSunshineBar();
        if (sunshineControls) sunshineControls.style.display = 'none';
        if (state.sunshineTimer) {
            clearTimeout(state.sunshineTimer);
            state.sunshineTimer = null;
        }
        state.sunshineInFlight = false;
    } else {
        if (sunshineControls) sunshineControls.style.display = sshUp ? 'flex' : 'none';
        if (!document.hidden && !state.diagnosticsOpen) {
            if (!wasMachineUp || (!state.sunshineTimer && !state.sunshineInFlight)) {
                if (state.sunshineTimer) clearTimeout(state.sunshineTimer);
                checkSunshine();
            }
        }
    }

    // Sysinfo Preview Panel Visibility & Polling
    if (!isUp || !sshUp) {
        hideSysinfoPanel();
        if (state.sysinfoTimer) {
            clearTimeout(state.sysinfoTimer);
            state.sysinfoTimer = null;
        }
        state.sysinfoInFlight = false;
    } else {
        if (!document.hidden && !state.diagnosticsOpen) {
            if (!wasSshReady || (!state.sysinfoTimer && !state.sysinfoInFlight)) {
                if (state.sysinfoTimer) clearTimeout(state.sysinfoTimer);
                checkSysinfo();
            }
        }
    }

    // Uptime Badge Visibility & Polling
    if (!isUp || !sshUp) {
        if (elements.statusUptime) elements.statusUptime.style.display = 'none';
        if (state.uptimeTimer) {
            clearTimeout(state.uptimeTimer);
            state.uptimeTimer = null;
        }
        state.uptimeInFlight = false;
    } else {
        if (!document.hidden && !state.diagnosticsOpen) {
            if (!wasSshReady || (!state.uptimeTimer && !state.uptimeInFlight)) {
                if (state.uptimeTimer) clearTimeout(state.uptimeTimer);
                checkUptime();
            }
        }
    }
}

function startPolling() {
    if (state.statusInterval) clearInterval(state.statusInterval);
    if (state.sunshineTimer) clearTimeout(state.sunshineTimer);
    if (state.uptimeTimer) clearTimeout(state.uptimeTimer);
    if (state.sysinfoTimer) clearTimeout(state.sysinfoTimer);

    state.statusInterval = setInterval(checkStatus, state.statusPollInterval);

    if (!state.diagnosticsOpen && state.machineIsUp) {
        if (!document.hidden && state.sshReady) {
            state.sysinfoTimer = setTimeout(checkSysinfo, 500);
            state.uptimeTimer = setTimeout(checkUptime, 800);
        }
        state.sunshineTimer = setTimeout(checkSunshine, 800);
    }
}

function stopAllPolling() {
    if (state.statusInterval) { clearInterval(state.statusInterval); state.statusInterval = null; }
    if (state.sunshineTimer) { clearTimeout(state.sunshineTimer); state.sunshineTimer = null; }
    if (state.uptimeTimer) { clearTimeout(state.uptimeTimer); state.uptimeTimer = null; }
    if (state.sysinfoTimer) { clearTimeout(state.sysinfoTimer); state.sysinfoTimer = null; }
    stopDiagPipeline();
    state.sunshineInFlight = false;
    state.uptimeInFlight = false;
    state.sysinfoInFlight = false;
}

// ─── Offline Reconnection ─────────────────────────────────────
function enterOfflineMode() {
    dismissCyberLoader();
    setOfflineMode(true);
    if (elements.lockScreen) elements.lockScreen.style.display = 'none';
    if (elements.mainContainer) elements.mainContainer.style.display = 'flex';

    if (elements.statusPanel) elements.statusPanel.className = 'status-panel down';
    if (elements.statusDot) elements.statusDot.className = 'status-dot down';
    updateDiagnosticsButtonState();
    if (state.diagnosticsOpen) closeDiagnostics();
    const effectiveAction = state.sendingAction || state.lastPowerAction;
    const isSleeping = !state.isBooting && isWakeUpAction(effectiveAction);
    setHeroState(false, false, isSleeping);
    if (elements.statusValue) elements.statusValue.textContent = 'OFFLINE';
    if (elements.statusIp) elements.statusIp.style.display = 'none';
    if (elements.statusUptime) elements.statusUptime.style.display = 'none';

    hideSysinfoPanel();
    hideSunshineBar();
    const sunshineControls = document.getElementById('sunshine-controls');
    if (sunshineControls) sunshineControls.style.display = 'none';

    if (state.statusInterval) clearInterval(state.statusInterval);
    state.statusInterval = setInterval(retryConnection, state.statusPollInterval);
}

async function retryConnection() {
    try {
        const data = await apiFetch('status');
        clearInterval(state.statusInterval);
        setOfflineMode(false);
        state.lastPowerAction = data.last_power_action || null;
        onAuthenticated();
        updateUI(data.status === 'up', data.ip, data.ssh_ready || false);
    } catch (e) {
        if (e.message === 'auth') {
            clearInterval(state.statusInterval);
            setOfflineMode(false);
            showLockScreen();
        }
        /* retry next interval */
    }
}

// ─── Configuration Bootstrap ──────────────────────────────────
async function loadPublicConfig() {
    try {
        const cfg = await apiFetch('config');
        if (cfg && cfg.target && cfg.target.name) {
            state.targetName = cfg.target.name;
            const targetUpper = cfg.target.name.toUpperCase();
            if (cfg.target.host) state.targetHost = cfg.target.host;

            document.title = `${cfg.target.name} — RigPulse`;

            if (elements.targetNameLabel) elements.targetNameLabel.textContent = targetUpper;
            if (elements.lockTitle) elements.lockTitle.textContent = `${targetUpper} ACCESS IS RESTRICTED`;

            const shutdownModalTitle = document.getElementById('shutdown-modal-title');
            const shutdownModalBody = document.getElementById('shutdown-modal-body');
            if (shutdownModalTitle) shutdownModalTitle.textContent = `SHUTDOWN ${targetUpper}?`;
            if (shutdownModalBody) shutdownModalBody.innerHTML = `This will immediately power off ${cfg.target.name}.<br>Any unsaved work will be lost.`;

            const diagnosticsTitle = document.getElementById('diagnostics-title');
            if (diagnosticsTitle) diagnosticsTitle.textContent = `${targetUpper} DIAGNOSTICS`;

            const diagnosticsLoadingText = document.getElementById('diagnostics-loading-text');
            if (diagnosticsLoadingText) diagnosticsLoadingText.textContent = `PROBING ${targetUpper} TELEMETRY…`;

            const historyTitle = document.getElementById('history-title');
            if (historyTitle) historyTitle.textContent = `${targetUpper} ACTION HISTORY`;

            const sshNoticeText = document.getElementById('ssh-notice-text');
            if (sshNoticeText) sshNoticeText.textContent = `SSH server starting on ${cfg.target.name}…`;

            setHeroName(targetUpper);
            const resolvedDomain = (cfg.target.public_domain || (cfg.sunshine && cfg.sunshine.wan_host) || cfg.target.host || '').toUpperCase();
            setHeroDomain(resolvedDomain);

            if (elements.refreshToggle) elements.refreshToggle.title = `Reload ${cfg.target.name} Dashboard`;
            if (elements.historyToggle) elements.historyToggle.title = `Action Audit Log for ${cfg.target.name}`;
            if (elements.diagnosticsToggle) elements.diagnosticsToggle.title = `Diagnostics & Telemetry for ${cfg.target.name}`;
        }
        if (cfg && cfg.sunshine && cfg.sunshine.wan_host) {
            state.sunshineWanHost = cfg.sunshine.wan_host;
        }
        if (cfg && cfg.client) {
            if (cfg.client.poll_interval_ms) state.statusPollInterval = cfg.client.poll_interval_ms;
            if (cfg.client.sunshine_poll_ms) state.sunshinePollInterval = cfg.client.sunshine_poll_ms;
            if (cfg.client.uptime_poll_ms) state.uptimePollInterval = cfg.client.uptime_poll_ms;
            if (cfg.client.sysinfo_poll_ms) state.sysinfoPollInterval = cfg.client.sysinfo_poll_ms;
            if (cfg.client.chart_history_max) state.historyMax = cfg.client.chart_history_max;
            if (cfg.client.cpu_power_max_watts) state.cpuPowerMaxWatts = cfg.client.cpu_power_max_watts;
            if (cfg.client.default_metric && !localStorage.getItem('rigpulse_metric')) {
                state.secondaryMetric = cfg.client.default_metric;
                updateMetricBtnUI();
            }
        }
    } catch (e) { /* silent */ }
}

async function tryInitialAuth() {
    await loadPublicConfig();
    try {
        const data = await apiFetch('status');
        if (data.csrf_token) setCsrfToken(data.csrf_token);
        if (data.role) state.userRole = data.role;
        state.lastPowerAction = data.last_power_action || null;
        onAuthenticated();
        updateUI(data.status === 'up', data.ip, data.ssh_ready || false);
    } catch (e) {
        if (e.message === 'auth') return;
        enterOfflineMode();
    } finally {
        dismissCyberLoader();
    }
}

// ─── Lifecycle & Keyboard Events ──────────────────────────────
function handleAppResume() {
    const now = Date.now();
    if (now - lastResumeTime < 350) return;
    lastResumeTime = now;

    if (document.hidden) return;

    if (state.authenticated) {
        if (state.isOffline) {
            retryConnection();
        } else {
            startPolling();
            checkStatus();
            if (state.machineIsUp && state.sshReady) {
                checkSysinfo();
                checkUptime();
            }
        }
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (state.sysinfoTimer) {
            clearTimeout(state.sysinfoTimer);
            state.sysinfoTimer = null;
        }
        if (state.uptimeTimer) {
            clearTimeout(state.uptimeTimer);
            state.uptimeTimer = null;
        }
        stopDiagPipeline();
    } else {
        handleAppResume();
        if (state.diagnosticsOpen) {
            startDiagPipeline();
        }
    }
});

// Escape key closes open modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (state.diagnosticsOpen) closeDiagnostics();
        closeHistory();
        hideShutdownModal();
    }
});

window.addEventListener('pageshow', handleAppResume);
window.addEventListener('focus', handleAppResume);
window.addEventListener('online', handleAppResume);

if (elements.refreshToggle) {
    elements.refreshToggle.addEventListener('click', () => {
        elements.refreshToggle.classList.add('spinning');
        setTimeout(() => window.location.reload(), 200);
    });
}

// ─── Server Configuration Loader ─────────────────────────────
async function loadServerConfig() {
    try {
        const data = await apiFetch('config');
        if (data) {
            if (data.target && data.target.name) {
                setHeroName(data.target.name);
            }
            if (data.target && data.target.public_domain) {
                setHeroDomain(data.target.public_domain);
            }
            if (data.client) {
                if (data.client.default_gpu_mode) {
                    applyConfiguredDefaultGpuMode(data.client.default_gpu_mode);
                }
                if (data.client.cpu_power_max_watts) {
                    state.cpuPowerMaxWatts = Number(data.client.cpu_power_max_watts) || 150;
                }
            }
        }
    } catch (e) {
        // Fallback gracefully to client-side defaults
    }
}

// ─── Bootstrap Modules ────────────────────────────────────────
function startApp() {
    initHero();
    initAuth({
        onAuthSuccess: () => {
            startPolling();
            checkStatus();
        },
        onLogout: () => {
            stopAllPolling();
            closeDiagnostics();
            closeHistory();
            hideShutdownModal();
        }
    });

    initPower({
        onPollRequested: checkStatus
    });

    initSunshine();
    initHistory();
    initDiagnostics({
        onPollingResume: () => {
            if (state.authenticated && state.machineIsUp && state.sshReady && !state.isOffline && !document.hidden) {
                startPolling();
            }
        }
    });

    // Load server configuration from config.php (applies default_gpu_mode, host identity, etc.)
    loadServerConfig();

    // Start initial authentication check
    tryInitialAuth();

    // Safety fallback to guarantee cyber loader never blocks HUD
    setTimeout(dismissCyberLoader, 4000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}

