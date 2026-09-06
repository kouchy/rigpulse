/**
 * RigPulse — Canvas Chart Rendering Engine (js/charts.js)
 * 
 * HiDPI crisp rendering, sliding smooth interpolation, right-axis dynamic units,
 * and real-time hover point crosshairs.
 */

export function formatMetricValue(val, unit) {
    if (val === undefined || val === null || isNaN(val)) return '—';
    if (unit === 'MB/s') {
        return Number(val).toFixed(1) + ' MB/s';
    }
    if (unit === 'W') {
        return Math.round(val) + 'W';
    }
    if (unit === '°C') {
        return Math.round(val) + '°C';
    }
    if (unit === '%') {
        return Math.round(val) + '%';
    }
    return Math.round(val) + (unit ? unit : '');
}

export function formatMetricAge(ts) {
    if (!ts) return 'now';
    const ageSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (ageSec === 0) return 'just now';
    if (ageSec < 60) return `${ageSec}s ago`;
    const m = Math.floor(ageSec / 60);
    const s = ageSec % 60;
    return `${m}m ${s}s ago`;
}

export function getTimeAxisLabels(datasets, totalPoints, pipelineSpeed = 1) {
    let spanSec = 60;
    if (pipelineSpeed === 2) spanSec = 30;
    if (pipelineSpeed === 3) spanSec = 15;

    const dsWithTime = datasets ? datasets.find(d => d && d.timestamps && d.timestamps.length >= 2) : null;
    if (dsWithTime) {
        const ts = dsWithTime.timestamps;
        const actualIntervalSec = (ts[ts.length - 1] - ts[0]) / ((ts.length - 1) * 1000);
        if (actualIntervalSec > 0.05 && actualIntervalSec < 15) {
            spanSec = Math.round(actualIntervalSec * (totalPoints - 1));
        }
    }

    const formatSec = (s) => {
        if (s <= 0) return 'now';
        if (s < 60) return `-${s}s`;
        const m = Math.floor(s / 60);
        const rem = s % 60;
        return rem === 0 ? `-${m}m` : `-${m}m${rem}s`;
    };

    return [
        { frac: 0, label: formatSec(spanSec), align: 'left' },
        { frac: 0.25, label: formatSec(Math.round(spanSec * 0.75)), align: 'center' },
        { frac: 0.5, label: formatSec(Math.round(spanSec * 0.5)), align: 'center' },
        { frac: 0.75, label: formatSec(Math.round(spanSec * 0.25)), align: 'center' },
        { frac: 1, label: 'now', align: 'right' }
    ];
}

export function drawLineChart(canvas, datasets, options = {}, state = {}) {
    if (!canvas) return;
    let w = canvas._cachedW;
    let h = canvas._cachedH;
    if (!w || !h) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        w = canvas._cachedW = rect.width;
        h = canvas._cachedH = rect.height;
    }

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const padLeft = options.padLeft || 24;
    const padRight = options.padRight || (options.rightAxis ? 30 : 8);
    const padTop = 6;
    const padBottom = 16;

    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    if (plotW <= 0 || plotH <= 0) {
        ctx.restore();
        return;
    }

    const maxPoints = options.maxPoints || 60;
    const totalPoints = Math.max(maxPoints, 2);
    const stepX = plotW / (totalPoints - 1);

    // Grid lines at 0%, 50%, 100%
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const gridSteps = [0, 0.5, 1];
    gridSteps.forEach(step => {
        const y = padTop + plotH * (1 - step);
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(w - padRight, y);
        ctx.stroke();

        const pctLabel = options.unit
            ? `${Math.round(step * (options.maxLeftVal || 100))}${options.unit}`
            : `${Math.round(step * 100)}%`;
        ctx.fillText(pctLabel, padLeft - 4, y);

        if (options.rightAxis && options.maxRightVal) {
            ctx.textAlign = 'left';
            const rightUnit = options.rightUnit !== undefined ? options.rightUnit : 'W';
            const rightVal = `${Math.round(step * options.maxRightVal)}${rightUnit}`;
            ctx.fillText(rightVal, w - padRight + 4, y);
            ctx.textAlign = 'right';
        }
    });

    // Time Axis Labels
    const pipelineSpeed = state.pipelineSpeed || 1;
    const timeSteps = getTimeAxisLabels(datasets, totalPoints, pipelineSpeed);

    ctx.save();
    ctx.font = '7.5px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';

    timeSteps.forEach(ts => {
        const x = padLeft + plotW * ts.frac;
        if (ts.frac > 0 && ts.frac < 1) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.moveTo(x, padTop);
            ctx.lineTo(x, padTop + plotH);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath();
        ctx.moveTo(x, padTop + plotH);
        ctx.lineTo(x, padTop + plotH + 2.5);
        ctx.stroke();

        ctx.textAlign = ts.align;
        ctx.textBaseline = 'top';
        ctx.fillText(ts.label, x, padTop + plotH + 3.5);
    });
    ctx.restore();

    const slideProgress = (state.slideProgress !== undefined) ? state.slideProgress : 1;
    const gpuMode = state.gpuMode || 'eco';

    // Clip dataset drawing to plot area so lines glide in/out smoothly without overflowing axes
    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop - 2, plotW + 3.5, plotH + 4);
    ctx.clip();

    // Draw datasets in reverse Z-order so secondary curves (e.g. Power, then RAM) are in the background
    // and the primary curve (e.g. CPU, GPU, Disk Read, Net Recv) is rendered on TOP.
    // HTML legends at the top retain their original logical order.
    const validDatasets = (datasets || []).filter(Boolean);
    [...validDatasets].reverse().forEach(ds => {
        const data = ds.data;
        if (!data || data.length === 0) return;

        const maxVal = ds.maxVal || 100;
        const offset = totalPoints - data.length;
        const slideOffset = (data.length > 1) ? (1 - slideProgress) * stepX : 0;

        ctx.beginPath();
        let started = false;

        for (let i = 0; i < data.length; i++) {
            const val = Math.max(0, Math.min(maxVal, data[i]));
            const x = data.length === 1
                ? padLeft + plotW
                : padLeft + ((offset + i) / (totalPoints - 1)) * plotW + slideOffset;
            const y = padTop + plotH * (1 - val / maxVal);

            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }

        if (gpuMode === 'light') {
            ctx.strokeStyle = ds.color;
            ctx.lineWidth = 1.4;
            ctx.stroke();
        } else if (gpuMode === 'eco') {
            ctx.save();
            ctx.strokeStyle = ds.color;
            ctx.globalAlpha = 0.25;
            ctx.lineWidth = 3.6;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.strokeStyle = ds.color;
            ctx.lineWidth = 1.6;
            ctx.shadowColor = ds.color;
            ctx.shadowBlur = 4;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Glowing head dot at latest measurement point
        const lastIdx = data.length - 1;
        const lastVal = Math.max(0, Math.min(maxVal, data[lastIdx]));
        const lastX = data.length === 1
            ? padLeft + plotW
            : padLeft + ((offset + lastIdx) / (totalPoints - 1)) * plotW + slideOffset;
        const lastY = padTop + plotH * (1 - lastVal / maxVal);

        ctx.save();
        ctx.beginPath();
        ctx.arc(lastX, lastY, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = ds.color;
        if (gpuMode === 'heavy') {
            ctx.shadowColor = ds.color;
            ctx.shadowBlur = 5;
        }
        ctx.fill();
        ctx.restore();
    });

    // If canvas currently has an active hover point, dynamically follow the point as curves slide
    if (canvas._activeHoverPoint) {
        const hp = canvas._activeHoverPoint;
        let activeX = hp.x;
        let activeY = hp.y;
        let pointFound = false;

        if (hp.timestamp) {
            const ds = validDatasets.find(d => d.label === hp.label) || validDatasets[0];
            if (ds && ds.timestamps && ds.data) {
                const idx = ds.timestamps.indexOf(hp.timestamp);
                if (idx !== -1) {
                    const val = Math.max(0, Math.min(ds.maxVal || 100, ds.data[idx]));
                    const offset = totalPoints - ds.data.length;
                    const slideOffset = (ds.data.length > 1) ? (1 - slideProgress) * stepX : 0;
                    activeX = ds.data.length === 1
                        ? padLeft + plotW
                        : padLeft + ((offset + idx) / Math.max(1, totalPoints - 1)) * plotW + slideOffset;
                    activeY = padTop + plotH * (1 - val / (ds.maxVal || 100));

                    hp.x = activeX;
                    hp.y = activeY;
                    hp.valStr = formatMetricValue(ds.data[idx], ds.unit);
                    hp.timeStr = formatMetricAge(hp.timestamp);
                    pointFound = true;
                }
            }
        }

        const diagChartTooltip = document.getElementById('diag-chart-tooltip');
        if (!pointFound && hp.timestamp) {
            canvas._activeHoverPoint = null;
            if (diagChartTooltip && diagChartTooltip._activeCanvas === canvas) {
                diagChartTooltip._activeCanvas = null;
                diagChartTooltip.classList.remove('visible');
                diagChartTooltip.style.display = 'none';
            }
        } else if (pointFound && activeX < padLeft - 2) {
            canvas._activeHoverPoint = null;
            if (diagChartTooltip && diagChartTooltip._activeCanvas === canvas) {
                diagChartTooltip._activeCanvas = null;
                diagChartTooltip.classList.remove('visible');
                diagChartTooltip.style.display = 'none';
            }
        } else if (pointFound || !hp.timestamp) {
            // Vertical guideline
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(activeX, padTop);
            ctx.lineTo(activeX, padTop + plotH);
            ctx.stroke();
            ctx.restore();

            // Glowing point halo (circle with center dot)
            ctx.save();
            ctx.beginPath();
            ctx.arc(activeX, activeY, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(activeX, activeY, 5.5, 0, Math.PI * 2);
            ctx.strokeStyle = hp.color;
            ctx.lineWidth = 2;
            if (gpuMode === 'heavy') {
                ctx.shadowColor = hp.color;
                ctx.shadowBlur = 8;
            }
            ctx.stroke();
            ctx.restore();

            // Update tooltip position and content in real-time as point slides
            if (diagChartTooltip && diagChartTooltip.classList.contains('visible') && diagChartTooltip._activeCanvas === canvas) {
                const rect = canvas.getBoundingClientRect();
                updateChartTooltipContentAndPos(rect.left + activeX, rect.top + activeY, hp, diagChartTooltip);
            }
        }
    }

    ctx.restore(); // restore clip boundary

    // Cache geometry & datasets for pointer hover detection
    canvas._lastChartInfo = {
        padLeft,
        padRight,
        padTop,
        plotW,
        plotH,
        totalPoints,
        maxPoints,
        stepX,
        slideOffset: (validDatasets.some(d => d.data && d.data.length > 1)) ? (1 - slideProgress) * stepX : 0,
        datasets: validDatasets,
        options
    };

    ctx.restore(); // restore canvas context
}

export function getPingColor(ms) {
    if (ms <= 30) return '#4ade80';
    if (ms <= 50) return '#facc15';
    if (ms <= 100) return '#fb923c';
    return '#f87171';
}

export function updateChartTooltipContentAndPos(clientX, clientY, info, tooltipEl) {
    const tooltip = tooltipEl || document.getElementById('diag-chart-tooltip');
    if (!tooltip) return;
    tooltip.style.borderColor = info.color;
    tooltip.style.boxShadow = `0 4px 16px rgba(0, 0, 0, 0.65), 0 0 10px ${info.color}66`;

    tooltip.innerHTML = `
        <div class="dct-header">
            <span class="dct-label" style="color: ${info.color};">
                <span class="dct-dot"></span>${info.label}
            </span>
            <span class="dct-time">${info.timeStr}</span>
        </div>
        <span class="dct-val" style="color: ${info.color};">${info.valStr}</span>
    `;

    const tw = tooltip.offsetWidth || 90;
    const th = tooltip.offsetHeight || 40;
    const pad = 12;

    let posX = clientX;
    let posY = clientY - 14;

    if (posX - tw / 2 < pad) posX = tw / 2 + pad;
    if (posX + tw / 2 > window.innerWidth - pad) posX = window.innerWidth - pad - tw / 2;
    if (posY - th < pad) posY = clientY + th + 14;

    tooltip.style.left = `${posX}px`;
    tooltip.style.top = `${posY}px`;
}

export function showChartTooltip(clientX, clientY, info, canvas) {
    const tooltip = document.getElementById('diag-chart-tooltip');
    if (!tooltip) return;
    tooltip._activeCanvas = canvas || null;
    tooltip.style.display = 'flex';
    updateChartTooltipContentAndPos(clientX, clientY, info, tooltip);
    tooltip.classList.add('visible');
}

export function hideChartTooltip(canvas) {
    const tooltip = document.getElementById('diag-chart-tooltip');
    if (canvas && canvas._activeHoverPoint) {
        canvas._activeHoverPoint = null;
    } else if (!canvas) {
        document.querySelectorAll('canvas').forEach(c => {
            if (c._activeHoverPoint) c._activeHoverPoint = null;
        });
    }
    if (tooltip) {
        tooltip._activeCanvas = null;
        tooltip.classList.remove('visible');
        tooltip.style.display = 'none';
    }
}
