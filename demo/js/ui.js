/**
 * RigPulse — User Interface & Notification System (js/ui.js)
 */

import { state } from './state.js';

// ─── DOM Elements Cache ───────────────────────────────────────
export const elements = {
    lockScreen: document.getElementById('lock-screen'),
    lockTitle: document.getElementById('lock-title'),
    lockForm: document.getElementById('lock-form'),
    lockPassword: document.getElementById('lock-password'),
    lockSubmit: document.getElementById('lock-submit'),
    lockError: document.getElementById('lock-error'),

    mainContainer: document.getElementById('main-container'),
    statusPanel: document.getElementById('status-panel'),
    statusDot: document.getElementById('status-dot'),
    statusValue: document.getElementById('status-value'),
    statusIp: document.getElementById('status-ip'),
    sunshineHeaderPing: document.getElementById('sunshine-header-ping'),
    statusUptime: document.getElementById('status-uptime'),

    powerBtn: document.getElementById('power-btn'),
    sleepBtn: document.getElementById('sleep-btn'),
    sshNotice: document.getElementById('ssh-notice'),
    messageEl: document.getElementById('message'),
    offlineBanner: document.getElementById('offline-banner'),
    targetNameLabel: document.getElementById('target-name-label'),

    // Top action buttons
    refreshToggle: document.getElementById('refresh-toggle'),
    gpuToggleBtn: document.getElementById('gpu-toggle'),
    historyToggle: document.getElementById('history-toggle'),
    logoutToggle: document.getElementById('logout-toggle'),
    diagnosticsToggle: document.getElementById('diagnostics-toggle'),

    // Mini sysinfo preview card
    sysinfoPanel: document.getElementById('sysinfo-panel'),
    cpuFill: document.getElementById('cpu-fill'),
    cpuVal: document.getElementById('cpu-val'),
    ramFill: document.getElementById('ram-fill'),
    ramVal: document.getElementById('ram-val'),
    gpuFill: document.getElementById('gpu-fill'),
    gpuVal: document.getElementById('gpu-val'),
    vramFill: document.getElementById('vram-fill'),
    vramVal: document.getElementById('vram-val'),
    cyberLoader: document.getElementById('cyber-loader'),
};

let messageTimeout = null;
let activeDotInterval = null;

// ─── Cyberpunk HUD Loader Dismissal ────────────────────────────
export function dismissCyberLoader() {
    const loader = elements.cyberLoader || document.getElementById('cyber-loader');
    if (!loader || loader.dataset.dismissed) return;
    loader.dataset.dismissed = 'true';
    loader.classList.add('fade-out');
    setTimeout(() => {
        loader.style.display = 'none';
    }, 420);
}

// ─── Toast / Message Notification ─────────────────────────────
export function showMessage(text, type = 'info') {
    if (!elements.messageEl) return;
    elements.messageEl.textContent = text;
    elements.messageEl.className = 'message ' + type;
    elements.messageEl.style.opacity = '1';

    clearTimeout(messageTimeout);
    messageTimeout = setTimeout(() => {
        elements.messageEl.style.opacity = '0';
    }, 6000);
}

// ─── Button Helper ────────────────────────────────────────────
export function resetButton(btn, text) {
    if (!btn) return;
    const label = btn.querySelector('.wol-btn-text');
    if (label) label.textContent = text;
    btn.classList.remove('sending');
    btn.disabled = false;
}

// ─── Ping Colors & Formatting ─────────────────────────────────
export function pingColor(ms, alpha = 1) {
    if (ms <= 30) return `rgba(74, 222, 128, ${alpha})`;
    if (ms <= 60) return `rgba(250, 204, 21, ${alpha})`;
    if (ms <= 100) return `rgba(251, 146, 60, ${alpha})`;
    return `rgba(248, 113, 113, ${alpha})`;
}

export function formatPing(ms) {
    if (ms === null || ms === undefined || ms < 0) return '';
    return ms < 1 ? '<1 ms' : `${Math.round(ms)} ms`;
}

// ─── Shared Dot Animation ─────────────────────────────────────
export function startDotAnimation(prefix, count, targetEl, intervalMs = 400) {
    stopDotAnimation();
    let dots = 0;
    const update = () => {
        dots = (dots + 1) % (count + 1);
        const text = prefix + '.'.repeat(dots);
        if (targetEl) {
            const span = targetEl.querySelector('.wol-btn-text');
            if (span) span.textContent = text;
            else targetEl.textContent = text;
        }
    };
    update();
    activeDotInterval = setInterval(update, intervalMs);
}

export function stopDotAnimation() {
    if (activeDotInterval) {
        clearInterval(activeDotInterval);
        activeDotInterval = null;
    }
}

// ─── Top Bar & Role Visibility ────────────────────────────────
export function updateUserRoleUI() {
    if (!state.authenticated) return;
    if (elements.refreshToggle) elements.refreshToggle.style.display = 'flex';
    if (elements.gpuToggleBtn) elements.gpuToggleBtn.style.display = 'flex';
    if (elements.historyToggle) elements.historyToggle.style.display = 'flex';
    if (elements.logoutToggle) elements.logoutToggle.style.display = 'flex';

    if (state.userRole === 'admin') {
        if (elements.diagnosticsToggle) elements.diagnosticsToggle.style.display = 'flex';
        updateDiagnosticsButtonState();
    } else {
        if (elements.diagnosticsToggle) elements.diagnosticsToggle.style.display = 'none';
    }
}

export function updateDiagnosticsButtonState() {
    if (!elements.diagnosticsToggle) return;
    if (!state.authenticated || state.userRole !== 'admin') {
        elements.diagnosticsToggle.style.display = 'none';
        return;
    }
    elements.diagnosticsToggle.style.display = 'flex';

    const canProbe = state.machineIsUp && state.sshReady && !state.isOffline;
    elements.diagnosticsToggle.disabled = !canProbe;
    elements.diagnosticsToggle.classList.toggle('disabled', !canProbe);
    elements.diagnosticsToggle.title = canProbe
        ? 'Diagnostic Telemetry HUD'
        : `Diagnostics unavailable (${state.targetName} offline)`;
}

// ─── Mini Sysinfo Preview Panel (Home Screen) ─────────────────
export function showSysinfoPanel() {
    if (!elements.sysinfoPanel) return;
    if (elements.sysinfoPanel.style.display === 'flex' && !elements.sysinfoPanel.classList.contains('hiding')) return;
    elements.sysinfoPanel.classList.remove('hiding');
    elements.sysinfoPanel.style.display = 'flex';
    const sunshineBar = document.getElementById('sunshine-bar');
    if (sunshineBar && sunshineBar.style.display === 'none') {
        sunshineBar.style.display = 'flex';
    }
}

export function hideSysinfoPanel() {
    if (!elements.sysinfoPanel) return;
    if (elements.sysinfoPanel.style.display === 'none' || elements.sysinfoPanel.classList.contains('hiding')) return;
    elements.sysinfoPanel.classList.add('hiding');
    elements.sysinfoPanel.addEventListener('animationend', function onEnd() {
        elements.sysinfoPanel.removeEventListener('animationend', onEnd);
        elements.sysinfoPanel.style.display = 'none';
        elements.sysinfoPanel.classList.remove('hiding');
    });
}

function setSysinfoBar(fill, valEl, pct, label) {
    if (!fill || !valEl) return;
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    fill.style.width = p + '%';
    fill.className = 'sysinfo-fill ' + (p < 50 ? 'level-low' : p < 80 ? 'level-medium' : 'level-high');
    valEl.textContent = label;
}

export function updateSysinfoPreview(s) {
    if (!s) return;
    showSysinfoPanel();

    // CPU: load % + freq + temperature + power
    let cpuLabel = (s.cpu !== undefined ? s.cpu : (s.cpu_usage || 0)) + '%';
    if (s.cpu_freq && s.cpu_freq !== 'N/A') cpuLabel += ' · ' + s.cpu_freq + 'GHz';
    if (s.cpu_temp && s.cpu_temp !== 'N/A' && s.cpu_temp !== null) cpuLabel += ' · ' + s.cpu_temp + '°C';
    if (s.cpu_power && s.cpu_power !== 'N/A' && s.cpu_power !== null) cpuLabel += ' · ' + s.cpu_power + 'W';
    setSysinfoBar(elements.cpuFill, elements.cpuVal, (s.cpu !== undefined ? s.cpu : s.cpu_usage) || 0, cpuLabel);

    // RAM: used / total GB
    if (s.ram_used !== undefined && s.ram_total !== undefined) {
        const ramPct = Math.round((s.ram_used / s.ram_total) * 100);
        setSysinfoBar(elements.ramFill, elements.ramVal, ramPct, s.ram_used + ' / ' + s.ram_total + ' GB');
    }

    // GPU: load % + freq + temperature + power
    if (s.gpu_load !== 'N/A' && s.gpu_load !== null && s.gpu_load !== undefined) {
        if (s.gpu_power && s.gpu_power !== 'N/A' && parseInt(s.gpu_power, 10) > 0) {
            state.lastKnownGpuPower = parseInt(s.gpu_power, 10);
        }
        if (s.gpu_freq && s.gpu_freq !== 'N/A' && parseInt(s.gpu_freq, 10) > 0) {
            state.lastKnownGpuFreq = parseInt(s.gpu_freq, 10);
        }

        const effectiveGpuPower = (s.gpu_power && s.gpu_power !== 'N/A') ? s.gpu_power : (state.lastKnownGpuPower || null);
        const effectiveGpuFreq = (s.gpu_freq && s.gpu_freq !== 'N/A') ? s.gpu_freq : (state.lastKnownGpuFreq || null);

        let gpuLabel = s.gpu_load + '%';
        if (effectiveGpuFreq) gpuLabel += ' · ' + effectiveGpuFreq + 'MHz';
        if (s.gpu_temp && s.gpu_temp !== 'N/A') gpuLabel += ' · ' + s.gpu_temp + '°C';
        if (effectiveGpuPower) gpuLabel += ' · ' + effectiveGpuPower + 'W';
        setSysinfoBar(elements.gpuFill, elements.gpuVal, parseInt(s.gpu_load, 10), gpuLabel);

        // VRAM: used / total (in MiB → GB)
        const vramUsed = parseInt(s.gpu_mem_used, 10);
        const vramTotal = parseInt(s.gpu_mem_total, 10);
        if (!isNaN(vramUsed) && !isNaN(vramTotal) && vramTotal > 0) {
            const vramPct = Math.round((vramUsed / vramTotal) * 100);
            const usedGB = (vramUsed / 1024).toFixed(1);
            const totalGB = (vramTotal / 1024).toFixed(0);
            setSysinfoBar(elements.vramFill, elements.vramVal, vramPct, usedGB + ' / ' + totalGB + ' GB');
        } else {
            setSysinfoBar(elements.vramFill, elements.vramVal, 0, 'N/A');
        }
    } else {
        setSysinfoBar(elements.gpuFill, elements.gpuVal, 0, 'N/A');
        setSysinfoBar(elements.vramFill, elements.vramVal, 0, 'N/A');
    }
}

// ─── Offline Banner ───────────────────────────────────────────
export function setOfflineMode(offline) {
    state.isOffline = offline;
    if (elements.offlineBanner) {
        elements.offlineBanner.style.display = offline ? 'block' : 'none';
    }
    if (elements.powerBtn) elements.powerBtn.disabled = offline;
    if (elements.sleepBtn) elements.sleepBtn.disabled = offline;
}
