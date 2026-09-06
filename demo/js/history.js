/**
 * RigPulse — Action History & Audit Log (js/history.js)
 */

import { apiFetch } from './api.js';

const historyToggle = document.getElementById('history-toggle');
const historyOverlay = document.getElementById('history-overlay');
const historyClose = document.getElementById('history-close');
const historyList = document.getElementById('history-list');

export function initHistory() {
    if (historyToggle) historyToggle.addEventListener('click', openHistory);
    if (historyClose) historyClose.addEventListener('click', closeHistory);
    if (historyOverlay) {
        historyOverlay.addEventListener('click', (e) => {
            if (e.target === historyOverlay) closeHistory();
        });
    }
}

export async function openHistory() {
    if (!historyOverlay || !historyList) return;
    historyOverlay.style.display = 'flex';
    historyList.innerHTML = `
        <div class="history-loading">
            <span class="history-spinner"></span>
            <span>LOADING HISTORY…</span>
        </div>
    `;

    try {
        const data = await apiFetch('history');
        if (!data.history || data.history.length === 0) {
            historyList.innerHTML = '<div class="history-empty">No actions recorded yet.</div>';
            return;
        }
        historyList.textContent = ''; // clear loader
        data.history.forEach(entry => {
            const item = document.createElement('div');
            item.className = 'history-item';

            const actionSpan = document.createElement('span');
            let actionKey = entry.action ? entry.action.toLowerCase() : '';
            if (actionKey === 'wake') actionKey = 'wol';
            const isSunshine = actionKey.startsWith('sunshine');
            const actClass = isSunshine ? 'act-sunshine' : 'act-' + actionKey;
            actionSpan.className = 'hi-action ' + actClass;

            let displayLabel = actionKey.toUpperCase();
            if (displayLabel.startsWith('SUNSHINE-')) {
                displayLabel = displayLabel.replace('SUNSHINE-', 'SNSH-');
            }
            actionSpan.textContent = displayLabel;
            item.appendChild(actionSpan);

            const ipSpan = document.createElement('span');
            ipSpan.className = 'hi-ip';
            ipSpan.textContent = entry.ip;
            item.appendChild(ipSpan);

            const timeSpan = document.createElement('span');
            timeSpan.className = 'hi-time';
            const d = new Date(entry.time);
            const datePart = d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
            const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            timeSpan.textContent = datePart + ' ' + timePart;
            item.appendChild(timeSpan);

            historyList.appendChild(item);
        });
    } catch (e) {
        historyList.innerHTML = '<div class="history-error">Failed to load history.</div>';
    }
}

export function closeHistory() {
    if (historyOverlay) historyOverlay.style.display = 'none';
}
