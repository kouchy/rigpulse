/**
 * RigPulse — Diagnostic HUD & Real-time Telemetry (js/diagnostics.js)
 */

import { apiFetch } from './api.js';
import { state } from './state.js';
import {
    drawLineChart,
    formatMetricValue,
    formatMetricAge,
    getPingColor,
    updateChartTooltipContentAndPos,
    showChartTooltip,
    hideChartTooltip
} from './charts.js';
import { showMessage, pingColor, formatPing, updateDiagnosticsButtonState, updateSysinfoPreview, hideSysinfoPanel } from './ui.js';
import {
    sunshineIsRunning,
    lastSunshinePingMs,
    lastSunshinePingType,
    sunshinePingSamples,
    sunshinePingTimes,
    setSunshineIsRunning,
    resetSunshinePing,
    measureSunshinePing,
    updateSunshinePingUI,
    collapseSunshineBar
} from './sunshine.js';
import { setHeroMode } from './hero.js';

// ─── DOM Elements Cache ───────────────────────────────────────
const diagnosticsToggle = document.getElementById('diagnostics-toggle');
const diagnosticsOverlay = document.getElementById('diagnostics-overlay');
const diagnosticsClose = document.getElementById('diagnostics-close');
const diagnosticsLoading = document.getElementById('diagnostics-loading');
const diagnosticsContent = document.getElementById('diagnostics-content');

const diagCpuName = document.getElementById('diag-cpu-name');
const diagCpuVal = document.getElementById('diag-cpu-val');
const diagCpuBar = document.getElementById('diag-cpu-bar');
const diagRamVal = document.getElementById('diag-ram-val');
const diagRamBar = document.getElementById('diag-ram-bar');
const diagProcsList = document.getElementById('diag-procs-list');

const diagGpuName = document.getElementById('diag-gpu-name');
const diagGpuVal = document.getElementById('diag-gpu-val');
const diagGpuBar = document.getElementById('diag-gpu-bar');
const diagVramVal = document.getElementById('diag-vram-val');
const diagVramBar = document.getElementById('diag-vram-bar');
const diagGpuPower = document.getElementById('diag-gpu-power');
const diagGpuEnc = document.getElementById('diag-gpu-enc');
const diagGpuDriver = document.getElementById('diag-gpu-driver');

const diagDiskIo = document.getElementById('diag-disk-io');
const diagDisksContainer = document.getElementById('diag-disks-container');
const diagUptime = document.getElementById('diag-uptime');
const diagSunshineStatus = document.getElementById('diag-sunshine-status');
const statusUptime = document.getElementById('status-uptime');

const diagPingCur = document.getElementById('diag-ping-cur');
const diagPingStatAvg = document.getElementById('diag-ping-stat-avg');
const diagPingStatDev = document.getElementById('diag-ping-stat-dev');
const diagPingCanvas = document.getElementById('diag-ping-sparkline');
const diagPingCtx = diagPingCanvas ? diagPingCanvas.getContext('2d') : null;

const diagNetLabel = document.getElementById('diag-net-label');
const diagNetIo = document.getElementById('diag-net-io');
const diagApp = document.getElementById('diag-app');
const diagAppCard = document.getElementById('diag-app-card');
const diagAppIconWrap = document.getElementById('diag-app-icon-wrap');
const diagAppRuntime = document.getElementById('diag-app-runtime');

const diagWinLabel = document.getElementById('diag-win-label');
const diagWinBuild = document.getElementById('diag-win-build');
const diagWinCard = document.getElementById('diag-win-card');
const diagReboot = document.getElementById('diag-reboot');

// Canvas chart wraps and buttons
const diagCpuChartWrap = document.getElementById('diag-cpu-chart-wrap');
const diagGpuChartWrap = document.getElementById('diag-gpu-chart-wrap');
const diagCpuChartBtn = document.getElementById('diag-cpu-chart-btn');
const diagGpuChartBtn = document.getElementById('diag-gpu-chart-btn');
const diagCpuCanvas = document.getElementById('diag-cpu-canvas');
const diagGpuCanvas = document.getElementById('diag-gpu-canvas');

const diagChartCpuVal = document.getElementById('diag-chart-cpu-val');
const diagChartRamVal = document.getElementById('diag-chart-ram-val');
const diagChartCpuPwrPill = document.getElementById('diag-chart-cpu-pwr-pill');
const diagChartCpuPowerVal = document.getElementById('diag-chart-cpu-power-val');
const diagChartCpuMetricLabel = document.getElementById('diag-chart-cpu-metric-label');
const diagChartCpuFanPill = document.getElementById('diag-chart-cpu-fan-pill');
const diagChartCpuFanVal = document.getElementById('diag-chart-cpu-fan-val');

const diagChartGpuVal = document.getElementById('diag-chart-gpu-val');
const diagChartVramVal = document.getElementById('diag-chart-vram-val');
const diagChartEncVal = document.getElementById('diag-chart-enc-val');
const diagChartGpuFanPill = document.getElementById('diag-chart-gpu-fan-pill');
const diagChartFanVal = document.getElementById('diag-chart-fan-val');
const diagChartGpuPwrPill = document.getElementById('diag-chart-gpu-pwr-pill');
const diagChartPowerVal = document.getElementById('diag-chart-power-val');
const diagChartGpuMetricLabel = document.getElementById('diag-chart-gpu-metric-label');

const diagDiskChartWrap = document.getElementById('diag-disk-chart-wrap');
const diagNetChartWrap = document.getElementById('diag-net-chart-wrap');
const diagDiskChartBtn = document.getElementById('diag-disk-chart-btn');
const diagNetChartBtn = document.getElementById('diag-net-chart-btn');
const diagDiskCanvas = document.getElementById('diag-disk-canvas');
const diagNetCanvas = document.getElementById('diag-net-canvas');

const diagChartDiskReadVal = document.getElementById('diag-chart-disk-read-val');
const diagChartDiskWriteVal = document.getElementById('diag-chart-disk-write-val');
const diagChartNetRecvVal = document.getElementById('diag-chart-net-recv-val');
const diagChartNetSentVal = document.getElementById('diag-chart-net-sent-val');

const diagMetricBtn = document.getElementById('diag-metric-btn');
const diagPipelineBtn = document.getElementById('diag-pipeline-btn');
const diagGpuModeBtn = document.getElementById('diag-gpu-mode-btn');
const gpuToggleBtn = document.getElementById('gpu-toggle');
const diagChartTooltip = document.getElementById('diag-chart-tooltip');

let diagChartAnimFrame = null;
let onPollingResumeCallback = null;

// ─── Initialization ───────────────────────────────────────────
export function initDiagnostics({ onPollingResume }) {
    onPollingResumeCallback = onPollingResume;

    if (diagnosticsToggle) diagnosticsToggle.addEventListener('click', openDiagnostics);
    if (diagnosticsClose) diagnosticsClose.addEventListener('click', closeDiagnostics);
    if (diagnosticsOverlay) {
        diagnosticsOverlay.addEventListener('click', (e) => {
            if (e.target === diagnosticsOverlay) closeDiagnostics();
        });
    }

    if (diagChartCpuFanPill) {
        diagChartCpuFanPill.addEventListener('click', (e) => {
            e.stopPropagation();
            if (diagChartCpuFanPill.dataset.tooltip) {
                showMessage(diagChartCpuFanPill.dataset.tooltip, 'info');
            }
        });
    }
    if (diagChartGpuFanPill) {
        diagChartGpuFanPill.addEventListener('click', (e) => {
            e.stopPropagation();
            if (diagChartGpuFanPill.dataset.tooltip) {
                showMessage(diagChartGpuFanPill.dataset.tooltip, 'info');
            }
        });
    }

    if (diagCpuChartBtn) diagCpuChartBtn.addEventListener('click', toggleCpuChart);
    if (diagGpuChartBtn) diagGpuChartBtn.addEventListener('click', toggleGpuChart);
    if (diagDiskChartBtn) diagDiskChartBtn.addEventListener('click', toggleDiskChart);
    if (diagNetChartBtn) diagNetChartBtn.addEventListener('click', toggleNetChart);
    if (diagMetricBtn) diagMetricBtn.addEventListener('click', toggleSecondaryMetric);
    if (diagPipelineBtn) diagPipelineBtn.addEventListener('click', togglePipelineSpeed);
    if (diagGpuModeBtn) diagGpuModeBtn.addEventListener('click', toggleGpuMode);
    if (gpuToggleBtn) gpuToggleBtn.addEventListener('click', toggleGpuMode);

    setupCanvasHoverInteractivity(diagCpuCanvas);
    setupCanvasHoverInteractivity(diagGpuCanvas);
    setupCanvasHoverInteractivity(diagDiskCanvas);
    setupCanvasHoverInteractivity(diagNetCanvas);
    setupCanvasHoverInteractivity(diagPingCanvas);

    window.addEventListener('resize', () => {
        if (diagCpuCanvas) diagCpuCanvas._cachedW = diagCpuCanvas._cachedH = null;
        if (diagGpuCanvas) diagGpuCanvas._cachedW = diagGpuCanvas._cachedH = null;
        if (diagDiskCanvas) diagDiskCanvas._cachedW = diagDiskCanvas._cachedH = null;
        if (diagNetCanvas) diagNetCanvas._cachedW = diagNetCanvas._cachedH = null;
        if (state.diagnosticsOpen) {
            renderAllDiagCharts();
        }
    });

    initGpuMode();
}

// ─── GPU Performance Mode Switcher ────────────────────────────
export function setGpuMode(mode) {
    if (mode === true || mode === 'eco') mode = 'eco';
    else if (mode === 'light') mode = 'light';
    else if (mode === false || mode === 'heavy') mode = 'heavy';
    else mode = 'eco';

    state.gpuMode = mode;

    try {
        localStorage.setItem('rigpulse_gpu_mode', mode);
    } catch (e) { /* ignore */ }

    setHeroMode(mode);

    document.body.classList.remove('mode-eco', 'mode-light', 'mode-heavy', 'mode-ultralight');
    document.body.classList.add('mode-' + mode);
    if (mode === 'light') {
        document.body.classList.add('mode-ultralight');
    }

    if (gpuToggleBtn) {
        gpuToggleBtn.classList.remove('eco', 'light', 'heavy');
        gpuToggleBtn.classList.add(mode);
        if (mode === 'eco') {
            gpuToggleBtn.textContent = '🍃';
            gpuToggleBtn.title = 'Performance Mode: ECO 30FPS (Click for Light 🪶)';
        } else if (mode === 'light') {
            gpuToggleBtn.textContent = '🪶';
            gpuToggleBtn.title = 'Performance Mode: ULTRA LIGHT 0FPS (Click for Heavy ✨)';
        } else {
            gpuToggleBtn.textContent = '✨';
            gpuToggleBtn.title = 'Performance Mode: HEAVY 120FPS (Click for Eco 🍃)';
        }
    }

    if (diagGpuModeBtn) {
        diagGpuModeBtn.classList.remove('eco', 'light', 'heavy');
        diagGpuModeBtn.classList.add(mode);
        const iconSpan = diagGpuModeBtn.querySelector('.gpu-mode-icon');
        const textSpan = diagGpuModeBtn.querySelector('.gpu-mode-text');
        if (mode === 'eco') {
            if (iconSpan) iconSpan.textContent = '🍃';
            if (textSpan) textSpan.textContent = 'GPU: ECO';
            diagGpuModeBtn.title = 'Performance Mode (Current: ECO 30FPS — Click for Light 🪶)';
        } else if (mode === 'light') {
            if (iconSpan) iconSpan.textContent = '🪶';
            if (textSpan) textSpan.textContent = 'GPU: LIGHT';
            diagGpuModeBtn.title = 'Performance Mode (Current: ULTRA LIGHT — Click for Heavy ✨)';
        } else {
            if (iconSpan) iconSpan.textContent = '✨';
            if (textSpan) textSpan.textContent = 'GPU: HEAVY';
            diagGpuModeBtn.title = 'Performance Mode (Current: HEAVY 120FPS — Click for Eco 🍃)';
        }
    }

    if (state.diagnosticsOpen) {
        renderAllDiagCharts();
    }
    if (state.machineIsUp && sunshineIsRunning) {
        renderPingSparkline();
    }
}

export function toggleGpuMode() {
    let nextMode = 'eco';
    if (state.gpuMode === 'eco') nextMode = 'light';
    else if (state.gpuMode === 'light') nextMode = 'heavy';
    else nextMode = 'eco';
    setGpuMode(nextMode);
}

export function initGpuMode(configuredDefault = null) {
    let saved = null;
    try {
        saved = localStorage.getItem('rigpulse_gpu_mode');
    } catch (e) { /* ignore */ }

    if (saved === 'eco' || saved === 'light' || saved === 'heavy') {
        setGpuMode(saved);
        return;
    }

    // Default performance mode: strictly identical on both desktop and mobile, respects configured default
    const targetMode = configuredDefault || state.gpuMode || 'eco';
    setGpuMode(targetMode);
}

export function applyConfiguredDefaultGpuMode(mode) {
    if (!mode || (mode !== 'eco' && mode !== 'light' && mode !== 'heavy')) return;
    state.gpuMode = mode;

    let hasSaved = false;
    try {
        const saved = localStorage.getItem('rigpulse_gpu_mode');
        hasSaved = (saved === 'eco' || saved === 'light' || saved === 'heavy');
    } catch (e) { /* ignore */ }

    // If user has not chosen an explicit override in localStorage, adopt the server-configured default
    if (!hasSaved) {
        setGpuMode(mode);
    }
}

// ─── Pipeline Speed Switcher (1x, 2x, 3x) ─────────────────────
export function updatePipelineBtnUI() {
    if (!diagPipelineBtn) return;
    diagPipelineBtn.className = `diag-pipeline-btn speed-${state.pipelineSpeed}x`;
    if (state.pipelineSpeed === 1) {
        diagPipelineBtn.title = 'Refresh speed: 1x (Standard / 500ms rest) — Click for 2x';
        diagPipelineBtn.innerHTML = '<span class="deb-mode">⏱️ REFRESH: 1x</span>';
    } else if (state.pipelineSpeed === 2) {
        diagPipelineBtn.title = 'Refresh speed: 2x (Interleaved pipeline) — Click for 3x';
        diagPipelineBtn.innerHTML = '<span class="deb-mode">⏱️ REFRESH: 2x</span>';
    } else {
        diagPipelineBtn.title = 'Refresh speed: 3x (Turbo multi-stream) — Click for 1x';
        diagPipelineBtn.innerHTML = '<span class="deb-mode">🚀 REFRESH: 3x</span>';
    }
}

export function togglePipelineSpeed() {
    state.pipelineSpeed = (state.pipelineSpeed % 3) + 1;
    updatePipelineBtnUI();
    if (state.diagnosticsOpen) {
        renderAllDiagCharts();
        startDiagPipeline();
    }
}

// ─── Metric Switcher (Power W vs Temp °C) ─────────────────────
export function updateMetricBtnUI() {
    if (diagMetricBtn) {
        if (state.secondaryMetric === 'temp') {
            diagMetricBtn.className = 'diag-metric-btn temp';
            diagMetricBtn.title = 'Active: Temperature (°C) — Click to switch to Power (W)';
            diagMetricBtn.innerHTML = '🌡️ METRIC: TEMP';
        } else {
            diagMetricBtn.className = 'diag-metric-btn power';
            diagMetricBtn.title = 'Active: Power (W) — Click to switch to Temperature (°C)';
            diagMetricBtn.innerHTML = '⚡ METRIC: PWR';
        }
    }
    if (diagChartCpuMetricLabel) {
        diagChartCpuMetricLabel.textContent = state.secondaryMetric === 'temp' ? 'TEMP' : 'PWR';
    }
    if (diagChartGpuMetricLabel) {
        diagChartGpuMetricLabel.textContent = state.secondaryMetric === 'temp' ? 'TEMP' : 'PWR';
    }
    if (diagChartCpuPwrPill) {
        diagChartCpuPwrPill.classList.toggle('gold', state.secondaryMetric === 'power');
        diagChartCpuPwrPill.classList.toggle('red', state.secondaryMetric === 'temp');
    }
    if (diagChartGpuPwrPill) {
        diagChartGpuPwrPill.classList.toggle('gold', state.secondaryMetric === 'power');
        diagChartGpuPwrPill.classList.toggle('red', state.secondaryMetric === 'temp');
    }

    // Immediately synchronize the legend pill values with the selected metric using latest history
    const latestCpu = (state.cpuHistory && state.cpuHistory.length > 0)
        ? state.cpuHistory[state.cpuHistory.length - 1]
        : null;
    if (diagChartCpuPowerVal) {
        if (latestCpu) {
            if (state.secondaryMetric === 'temp') {
                const cpuTemp = latestCpu.temp || 0;
                if (cpuTemp > 0) {
                    if (diagChartCpuPwrPill) diagChartCpuPwrPill.style.display = 'inline-flex';
                    diagChartCpuPowerVal.textContent = cpuTemp + '°C';
                } else {
                    if (diagChartCpuPwrPill) diagChartCpuPwrPill.style.display = 'none';
                    diagChartCpuPowerVal.textContent = '—';
                }
            } else {
                const cpuPwr = latestCpu.power || 0;
                if (cpuPwr > 0) {
                    if (diagChartCpuPwrPill) diagChartCpuPwrPill.style.display = 'inline-flex';
                    diagChartCpuPowerVal.textContent = cpuPwr + 'W';
                } else {
                    if (diagChartCpuPwrPill) diagChartCpuPwrPill.style.display = 'none';
                    diagChartCpuPowerVal.textContent = '—';
                }
            }
        } else {
            diagChartCpuPowerVal.textContent = '—';
        }
    }

    const latestGpu = (state.gpuHistory && state.gpuHistory.length > 0)
        ? state.gpuHistory[state.gpuHistory.length - 1]
        : null;
    if (diagChartPowerVal) {
        if (latestGpu) {
            if (state.secondaryMetric === 'temp') {
                const gpuTemp = latestGpu.temp || 0;
                diagChartPowerVal.textContent = gpuTemp > 0 ? (gpuTemp + '°C') : '—';
            } else {
                const pwrW = latestGpu.power || 0;
                diagChartPowerVal.textContent = pwrW > 0 ? (pwrW + 'W') : '—';
            }
        } else {
            diagChartPowerVal.textContent = '—';
        }
    }
}

export function toggleSecondaryMetric() {
    state.secondaryMetric = state.secondaryMetric === 'power' ? 'temp' : 'power';
    updateMetricBtnUI();
    if (state.diagnosticsOpen) {
        renderCpuChart();
        renderGpuChart(state.lastKnownGpuPowerLimit);
    }
}

// ─── Chart Toggle Buttons ─────────────────────────────────────
export function toggleCpuChart() {
    state.cpuChartVisible = !state.cpuChartVisible;
    if (!state.cpuChartVisible) hideChartTooltip(diagCpuCanvas);
    if (diagCpuChartWrap) diagCpuChartWrap.classList.toggle('collapsed', !state.cpuChartVisible);
    if (diagCpuChartBtn) {
        diagCpuChartBtn.classList.toggle('active', state.cpuChartVisible);
        diagCpuChartBtn.title = state.cpuChartVisible ? 'Hide CPU history chart' : 'Show CPU history chart';
    }
    if (state.cpuChartVisible) renderCpuChart();
}

export function toggleGpuChart() {
    state.gpuChartVisible = !state.gpuChartVisible;
    if (!state.gpuChartVisible) hideChartTooltip(diagGpuCanvas);
    if (diagGpuChartWrap) diagGpuChartWrap.classList.toggle('collapsed', !state.gpuChartVisible);
    if (diagGpuChartBtn) {
        diagGpuChartBtn.classList.toggle('active', state.gpuChartVisible);
        diagGpuChartBtn.title = state.gpuChartVisible ? 'Hide GPU history chart' : 'Show GPU history chart';
    }
    if (state.gpuChartVisible) renderGpuChart(state.lastKnownGpuPowerLimit);
}

export function toggleDiskChart() {
    state.diskChartVisible = !state.diskChartVisible;
    if (!state.diskChartVisible) hideChartTooltip(diagDiskCanvas);
    if (diagDiskChartWrap) diagDiskChartWrap.classList.toggle('collapsed', !state.diskChartVisible);
    if (diagDiskChartBtn) {
        diagDiskChartBtn.classList.toggle('active', state.diskChartVisible);
        diagDiskChartBtn.title = state.diskChartVisible ? 'Hide Storage history chart' : 'Show Storage history chart';
    }
    if (state.diskChartVisible) renderDiskChart();
}

export function toggleNetChart() {
    state.netChartVisible = !state.netChartVisible;
    if (!state.netChartVisible) hideChartTooltip(diagNetCanvas);
    if (diagNetChartWrap) diagNetChartWrap.classList.toggle('collapsed', !state.netChartVisible);
    if (diagNetChartBtn) {
        diagNetChartBtn.classList.toggle('active', state.netChartVisible);
        diagNetChartBtn.title = state.netChartVisible ? 'Hide Network history chart' : 'Show Network history chart';
    }
    if (state.netChartVisible) renderNetChart();
}

// ─── Modal Open / Close ───────────────────────────────────────
export function openDiagnostics() {
    if (!state.authenticated || state.userRole !== 'admin' || !state.machineIsUp || !state.sshReady || state.isOffline) return;
    state.diagnosticsOpen = true;
    state.lastRenderedSeq = 0;
    document.body.classList.add('modal-open');

    collapseSunshineBar();

    if (diagCpuCanvas) diagCpuCanvas._cachedW = diagCpuCanvas._cachedH = null;
    if (diagGpuCanvas) diagGpuCanvas._cachedW = diagGpuCanvas._cachedH = null;
    if (diagDiskCanvas) diagDiskCanvas._cachedW = diagDiskCanvas._cachedH = null;
    if (diagNetCanvas) diagNetCanvas._cachedW = diagNetCanvas._cachedH = null;

    state.cpuHistory = [];
    state.gpuHistory = [];
    state.diskHistory = [];
    state.netHistory = [];

    updateMetricBtnUI();
    updatePipelineBtnUI();

    if (diagnosticsOverlay) diagnosticsOverlay.style.display = 'flex';
    if (diagnosticsLoading) {
        diagnosticsLoading.style.display = 'flex';
        diagnosticsLoading.className = 'diagnostics-loading';
        diagnosticsLoading.innerHTML = '<span class="diagnostics-spinner"></span><span>PROBING SYSTEM TELEMETRY…</span>';
    }
    if (diagnosticsContent) diagnosticsContent.style.display = 'none';

    if (state.machineIsUp && sunshineIsRunning) {
        measureSunshinePing(true).then(() => {
            updateSunshinePingStatsUI();
            updateSunshinePingUI();
        });
    }

    startDiagPipeline();
}

export function closeDiagnostics() {
    state.diagnosticsOpen = false;
    document.body.classList.remove('modal-open');
    if (diagnosticsOverlay) diagnosticsOverlay.style.display = 'none';
    hideChartTooltip(null);
    stopDiagPipeline();

    state.cpuHistory = [];
    state.gpuHistory = [];
    state.diskHistory = [];
    state.netHistory = [];

    if (typeof onPollingResumeCallback === 'function') {
        onPollingResumeCallback();
    }
}

// ─── Metronome & Diagnostic Pipeline ──────────────────────────
function getMetronomeInterval() {
    if (state.pipelineSpeed === 1) {
        return Math.max(1200, state.measuredRtt + 500);
    } else if (state.pipelineSpeed === 2) {
        return Math.max(700, Math.round(state.measuredRtt / 2));
    } else {
        return Math.max(450, Math.round(state.measuredRtt / 3));
    }
}

export function abortAllDiagRequests() {
    state.inFlightControllers.forEach(controller => {
        try { controller.abort(); } catch (e) { }
    });
    state.inFlightControllers.clear();
    state.inFlightCount = 0;
}

export function stopDiagPipeline() {
    if (state.metronomeTimer) {
        clearTimeout(state.metronomeTimer);
        state.metronomeTimer = null;
    }
    if (diagChartAnimFrame) {
        cancelAnimationFrame(diagChartAnimFrame);
        diagChartAnimFrame = null;
    }
    state.chartSlideProgress = 1;
    abortAllDiagRequests();
}

export function startDiagPipeline() {
    stopDiagPipeline();
    triggerMetronomeTick();
}

function scheduleNextMetronomeTick(delay) {
    if (!state.diagnosticsOpen || !state.authenticated || state.userRole !== 'admin') return;
    if (state.metronomeTimer) clearTimeout(state.metronomeTimer);
    const ms = delay !== undefined ? delay : getMetronomeInterval();
    state.metronomeTimer = setTimeout(triggerMetronomeTick, ms);
}

function triggerMetronomeTick() {
    if (!state.diagnosticsOpen || !state.authenticated || state.userRole !== 'admin') return;

    if (!state.machineIsUp || !state.sshReady || state.isOffline) {
        if (diagnosticsLoading) {
            diagnosticsLoading.style.display = 'flex';
            diagnosticsLoading.innerHTML = '<span class="diagnostics-spinner"></span><span>WAITING FOR HOST TO BE ONLINE & SSH READY…</span>';
        }
        if (diagnosticsContent) diagnosticsContent.style.display = 'none';
        scheduleNextMetronomeTick(2000);
        return;
    }

    if (state.inFlightCount >= state.pipelineSpeed) {
        scheduleNextMetronomeTick(250);
        return;
    }

    dispatchDiagRequest();

    if (state.pipelineSpeed > 1) {
        scheduleNextMetronomeTick();
    }
}

async function dispatchDiagRequest() {
    const controller = new AbortController();
    state.inFlightControllers.add(controller);
    state.inFlightCount++;
    const reqSeq = ++state.seqCounter;
    const t0 = Date.now();

    try {
        const data = await apiFetch('diagnostics', { signal: controller.signal });
        const rtt = Date.now() - t0;
        if (rtt > 200 && rtt < 15000) {
            state.rttSamples.push(rtt);
            if (state.rttSamples.length > 4) state.rttSamples.shift();
            state.measuredRtt = Math.round(state.rttSamples.reduce((a, b) => a + b, 0) / state.rttSamples.length);
        }

        if (!state.diagnosticsOpen || controller.signal.aborted) return;

        if (!data.available || !data.stats) {
            if (state.lastRenderedSeq === 0 && diagnosticsLoading) {
                diagnosticsLoading.style.display = 'flex';
                if (data.debug && data.debug.message) {
                    diagnosticsLoading.className = 'diagnostics-error';
                    diagnosticsLoading.textContent = `⚠ ${data.debug.message}`;
                } else {
                    diagnosticsLoading.className = 'diagnostics-loading';
                    diagnosticsLoading.innerHTML = '<span class="diagnostics-spinner"></span><span>PROBING SYSTEM TELEMETRY…</span>';
                }
                if (diagnosticsContent) diagnosticsContent.style.display = 'none';
            }
            return;
        }

        if (reqSeq > state.lastRenderedSeq) {
            state.lastRenderedSeq = reqSeq;
            if (diagnosticsLoading) diagnosticsLoading.style.display = 'none';
            if (diagnosticsContent) diagnosticsContent.style.display = 'flex';
            renderDiagnostics(data.stats);
        }
    } catch (e) {
        if (!state.diagnosticsOpen || e.name === 'AbortError' || controller.signal.aborted) return;
        if (e.message === 'auth') return;
        if (state.lastRenderedSeq === 0 && diagnosticsLoading) {
            diagnosticsLoading.style.display = 'flex';
            diagnosticsLoading.className = 'diagnostics-error';
            diagnosticsLoading.textContent = '✗ Diagnostic telemetry unavailable: ' + (e.message || 'error');
        }
    } finally {
        state.inFlightControllers.delete(controller);
        state.inFlightCount = Math.max(0, state.inFlightCount - 1);

        if (!controller.signal.aborted && state.pipelineSpeed === 1 && state.diagnosticsOpen) {
            scheduleNextMetronomeTick(500);
        }
    }
}

// ─── Launcher Icons ───────────────────────────────────────────
function getLauncherIconSvg(launcher) {
    switch (launcher) {
        case 'steam':
            return `<svg class="diag-icon-svg steam" viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/></svg>`;
        case 'xbox':
            return `<svg class="diag-icon-svg xbox" viewBox="0 0 24 24" fill="currentColor"><path d="M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.902-2.967 1.877-1.912-4.316-8.709-7.902-11.417-3.582 2.708-9.779 9.505-7.898 11.417zm11.16-14.406c2.5 2.961 7.484 10.313 6.076 12.912C23.002 17.48 24 14.861 24 12.004c0-3.34-1.365-6.362-3.57-8.536 0 0-.027-.022-.082-.042-.063-.022-.152-.045-.281-.045-.592 0-1.985.434-4.805 3.246zM3.654 3.426c-.057.02-.082.041-.086.042C1.365 5.642 0 8.664 0 12.004c0 2.854.998 5.473 2.661 7.533-1.401-2.605 3.579-9.951 6.08-12.91-2.82-2.813-4.216-3.245-4.806-3.245-.131 0-.223.021-.281.046v-.002zM12 3.551S9.055 1.828 6.755 1.746c-.903-.033-1.454.295-1.521.339C7.379.646 9.659 0 11.984 0H12c2.334 0 4.605.646 6.766 2.085-.068-.046-.615-.372-1.52-.339C14.946 1.828 12 3.545 12 3.545v.006z"/></svg>`;
        case 'epic':
            return `<svg class="diag-icon-svg epic" viewBox="0 0 24 24" fill="currentColor"><path d="M3.537 0C2.165 0 1.66.506 1.66 1.879V18.44a4.262 4.262 0 00.02.433c.031.3.037.59.316.92.027.033.311.245.311.245.153.075.258.13.43.2l8.335 3.491c.433.199.614.276.928.27h.002c.314.006.495-.071.928-.27l8.335-3.492c.172-.07.277-.124.43-.2 0 0 .284-.211.311-.243.28-.33.285-.621.316-.92a4.261 4.261 0 00.02-.434V1.879c0-1.373-.506-1.88-1.878-1.88zm13.366 3.11h.68c1.138 0 1.688.553 1.688 1.696v1.88h-1.374v-1.8c0-.369-.17-.54-.523-.54h-.235c-.367 0-.537.17-.537.539v5.81c0 .369.17.54.537.54h.262c.353 0 .523-.171.523-.54V8.619h1.373v2.143c0 1.144-.562 1.71-1.7 1.71h-.694c-1.138 0-1.7-.566-1.7-1.71V4.82c0-1.144.562-1.709 1.7-1.709zm-12.186.08h3.114v1.274H6.117v2.603h1.648v1.275H6.117v2.774h1.74v1.275h-3.14zm3.816 0h2.198c1.138 0 1.7.564 1.7 1.708v2.445c0 1.144-.562 1.71-1.7 1.71h-.799v3.338h-1.4zm4.53 0h1.4v9.201h-1.4zm-3.13 1.235v3.392h.575c.354 0 .523-.171.523-.54V4.965c0-.368-.17-.54-.523-.54zm-3.74 10.147a1.708 1.708 0 01.591.108 1.745 1.745 0 01.49.299l-.452.546a1.247 1.247 0 00-.308-.195.91.91 0 00-.363-.068.658.658 0 00-.28.06.703.703 0 00-.224.163.783.783 0 00-.151.243.799.799 0 00-.056.299v.008a.852.852 0 00.056.31.7.7 0 00.157.245.736.736 0 00.238.16.774.774 0 00.303.058.79.79 0 00.445-.116v-.339h-.548v-.565H7.37v1.255a2.019 2.019 0 01-.524.307 1.789 1.789 0 01-.683.123 1.642 1.642 0 01-.602-.107 1.46 1.46 0 01-.478-.3 1.371 1.371 0 01-.318-.455 1.438 1.438 0 01-.115-.58v-.008a1.426 1.426 0 01.113-.57 1.449 1.449 0 01.312-.46 1.418 1.418 0 01.474-.309 1.58 1.58 0 01.598-.111 1.708 1.708 0 01.045 0zm11.963.008a2.006 2.006 0 01.612.094 1.61 1.61 0 01.507.277l-.386.546a1.562 1.562 0 00-.39-.205 1.178 1.178 0 00-.388-.07.347.347 0 00-.208.052.154.154 0 00-.07.127v.008a.158.158 0 00.022.084.198.198 0 00.076.066.831.831 0 00.147.06c.062.02.14.04.236.061a3.389 3.389 0 01.43.122 1.292 1.292 0 01.328.17.678.678 0 01.207.24.739.739 0 01.071.337v.008a.865.865 0 01-.081.382.82.82 0 01-.229.285 1.032 1.032 0 01-.353.18 1.606 1.606 0 01-.46.061 2.16 2.16 0 01-.71-.116 1.718 1.718 0 01-.593-.346l.43-.514c.277.223.578.335.9.335a.457.457 0 00.236-.05.157.157 0 00.082-.142v-.008a.15.15 0 00-.02-.077.204.204 0 00-.073-.066.753.753 0 00-.143-.062 2.45 2.45 0 00-.233-.062 5.036 5.036 0 01-.413-.113 1.26 1.26 0 01-.331-.16.72.72 0 01-.222-.243.73.73 0 01-.082-.36v-.008a.863.863 0 01.074-.359.794.794 0 01.214-.283 1.007 1.007 0 01.34-.185 1.423 1.423 0 01.448-.066 2.006 2.006 0 01.025 0zm-9.358.025h.742l1.183 2.81h-.825l-.203-.499H8.623l-.198.498h-.81zm2.197.02h.814l.663 1.08.663-1.08h.814v2.79h-.766v-1.602l-.711 1.091h-.016l-.707-1.083v1.593h-.754zm3.469 0h2.235v.658h-1.473v.422h1.334v.61h-1.334v.442h1.493v.658h-2.255zm-5.3.897l-.315.793h.624zm-1.145 5.19h8.014l-4.09 1.348z"/></svg>`;
        case 'battlenet':
            return `<svg class="diag-icon-svg battlenet" viewBox="0 0 24 24" fill="currentColor"><path d="M18.94 8.296C15.9 6.892 11.534 6 7.426 6.332c.206-1.36.714-2.308 1.548-2.508 1.148-.275 2.4.48 3.594 1.854.782.102 1.71.28 2.355.429C12.747 2.013 9.828-.282 7.607.565c-1.688.644-2.553 2.97-2.448 6.094-2.2.468-3.915 1.3-5.013 2.495-.056.065-.181.227-.137.305.034.058.146-.008.194-.04 1.274-.89 2.904-1.373 5.027-1.676.303 3.333 1.713 7.56 4.055 10.952-1.28.502-2.356.536-2.946-.087-.812-.856-.784-2.318-.19-4.04a26.764 26.764 0 0 1-.807-2.254c-2.459 3.934-2.986 7.61-1.143 9.11 1.402 1.14 3.847.725 6.502-.926 1.505 1.672 3.083 2.74 4.667 3.094.084.015.287.043.332-.034.034-.06-.08-.124-.131-.149-1.408-.657-2.64-1.828-3.964-3.515 2.735-1.929 5.691-5.263 7.457-8.988 1.076.86 1.64 1.773 1.398 2.595-.336 1.131-1.615 1.84-3.403 2.185a27.697 27.697 0 0 1-1.548 1.826c4.634.16 8.08-1.22 8.458-3.565.286-1.786-1.295-3.696-4.053-5.17.696-2.139.832-4.04.346-5.588-.029-.08-.106-.27-.196-.27-.068 0-.067.13-.063.187.135 1.547-.263 3.2-1.062 5.19zm-8.533 9.869c-1.96-3.145-3.09-6.849-3.082-10.594 3.702-.124 7.474.748 10.714 2.627-1.743 3.269-4.385 6.1-7.633 7.966h.001z"/></svg>`;
        case 'desktop':
            return `<svg class="diag-icon-svg desktop" viewBox="0 0 24 24" fill="currentColor"><path d="M20 3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h6l-2 2v1h8v-1l-2-2h6c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H4V5h16v11z"/></svg>`;
        case 'standalone':
        default:
            return `<svg class="diag-icon-svg gamepad" viewBox="0 0 24 24" fill="currentColor"><path d="M21.58 16.09l-1.09-7.66C20.21 6.46 18.52 5 16.53 5H7.47C5.48 5 3.79 6.46 3.51 8.43l-1.09 7.66C2.2 17.63 3.39 19 4.94 19c.68 0 1.32-.27 1.8-.75L9 16h6l2.25 2.25c.48.48 1.13.75 1.81.75 1.55 0 2.74-1.37 2.52-2.91zM11 11H9v2H8v-2H6v-1h2V8h1v2h2v1zm4-1c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>`;
    }
}

// ─── Rendering Diagnostics Data ───────────────────────────────
export function renderDiagnostics(s) {
    if (!s) return;

    // 1. CPU & RAM
    if (diagCpuName) diagCpuName.textContent = s.cpu_name || 'CPU';

    let hasCpuFan = false;
    let cpuFanPct = 0;
    const curFan = (s.cpu_fan_cur !== 'N/A' && s.cpu_fan_cur !== null && s.cpu_fan_cur !== undefined) ? parseFloat(s.cpu_fan_cur) : NaN;
    const maxFan = (s.cpu_fan_max !== 'N/A' && s.cpu_fan_max !== null && s.cpu_fan_max !== undefined) ? parseFloat(s.cpu_fan_max) : NaN;

    if (!isNaN(curFan) && !isNaN(maxFan) && maxFan > 0) {
        cpuFanPct = Math.min(100, Math.round((curFan / maxFan) * 100));
        hasCpuFan = true;
    } else if (s.cpu_fan !== null && s.cpu_fan !== undefined && s.cpu_fan !== 'N/A') {
        const parsed = parseInt(s.cpu_fan, 10);
        if (!isNaN(parsed)) {
            cpuFanPct = Math.max(0, Math.min(100, parsed));
            hasCpuFan = true;
        }
    } else if (!isNaN(curFan)) {
        hasCpuFan = true;
    }

    let fanDisplay = hasCpuFan ? `${cpuFanPct}%` : '';
    let fanTooltip = '';
    if (!isNaN(curFan)) {
        fanTooltip = `CPU Fan: ${fanDisplay ? fanDisplay + ' · ' : ''}${Math.round(curFan)} RPM`;
        if (!isNaN(maxFan) && maxFan > 0 && (!hasCpuFan || cpuFanPct >= 80 || maxFan > curFan * 1.3)) {
            fanTooltip += ` (max ${Math.round(maxFan)} RPM)`;
        }
    } else if (hasCpuFan) {
        fanTooltip = `CPU Fan: ${fanDisplay}`;
    }

    let cpuDetail = `${s.cpu_load}%`;
    if (s.cpu_power && s.cpu_power !== 'N/A' && s.cpu_power !== null) cpuDetail += ` · ⚡ ${s.cpu_power}W`;
    if (s.cpu_freq && s.cpu_freq !== 'N/A' && s.cpu_freq !== null) cpuDetail += ` · ${s.cpu_freq}GHz`;
    if (s.cpu_temp && s.cpu_temp !== 'N/A' && s.cpu_temp !== null) cpuDetail += ` · ${s.cpu_temp}°C`;
    if (hasCpuFan) cpuDetail += ` · 🌀 ${fanDisplay || (Math.round(curFan) + ' RPM')}`;
    if (diagCpuVal) {
        diagCpuVal.textContent = cpuDetail;
        if (fanTooltip) diagCpuVal.title = fanTooltip;
    }
    if (diagCpuBar) diagCpuBar.style.width = Math.max(0, Math.min(100, s.cpu_load)) + '%';

    if (diagChartCpuFanPill && diagChartCpuFanVal) {
        if (hasCpuFan) {
            diagChartCpuFanPill.style.display = 'inline-flex';
            diagChartCpuFanVal.textContent = fanDisplay || (Math.round(curFan) + ' RPM');
            if (fanTooltip) {
                diagChartCpuFanPill.title = fanTooltip;
                diagChartCpuFanPill.dataset.tooltip = fanTooltip;
            }
        } else {
            diagChartCpuFanPill.style.display = 'none';
        }
    }

    if (diagRamVal) diagRamVal.textContent = `${s.ram_used} / ${s.ram_total} GB (${s.ram_pct}%)`;
    if (diagRamBar) diagRamBar.style.width = Math.max(0, Math.min(100, s.ram_pct)) + '%';

    const cpuL = typeof s.cpu_load === 'number' ? s.cpu_load : parseFloat(s.cpu_load) || 0;
    const ramP = typeof s.ram_pct === 'number' ? s.ram_pct : parseFloat(s.ram_pct) || 0;
    const cpuPwr = (s.cpu_power && s.cpu_power !== 'N/A') ? parseFloat(s.cpu_power) || 0 : 0;
    const cpuTemp = (s.cpu_temp && s.cpu_temp !== 'N/A') ? parseFloat(s.cpu_temp) || 0 : 0;

    if (diagChartCpuVal) diagChartCpuVal.textContent = Math.round(cpuL) + '%';
    if (diagChartRamVal) diagChartRamVal.textContent = Math.round(ramP) + '%';
    if (diagChartCpuPwrPill && diagChartCpuPowerVal) {
        if (state.secondaryMetric === 'temp') {
            if (cpuTemp > 0) {
                diagChartCpuPwrPill.style.display = 'inline-flex';
                diagChartCpuPowerVal.textContent = cpuTemp + '°C';
            } else {
                diagChartCpuPwrPill.style.display = 'none';
            }
        } else {
            if (cpuPwr > 0) {
                diagChartCpuPwrPill.style.display = 'inline-flex';
                diagChartCpuPowerVal.textContent = cpuPwr + 'W';
            } else {
                diagChartCpuPwrPill.style.display = 'none';
            }
        }
    }
    state.cpuHistory.push({ cpu: cpuL, ram: ramP, power: cpuPwr, temp: cpuTemp, fan: cpuFanPct, time: Date.now() });
    if (state.cpuHistory.length > state.historyMax) state.cpuHistory.shift();

    // Top 3 Processes (htop Mini Table)
    if (diagProcsList) {
        diagProcsList.textContent = '';
        const procs = s.top_procs || s.processes || s.top_processes || [];
        if (Array.isArray(procs) && procs.length > 0) {
            const activeExe = (s.foreground_exe || '').toLowerCase().trim();
            const activePid = s.foreground_pid ? String(s.foreground_pid) : '';
            const activeApp = (s.foreground_app || '').toLowerCase().trim();
            const isDesktop = !activeApp || activeApp.includes('desktop') || activeExe === 'explorer.exe';

            procs.slice(0, 3).forEach((p, idx) => {
                const row = document.createElement('div');
                const pName = (p.name || '').toLowerCase().trim();
                const pPid = p.pid ? String(p.pid) : '';

                // Only highlight if it strictly matches a launched foreground game/application
                const matchesExe = activeExe && (pName === activeExe || pName.replace(/\.exe$/, '') === activeExe.replace(/\.exe$/, ''));
                const matchesPid = activePid && pPid && (pPid === activePid);
                const isForeground = !isDesktop && (matchesExe || matchesPid);

                row.className = isForeground ? 'diag-proc-row active-proc' : 'diag-proc-row';

                const rank = document.createElement('span');
                rank.className = 'dpr-rank';
                rank.textContent = (idx + 1);

                const pid = document.createElement('span');
                pid.className = 'dpr-pid';
                pid.textContent = p.pid ? p.pid : '—';

                const name = document.createElement('span');
                name.className = 'dpr-name';
                name.textContent = p.name || '—';
                name.title = `${p.name || 'Process'} (PID: ${p.pid || 'N/A'})` + (isForeground ? ' • [ACTIVE FOREGROUND APP]' : '');

                const cpu = document.createElement('span');
                cpu.className = 'dpr-cpu';
                const cpuVal = typeof p.cpu === 'number' ? (p.cpu % 1 === 0 ? p.cpu : p.cpu.toFixed(1)) : (parseFloat(p.cpu) || 0);
                cpu.textContent = `${cpuVal}%`;

                const mem = document.createElement('span');
                mem.className = 'dpr-mem';
                const memFormatted = typeof p.mem === 'string' ? p.mem :
                    (typeof p.mem_mb === 'number' ? (p.mem_mb >= 1024 ? (p.mem_mb / 1024).toFixed(1) + ' GB' : Math.round(p.mem_mb) + ' MB') :
                    (p.mem !== undefined && p.mem !== null ? `${p.mem}` : '—'));
                mem.textContent = memFormatted;

                row.appendChild(rank);
                row.appendChild(pid);
                row.appendChild(name);
                row.appendChild(cpu);
                row.appendChild(mem);
                diagProcsList.appendChild(row);
            });
        } else {
            const emptyRow = document.createElement('div');
            emptyRow.className = 'diag-proc-row';
            emptyRow.style.color = 'rgba(255,255,255,0.4)';
            emptyRow.textContent = 'No process telemetry';
            diagProcsList.appendChild(emptyRow);
        }
    }

    // 2. GPU & VRAM
    if (diagGpuName) diagGpuName.textContent = s.gpu_name || 'GPU';
    if (diagGpuDriver) {
        diagGpuDriver.textContent = s.gpu_driver && s.gpu_driver !== 'N/A' ? `v${s.gpu_driver}` : '—';
    }
    if (s.gpu_load !== 'N/A' && s.gpu_load !== null && s.gpu_load !== undefined) {
        let hasGpuFan = false;
        let gpuFanPct = 0;
        const curGpuFan = (s.gpu_fan_cur !== 'N/A' && s.gpu_fan_cur !== null && s.gpu_fan_cur !== undefined) ? parseFloat(s.gpu_fan_cur) : NaN;
        const maxGpuFan = (s.gpu_fan_max !== 'N/A' && s.gpu_fan_max !== null && s.gpu_fan_max !== undefined) ? parseFloat(s.gpu_fan_max) : NaN;

        if (s.gpu_fan && s.gpu_fan !== 'N/A' && s.gpu_fan !== '[Not Supported]') {
            const parsed = parseInt(s.gpu_fan, 10);
            if (!isNaN(parsed)) {
                gpuFanPct = Math.max(0, Math.min(100, parsed));
                hasGpuFan = true;
            }
        } else if (!isNaN(curGpuFan) && !isNaN(maxGpuFan) && maxGpuFan > 0) {
            gpuFanPct = Math.min(100, Math.round((curGpuFan / maxGpuFan) * 100));
            hasGpuFan = true;
        } else if (!isNaN(curGpuFan)) {
            hasGpuFan = true;
        }

        let gpuFanDisplay = hasGpuFan ? `${gpuFanPct}%` : '';
        let gpuFanTooltip = '';
        if (!isNaN(curGpuFan)) {
            gpuFanTooltip = `GPU Fan: ${gpuFanDisplay ? gpuFanDisplay + ' · ' : ''}${Math.round(curGpuFan)} RPM`;
            if (!isNaN(maxGpuFan) && maxGpuFan > 0 && (!hasGpuFan || gpuFanPct >= 80 || maxGpuFan > curGpuFan * 1.3)) {
                gpuFanTooltip += ` (max ${Math.round(maxGpuFan)} RPM)`;
            }
        } else if (hasGpuFan) {
            gpuFanTooltip = `GPU Fan: ${gpuFanDisplay}`;
        }

        if (s.gpu_power && s.gpu_power !== 'N/A' && parseInt(s.gpu_power, 10) > 0) {
            state.lastKnownGpuPower = parseInt(s.gpu_power, 10);
        }
        if (s.gpu_freq && s.gpu_freq !== 'N/A' && parseInt(s.gpu_freq, 10) > 0) {
            state.lastKnownGpuFreq = parseInt(s.gpu_freq, 10);
        }

        const effectiveGpuPower = (s.gpu_power && s.gpu_power !== 'N/A') ? s.gpu_power : (state.lastKnownGpuPower || null);
        const effectiveGpuFreq = (s.gpu_freq && s.gpu_freq !== 'N/A') ? s.gpu_freq : (state.lastKnownGpuFreq || null);

        let gpuDetail = `${s.gpu_load}%`;
        if (effectiveGpuPower) gpuDetail += ` · ⚡ ${effectiveGpuPower}W`;
        if (effectiveGpuFreq) gpuDetail += ` · ${effectiveGpuFreq}MHz`;
        if (s.gpu_temp && s.gpu_temp !== 'N/A') gpuDetail += ` · ${s.gpu_temp}°C`;
        if (hasGpuFan) gpuDetail += ` · 🌀 ${gpuFanDisplay || (Math.round(curGpuFan) + ' RPM')}`;
        if (diagGpuVal) {
            diagGpuVal.textContent = gpuDetail;
            if (gpuFanTooltip) diagGpuVal.title = gpuFanTooltip;
        }
        if (diagGpuBar) diagGpuBar.style.width = Math.max(0, Math.min(100, parseInt(s.gpu_load, 10) || 0)) + '%';

        const vramUsed = parseInt(s.gpu_mem_used, 10);
        const vramTotal = parseInt(s.gpu_mem_total, 10);
        let vramPct = 0;
        if (!isNaN(vramUsed) && !isNaN(vramTotal) && vramTotal > 0) {
            vramPct = Math.round((vramUsed / vramTotal) * 100);
            const usedGB = (vramUsed / 1024).toFixed(1);
            const totalGB = (vramTotal / 1024).toFixed(0);
            if (diagVramVal) diagVramVal.textContent = `${usedGB} / ${totalGB} GB (${vramPct}%)`;
            if (diagVramBar) diagVramBar.style.width = Math.max(0, Math.min(100, vramPct)) + '%';
        }

        const pwrW = effectiveGpuPower ? parseInt(effectiveGpuPower, 10) || 0 : 0;
        const gpuTemp = (s.gpu_temp && s.gpu_temp !== 'N/A') ? parseFloat(s.gpu_temp) || 0 : 0;
        const encL = (s.gpu_enc && s.gpu_enc !== 'N/A') ? parseInt(s.gpu_enc, 10) || 0 : 0;
        const fanPct = gpuFanPct;
        const gpuL = parseInt(s.gpu_load, 10) || 0;

        if (diagGpuPower) diagGpuPower.textContent = effectiveGpuPower ? `${effectiveGpuPower}W` : '—';
        if (diagGpuEnc) diagGpuEnc.textContent = (s.gpu_enc && s.gpu_enc !== 'N/A') ? `${s.gpu_enc}%` : '0%';

        if (diagChartGpuVal) diagChartGpuVal.textContent = gpuL + '%';
        if (diagChartVramVal) diagChartVramVal.textContent = vramPct + '%';
        if (diagChartEncVal) diagChartEncVal.textContent = encL + '%';
        if (diagChartFanVal) {
            diagChartFanVal.textContent = hasGpuFan ? (fanPct + '%') : '—';
            const pill = diagChartGpuFanPill || diagChartFanVal.parentElement;
            if (pill) {
                if (hasGpuFan && gpuFanTooltip) {
                    pill.title = gpuFanTooltip;
                    pill.dataset.tooltip = gpuFanTooltip;
                } else {
                    pill.removeAttribute('title');
                    delete pill.dataset.tooltip;
                }
            }
        }
        if (diagChartPowerVal) diagChartPowerVal.textContent = (state.secondaryMetric === 'temp') ? (gpuTemp + '°C') : (pwrW + 'W');

        state.gpuHistory.push({ gpu: gpuL, vram: vramPct, enc: encL, fan: fanPct, power: pwrW, temp: gpuTemp, time: Date.now() });
        if (state.gpuHistory.length > state.historyMax) state.gpuHistory.shift();

        if (s.gpu_power_limit && parseInt(s.gpu_power_limit, 10) > 0) {
            state.lastKnownGpuPowerLimit = parseInt(s.gpu_power_limit, 10);
        }
    } else {
        if (diagGpuVal) diagGpuVal.textContent = 'N/A';
        if (diagGpuBar) diagGpuBar.style.width = '0%';
        if (diagVramVal) diagVramVal.textContent = 'N/A';
        if (diagVramBar) diagVramBar.style.width = '0%';
        if (diagGpuPower) diagGpuPower.textContent = '—';
        if (diagGpuEnc) diagGpuEnc.textContent = '—';
        if (diagChartFanVal) diagChartFanVal.textContent = '—';
    }

    // 3. Storage / Disks
    const dRead = typeof s.disk_read_mb === 'number' ? s.disk_read_mb : parseFloat(s.disk_read_mb) || 0;
    const dWrite = typeof s.disk_write_mb === 'number' ? s.disk_write_mb : parseFloat(s.disk_write_mb) || 0;
    if (diagDiskIo) diagDiskIo.textContent = `📖 R: ${dRead.toFixed(1)} MB/s | ✍️ W: ${dWrite.toFixed(1)} MB/s`;
    if (diagChartDiskReadVal) diagChartDiskReadVal.textContent = dRead.toFixed(1) + ' MB/s';
    if (diagChartDiskWriteVal) diagChartDiskWriteVal.textContent = dWrite.toFixed(1) + ' MB/s';
    state.diskHistory.push({ read: dRead, write: dWrite, time: Date.now() });
    if (state.diskHistory.length > state.historyMax) state.diskHistory.shift();

    if (diagDisksContainer) {
        diagDisksContainer.textContent = '';
        const visibleDisks = (s.disks || []).filter(d => {
            const label = (d.label || '').toLowerCase();
            return !label.includes('réservé au système') &&
                !label.includes('reserve au systeme') &&
                !label.includes('system reserved') &&
                !label.includes('récupération') &&
                !label.includes('recuperation') &&
                !label.includes('recovery');
        });

        if (visibleDisks.length > 0) {
            visibleDisks.forEach(d => {
                const item = document.createElement('div');
                item.className = 'diag-disk-item';

                const header = document.createElement('div');
                header.className = 'diag-disk-header';

                const dev = d.device || d.drive || 'C:';
                const totalGb = Math.round(d.total !== undefined ? d.total : (d.total_gb || 0));
                const usedGb = Math.round(d.used !== undefined ? d.used : (d.used_gb || 0));
                const freeGb = Math.round(d.free !== undefined ? d.free : (d.free_gb || (totalGb - usedGb)));
                const pct = d.pct !== undefined ? d.pct : (d.used_pct !== undefined ? d.used_pct : (totalGb > 0 ? Math.round((usedGb / totalGb) * 100) : 0));

                const name = document.createElement('span');
                name.className = 'dd-name';
                name.textContent = `${dev} [${d.label || 'Volume'}]`;

                const stats = document.createElement('span');
                stats.className = 'dd-stats';
                stats.textContent = `${usedGb} / ${totalGb} GB (${pct}%) · ${freeGb} GB free`;

                header.appendChild(name);
                header.appendChild(stats);

                const bar = document.createElement('div');
                bar.className = 'diag-disk-bar';

                const fill = document.createElement('div');
                const levelClass = d.pct < 75 ? 'level-low' : (d.pct < 85 ? 'level-med' : 'level-high');
                fill.className = `diag-disk-fill ${levelClass}`;
                fill.style.width = Math.max(0, Math.min(100, d.pct)) + '%';

                bar.appendChild(fill);
                item.appendChild(header);
                item.appendChild(bar);
                diagDisksContainer.appendChild(item);
            });
        } else {
            const emptyDisk = document.createElement('div');
            emptyDisk.style.fontSize = '0.65rem';
            emptyDisk.style.color = 'rgba(255,255,255,0.4)';
            emptyDisk.textContent = 'No storage volumes detected.';
            diagDisksContainer.appendChild(emptyDisk);
        }
    }

    // 4. Network, Sunshine & OS
    if (diagUptime) diagUptime.textContent = `Uptime: ${s.uptime}`;

    // Sunshine Status & Streaming Detection
    const sunshineRunning = Boolean(s.sunshine_running !== false);
    setSunshineIsRunning(sunshineRunning);

    if (diagSunshineStatus) {
        if (!sunshineRunning) {
            diagSunshineStatus.textContent = '● DOWN';
            diagSunshineStatus.className = 'dii-val stream-down';
            resetSunshinePing();
            updateSunshinePingStatsUI();
            updateSunshinePingUI();
        } else {
            if (s.sunshine_clients > 0) {
                diagSunshineStatus.innerHTML = `● STREAMING <span class="stream-clients">(${s.sunshine_clients} client${s.sunshine_clients > 1 ? 's' : ''})</span>`;
                diagSunshineStatus.className = 'dii-val stream-active';
            } else {
                diagSunshineStatus.innerHTML = '○ Idle <span class="stream-clients">(0 client)</span>';
                diagSunshineStatus.className = 'dii-val stream-idle';
            }

            measureSunshinePing().then(res => {
                if (!state.diagnosticsOpen) return;
                updateSunshinePingStatsUI();
                updateSunshinePingUI();
            });
            if (sunshinePingSamples.length > 0) {
                const pingClass = lastSunshinePingMs <= 30 ? 'good' : (lastSunshinePingMs <= 50 ? 'medium' : (lastSunshinePingMs <= 100 ? 'warn' : 'bad'));
                renderPingSparkline(pingClass);
            }
        }
    }

    const nRecv = typeof s.net_recv_mb === 'number' ? s.net_recv_mb : (s.net && s.net.recv_mb_s !== undefined ? s.net.recv_mb_s : parseFloat(s.net_recv_mb) || 0);
    const nSent = typeof s.net_sent_mb === 'number' ? s.net_sent_mb : (s.net && s.net.sent_mb_s !== undefined ? s.net.sent_mb_s : parseFloat(s.net_sent_mb) || 0);
    const netAdapter = s.net_adapter || (s.net && s.net.adapter) || '';

    if (diagNetLabel) diagNetLabel.textContent = netAdapter ? `NETWORK TRAFFIC (${netAdapter})` : 'NETWORK TRAFFIC';
    if (diagNetIo) diagNetIo.textContent = `↓ ${nRecv.toFixed(1)} MB/s | ↑ ${nSent.toFixed(1)} MB/s`;
    if (diagChartNetRecvVal) diagChartNetRecvVal.textContent = nRecv.toFixed(2) + ' MB/s';
    if (diagChartNetSentVal) diagChartNetSentVal.textContent = nSent.toFixed(2) + ' MB/s';
    state.netHistory.push({ recv: nRecv, sent: nSent, time: Date.now() });
    if (state.netHistory.length > state.historyMax) state.netHistory.shift();

    // Foreground App
    const appName = s.foreground_app || 'Windows Desktop';
    const isDesktop = appName === 'Windows Desktop' || s.foreground_launcher === 'desktop';
    if (diagApp) {
        if (s.foreground_healthy === false) {
            diagApp.textContent = `${appName} (Not Responding)`;
            diagApp.className = 'dii-val app-frozen';
        } else {
            diagApp.textContent = appName;
            diagApp.className = 'dii-val';
        }
    }
    if (diagAppRuntime) {
        diagAppRuntime.textContent = (s.foreground_runtime && !isDesktop) ? s.foreground_runtime : '';
    }
    if (diagAppIconWrap) {
        const launcher = s.foreground_launcher || (isDesktop ? 'desktop' : 'standalone');
        diagAppIconWrap.innerHTML = getLauncherIconSvg(launcher);
    }
    if (diagAppCard) {
        const details = [];
        if (appName) details.push(appName);
        if (s.foreground_exe && s.foreground_exe !== appName) details.push(s.foreground_exe);
        if (s.foreground_launcher && !isDesktop) {
            const launcherNames = {
                steam: 'Steam',
                xbox: 'Xbox / PC Game Pass',
                epic: 'Epic Games',
                battlenet: 'Battle.net',
                gog: 'GOG Galaxy',
                ea: 'EA App',
                ubisoft: 'Ubisoft Connect',
                standalone: 'Standalone'
            };
            details.push(launcherNames[s.foreground_launcher] || s.foreground_launcher);
        }
        if (s.foreground_pid) details.push(`PID ${s.foreground_pid}`);
        if (s.foreground_runtime && !isDesktop) details.push(`Session: ${s.foreground_runtime}`);
        if (s.foreground_healthy === false) details.push('⚠️ Status: Not Responding');

        diagAppCard.title = details.join(' • ');
    }

    // Windows Meta & Updates
    if (diagWinLabel) {
        const ed = s.win_edition ? s.win_edition.toUpperCase() : 'WINDOWS';
        diagWinLabel.textContent = ed + (s.win_ver ? ' (' + s.win_ver + ')' : '');
    }
    if (diagWinBuild) {
        diagWinBuild.textContent = s.win_build ? 'Build ' + s.win_build : '';
    }
    if (diagReboot) {
        if (s.reboot_pending) {
            diagReboot.textContent = '⚠️ Reboot required' + (s.reboot_kb ? ' (' + s.reboot_kb + ')' : '');
            diagReboot.style.color = 'var(--neon-red)';
            diagReboot.style.textShadow = '0 0 8px rgba(255, 23, 68, 0.4)';
        } else {
            diagReboot.textContent = '✓ Up to date' + (s.win_update_date ? ' (' + s.win_update_date + ')' : '');
            diagReboot.style.color = 'var(--neon-green)';
            diagReboot.style.textShadow = '0 0 8px rgba(57, 255, 20, 0.4)';
        }
    }
    if (diagWinCard) {
        const details = [];
        if (s.win_edition) details.push(s.win_edition + (s.win_ver ? ' (' + s.win_ver + ')' : ''));
        if (s.win_build) details.push('Build ' + s.win_build);
        if (s.reboot_pending) {
            details.push('⚠️ Reboot pending' + (s.reboot_kb ? ' for ' + s.reboot_kb : ''));
        } else {
            details.push('✓ System up to date' + (s.win_update_raw ? ' (Last update: ' + s.win_update_raw + ')' : ''));
        }
        diagWinCard.title = details.join(' • ');
    }

    triggerChartsSlideAnimation();
}

// ─── Charts Rendering ─────────────────────────────────────────
export function renderCpuChart() {
    if (!state.cpuChartVisible || !diagCpuCanvas) return;
    const cpuData = state.cpuHistory.map(h => h.cpu);
    const ramData = state.cpuHistory.map(h => h.ram);
    const fanData = state.cpuHistory.map(h => h.fan || 0);
    const timestamps = state.cpuHistory.map(h => h.time);

    const datasets = [
        { label: 'CPU', data: cpuData, color: '#00f0ff', maxVal: 100, unit: '%', timestamps },
        { label: 'RAM', data: ramData, color: '#ff00ff', maxVal: 100, unit: '%', timestamps },
    ];

    const hasFan = fanData.some(f => f > 0);
    if (hasFan) {
        datasets.push({ label: 'FAN SPEED', data: fanData, color: '#39ff14', maxVal: 100, unit: '%', timestamps });
    }

    let hasSecondary = false;
    let maxSecondary = 0;
    let rightUnit = 'W';

    if (state.secondaryMetric === 'temp') {
        const tempData = state.cpuHistory.map(h => h.temp || 0);
        hasSecondary = tempData.some(t => t > 0);
        const maxRecordedTemp = hasSecondary ? Math.max(...tempData) : 0;
        maxSecondary = Math.max(100, Math.ceil(maxRecordedTemp / 10) * 10);
        rightUnit = '°C';
        if (hasSecondary) {
            datasets.push({ label: 'CPU TEMP', data: tempData, color: '#ff1744', maxVal: maxSecondary, unit: '°C', timestamps });
        }
    } else {
        const pwrData = state.cpuHistory.map(h => h.power || 0);
        hasSecondary = pwrData.some(p => p > 0);
        const maxRecordedPwr = hasSecondary ? Math.max(...pwrData) : 0;
        let maxPower = Math.max(maxRecordedPwr, state.cpuPowerMaxWatts);
        if (maxPower > state.cpuPowerMaxWatts) {
            maxPower = Math.ceil(maxPower / 50) * 50;
        }
        maxSecondary = maxPower;
        rightUnit = 'W';
        if (hasSecondary) {
            datasets.push({ label: 'CPU POWER', data: pwrData, color: '#ffd600', maxVal: maxSecondary, unit: 'W', timestamps });
        }
    }

    drawLineChart(diagCpuCanvas, datasets, {
        padLeft: 24,
        padRight: hasSecondary ? 30 : 8,
        rightAxis: hasSecondary,
        maxRightVal: maxSecondary,
        rightUnit,
        maxPoints: state.historyMax
    }, {
        pipelineSpeed: state.pipelineSpeed,
        slideProgress: state.chartSlideProgress,
        gpuMode: state.gpuMode
    });
}

export function renderGpuChart(powerLimit = 0) {
    if (!state.gpuChartVisible || !diagGpuCanvas) return;
    const gpuData = state.gpuHistory.map(h => h.gpu);
    const vramData = state.gpuHistory.map(h => h.vram);
    const encData = state.gpuHistory.map(h => h.enc);
    const fanData = state.gpuHistory.map(h => h.fan || 0);
    const timestamps = state.gpuHistory.map(h => h.time);

    let maxSecondary = 0;
    let rightUnit = 'W';
    let secondaryDataset = null;

    if (state.secondaryMetric === 'temp') {
        const tempData = state.gpuHistory.map(h => h.temp || 0);
        const maxRecordedTemp = tempData.length > 0 ? Math.max(...tempData) : 0;
        maxSecondary = Math.max(100, Math.ceil(maxRecordedTemp / 10) * 10);
        rightUnit = '°C';
        secondaryDataset = { label: 'GPU TEMP', data: tempData, color: '#ff1744', maxVal: maxSecondary, unit: '°C', timestamps };
    } else {
        const pwrData = state.gpuHistory.map(h => h.power || 0);
        const maxRecordedPwr = pwrData.length > 0 ? Math.max(...pwrData) : 0;
        maxSecondary = Math.max(powerLimit || 0, maxRecordedPwr, 100);
        rightUnit = 'W';
        secondaryDataset = { label: 'GPU POWER', data: pwrData, color: '#ffd600', maxVal: maxSecondary, unit: 'W', timestamps };
    }

    drawLineChart(diagGpuCanvas, [
        { label: 'GPU LOAD', data: gpuData, color: '#00f0ff', maxVal: 100, unit: '%', timestamps },
        { label: 'VRAM LOAD', data: vramData, color: '#ff00ff', maxVal: 100, unit: '%', timestamps },
        { label: 'ENCODER', data: encData, color: '#ff7700', maxVal: 100, unit: '%', timestamps },
        { label: 'FAN SPEED', data: fanData, color: '#39ff14', maxVal: 100, unit: '%', timestamps },
        secondaryDataset,
    ], {
        padLeft: 24,
        padRight: 30,
        rightAxis: true,
        maxRightVal: maxSecondary,
        rightUnit,
        maxPoints: state.historyMax
    }, {
        pipelineSpeed: state.pipelineSpeed,
        slideProgress: state.chartSlideProgress,
        gpuMode: state.gpuMode
    });
}

export function renderDiskChart() {
    if (!state.diskChartVisible || !diagDiskCanvas) return;
    const readData = state.diskHistory.map(h => h.read);
    const writeData = state.diskHistory.map(h => h.write);
    const allData = [...readData, ...writeData];
    const maxThroughput = allData.length > 0 ? Math.max(...allData) : 0;
    const maxVal = Math.max(Math.ceil(maxThroughput), 5);
    const timestamps = state.diskHistory.map(h => h.time);

    drawLineChart(diagDiskCanvas, [
        { label: 'DISK READ', data: readData, color: '#ffd600', maxVal, unit: 'MB/s', timestamps },
        { label: 'DISK WRITE', data: writeData, color: '#ff9100', maxVal, unit: 'MB/s', timestamps },
    ], {
        padLeft: 28,
        padRight: 8,
        unit: 'M',
        maxLeftVal: maxVal,
        maxPoints: state.historyMax
    }, {
        pipelineSpeed: state.pipelineSpeed,
        slideProgress: state.chartSlideProgress,
        gpuMode: state.gpuMode
    });
}

export function renderNetChart() {
    if (!state.netChartVisible || !diagNetCanvas) return;
    const recvData = state.netHistory.map(h => h.recv);
    const sentData = state.netHistory.map(h => h.sent);
    const allData = [...recvData, ...sentData];
    const maxThroughput = allData.length > 0 ? Math.max(...allData) : 0;
    const maxVal = Math.max(Math.ceil(maxThroughput), 2);
    const timestamps = state.netHistory.map(h => h.time);

    drawLineChart(diagNetCanvas, [
        { label: 'NET RECV', data: recvData, color: '#39ff14', maxVal, unit: 'MB/s', timestamps },
        { label: 'NET SENT', data: sentData, color: '#b388ff', maxVal, unit: 'MB/s', timestamps },
    ], {
        padLeft: 28,
        padRight: 8,
        unit: 'M',
        maxLeftVal: maxVal,
        maxPoints: state.historyMax
    }, {
        pipelineSpeed: state.pipelineSpeed,
        slideProgress: state.chartSlideProgress,
        gpuMode: state.gpuMode
    });
}

export function renderAllDiagCharts() {
    if (!state.diagnosticsOpen) return;
    if (state.cpuChartVisible) renderCpuChart();
    if (state.gpuChartVisible) renderGpuChart(state.lastKnownGpuPowerLimit);
    if (state.diskChartVisible) renderDiskChart();
    if (state.netChartVisible) renderNetChart();
}

function triggerChartsSlideAnimation() {
    if (diagChartAnimFrame) {
        cancelAnimationFrame(diagChartAnimFrame);
        diagChartAnimFrame = null;
    }

    if (state.gpuMode === 'light' || state.cpuHistory.length <= 1) {
        state.chartSlideProgress = 1;
        renderAllDiagCharts();
        return;
    }

    const duration = 280;
    const startTime = performance.now();
    let lastRenderTime = startTime;
    const targetInterval = (state.gpuMode === 'eco') ? 33 : 0;

    function step(now) {
        const elapsed = now - startTime;
        const rawProgress = Math.min(1, elapsed / duration);

        if (rawProgress >= 1) {
            state.chartSlideProgress = 1;
            renderAllDiagCharts();
            diagChartAnimFrame = null;
            return;
        }

        if (state.gpuMode === 'heavy' || (now - lastRenderTime >= targetInterval)) {
            lastRenderTime = now;
            state.chartSlideProgress = 1 - Math.pow(1 - rawProgress, 3);
            renderAllDiagCharts();
        }

        if (state.diagnosticsOpen) {
            diagChartAnimFrame = requestAnimationFrame(step);
        } else {
            state.chartSlideProgress = 1;
            renderAllDiagCharts();
            diagChartAnimFrame = null;
        }
    }

    state.chartSlideProgress = 0;
    renderAllDiagCharts();
    diagChartAnimFrame = requestAnimationFrame(step);
}

// ─── Sparkline Latency Widget ─────────────────────────────────
export function updateSunshinePingStatsUI() {
    if (!diagPingCur) return;
    if (!state.machineIsUp || !sunshineIsRunning || sunshinePingSamples.length === 0 || lastSunshinePingMs === null) {
        diagPingCur.textContent = '—';
        diagPingCur.className = 'dii-val';
        if (diagPingStatAvg) diagPingStatAvg.textContent = 'avg: —';
        if (diagPingStatDev) diagPingStatDev.textContent = 'σ: —';
        if (diagPingCtx && diagPingCanvas) diagPingCtx.clearRect(0, 0, diagPingCanvas.width, diagPingCanvas.height);
        return;
    }

    const n = sunshinePingSamples.length;
    const min = Math.min(...sunshinePingSamples);
    const max = Math.max(...sunshinePingSamples);
    const avg = sunshinePingSamples.reduce((a, b) => a + b, 0) / n;
    const variance = sunshinePingSamples.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / n;
    const stddev = Math.sqrt(variance);

    const typeStr = lastSunshinePingType === 'LOCAL' ? 'Local' : 'WAN';
    const pingClass = lastSunshinePingMs <= 30 ? 'good' : (lastSunshinePingMs <= 50 ? 'medium' : (lastSunshinePingMs <= 100 ? 'warn' : 'bad'));
    diagPingCur.className = 'dii-val';
    diagPingCur.innerHTML = `<span class="diag-ping-num ping-${pingClass}">${lastSunshinePingMs}ms</span> <span class="diag-ping-mode">(${typeStr})</span>`;

    if (diagPingStatAvg) diagPingStatAvg.textContent = `avg: ${avg.toFixed(1)}ms [${min}-${max}]`;
    if (diagPingStatDev) diagPingStatDev.textContent = `σ: ±${stddev.toFixed(1)}ms`;

    renderPingSparkline(pingClass);
}

export function renderPingSparkline(pingClass) {
    if (!diagPingCanvas || !diagPingCtx) return;
    const rect = diagPingCanvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.round(rect.width);
    const cssH = Math.round(rect.height) || 28;

    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);

    if (diagPingCanvas.width !== targetW || diagPingCanvas.height !== targetH) {
        diagPingCanvas.width = targetW;
        diagPingCanvas.height = targetH;
    }

    diagPingCtx.save();
    diagPingCtx.scale(dpr, dpr);
    diagPingCtx.clearRect(0, 0, cssW, cssH);

    if (!state.machineIsUp || !sunshineIsRunning || sunshinePingSamples.length < 2) {
        diagPingCtx.restore();
        return;
    }

    const data = sunshinePingSamples;
    const minVal = Math.min(...data);
    const maxVal = Math.max(...data);
    const range = Math.max(12, maxVal - minVal);

    const padX = 3;
    const padY = 2;
    const drawW = cssW - padX * 2;
    const drawH = cssH - padY * 2;
    const step = drawW / Math.max(1, data.length - 1);

    const points = data.map((v, i) => {
        const x = padX + i * step;
        const norm = (v - minVal) / range;
        const y = padY + drawH - norm * drawH;
        return {
            x,
            y,
            val: v,
            color: getPingColor(v),
            time: (sunshinePingTimes && sunshinePingTimes[i]) ? sunshinePingTimes[i] : null
        };
    });

    const gpuMode = state.gpuMode || 'eco';

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];

        diagPingCtx.save();
        diagPingCtx.beginPath();
        diagPingCtx.moveTo(p1.x, p1.y);
        diagPingCtx.lineTo(p2.x, p2.y);

        if (gpuMode === 'light') {
            diagPingCtx.strokeStyle = p2.color;
            diagPingCtx.lineWidth = 1.4;
            diagPingCtx.lineCap = 'round';
            diagPingCtx.stroke();
        } else if (gpuMode === 'eco') {
            if (p1.color === p2.color) {
                diagPingCtx.strokeStyle = p1.color;
            } else {
                const segGrad = diagPingCtx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
                segGrad.addColorStop(0, p1.color);
                segGrad.addColorStop(1, p2.color);
                diagPingCtx.strokeStyle = segGrad;
            }
            diagPingCtx.lineWidth = 1.6;
            diagPingCtx.lineCap = 'round';
            diagPingCtx.stroke();
        } else {
            if (p1.color === p2.color) {
                diagPingCtx.strokeStyle = p1.color;
                diagPingCtx.shadowColor = p1.color;
            } else {
                const segGrad = diagPingCtx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
                segGrad.addColorStop(0, p1.color);
                segGrad.addColorStop(1, p2.color);
                diagPingCtx.strokeStyle = segGrad;
                diagPingCtx.shadowColor = p2.color;
            }
            diagPingCtx.lineWidth = 1.6;
            diagPingCtx.lineCap = 'round';
            diagPingCtx.shadowBlur = 4;
            diagPingCtx.stroke();
        }
        diagPingCtx.restore();
    }

    const last = points[points.length - 1];
    diagPingCtx.save();
    diagPingCtx.beginPath();
    diagPingCtx.arc(last.x, last.y, 2.2, 0, Math.PI * 2);
    diagPingCtx.fillStyle = last.color;
    if (gpuMode === 'heavy') {
        diagPingCtx.shadowColor = last.color;
        diagPingCtx.shadowBlur = 5;
    }
    diagPingCtx.fill();
    diagPingCtx.restore();

    // Cache sparkline geometry for hover hit-testing
    diagPingCanvas._lastChartInfo = {
        padLeft: padX,
        padRight: padX,
        padTop: padY,
        plotW: drawW,
        plotH: drawH,
        points: points.map(p => ({ ...p })),
        totalPoints: data.length,
        maxPoints: data.length,
        stepX: step,
        slideOffset: 0,
        datasets: [{
            label: 'LATENCY',
            data,
            color: last.color,
            maxVal: minVal + range,
            unit: 'ms',
            timestamps: [...sunshinePingTimes]
        }],
        options: {}
    };

    // If sparkline currently has active hover point, dynamically follow
    if (diagPingCanvas._activeHoverPoint) {
        const hp = diagPingCanvas._activeHoverPoint;
        let activeX = hp.x;
        let activeY = hp.y;
        let pointFound = false;

        if (hp.timestamp && sunshinePingTimes.length > 0) {
            const idx = sunshinePingTimes.indexOf(hp.timestamp);
            if (idx !== -1 && points[idx]) {
                activeX = points[idx].x;
                activeY = points[idx].y;
                hp.x = activeX;
                hp.y = activeY;
                hp.color = points[idx].color;
                hp.valStr = `${Math.round(data[idx])} ms`;
                hp.timeStr = formatMetricAge(hp.timestamp);
                pointFound = true;
            }
        }

        if (!pointFound && hp.timestamp) {
            diagPingCanvas._activeHoverPoint = null;
            hideChartTooltip(diagPingCanvas);
        } else if (pointFound && activeX < padX - 2) {
            diagPingCanvas._activeHoverPoint = null;
            hideChartTooltip(diagPingCanvas);
        } else if (pointFound || !hp.timestamp) {
            diagPingCtx.save();
            diagPingCtx.beginPath();
            diagPingCtx.arc(activeX, activeY, 4, 0, Math.PI * 2);
            diagPingCtx.strokeStyle = hp.color;
            diagPingCtx.lineWidth = 1.6;
            if (gpuMode === 'heavy') {
                diagPingCtx.shadowColor = hp.color;
                diagPingCtx.shadowBlur = 6;
            }
            diagPingCtx.stroke();
            diagPingCtx.restore();

            const tooltip = document.getElementById('diag-chart-tooltip');
            if (tooltip && tooltip.classList.contains('visible') && tooltip._activeCanvas === diagPingCanvas) {
                const r = diagPingCanvas.getBoundingClientRect();
                updateChartTooltipContentAndPos(r.left + activeX, r.top + activeY, hp, tooltip);
            }
        }
    }

    diagPingCtx.restore();
}

// ─── Tooltip & Pointer Interactivity ──────────────────────────
function redrawCanvasOnly(canvas) {
    if (canvas === diagCpuCanvas && state.cpuChartVisible) renderCpuChart();
    else if (canvas === diagGpuCanvas && state.gpuChartVisible) renderGpuChart(state.lastKnownGpuPowerLimit);
    else if (canvas === diagDiskCanvas && state.diskChartVisible) renderDiskChart();
    else if (canvas === diagNetCanvas && state.netChartVisible) renderNetChart();
    else if (canvas === diagPingCanvas) {
        const pingClass = lastSunshinePingType === 'LOCAL' ? 'good' : (lastSunshinePingMs <= 30 ? 'good' : (lastSunshinePingMs <= 50 ? 'medium' : (lastSunshinePingMs <= 100 ? 'warn' : 'bad')));
        renderPingSparkline(pingClass);
    }
}

function handleCanvasPointerMove(canvas, e) {
    const info = canvas._lastChartInfo;
    if (!info || !info.datasets || info.datasets.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const touch = (e.touches && e.touches.length > 0) ? e.touches[0] : e;
    const clientX = touch.clientX;
    const clientY = touch.clientY;

    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    if (mx < 0 || mx > rect.width || my < 0 || my > rect.height) {
        hideChartTooltip(canvas);
        redrawCanvasOnly(canvas);
        return;
    }

    // Direct, ultra-precise hit-testing for Ping Sparkline using exact drawn points
    if (canvas === diagPingCanvas && info.points && info.points.length > 0) {
        let closestPoint = null;
        let minDistance = Infinity;

        info.points.forEach((pt, i) => {
            const dx = mx - pt.x;
            const dy = my - pt.y;
            const dist = Math.hypot(dx, dy * 0.85);

            if (dist < minDistance) {
                minDistance = dist;
                const ptTime = pt.time || (Date.now() - (info.points.length - 1 - i) * 2000);
                closestPoint = {
                    x: pt.x,
                    y: pt.y,
                    color: pt.color,
                    label: 'LATENCY',
                    timestamp: ptTime,
                    unit: 'ms',
                    valStr: `${Math.round(pt.val)} ms`,
                    timeStr: formatMetricAge(ptTime)
                };
            }
        });

        if (closestPoint) {
            const prevHp = canvas._activeHoverPoint;
            const isSamePoint = prevHp && prevHp.timestamp === closestPoint.timestamp;
            canvas._activeHoverPoint = closestPoint;
            if (!isSamePoint) {
                redrawCanvasOnly(canvas);
            }
            const ptScreenX = rect.left + closestPoint.x;
            const ptScreenY = rect.top + closestPoint.y;
            showChartTooltip(ptScreenX, ptScreenY, closestPoint, canvas);
        }
        return;
    }

    const { padLeft, plotW, padTop, plotH, totalPoints, slideOffset, datasets } = info;
    let closestPoint = null;
    let minDistance = Infinity;

    datasets.forEach((ds, dsIdx) => {
        const data = ds.data;
        if (!data || data.length === 0) return;
        const maxVal = ds.maxVal || 100;
        const offset = totalPoints - data.length;

        for (let i = 0; i < data.length; i++) {
            const rawVal = data[i];
            const clampedVal = Math.max(0, Math.min(maxVal, rawVal));
            const x = data.length === 1
                ? padLeft + plotW
                : padLeft + ((offset + i) / Math.max(1, totalPoints - 1)) * plotW + (slideOffset || 0);
            const y = padTop + plotH * (1 - clampedVal / maxVal);

            const dx = mx - x;
            const dy = my - y;
            const dist = Math.hypot(dx, dy * 0.85);

            if (dist < minDistance) {
                minDistance = dist;
                const ptTime = (ds.timestamps && ds.timestamps[i]) ? ds.timestamps[i] : Date.now();
                closestPoint = {
                    x,
                    y,
                    color: ds.color,
                    label: ds.label || 'METRIC',
                    datasetIndex: dsIdx,
                    timestamp: ptTime,
                    unit: ds.unit,
                    valStr: formatMetricValue(rawVal, ds.unit),
                    timeStr: formatMetricAge(ptTime)
                };
            }
        }
    });

    if (closestPoint) {
        const prevHp = canvas._activeHoverPoint;
        const isSamePoint = prevHp &&
            prevHp.timestamp === closestPoint.timestamp &&
            prevHp.datasetIndex === closestPoint.datasetIndex;
        canvas._activeHoverPoint = closestPoint;
        if (!isSamePoint) {
            redrawCanvasOnly(canvas);
        }
        const ptScreenX = rect.left + closestPoint.x;
        const ptScreenY = rect.top + closestPoint.y;
        showChartTooltip(ptScreenX, ptScreenY, closestPoint, canvas);
    }
}

function setupCanvasHoverInteractivity(canvas) {
    if (!canvas) return;
    canvas.addEventListener('mousemove', (e) => handleCanvasPointerMove(canvas, e));
    canvas.addEventListener('mouseleave', () => {
        hideChartTooltip(canvas);
        redrawCanvasOnly(canvas);
    });
    canvas.addEventListener('touchstart', (e) => handleCanvasPointerMove(canvas, e), { passive: true });
    canvas.addEventListener('touchmove', (e) => handleCanvasPointerMove(canvas, e), { passive: true });
    canvas.addEventListener('touchend', () => {
        hideChartTooltip(canvas);
        redrawCanvasOnly(canvas);
    });
}

// ─── Background Polling: Uptime & Sysinfo Preview ─────────────
export async function checkUptime() {
    if (!state.machineIsUp || !state.sshReady || state.isOffline || state.diagnosticsOpen) {
        if (state.uptimeTimer) {
            clearTimeout(state.uptimeTimer);
            state.uptimeTimer = null;
        }
        return;
    }
    if (state.uptimeInFlight) return;

    state.uptimeInFlight = true;
    try {
        const data = await apiFetch('uptime');
        if (!state.machineIsUp) return;
        if (data && data.uptime) {
            const formattedUptime = data.uptime.replace(/^0d\s+/, '');
            if (statusUptime) {
                statusUptime.style.display = 'inline-block';
                statusUptime.textContent = formattedUptime;
            }
            if (diagUptime) diagUptime.textContent = `Uptime: ${data.uptime}`;
        } else {
            if (statusUptime) statusUptime.style.display = 'none';
        }
    } catch (e) { /* silent */ }
    finally {
        state.uptimeInFlight = false;
        if (!state.diagnosticsOpen && state.machineIsUp && state.sshReady && !state.isOffline) {
            clearTimeout(state.uptimeTimer);
            state.uptimeTimer = setTimeout(checkUptime, state.uptimePollInterval);
        }
    }
}

export async function checkSysinfo() {
    if (!state.machineIsUp || !state.sshReady || state.isOffline || state.diagnosticsOpen) {
        hideSysinfoPanel();
        if (state.sysinfoTimer) {
            clearTimeout(state.sysinfoTimer);
            state.sysinfoTimer = null;
        }
        return;
    }
    if (state.sysinfoInFlight) return;

    state.sysinfoInFlight = true;
    try {
        const data = await apiFetch('sysinfo');
        if (!state.machineIsUp || !state.sshReady) return;
        if (data && data.available && data.stats) {
            updateSysinfoPreview(data.stats);
            if (data.stats.uptime && statusUptime && (!statusUptime.textContent || statusUptime.style.display === 'none')) {
                statusUptime.style.display = 'inline-block';
                statusUptime.textContent = data.stats.uptime.replace(/^0d\s+/, '');
            }
        } else {
            hideSysinfoPanel();
        }
    } catch (e) { /* silent */ }
    finally {
        state.sysinfoInFlight = false;
        if (!state.diagnosticsOpen && state.machineIsUp && state.sshReady && !state.isOffline) {
            clearTimeout(state.sysinfoTimer);
            state.sysinfoTimer = setTimeout(checkSysinfo, state.sysinfoPollInterval);
        }
    }
}
