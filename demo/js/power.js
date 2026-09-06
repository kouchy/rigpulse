/**
 * RigPulse — Power State & Host Lifecycle Controls (js/power.js)
 */

import { apiFetch } from './api.js';
import { state } from './state.js';
import { elements, showMessage, resetButton, startDotAnimation, stopDotAnimation } from './ui.js';
import { triggerHyperdriveWarp, setHeroState } from './hero.js';

const shutdownModal = document.getElementById('shutdown-modal');
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');

let pollRequestCallback = null;

export function initPower({ onPollRequested }) {
    pollRequestCallback = onPollRequested;

    if (elements.powerBtn) {
        elements.powerBtn.addEventListener('click', handlePowerBtnClick);
    }
    if (elements.sleepBtn) {
        elements.sleepBtn.addEventListener('click', () => {
            if (elements.sleepBtn.disabled || state.isBooting || state.sendingAction) return;
            doSleep();
        });
    }
    if (modalCancel) {
        modalCancel.addEventListener('click', hideShutdownModal);
    }
    if (shutdownModal) {
        shutdownModal.addEventListener('click', (e) => {
            if (e.target === shutdownModal) hideShutdownModal();
        });
    }
    if (modalConfirm) {
        modalConfirm.addEventListener('click', async () => {
            hideShutdownModal();
            await doShutdown();
        });
    }
}

function handlePowerBtnClick() {
    if (elements.powerBtn.disabled || state.isBooting || state.sendingAction) return;
    if (elements.powerBtn.dataset.mode === 'shutdown') {
        showShutdownModal();
    } else {
        doWOL();
    }
}

export function showShutdownModal() {
    if (shutdownModal) {
        shutdownModal.style.display = 'flex';
        if (modalConfirm) modalConfirm.focus();
    }
}

export function hideShutdownModal() {
    if (shutdownModal) shutdownModal.style.display = 'none';
}

export function isWakeUpAction(action) {
    return action === 'sleep' || action === 'wol';
}

export function scheduleExtraPolls(intervals) {
    if (typeof pollRequestCallback !== 'function') return;
    intervals.forEach(ms => setTimeout(pollRequestCallback, ms));
}

export function startSendingAction(action, btn, baseLabel, extraClasses) {
    clearTimeout(state.sendingTimer);
    state.sendingAction = action;
    if (btn) {
        btn.classList.add('sending');
    }
    startDotAnimation(baseLabel, 3, btn, 500);

    // Safety auto-expire after 45s
    state.sendingTimer = setTimeout(() => {
        stopSendingAction();
        if (typeof pollRequestCallback === 'function') {
            pollRequestCallback();
        }
    }, 45000);
}

export function stopSendingAction() {
    clearTimeout(state.sendingTimer);
    state.sendingAction = null;
    state.sendingTimer = null;
    if (elements.powerBtn) {
        elements.powerBtn.classList.remove('sending');
        elements.powerBtn.style.display = 'flex';
    }
    if (elements.sleepBtn) elements.sleepBtn.classList.remove('sending');
    stopDotAnimation();
}

export function enterBootingMode(isWakeUp) {
    state.isBooting = true;
    state.bootIsWakeUp = !!isWakeUp;
    state.bootStartTime = Date.now();
    const label = state.bootIsWakeUp ? 'WAKING UP' : 'BOOTING';

    if (elements.powerBtn) {
        elements.powerBtn.style.display = 'flex';
        elements.powerBtn.disabled = false;
        elements.powerBtn.dataset.mode = 'booting';
        elements.powerBtn.className = 'wol-btn booting';
        startDotAnimation(label, 3, elements.powerBtn, 500);
    }
    if (elements.sleepBtn) {
        elements.sleepBtn.style.display = 'none';
    }

    if (elements.statusPanel) {
        elements.statusPanel.className = 'status-panel booting';
    }
    if (elements.statusDot) {
        elements.statusDot.className = 'status-dot booting';
    }
    if (elements.statusValue) {
        elements.statusValue.textContent = state.bootIsWakeUp ? 'WAKING UP…' : 'BOOTING…';
    }
    setHeroState(false, true, false);

    const resetLabel = state.bootIsWakeUp ? 'WAKE UP' : 'POWER ON';
    const timeoutMsg = state.bootIsWakeUp
        ? `✗ Wake timed out — ${state.targetName} did not respond`
        : `✗ Boot timed out — ${state.targetName} did not respond`;

    state.bootTimeoutHandle = setTimeout(() => {
        if (!state.isBooting) return;
        exitBootingMode(false);
        resetButton(elements.powerBtn, resetLabel);
        if (elements.powerBtn) {
            elements.powerBtn.style.display = 'flex';
            elements.powerBtn.className = 'wol-btn';
            elements.powerBtn.dataset.mode = 'wol';
        }
        showMessage(timeoutMsg, 'error');
    }, state.bootTimeoutMs);
}

export function exitBootingMode(completed = false) {
    if (completed && state.bootStartTime) {
        const elapsedSec = Math.round((Date.now() - state.bootStartTime) / 1000);
        const actionLabel = state.bootIsWakeUp ? 'woke up' : 'booted';
        showMessage(`✓ ${state.targetName} is online — ${actionLabel} in ${elapsedSec}s`, 'success');
    }
    state.isBooting = false;
    state.bootStartTime = null;
    clearTimeout(state.bootTimeoutHandle);
    state.bootTimeoutHandle = null;
    stopDotAnimation();
    if (elements.powerBtn) {
        elements.powerBtn.style.display = 'flex';
    }
}

export async function doWOL() {
    triggerHyperdriveWarp();
    const isWakeUp = isWakeUpAction(state.lastPowerAction);
    state.sendingAction = 'wol';
    if (elements.powerBtn) {
        elements.powerBtn.style.display = 'flex';
        elements.powerBtn.disabled = true;
        elements.powerBtn.classList.add('sending');
        const textSpan = elements.powerBtn.querySelector('.wol-btn-text');
        if (textSpan) textSpan.textContent = 'SENDING…';
    }
    if (elements.sleepBtn) {
        elements.sleepBtn.style.display = 'none';
    }

    const wolLabel = isWakeUp ? 'Sending wake-up packet…' : 'Sending magic packet…';
    showMessage(wolLabel, 'info');

    const resetLabel = isWakeUp ? 'WAKE UP' : 'POWER ON';
    try {
        const data = await apiFetch('wol', { method: 'POST' });
        state.sendingAction = null;
        if (data.success) {
            showMessage('✓ ' + data.message, 'success');
            enterBootingMode(isWakeUp);
            scheduleExtraPolls([2000, 5000]);
        } else {
            showMessage('✗ ' + data.message, 'error');
            resetButton(elements.powerBtn, resetLabel);
        }
    } catch (e) {
        state.sendingAction = null;
        if (e.message === 'auth') return;
        showMessage('✗ ' + (e.message || 'Failed to communicate with API'), 'error');
        resetButton(elements.powerBtn, resetLabel);
    }
}

export async function doShutdown() {
    startSendingAction('shutdown', elements.powerBtn, 'POWERING OFF', 'shutdown-btn');
    if (elements.powerBtn) {
        elements.powerBtn.disabled = false;
        elements.powerBtn.style.display = 'flex';
    }
    if (elements.sleepBtn) elements.sleepBtn.style.display = 'none';
    showMessage('Sending shutdown command…', 'info');

    try {
        const data = await apiFetch('shutdown', { method: 'POST' });
        if (data.success) {
            if (elements.sshNotice) elements.sshNotice.style.display = 'none';
            showMessage('✓ ' + data.message, 'success');
            scheduleExtraPolls([2000, 4000, 7000, 12000, 20000]);
        } else {
            stopSendingAction();
            showMessage('✗ ' + data.message, 'error');
            resetButton(elements.powerBtn, 'POWER OFF');
            if (elements.powerBtn) elements.powerBtn.className = 'wol-btn shutdown-btn';
            if (elements.sleepBtn) {
                elements.sleepBtn.style.display = 'flex';
                elements.sleepBtn.disabled = false;
            }
        }
    } catch (e) {
        if (e.message === 'auth') return;
        stopSendingAction();
        showMessage('✗ ' + (e.message || 'Failed to communicate with API'), 'error');
        resetButton(elements.powerBtn, 'POWER OFF');
        if (elements.powerBtn) elements.powerBtn.className = 'wol-btn shutdown-btn';
        if (elements.sleepBtn) {
            elements.sleepBtn.style.display = 'flex';
            elements.sleepBtn.disabled = false;
        }
    }
}

export async function doSleep() {
    startSendingAction('sleep', elements.sleepBtn, 'SLEEPING', 'sleep-btn');
    if (elements.sleepBtn) {
        elements.sleepBtn.disabled = false;
        elements.sleepBtn.style.display = 'flex';
    }
    if (elements.powerBtn) elements.powerBtn.style.display = 'none';
    showMessage('Sending sleep command…', 'info');

    try {
        const data = await apiFetch('sleep', { method: 'POST' });
        if (data.success) {
            if (elements.sshNotice) elements.sshNotice.style.display = 'none';
            showMessage('✓ ' + data.message, 'success');
            scheduleExtraPolls([2000, 5000, 10000]);
        } else {
            stopSendingAction();
            showMessage('✗ ' + data.message, 'error');
            resetButton(elements.sleepBtn, 'SLEEP');
            if (elements.sleepBtn) elements.sleepBtn.className = 'wol-btn sleep-btn';
            if (elements.powerBtn) {
                elements.powerBtn.style.display = 'flex';
                elements.powerBtn.disabled = false;
            }
        }
    } catch (e) {
        if (e.message === 'auth') return;
        stopSendingAction();
        showMessage('✗ ' + (e.message || 'Failed to communicate with API'), 'error');
        resetButton(elements.sleepBtn, 'SLEEP');
        if (elements.sleepBtn) elements.sleepBtn.className = 'wol-btn sleep-btn';
        if (elements.powerBtn) {
            elements.powerBtn.style.display = 'flex';
            elements.powerBtn.disabled = false;
        }
    }
}
