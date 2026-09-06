/**
 * RigPulse — Frontend Configuration & Default Timers (js/config.js)
 * 
 * These settings define client polling frequencies, chart limits, and initial modes.
 * Any key can be overridden server-side in config.php under the 'client' section.
 */

export const defaultClientConfig = {
    // Polling intervals in milliseconds
    statusPollInterval: 3000,       // 3s — reachability ping & state detection
    sunshinePollInterval: 4000,     // 4s — Sunshine streaming TCP ports check
    uptimePollInterval: 30000,      // 30s — System uptime query interval
    sysinfoPollInterval: 2000,      // 2s — real-time hardware monitoring when tab is active
    bootTimeoutMs: 120000,          // 2 min — revert if machine never responds

    // Telemetry & Chart Settings
    diagHistoryMax: 60,             // Number of historical points kept in sliding charts (~3 min at 3s)
    cpuPowerMaxWatts: 150,          // Baseline CPU power ceiling (auto-scales upward if exceeded)

    // Performance & HUD Defaults
    defaultGpuMode: 'eco',          // Default mode for desktop & mobile: 'eco' | 'light' | 'heavy' (configured via config.php)
    defaultPipelineSpeed: 1,        // 1x (3s) | 2x (1.5s) | 3x (750ms)
    defaultSecondaryMetric: 'power',// 'power' (Watts) | 'temp' (°C)
};
