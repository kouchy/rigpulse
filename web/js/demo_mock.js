/**
 * RigPulse — Client-Side Mock API for Interactive Demo (js/demo_mock.js)
 * Activates automatically when '?demo=1' is in the URL or window.RIGPULSE_DEMO is true.
 * Provides 100% serverless simulation without modifying any backend code.
 */

import { ENABLE_DEMO, DEMO_BAR } from './demo.js';
import { state } from './state.js';

const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const viewMode = urlParams ? urlParams.get('view') : null;
const hideToolbar = urlParams ? (urlParams.get('hide_bar') === '1' || urlParams.get('notoolbar') === '1') : false;

export const isDemoMode = typeof window !== 'undefined' && (
    Boolean(ENABLE_DEMO) ||
    urlParams?.get('demo') === '1' ||
    Boolean(window.RIGPULSE_DEMO) ||
    window.location.protocol === 'file:'
);

if (isDemoMode && typeof window !== 'undefined') {
    window.RIGPULSE_DEMO = true;
}


// Formatted ISO timestamps for audit log
function getPastISO(minutesAgo) {
    return new Date(Date.now() - minutesAgo * 60000).toISOString();
}

// Simulated Host State with rich, realistic audit history
export const demoState = {
    authenticated: viewMode === 'lock' ? false : true,
    role: 'admin', // 'admin' | 'user'
    online: (viewMode === 'offline' || viewMode === 'down' || viewMode === 'sleep') ? false : true,
    lastPowerAction: viewMode === 'sleep' ? 'sleep' : ((viewMode === 'offline' || viewMode === 'down') ? 'shutdown' : null),
    uptime: '4h 22m',
    hostname: 'RigPulse',
    ip: '192.168.1.100',
    mac: '00:11:22:33:44:55',
    companion: '192.168.1.200',
    sunshineReachable: (viewMode === 'offline' || viewMode === 'down' || viewMode === 'sleep') ? false : true,
    sunshinePorts: { rtsp: true, api: true, http: true, web: true },
    metricTick: 0,
    historyPreSeeded: false,
    actionLogs: [
        { ts: Math.floor(Date.now() / 1000) - 720, time: getPastISO(12), action: 'sunshine-restart', ip: '192.168.1.200', result: 'success' },
        { ts: Math.floor(Date.now() / 1000) - 3600, time: getPastISO(60), action: 'wol', ip: '192.168.1.200', result: 'success' },
        { ts: Math.floor(Date.now() / 1000) - 5100, time: getPastISO(85), action: 'sleep', ip: '192.168.1.150', result: 'success' },
        { ts: Math.floor(Date.now() / 1000) - 8400, time: getPastISO(140), action: 'wol', ip: '192.168.1.200', result: 'success' },
        { ts: Math.floor(Date.now() / 1000) - 15420, time: getPastISO(257), action: 'sunshine-start', ip: '192.168.1.100', result: 'success' },
        { ts: Math.floor(Date.now() / 1000) - 15600, time: getPastISO(260), action: 'wol', ip: '192.168.1.200', result: 'success' }
    ]
};

if (typeof window !== 'undefined') {
    if (viewMode === 'online') {
        try { localStorage.setItem('sunshine_collapsed', '0'); } catch (e) {}
        const hideLoader = () => {
            const l = document.getElementById('cyber-loader');
            if (l) l.style.display = 'none';
            const mc = document.getElementById('main-container');
            if (mc) mc.style.display = 'flex';
            const sb = document.getElementById('sunshine-bar');
            if (sb) {
                sb.classList.remove('collapsed');
                sb.style.display = 'flex';
            }
        };
        window.addEventListener('DOMContentLoaded', hideLoader);
        window.addEventListener('load', hideLoader);
    } else if (viewMode === 'diag') {
        window.addEventListener('load', () => {
            const l = document.getElementById('cyber-loader');
            if (l) l.style.display = 'none';
            const btn = document.getElementById('diagnostics-toggle');
            if (btn) btn.click();
        });
    }
}

/**
 * Continuous, smoothly interpolated gaming scenario in an 80-second loop:
 * - 00s–15s : Desktop Idle (Steam/Sunshine idle, 0 RPM fan stop)
 * - 15s–30s : Game Launch & Shader Compilation (CPU spike to 82%, NVMe read spike to 450 MB/s)
 * - 30s–65s : Intense 4K HDR Ray Tracing + Sunshine AV1 Stream (GPU 96%, 265W, 82 MB/s network stream)
 * - 65s–80s : Pause Menu & Cooldown (smooth glide back to idle)
 */
function getScenarioMetricsAtTime(secondsTimestamp) {
    const cycle = (secondsTimestamp % 80);

    let cpuLoad, cpuTemp, cpuPower, cpuFanPct, cpuFanRpm;
    let gpuLoad, gpuTemp, gpuPower, gpuFanPct, gpuFanRpm, gpuVramMb, gpuEnc;
    let diskRead, diskWrite, netRecv, netSent;
    let processes = [];
    let foregroundApp = 'Windows Desktop';
    let foregroundLauncher = 'desktop';
    let foregroundExe = 'explorer.exe';
    let foregroundPid = 1044;
    let foregroundRuntime = '';

    if (cycle < 15) {
        // Phase 1: Desktop Idle (Steam/Sunshine idle, 0 RPM fan stop)
        const p = cycle / 15;
        cpuLoad = Math.round(14 + Math.sin(p * Math.PI) * 4);
        cpuTemp = Math.round(45 + p * 2);
        cpuPower = Math.round(36 + p * 4);
        cpuFanPct = 26;
        cpuFanRpm = 680;

        gpuLoad = Math.round(7 + Math.sin(p * Math.PI) * 3);
        gpuTemp = 42;
        gpuPower = 42;
        gpuFanPct = 0;
        gpuFanRpm = 0; // 0dB Fan stop mode
        gpuVramMb = 3250;
        gpuEnc = 0;

        diskRead = Number((1.8 + Math.random() * 1.5).toFixed(1));
        diskWrite = Number((0.6 + Math.random() * 0.4).toFixed(1));
        netRecv = Number((0.4 + Math.random() * 0.2).toFixed(1));
        netSent = Number((0.1 + Math.random() * 0.05).toFixed(1));

        foregroundApp = 'Windows Desktop';
        foregroundLauncher = 'desktop';
        foregroundExe = 'explorer.exe';
        foregroundPid = 1044;
        foregroundRuntime = '';

        processes = [
            { name: 'explorer.exe', pid: 1044, cpu: 2.8, mem_mb: 285 },
            { name: 'Steam.exe', pid: 5412, cpu: 1.4, mem_mb: 490 },
            { name: 'sunshine.exe', pid: 4812, cpu: 0.9, mem_mb: 230 }
        ];
    } else if (cycle < 30) {
        // Phase 2: Game Launch & Shader Compilation
        const p = (cycle - 15) / 15;
        const ramp = Math.sin(p * Math.PI * 0.5);

        cpuLoad = Math.round(20 + ramp * 65); // Spikes up to 85%
        cpuTemp = Math.round(48 + ramp * 24); // Ramps to 72°C
        cpuPower = Math.round(42 + ramp * 58); // Ramps to 100W
        cpuFanPct = Math.round(26 + ramp * 28);
        cpuFanRpm = Math.round(680 + ramp * 580);

        gpuLoad = Math.round(10 + ramp * 48);
        gpuTemp = Math.round(42 + ramp * 13);
        gpuPower = Math.round(42 + ramp * 75);
        gpuFanPct = Math.round(ramp * 36);
        gpuFanRpm = Math.round(ramp * 1050);
        gpuVramMb = Math.round(3250 + ramp * 5400); // Loads textures to 8.6GB
        gpuEnc = Math.round(ramp * 8);

        diskRead = Number((40 + Math.sin(p * Math.PI) * 420).toFixed(1)); // Read spikes to 460 MB/s!
        diskWrite = Number((8 + ramp * 12).toFixed(1));
        netRecv = Number((2 + ramp * 16).toFixed(1));
        netSent = Number((0.2 + ramp * 0.8).toFixed(1));

        foregroundApp = 'Cyberpunk 2077';
        foregroundLauncher = 'steam';
        foregroundExe = 'Cyberpunk2077.exe';
        foregroundPid = 14080;
        foregroundRuntime = '0h 03m';

        processes = [
            { name: 'Cyberpunk2077.exe', pid: 14080, cpu: Number((18 + ramp * 56).toFixed(1)), mem_mb: Math.round(2000 + ramp * 6500) },
            { name: 'sunshine.exe', pid: 4812, cpu: 3.2, mem_mb: 280 },
            { name: 'Steam.exe', pid: 5412, cpu: 2.1, mem_mb: 510 }
        ];
    } else if (cycle < 65) {
        // Phase 3: Intense 4K HDR Ray Tracing + Sunshine AV1 Stream
        const p = (cycle - 30) / 35;
        const wobble = Math.sin(p * Math.PI * 4);

        cpuLoad = Math.round(48 + wobble * 6);
        cpuTemp = Math.round(63 + wobble * 2);
        cpuPower = Math.round(75 + wobble * 6);
        cpuFanPct = 46;
        cpuFanRpm = 1040;

        gpuLoad = Math.round(95 + wobble * 3); // 92-98% load!
        gpuTemp = Math.round(66 + wobble * 1.5);
        gpuPower = Math.round(260 + wobble * 18); // 240W-280W
        gpuFanPct = 54;
        gpuFanRpm = 1520;
        gpuVramMb = Math.round(11850 + wobble * 350); // ~12 GB VRAM
        gpuEnc = Math.round(88 + wobble * 6); // 82-94% Encoder

        diskRead = Number((72 + wobble * 18).toFixed(1));
        diskWrite = Number((12 + Math.random() * 4).toFixed(1));
        netRecv = Number((82.4 + wobble * 5).toFixed(1)); // 82 MB/s stream!
        netSent = Number((3.6 + Math.random() * 0.6).toFixed(1));

        foregroundApp = 'Cyberpunk 2077';
        foregroundLauncher = 'steam';
        foregroundExe = 'Cyberpunk2077.exe';
        foregroundPid = 14080;
        foregroundRuntime = '1h 14m';

        processes = [
            { name: 'Cyberpunk2077.exe', pid: 14080, cpu: Number((45 + wobble * 4).toFixed(1)), mem_mb: 11420 },
            { name: 'sunshine.exe', pid: 4812, cpu: 8.8, mem_mb: 420 },
            { name: 'Discord.exe', pid: 9216, cpu: 1.4, mem_mb: 490 }
        ];
    } else {
        // Phase 4: Pause Menu & Cooldown (65s to 80s)
        const p = (cycle - 65) / 15;
        const decay = Math.cos(p * Math.PI * 0.5);

        cpuLoad = Math.round(16 + decay * 28);
        cpuTemp = Math.round(46 + decay * 16);
        cpuPower = Math.round(38 + decay * 34);
        cpuFanPct = Math.round(26 + decay * 18);
        cpuFanRpm = Math.round(680 + decay * 340);

        gpuLoad = Math.round(8 + decay * 65);
        gpuTemp = Math.round(43 + decay * 22);
        gpuPower = Math.round(45 + decay * 180);
        gpuFanPct = Math.round(decay * 48);
        gpuFanRpm = Math.round(decay * 1350);
        gpuVramMb = Math.round(3800 + decay * 7400);
        gpuEnc = Math.round(decay * 55);

        diskRead = Number((3.5 + decay * 55).toFixed(1));
        diskWrite = Number((1.2 + decay * 8).toFixed(1));
        netRecv = Number((1.2 + decay * 60).toFixed(1));
        netSent = Number((0.2 + decay * 2.8).toFixed(1));

        foregroundApp = 'Cyberpunk 2077';
        foregroundLauncher = 'steam';
        foregroundExe = 'Cyberpunk2077.exe';
        foregroundPid = 14080;
        foregroundRuntime = '1h 18m';

        processes = [
            { name: 'Cyberpunk2077.exe', pid: 14080, cpu: Number((8 + decay * 32).toFixed(1)), mem_mb: Math.round(4200 + decay * 6800) },
            { name: 'sunshine.exe', pid: 4812, cpu: Number((1.5 + decay * 6).toFixed(1)), mem_mb: 340 },
            { name: 'Steam.exe', pid: 5412, cpu: 2.2, mem_mb: 495 }
        ];
    }

    if (!demoState.sunshineReachable) {
        processes = processes.map(p => p.name === 'sunshine.exe' ? { name: 'dwm.exe', pid: 820, cpu: 0.6, mem_mb: 145 } : p);
    }

    return {
        cpuLoad, cpuTemp, cpuPower, cpuFanPct, cpuFanRpm,
        gpuLoad, gpuTemp, gpuPower, gpuFanPct, gpuFanRpm, gpuVramMb, gpuEnc,
        diskRead, diskWrite, netRecv, netSent,
        foregroundApp, foregroundLauncher, foregroundExe, foregroundPid, foregroundRuntime,
        processes
    };
}

// Generate full telemetry payload and pre-seed history if empty
function generateDiagnosticsPayload() {
    const nowSec = Date.now() / 1000;
    const m = getScenarioMetricsAtTime(nowSec);

    // Pre-seed 30 historical points if state history is empty or just opened
    if (state && (!state.cpuHistory || state.cpuHistory.length <= 1)) {
        state.cpuHistory = [];
        state.gpuHistory = [];
        state.diskHistory = [];
        state.netHistory = [];

        for (let i = 29; i >= 1; i--) {
            const histSec = nowSec - i * 1.5;
            const hm = getScenarioMetricsAtTime(histSec);
            const histTime = Math.round(histSec * 1000);

            state.cpuHistory.push({
                cpu: hm.cpuLoad,
                ram: 39.4,
                power: hm.cpuPower,
                temp: hm.cpuTemp,
                fan: hm.cpuFanPct,
                time: histTime
            });

            state.gpuHistory.push({
                gpu: hm.gpuLoad,
                vram: Number(((hm.gpuVramMb / 16376) * 100).toFixed(1)),
                enc: hm.gpuEnc,
                fan: hm.gpuFanPct,
                power: hm.gpuPower,
                temp: hm.gpuTemp,
                time: histTime
            });

            state.diskHistory.push({
                read: hm.diskRead,
                write: hm.diskWrite,
                time: histTime
            });

            state.netHistory.push({
                recv: hm.netRecv,
                sent: hm.netSent,
                time: histTime
            });
        }
    }

    const topProcs = (m.processes || []).map(p => ({
        pid: p.pid,
        name: p.name,
        cpu: p.cpu,
        mem: p.mem_mb >= 1024 ? (p.mem_mb / 1024).toFixed(1) + ' GB' : p.mem_mb + ' MB'
    }));

    return {
        status: 'ok',
        cpu_name: 'AMD Ryzen 7 7800X3D 8-Core Processor',
        cpu_cores: 8,
        cpu_logical: 16,
        cpu: m.cpuLoad,
        cpu_usage: m.cpuLoad,
        cpu_load: m.cpuLoad,
        cpu_freq: 4.8,
        cpu_temp: m.cpuTemp,
        cpu_power: m.cpuPower,
        cpu_fan: m.cpuFanPct,
        cpu_fan_cur: m.cpuFanRpm,
        cpu_fan_max: 'N/A',
        ram_total: 32.0,
        ram_used: 12.6,
        ram_total_gb: 32.0,
        ram_used_gb: 12.6,
        ram_pct: 39.4,
        gpu_name: 'NVIDIA GeForce RTX 4080',
        gpu_driver: '560.94',
        gpu_load: m.gpuLoad,
        gpu_freq: 2610,
        gpu_mem_used: m.gpuVramMb,
        gpu_mem_total: 16376,
        gpu_vram_used_mb: m.gpuVramMb,
        gpu_vram_total_mb: 16376,
        gpu_vram_pct: Number(((m.gpuVramMb / 16376) * 100).toFixed(1)),
        gpu_enc: m.gpuEnc,
        gpu_temp: m.gpuTemp,
        gpu_power: m.gpuPower,
        gpu_power_limit: 320,
        gpu_fan: m.gpuFanPct,
        gpu_fan_cur: m.gpuFanRpm,
        gpu_fan_max: 'N/A',
        disks: [
            {
                device: 'C:',
                drive: 'C:',
                fs: 'NTFS',
                label: 'Samsung 990 PRO 2TB (Windows 11)',
                total: 1907,
                total_gb: 1907.7,
                used: 859,
                used_gb: 859.5,
                free: 1048,
                free_gb: 1048.2,
                pct: 45,
                used_pct: 45,
                read_mb_s: m.diskRead,
                write_mb_s: m.diskWrite
            },
            {
                device: 'D:',
                drive: 'D:',
                fs: 'NTFS',
                label: 'Seagate IronWolf 4TB (Games & Archive)',
                total: 3726,
                total_gb: 3726.0,
                used: 2422,
                used_gb: 2422.0,
                free: 1304,
                free_gb: 1304.0,
                pct: 65,
                used_pct: 65,
                read_mb_s: Number((m.diskRead * 0.15).toFixed(1)),
                write_mb_s: Number((m.diskWrite * 0.1).toFixed(1))
            }
        ],
        disk_read_mb: m.diskRead,
        disk_write_mb: m.diskWrite,
        net_adapter: 'Intel I226-V 2.5GbE',
        net_recv_mb: m.netRecv,
        net_sent_mb: m.netSent,
        net: {
            adapter: 'Intel I226-V 2.5GbE',
            recv_mb_s: m.netRecv,
            sent_mb_s: m.netSent
        },
        foreground_app: m.foregroundApp,
        foreground_launcher: m.foregroundLauncher,
        foreground_exe: m.foregroundExe,
        foreground_pid: m.foregroundPid,
        foreground_runtime: m.foregroundRuntime,
        foreground_healthy: true,
        top_procs: topProcs,
        processes: topProcs,
        win_edition: 'Windows 11 Pro',
        win_ver: '24H2',
        win_build: '26100.1742 (x64)',
        reboot_pending: false,
        reboot_kb: null,
        win_update_date: '04/09/2026',
        win_update_raw: '2026-09-04 · KB5043076 · DirectX 12 Ultimate · WDDM 3.2',
        motherboard: 'ASUS ROG STRIX B650E-I GAMING WIFI',
        bios_ver: '3024 (AGESA 1.2.0.2)',
        sunshine_running: Boolean(demoState.online && demoState.sunshineReachable),
        sunshine_clients: (demoState.online && demoState.sunshineReachable) ? (m.gpuEnc > 0 ? 1 : 0) : 0,
        uptime: demoState.uptime || '4h 22m'
    };
}

/**
 * Handle simulated API requests in demo mode
 */
export async function handleDemoApi(action, opts = {}) {
    // Realistic micro-latency (25-50ms)
    await new Promise(r => setTimeout(r, 25 + Math.random() * 25));

    switch (action) {
        case 'config':
            return {
                app_name: 'RigPulse',
                target: {
                    name: 'RigPulse',
                    host: demoState.ip,
                    public_domain: 'gaming.rigpulse.com'
                },
                sunshine: {
                    enabled: true,
                    wan_host: 'gaming.rigpulse.com'
                },
                telemetry: {
                    cpu_power_max_watts: 150
                },
                client: {}
            };

        case 'auth':
            demoState.authenticated = true;
            return {
                success: true,
                role: demoState.role,
                csrf_token: 'demo_csrf_token_888'
            };

        case 'logout':
            demoState.authenticated = false;
            return { success: true, message: 'Logged out' };

        case 'status':
            if (!demoState.authenticated) {
                const err = new Error('auth');
                err.status = 401;
                throw err;
            }

            if (demoState.online) {
                return {
                    status: 'up',
                    ip: demoState.ip,
                    host: demoState.ip,
                    ssh_ready: true,
                    csrf_token: 'demo_csrf_token_888',
                    role: demoState.role,
                    client_is_local: false,
                    last_power_action: demoState.lastPowerAction || null
                };
            } else {
                return {
                    status: 'down',
                    ip: null,
                    host: demoState.ip,
                    ssh_ready: false,
                    csrf_token: 'demo_csrf_token_888',
                    role: demoState.role,
                    client_is_local: false,
                    last_power_action: demoState.lastPowerAction || null
                };
            }

        case 'sunshine': {
            const isUp = Boolean(demoState.online && demoState.sunshineReachable);
            const now = Date.now();
            const wave = 5.8 + Math.sin(now / 3200) * 4.2 + Math.cos(now / 1300) * 2.4;
            const spike = Math.random() < 0.18 ? Math.random() * 4.5 : (Math.random() * 1.8 - 0.9);
            const ping = Number(Math.max(1.1, Math.min(14.9, wave + spike)).toFixed(1));
            return {
                success: true,
                available: Boolean(demoState.online),
                reason: demoState.online ? (demoState.sunshineReachable ? 'Host reachable' : 'Sunshine service is stopped') : 'Host is offline',
                ports: [
                    { name: 'RTSP', port: 48010, status: isUp ? 'up' : 'down', desc: 'RTSP Video/Audio Stream' },
                    { name: 'Control', port: 47999, status: isUp ? 'up' : 'down', desc: 'Control Channel' },
                    { name: 'Video', port: 47998, status: isUp ? 'up' : 'down', desc: 'Video Stream' },
                    { name: 'Audio', port: 48000, status: isUp ? 'up' : 'down', desc: 'Audio Stream' },
                    { name: 'Web', port: 47990, status: isUp ? 'up' : 'down', desc: 'Sunshine Admin Web UI' }
                ],
                ping_ms: isUp ? ping : null
            };
        }

        case 'uptime':
            if (!demoState.authenticated) {
                const err = new Error('auth');
                err.status = 401;
                throw err;
            }
            return {
                success: Boolean(demoState.online),
                uptime: demoState.online ? (demoState.uptime || '4h 22m') : null
            };

        case 'sysinfo':
        case 'diagnostics':
            if (!demoState.authenticated) {
                const err = new Error('auth');
                err.status = 401;
                throw err;
            }
            if (!demoState.online) {
                return { available: false, debug: { message: 'Host is offline' } };
            }
            return {
                available: true,
                stats: generateDiagnosticsPayload()
            };

        case 'shutdown': {
            demoState.actionLogs.unshift({
                ts: Math.floor(Date.now() / 1000),
                time: new Date().toISOString(),
                action: 'shutdown',
                ip: '192.168.1.200',
                result: 'success'
            });

            if (demoState.powerTimer) clearTimeout(demoState.powerTimer);
            demoState.powerTimer = setTimeout(() => {
                demoState.online = false;
                demoState.sunshineReachable = false;
                demoState.lastPowerAction = 'shutdown';
                if (typeof window !== 'undefined') {
                    if (window.updateDemoUI) window.updateDemoUI();
                    window.dispatchEvent(new Event('focus'));
                }
            }, 15000);

            return { success: true, message: 'Host shutdown initiated' };
        }

        case 'sleep': {
            demoState.actionLogs.unshift({
                ts: Math.floor(Date.now() / 1000),
                time: new Date().toISOString(),
                action: 'sleep',
                ip: '192.168.1.200',
                result: 'success'
            });

            if (demoState.powerTimer) clearTimeout(demoState.powerTimer);
            demoState.powerTimer = setTimeout(() => {
                demoState.online = false;
                demoState.sunshineReachable = false;
                demoState.lastPowerAction = 'sleep';
                if (typeof window !== 'undefined') {
                    if (window.updateDemoUI) window.updateDemoUI();
                    window.dispatchEvent(new Event('focus'));
                }
            }, 5000);

            return { success: true, message: 'Host sleep initiated' };
        }

        case 'wol': {
            let wolBody = {};
            try {
                wolBody = typeof opts.body === 'string' ? JSON.parse(opts.body) : (opts.body || {});
            } catch (e) { }
            const isWakeUp = !!wolBody.isWakeUp;
            const wolDelay = isWakeUp ? 3000 : 30000;

            if (demoState.powerTimer) clearTimeout(demoState.powerTimer);
            demoState.online = false;
            demoState.sunshineReachable = false;
            demoState.lastPowerAction = 'wol';
            if (typeof window !== 'undefined' && window.updateDemoUI) window.updateDemoUI();

            demoState.actionLogs.unshift({
                ts: Math.floor(Date.now() / 1000),
                time: new Date().toISOString(),
                action: 'wol',
                ip: '192.168.1.200',
                result: 'success'
            });

            demoState.powerTimer = setTimeout(() => {
                demoState.online = true;
                demoState.sunshineReachable = true;
                demoState.lastPowerAction = 'wol';
                demoState.powerTimer = null;
                if (typeof window !== 'undefined') {
                    if (window.updateDemoUI) window.updateDemoUI();
                    window.dispatchEvent(new Event('focus'));
                }
            }, wolDelay);

            return { success: true, message: `Magic packet sent to ${demoState.mac}` };
        }

        case 'power': {
            let body = {};
            try {
                body = typeof opts.body === 'string' ? JSON.parse(opts.body) : (opts.body || {});
            } catch (e) { }

            const sub = body.subaction || 'wake';
            if (sub === 'shutdown') return handleDemoApi('shutdown', opts);
            if (sub === 'sleep') return handleDemoApi('sleep', opts);
            if (sub === 'wake' || sub === 'wol') return handleDemoApi('wol', opts);
            if (sub === 'reboot') {
                demoState.online = false;
                demoState.lastPowerAction = 'shutdown';
                setTimeout(() => {
                    demoState.online = true;
                    demoState.lastPowerAction = 'wol';
                    if (window.updateDemoUI) window.updateDemoUI();
                    window.dispatchEvent(new Event('focus'));
                }, 2800);
                return { success: true, message: 'Host reboot initiated' };
            }
            return { success: true, message: `Command ${sub} dispatched` };
        }

        case 'sunshine_ctl': {
            let body = {};
            try {
                body = typeof opts.body === 'string' ? JSON.parse(opts.body) : (opts.body || {});
            } catch (e) { }

            const rawCmd = body.cmd || body.subaction || 'sunshine-restart';
            const sub = rawCmd.replace(/^sunshine-/, ''); // 'start' | 'stop' | 'restart'

            demoState.actionLogs.unshift({
                ts: Math.floor(Date.now() / 1000),
                time: new Date().toISOString(),
                action: `sunshine-${sub}`,
                ip: '192.168.1.200',
                result: 'success'
            });

            if (sub === 'restart') {
                demoState.sunshineReachable = false;
                setTimeout(() => {
                    demoState.sunshineReachable = true;
                    if (typeof window !== 'undefined') {
                        if (window.checkSunshine) window.checkSunshine();
                        if (window.updateDemoUI) window.updateDemoUI();
                    }
                }, 1200);
                return { success: true, message: 'Sunshine restarted' };
            } else if (sub === 'stop') {
                demoState.sunshineReachable = false;
                setTimeout(() => {
                    if (typeof window !== 'undefined') {
                        if (window.checkSunshine) window.checkSunshine();
                        if (window.updateDemoUI) window.updateDemoUI();
                    }
                }, 100);
                return { success: true, message: 'Sunshine stopped' };
            } else if (sub === 'start') {
                demoState.sunshineReachable = true;
                setTimeout(() => {
                    if (typeof window !== 'undefined') {
                        if (window.checkSunshine) window.checkSunshine();
                        if (window.updateDemoUI) window.updateDemoUI();
                    }
                }, 100);
                return { success: true, message: 'Sunshine started' };
            }
            return { success: true, message: 'Command executed' };
        }

        case 'history':
            return {
                history: demoState.actionLogs,
                lock: { locked: false }
            };

        default:
            return { success: true };
    }
}

// Floating Demo Control Pill
export function initDemoToolbar() {
    if (!isDemoMode || !DEMO_BAR || document.getElementById('rigpulse-demo-bar') || hideToolbar) return;

    const bar = document.createElement('div');
    bar.id = 'rigpulse-demo-bar';
    bar.innerHTML = `
        <style>
            #rigpulse-demo-bar {
                position: fixed;
                bottom: 52px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 99999;
                background: rgba(10, 14, 23, 0.88);
                border: 1px solid rgba(0, 240, 255, 0.4);
                box-shadow: 0 4px 24px rgba(0, 0, 0, 0.6), 0 0 12px rgba(0, 240, 255, 0.2);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                border-radius: 999px;
                padding: 6px 14px;
                display: flex;
                align-items: center;
                gap: 8px;
                font-family: 'Share Tech Mono', monospace, sans-serif;
                font-size: 0.75rem;
                color: #fff;
                white-space: nowrap;
                max-width: 95vw;
                overflow-x: auto;
                transition: bottom 0.35s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .demo-badge-tag {
                color: #00f0ff;
                font-weight: 700;
                letter-spacing: 0.05em;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            .demo-badge-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: #39ff14;
                box-shadow: 0 0 6px #39ff14;
                animation: demoPulse 1.5s infinite alternate;
            }
            @keyframes demoPulse {
                from { opacity: 0.6; transform: scale(0.9); }
                to { opacity: 1; transform: scale(1.2); }
            }
            .demo-chip-btn {
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.18);
                color: #e0e0e0;
                border-radius: 999px;
                padding: 4px 10px;
                font-family: inherit;
                font-size: 0.72rem;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .demo-chip-btn:hover {
                background: rgba(0, 240, 255, 0.2);
                border-color: #00f0ff;
                color: #fff;
            }
            .demo-chip-btn.active-online {
                background: rgba(57, 255, 20, 0.15);
                border-color: rgba(57, 255, 20, 0.5);
                color: #39ff14;
            }
            .demo-chip-btn.active-sleep {
                background: rgba(255, 183, 0, 0.15);
                border-color: rgba(255, 183, 0, 0.5);
                color: #ffb700;
            }
            .demo-chip-btn.active-offline {
                background: rgba(255, 0, 85, 0.15);
                border-color: rgba(255, 0, 85, 0.5);
                color: #ff0055;
            }
        </style>
        <div class="demo-badge-tag">
            <span class="demo-badge-dot"></span>
            <span>DEMO</span>
        </div>
        <button class="demo-chip-btn active-online" id="demo-btn-power">
            <span>⚡ Host:</span> <strong id="demo-power-txt">ONLINE</strong>
        </button>
        <button class="demo-chip-btn" id="demo-btn-diag">
            <span>📊 Diagnostics</span>
        </button>
        <button class="demo-chip-btn" id="demo-btn-lock">
            <span>🔒 Lock</span>
        </button>
    `;

    document.body.appendChild(bar);

    const btnPower = document.getElementById('demo-btn-power');
    const powerTxt = document.getElementById('demo-power-txt');
    const btnDiag = document.getElementById('demo-btn-diag');
    const btnLock = document.getElementById('demo-btn-lock');

    function adjustDemoBarPosition() {
        const dBar = document.getElementById('rigpulse-demo-bar');
        const sunshine = document.getElementById('sunshine-bar');
        if (!dBar) return;
        if (!sunshine || sunshine.style.display === 'none' || !demoState.online) {
            dBar.style.bottom = '52px';
            return;
        }
        if (sunshine.classList.contains('collapsed')) {
            dBar.style.bottom = '52px';
        } else {
            const h = sunshine.offsetHeight || 180;
            dBar.style.bottom = `${h + 12}px`;
        }
    }

    btnPower.addEventListener('click', () => {
        if (demoState.online) {
            // ONLINE -> SLEEP
            demoState.online = false;
            demoState.sunshineReachable = false;
            demoState.lastPowerAction = 'sleep';
        } else if (demoState.lastPowerAction === 'sleep') {
            // SLEEP -> DOWN
            demoState.online = false;
            demoState.sunshineReachable = false;
            demoState.lastPowerAction = 'shutdown';
        } else {
            // DOWN -> ONLINE
            demoState.online = true;
            demoState.sunshineReachable = true;
            demoState.lastPowerAction = 'wol';
        }
        window.updateDemoUI();
        window.dispatchEvent(new Event('focus'));
    });

    btnDiag.addEventListener('click', () => {
        if (!demoState.online) {
            demoState.online = true;
            demoState.sunshineReachable = true;
            demoState.lastPowerAction = 'wol';
            window.updateDemoUI();
        }
        const diagBtn = document.getElementById('diagnostics-toggle');
        if (diagBtn) diagBtn.click();
    });

    btnLock.addEventListener('click', () => {
        demoState.authenticated = false;

        // Close diagnostics modal
        const diagClose = document.getElementById('diagnostics-close');
        if (diagClose) diagClose.click();
        const diagOverlay = document.getElementById('diagnostics-overlay');
        if (diagOverlay) diagOverlay.style.display = 'none';
        state.diagnosticsOpen = false;

        // Close history modal
        const histClose = document.getElementById('history-close');
        if (histClose) histClose.click();
        const histOverlay = document.getElementById('history-overlay');
        if (histOverlay) histOverlay.style.display = 'none';

        // Close shutdown modal if open
        const shutdownCancel = document.getElementById('modal-cancel');
        if (shutdownCancel) shutdownCancel.click();
        const shutdownModal = document.getElementById('shutdown-modal');
        if (shutdownModal) shutdownModal.style.display = 'none';

        document.body.classList.remove('modal-open');

        // Trigger logout flow if button is available
        const logoutToggle = document.getElementById('logout-toggle');
        if (logoutToggle && typeof logoutToggle.click === 'function') {
            logoutToggle.click();
        }

        const lockScreen = document.getElementById('lock-screen');
        const mainContainer = document.getElementById('main-container');
        if (lockScreen) lockScreen.style.display = 'flex';
        if (mainContainer) mainContainer.style.display = 'none';
        if (logoutToggle) logoutToggle.style.display = 'none';
        const historyToggle = document.getElementById('history-toggle');
        if (historyToggle) historyToggle.style.display = 'none';
        const diagToggle = document.getElementById('diagnostics-toggle');
        if (diagToggle) diagToggle.style.display = 'none';
        const refreshToggle = document.getElementById('refresh-toggle');
        if (refreshToggle) refreshToggle.style.display = 'none';
        const gpuToggle = document.getElementById('gpu-toggle-btn');
        if (gpuToggle) gpuToggle.style.display = 'none';

        const lockPassword = document.getElementById('lock-password');
        if (lockPassword) {
            lockPassword.value = '';
            lockPassword.focus();
        }
        const lockError = document.getElementById('lock-error');
        if (lockError) {
            lockError.textContent = '';
            lockError.className = 'lock-error';
        }

        adjustDemoBarPosition();
    });

    window.updateDemoUI = function () {
        if (demoState.online) {
            btnPower.className = 'demo-chip-btn active-online';
            powerTxt.textContent = 'ONLINE';
        } else if (demoState.lastPowerAction === 'sleep') {
            btnPower.className = 'demo-chip-btn active-sleep';
            powerTxt.textContent = 'SLEEP';
        } else {
            btnPower.className = 'demo-chip-btn active-offline';
            powerTxt.textContent = 'DOWN';
        }
        adjustDemoBarPosition();
    };

    // Watch for Sunshine panel toggle and window resize
    window.addEventListener('resize', adjustDemoBarPosition);
    const sunCollapseBtn = document.getElementById('sunshine-collapse-btn');
    if (sunCollapseBtn) {
        sunCollapseBtn.addEventListener('click', () => {
            setTimeout(adjustDemoBarPosition, 50);
            setTimeout(adjustDemoBarPosition, 380);
        });
    }
    const sunBar = document.getElementById('sunshine-bar');
    if (sunBar) {
        sunBar.addEventListener('transitionend', adjustDemoBarPosition);
    }
    setTimeout(adjustDemoBarPosition, 200);
    setTimeout(adjustDemoBarPosition, 800);

    window.RigPulseDemo = {
        getState: () => demoState,
        setMode: (mode) => {
            if (mode === 'online') {
                demoState.online = true;
                demoState.sunshineReachable = true;
                demoState.lastPowerAction = 'wol';
            } else if (mode === 'sleep') {
                demoState.online = false;
                demoState.sunshineReachable = false;
                demoState.lastPowerAction = 'sleep';
            } else {
                demoState.online = false;
                demoState.sunshineReachable = false;
                demoState.lastPowerAction = 'shutdown';
            }
            if (window.updateDemoUI) window.updateDemoUI();
            window.dispatchEvent(new Event('focus'));
        },
        setOnline: (val) => {
            window.RigPulseDemo.setMode(val ? 'online' : 'down');
        },
        setAuthenticated: (val) => {
            demoState.authenticated = !!val;
        }
    };
}
