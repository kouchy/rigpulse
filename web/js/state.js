/**
 * RigPulse — Global Application & Telemetry State (js/state.js)
 */

import { defaultClientConfig } from './config.js';

export const state = {
    // Configuration & Metadata
    appName: 'RigPulse',
    targetName: 'GamingRig',
    targetHost: '',
    cpuPowerMaxWatts: defaultClientConfig.cpuPowerMaxWatts || 150,

    // Timers & Polling Frequencies (milliseconds)
    statusPollInterval: defaultClientConfig.statusPollInterval || 3000,
    sunshinePollInterval: defaultClientConfig.sunshinePollInterval || 4000,
    uptimePollInterval: defaultClientConfig.uptimePollInterval || 30000,
    sysinfoPollInterval: defaultClientConfig.sysinfoPollInterval || 2000,
    bootTimeoutMs: defaultClientConfig.bootTimeoutMs || 120000,

    // Machine & Session State
    authenticated: false,
    userRole: 'user', // 'user' | 'admin'
    machineIsUp: false,
    sshReady: false,
    isOffline: false,
    isBooting: false,
    bootIsWakeUp: false,
    bootStartTime: null,
    lastPowerAction: null, // 'shutdown' | 'sleep' | null
    sendingAction: null,    // null | 'wol' | 'sleep' | 'shutdown'
    sendingTimer: null,
    bootTimeoutHandle: null,
    statusInterval: null,

    // Sunshine Streaming Service State
    sunshineTimer: null,
    sunshineInFlight: false,
    sunshineBusy: false,
    sunshineWanHost: null,

    // Uptime & Status Check State
    uptimeTimer: null,
    uptimeInFlight: false,
    sysinfoTimer: null,
    sysinfoInFlight: false,

    // Telemetry Sliding History (max points from config)
    historyMax: defaultClientConfig.diagHistoryMax || 60,
    cpuHistory: [],
    gpuHistory: [],
    diskHistory: [],
    netHistory: [],

    // Chart Options & Visibility
    cpuChartVisible: true,
    gpuChartVisible: true,
    diskChartVisible: true,
    netChartVisible: true,
    secondaryMetric: defaultClientConfig.defaultSecondaryMetric || 'power', // 'power' | 'temp'

    // Diagnostics Engine State
    diagnosticsOpen: false,
    pipelineSpeed: defaultClientConfig.defaultPipelineSpeed || 1, // 1 (3s) | 2 (1.5s) | 3 (750ms)
    gpuMode: defaultClientConfig.defaultGpuMode || 'eco',         // 'eco' | 'light' | 'heavy'
    chartSlideProgress: 1,
    measuredRtt: 2200,
    rttSamples: [],
    inFlightCount: 0,
    inFlightControllers: new Set(),
    metronomeTimer: null,
    seqCounter: 0,
    lastRenderedSeq: 0,
    lastKnownGpuPowerLimit: 0,
    lastKnownGpuPower: null,
    lastKnownGpuFreq: null,

    // Agent Capabilities (Protocol v1.0)
    capabilities: null,
};
