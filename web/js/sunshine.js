/**
 * RigPulse — Sunshine Streaming Service & Latency Probes (js/sunshine.js)
 */

import { apiFetch } from './api.js';
import { state } from './state.js';
import { showMessage, pingColor, formatPing } from './ui.js';
import { isDemoMode } from './demo_mock.js';

const sunshineBar = document.getElementById('sunshine-bar');
const sunshineStatus = document.getElementById('sunshine-status');
const sunshinePorts = document.getElementById('sunshine-ports');
const sunshineControls = document.getElementById('sunshine-controls');
const sunStartBtn = document.getElementById('sun-start');
const sunStopBtn = document.getElementById('sun-stop');
const sunRestartBtn = document.getElementById('sun-restart');
const sunshineHeaderPing = document.getElementById('sunshine-header-ping');
const sunshineHeader = sunshineBar ? sunshineBar.querySelector('.sunshine-header') : null;
const sunshineCollapseBtn = document.getElementById('sunshine-collapse-btn');

export let sunshineIsRunning = false;
export let lastSunshinePingMs = null;
export let lastSunshinePingType = null;
export let sunshinePingSamples = [];
export let sunshinePingTimes = [];
export let clientIsLocal = true;

let sunshinePingInFlight = false;
let lastSunshinePingTime = 0;

const SUNSHINE_PING_INTERVAL_HOME = 6000;
const SUNSHINE_PING_INTERVAL_MODAL = 1500;

export function setSunshineIsRunning(val) {
    sunshineIsRunning = Boolean(val);
}

export function resetSunshinePing() {
    lastSunshinePingMs = null;
    lastSunshinePingType = null;
    sunshinePingSamples.length = 0;
    sunshinePingTimes.length = 0;
}

export function initSunshine() {
    if (typeof window !== 'undefined') {
        window.checkSunshine = checkSunshine;
        if (isDemoMode && sunshinePingSamples.length === 0) {
            const base = Date.now() - 30000;
            const seed = [2.4, 4.8, 1.9, 12.3, 7.5, 3.2, 14.1, 5.6, 2.1, 8.9, 3.7, 1.8];
            seed.forEach((v, i) => {
                sunshinePingSamples.push(v);
                sunshinePingTimes.push(base + i * 2500);
            });
            lastSunshinePingMs = 3.7;
            lastSunshinePingType = 'LOCAL';
        }
    }
    if (sunStartBtn) sunStartBtn.addEventListener('click', () => doSunshineCtl('sunshine-start'));
    if (sunStopBtn) sunStopBtn.addEventListener('click', () => doSunshineCtl('sunshine-stop'));
    if (sunRestartBtn) sunRestartBtn.addEventListener('click', () => doSunshineCtl('sunshine-restart'));
    initSunshineCollapse();
}

export function applySunshineCollapse(isCollapsed) {
    if (!sunshineBar) return;
    sunshineBar.classList.toggle('collapsed', isCollapsed);
    if (sunshineCollapseBtn) {
        sunshineCollapseBtn.setAttribute('title', isCollapsed ? 'Expand Sunshine panel' : 'Collapse Sunshine panel');
        sunshineCollapseBtn.setAttribute('aria-label', isCollapsed ? 'Expand Sunshine panel' : 'Collapse Sunshine panel');
    }
}

export function collapseSunshineBar() {
    if (!sunshineBar) return;
    applySunshineCollapse(true);
    try { localStorage.setItem('sunshine_collapsed', '1'); } catch (e) {}
}

/**
 * Collapse / expand the Sunshine bar.
 * The bar slides down leaving only the header tab visible.
 * State is persisted in localStorage so it survives page refresh.
 */
function initSunshineCollapse() {
    if (!sunshineBar || !sunshineCollapseBtn) return;

    // Default is collapsed (baissé) unless user explicitly expanded it ('0')
    const shouldBeCollapsed = localStorage.getItem('sunshine_collapsed') !== '0';
    applySunshineCollapse(shouldBeCollapsed);

    function toggleCollapse(e) {
        // If click came from the header but NOT the button itself, only toggle when already collapsed
        // (so the header acts as the re-open handle when minimised, but doesn't close when expanded
        // — users click the button to close).
        if (e.currentTarget === sunshineHeader && !sunshineBar.classList.contains('collapsed')) {
            return; // let button handle it
        }
        e.stopPropagation();

        const isCollapsed = !sunshineBar.classList.contains('collapsed');
        applySunshineCollapse(isCollapsed);
        localStorage.setItem('sunshine_collapsed', isCollapsed ? '1' : '0');
    }

    sunshineCollapseBtn.addEventListener('click', toggleCollapse);
    // Clicking anywhere on the header re-opens the bar when it is collapsed
    if (sunshineHeader) sunshineHeader.addEventListener('click', toggleCollapse);
}

export function setClientIsLocal(isLocal) {
    clientIsLocal = Boolean(isLocal);
}

export function hideSunshineBar() {
    if (!sunshineBar || sunshineBar.style.display === 'none' || sunshineBar.classList.contains('hiding')) return;
    sunshineBar.classList.add('hiding');
    sunshineBar.addEventListener('animationend', function onEnd() {
        sunshineBar.removeEventListener('animationend', onEnd);
        sunshineBar.style.display = 'none';
        sunshineBar.classList.remove('hiding');
    });
}

export function updateSunshinePingUI() {
    if (!sunshineHeaderPing) return;
    if (!state.machineIsUp || !sunshineIsRunning || lastSunshinePingMs === null) {
        sunshineHeaderPing.style.display = 'none';
        return;
    }

    sunshineHeaderPing.style.display = 'inline-flex';
    sunshineHeaderPing.className = 'sunshine-header-ping ' + (lastSunshinePingType === 'LOCAL' ? 'local' : 'wan');

    const dot = sunshineHeaderPing.querySelector('.shp-dot') || document.createElement('span');
    dot.className = 'shp-dot';
    dot.style.background = pingColor(lastSunshinePingMs);
    dot.style.boxShadow = `0 0 6px ${pingColor(lastSunshinePingMs, 0.6)}`;

    const text = sunshineHeaderPing.querySelector('.shp-text') || document.createElement('span');
    text.className = 'shp-text';
    const typeLabel = lastSunshinePingType === 'LOCAL' ? 'LOC' : (lastSunshinePingType || '');
    text.textContent = `${typeLabel} ${formatPing(lastSunshinePingMs)}`;

    if (!sunshineHeaderPing.contains(dot)) sunshineHeaderPing.appendChild(dot);
    if (!sunshineHeaderPing.contains(text)) sunshineHeaderPing.appendChild(text);
}

export function recordSunshinePingSample(ping, type) {
    lastSunshinePingMs = ping;
    lastSunshinePingType = type;
    sunshinePingSamples.push(ping);
    sunshinePingTimes.push(Date.now());
    if (sunshinePingSamples.length > 40) {
        sunshinePingSamples.shift();
        sunshinePingTimes.shift();
    }
}

export async function measureSunshinePing(force = false) {
    if (sunshinePingInFlight || !state.machineIsUp || state.isOffline || !sunshineIsRunning) {
        return lastSunshinePingMs !== null ? { ping: lastSunshinePingMs, type: lastSunshinePingType } : null;
    }

    const minInterval = state.diagnosticsOpen ? SUNSHINE_PING_INTERVAL_MODAL : SUNSHINE_PING_INTERVAL_HOME;
    const now = Date.now();
    if (!force && (now - lastSunshinePingTime) < minInterval) {
        return lastSunshinePingMs !== null ? { ping: lastSunshinePingMs, type: lastSunshinePingType } : null;
    }

    sunshinePingInFlight = true;
    lastSunshinePingTime = now;

    if (isDemoMode) {
        sunshinePingInFlight = false;
        if (!sunshineIsRunning) return null;
        const wave = 5.8 + Math.sin(now / 3200) * 4.2 + Math.cos(now / 1300) * 2.4;
        const spike = Math.random() < 0.18 ? Math.random() * 4.5 : (Math.random() * 1.8 - 0.9);
        const ping = Number(Math.max(1.1, Math.min(14.9, wave + spike)).toFixed(1));
        recordSunshinePingSample(ping, 'LOCAL');
        return { ping, type: 'LOCAL' };
    }

    const probeHost = (host, timeoutMs) => {
        const ports = [47984, 47990];
        const probeSingle = (port) => new Promise((resolve) => {
            const controller = new AbortController();
            const timer = setTimeout(() => {
                controller.abort();
                resolve(null);
            }, timeoutMs);

            const t0 = performance.now();
            fetch(`https://${host}:${port}/serverinfo`, {
                mode: 'no-cors',
                cache: 'no-store',
                signal: controller.signal
            }).then(() => {
                clearTimeout(timer);
                resolve(Math.round(performance.now() - t0));
            }).catch((err) => {
                clearTimeout(timer);
                if (err.name === 'AbortError') {
                    resolve(null);
                    return;
                }
                // TLS handshake rejection by browser for self-signed cert proves port is open!
                resolve(Math.round(performance.now() - t0));
            });
        });

        return Promise.all(ports.map(probeSingle)).then(results => {
            const valid = results.filter(r => r !== null && r > 0);
            return valid.length > 0 ? Math.min(...valid) : null;
        });
    };

    try {
        const localHost = state.targetHost || window.location.hostname;
        const wanHost = state.sunshineWanHost || localHost;

        if (clientIsLocal) {
            const ping = await probeHost(localHost, 900);
            if (ping !== null) {
                recordSunshinePingSample(ping, 'LOCAL');
                return { ping, type: 'LOCAL' };
            }
            const remotePing = await probeHost(wanHost, 2200);
            if (remotePing !== null) {
                recordSunshinePingSample(remotePing, 'WAN');
                return { ping: remotePing, type: 'WAN' };
            }
        } else {
            const ping = await probeHost(wanHost, 2200);
            if (ping !== null) {
                recordSunshinePingSample(ping, 'WAN');
                return { ping, type: 'WAN' };
            }
        }

        lastSunshinePingMs = null;
        lastSunshinePingType = null;
        return null;
    } finally {
        sunshinePingInFlight = false;
    }
}

export async function checkSunshine() {
    if (state.diagnosticsOpen || !state.machineIsUp || state.isOffline) {
        if (state.sunshineTimer) {
            clearTimeout(state.sunshineTimer);
            state.sunshineTimer = null;
        }
        return;
    }
    if (state.sunshineInFlight) return;

    state.sunshineInFlight = true;
    try {
        const data = await apiFetch('sunshine');
        if (!state.machineIsUp) return;

        if (!data.available) {
            if (sunshineBar) {
                sunshineBar.style.display = 'flex';
                sunshineBar.classList.remove('all-up', 'partial', 'all-down');
                sunshineBar.classList.add('warning');
                if (localStorage.getItem('sunshine_collapsed') !== '0') {
                    sunshineBar.classList.add('collapsed');
                }
            }
            if (sunshineStatus) sunshineStatus.textContent = '⚠ ' + data.reason;
            if (sunshinePorts) sunshinePorts.textContent = '';
            sunshineIsRunning = false;
            resetSunshinePing();
            updateSunshinePingUI();
            return;
        }

        const upCount = (data.ports || []).filter(p => p.status === 'up').length;
        const total = (data.ports || []).length;
        const allUp = total > 0 && upCount === total;
        const someUp = upCount > 0;
        sunshineIsRunning = Boolean((data.available || data.success) && someUp);
        if (!sunshineIsRunning) {
            resetSunshinePing();
        }

        if (sunshineBar) {
            sunshineBar.style.display = 'flex';
            sunshineBar.classList.remove('warning', 'all-up', 'partial', 'all-down');
            sunshineBar.classList.add(allUp ? 'all-up' : someUp ? 'partial' : 'all-down');
            if (localStorage.getItem('sunshine_collapsed') !== '0') {
                sunshineBar.classList.add('collapsed');
            }
        }
        if (sunshineStatus) {
            sunshineStatus.textContent = allUp ? 'ALL UP' : someUp ? `${upCount}/${total} UP` : 'ALL DOWN';
        }

        if (state.machineIsUp && sunshineIsRunning) {
            measureSunshinePing().then(() => updateSunshinePingUI());
        } else {
            updateSunshinePingUI();
        }

        if (sunshinePorts) {
            sunshinePorts.textContent = '';
            (data.ports || []).forEach(p => {
                const pill = document.createElement('span');
                pill.className = 'port-pill ' + (p.status === 'up' ? 'port-up' : 'port-down');
                pill.title = p.desc;

                const dot = document.createElement('span');
                dot.className = 'port-dot';
                pill.appendChild(dot);

                pill.appendChild(document.createTextNode(' ' + p.name + ' '));

                const num = document.createElement('span');
                num.className = 'port-num';
                num.textContent = ':' + p.port;
                pill.appendChild(num);

                sunshinePorts.appendChild(pill);
            });
        }

        if (state.sshReady && !state.sunshineBusy) {
            if (sunStartBtn) sunStartBtn.disabled = someUp;
            if (sunStopBtn) sunStopBtn.disabled = !someUp;
            if (sunRestartBtn) sunRestartBtn.disabled = false;
        }
    } catch (e) { /* silent */ }
    finally {
        state.sunshineInFlight = false;
        if (!state.diagnosticsOpen && state.machineIsUp && !state.isOffline) {
            clearTimeout(state.sunshineTimer);
            state.sunshineTimer = setTimeout(checkSunshine, state.sunshinePollInterval);
        } else {
            state.sunshineTimer = null;
        }
    }
}

export async function doSunshineCtl(cmd) {
    if (state.sunshineBusy) return;

    const btnMap = {
        'sunshine-start': sunStartBtn,
        'sunshine-stop': sunStopBtn,
        'sunshine-restart': sunRestartBtn,
    };
    const textMap = {
        'sunshine-start': 'STARTING…',
        'sunshine-stop': 'STOPPING…',
        'sunshine-restart': 'RESTARTING…',
    };
    const activeBtn = btnMap[cmd];
    const allBtns = [sunStartBtn, sunStopBtn, sunRestartBtn].filter(Boolean);
    const originalTxt = activeBtn ? activeBtn.textContent : '';

    state.sunshineBusy = true;
    allBtns.forEach(b => {
        if (b !== activeBtn) b.disabled = true;
    });
    if (activeBtn) {
        activeBtn.classList.add('sending');
        activeBtn.textContent = textMap[cmd];
    }

    const labels = { 'sunshine-start': 'Starting…', 'sunshine-stop': 'Stopping…', 'sunshine-restart': 'Restarting…' };
    showMessage(labels[cmd] || 'Sending…', 'info');

    try {
        const data = await apiFetch('sunshine_ctl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd }),
        });
        if (data.success) {
            showMessage('✓ ' + data.message, 'success');
        } else {
            showMessage('✗ ' + data.message, 'error');
        }
    } catch (e) {
        if (e.message !== 'auth') {
            showMessage('✗ ' + (e.message || 'Failed to communicate with API'), 'error');
        }
    }

    const resetDelay = isDemoMode ? (cmd === 'sunshine-stop' ? 700 : (cmd === 'sunshine-start' ? 900 : 1400)) : 10000;

    setTimeout(() => {
        if (activeBtn) {
            activeBtn.classList.remove('sending');
            activeBtn.textContent = originalTxt;
        }
        allBtns.forEach(b => { b.disabled = true; });
        state.sunshineBusy = false;
        checkSunshine();
    }, resetDelay);
}
