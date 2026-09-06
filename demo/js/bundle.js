(() => {
  // docs/demo/js/demo.js
  var ENABLE_DEMO = true;

  // docs/demo/js/config.js
  var defaultClientConfig = {
    // Polling intervals in milliseconds
    statusPollInterval: 3e3,
    // 3s — reachability ping & state detection
    sunshinePollInterval: 4e3,
    // 4s — Sunshine streaming TCP ports check
    uptimePollInterval: 3e4,
    // 30s — System uptime query interval
    sysinfoPollInterval: 2e3,
    // 2s — real-time hardware monitoring when tab is active
    bootTimeoutMs: 12e4,
    // 2 min — revert if machine never responds
    // Telemetry & Chart Settings
    diagHistoryMax: 60,
    // Number of historical points kept in sliding charts (~3 min at 3s)
    cpuPowerMaxWatts: 150,
    // Baseline CPU power ceiling (auto-scales upward if exceeded)
    // Performance & HUD Defaults
    defaultGpuMode: "eco",
    // Default mode for desktop & mobile: 'eco' | 'light' | 'heavy' (configured via config.php)
    defaultPipelineSpeed: 1,
    // 1x (3s) | 2x (1.5s) | 3x (750ms)
    defaultSecondaryMetric: "power"
    // 'power' (Watts) | 'temp' (°C)
  };

  // docs/demo/js/state.js
  var state = {
    // Configuration & Metadata
    appName: "RigPulse",
    targetName: "GamingRig",
    targetHost: "",
    cpuPowerMaxWatts: defaultClientConfig.cpuPowerMaxWatts || 150,
    // Timers & Polling Frequencies (milliseconds)
    statusPollInterval: defaultClientConfig.statusPollInterval || 3e3,
    sunshinePollInterval: defaultClientConfig.sunshinePollInterval || 4e3,
    uptimePollInterval: defaultClientConfig.uptimePollInterval || 3e4,
    sysinfoPollInterval: defaultClientConfig.sysinfoPollInterval || 2e3,
    bootTimeoutMs: defaultClientConfig.bootTimeoutMs || 12e4,
    // Machine & Session State
    authenticated: false,
    userRole: "user",
    // 'user' | 'admin'
    machineIsUp: false,
    sshReady: false,
    isOffline: false,
    isBooting: false,
    bootIsWakeUp: false,
    bootStartTime: null,
    lastPowerAction: null,
    // 'shutdown' | 'sleep' | null
    sendingAction: null,
    // null | 'wol' | 'sleep' | 'shutdown'
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
    secondaryMetric: defaultClientConfig.defaultSecondaryMetric || "power",
    // 'power' | 'temp'
    // Diagnostics Engine State
    diagnosticsOpen: false,
    pipelineSpeed: defaultClientConfig.defaultPipelineSpeed || 1,
    // 1 (3s) | 2 (1.5s) | 3 (750ms)
    gpuMode: defaultClientConfig.defaultGpuMode || "eco",
    // 'eco' | 'light' | 'heavy'
    chartSlideProgress: 1,
    measuredRtt: 2200,
    rttSamples: [],
    inFlightCount: 0,
    inFlightControllers: /* @__PURE__ */ new Set(),
    metronomeTimer: null,
    seqCounter: 0,
    lastRenderedSeq: 0,
    lastKnownGpuPowerLimit: 0,
    lastKnownGpuPower: null,
    lastKnownGpuFreq: null,
    // Agent Capabilities (Protocol v1.0)
    capabilities: null
  };

  // docs/demo/js/demo_mock.js
  var urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  var viewMode = urlParams ? urlParams.get("view") : null;
  var hideToolbar = urlParams ? urlParams.get("hide_bar") === "1" || urlParams.get("notoolbar") === "1" : false;
  var isDemoMode = typeof window !== "undefined" && (Boolean(ENABLE_DEMO) || urlParams?.get("demo") === "1" || Boolean(window.RIGPULSE_DEMO) || window.location.protocol === "file:");
  if (isDemoMode && typeof window !== "undefined") {
    window.RIGPULSE_DEMO = true;
  }
  function getPastISO(minutesAgo) {
    return new Date(Date.now() - minutesAgo * 6e4).toISOString();
  }
  var demoState = {
    authenticated: viewMode === "lock" ? false : true,
    role: "admin",
    // 'admin' | 'user'
    online: viewMode === "offline" || viewMode === "down" || viewMode === "sleep" ? false : true,
    lastPowerAction: viewMode === "sleep" ? "sleep" : viewMode === "offline" || viewMode === "down" ? "shutdown" : null,
    uptime: "4h 22m",
    hostname: "RigPulse",
    ip: "192.168.1.100",
    mac: "00:11:22:33:44:55",
    companion: "192.168.1.200",
    sunshineReachable: viewMode === "offline" || viewMode === "down" || viewMode === "sleep" ? false : true,
    sunshinePorts: { rtsp: true, api: true, http: true, web: true },
    metricTick: 0,
    historyPreSeeded: false,
    actionLogs: [
      { ts: Math.floor(Date.now() / 1e3) - 720, time: getPastISO(12), action: "sunshine-restart", ip: "192.168.1.200", result: "success" },
      { ts: Math.floor(Date.now() / 1e3) - 3600, time: getPastISO(60), action: "wol", ip: "192.168.1.200", result: "success" },
      { ts: Math.floor(Date.now() / 1e3) - 5100, time: getPastISO(85), action: "sleep", ip: "192.168.1.150", result: "success" },
      { ts: Math.floor(Date.now() / 1e3) - 8400, time: getPastISO(140), action: "wol", ip: "192.168.1.200", result: "success" },
      { ts: Math.floor(Date.now() / 1e3) - 15420, time: getPastISO(257), action: "sunshine-start", ip: "192.168.1.100", result: "success" },
      { ts: Math.floor(Date.now() / 1e3) - 15600, time: getPastISO(260), action: "wol", ip: "192.168.1.200", result: "success" }
    ]
  };
  if (typeof window !== "undefined") {
    if (viewMode === "online") {
      try {
        localStorage.setItem("sunshine_collapsed", "0");
      } catch (e) {
      }
      const hideLoader = () => {
        const l = document.getElementById("cyber-loader");
        if (l) l.style.display = "none";
        const mc = document.getElementById("main-container");
        if (mc) mc.style.display = "flex";
        const sb = document.getElementById("sunshine-bar");
        if (sb) {
          sb.classList.remove("collapsed");
          sb.style.display = "flex";
        }
      };
      window.addEventListener("DOMContentLoaded", hideLoader);
      window.addEventListener("load", hideLoader);
    } else if (viewMode === "diag") {
      window.addEventListener("load", () => {
        const l = document.getElementById("cyber-loader");
        if (l) l.style.display = "none";
        const btn = document.getElementById("diagnostics-toggle");
        if (btn) btn.click();
      });
    }
  }
  function getScenarioMetricsAtTime(secondsTimestamp) {
    const cycle = secondsTimestamp % 80;
    let cpuLoad, cpuTemp, cpuPower, cpuFanPct, cpuFanRpm;
    let gpuLoad, gpuTemp, gpuPower, gpuFanPct, gpuFanRpm, gpuVramMb, gpuEnc;
    let diskRead, diskWrite, netRecv, netSent;
    let processes = [];
    let foregroundApp = "Windows Desktop";
    let foregroundLauncher = "desktop";
    let foregroundExe = "explorer.exe";
    let foregroundPid = 1044;
    let foregroundRuntime = "";
    if (cycle < 15) {
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
      gpuFanRpm = 0;
      gpuVramMb = 3250;
      gpuEnc = 0;
      diskRead = Number((1.8 + Math.random() * 1.5).toFixed(1));
      diskWrite = Number((0.6 + Math.random() * 0.4).toFixed(1));
      netRecv = Number((0.4 + Math.random() * 0.2).toFixed(1));
      netSent = Number((0.1 + Math.random() * 0.05).toFixed(1));
      foregroundApp = "Windows Desktop";
      foregroundLauncher = "desktop";
      foregroundExe = "explorer.exe";
      foregroundPid = 1044;
      foregroundRuntime = "";
      processes = [
        { name: "explorer.exe", pid: 1044, cpu: 2.8, mem_mb: 285 },
        { name: "Steam.exe", pid: 5412, cpu: 1.4, mem_mb: 490 },
        { name: "sunshine.exe", pid: 4812, cpu: 0.9, mem_mb: 230 }
      ];
    } else if (cycle < 30) {
      const p = (cycle - 15) / 15;
      const ramp = Math.sin(p * Math.PI * 0.5);
      cpuLoad = Math.round(20 + ramp * 65);
      cpuTemp = Math.round(48 + ramp * 24);
      cpuPower = Math.round(42 + ramp * 58);
      cpuFanPct = Math.round(26 + ramp * 28);
      cpuFanRpm = Math.round(680 + ramp * 580);
      gpuLoad = Math.round(10 + ramp * 48);
      gpuTemp = Math.round(42 + ramp * 13);
      gpuPower = Math.round(42 + ramp * 75);
      gpuFanPct = Math.round(ramp * 36);
      gpuFanRpm = Math.round(ramp * 1050);
      gpuVramMb = Math.round(3250 + ramp * 5400);
      gpuEnc = Math.round(ramp * 8);
      diskRead = Number((40 + Math.sin(p * Math.PI) * 420).toFixed(1));
      diskWrite = Number((8 + ramp * 12).toFixed(1));
      netRecv = Number((2 + ramp * 16).toFixed(1));
      netSent = Number((0.2 + ramp * 0.8).toFixed(1));
      foregroundApp = "Cyberpunk 2077";
      foregroundLauncher = "steam";
      foregroundExe = "Cyberpunk2077.exe";
      foregroundPid = 14080;
      foregroundRuntime = "0h 03m";
      processes = [
        { name: "Cyberpunk2077.exe", pid: 14080, cpu: Number((18 + ramp * 56).toFixed(1)), mem_mb: Math.round(2e3 + ramp * 6500) },
        { name: "sunshine.exe", pid: 4812, cpu: 3.2, mem_mb: 280 },
        { name: "Steam.exe", pid: 5412, cpu: 2.1, mem_mb: 510 }
      ];
    } else if (cycle < 65) {
      const p = (cycle - 30) / 35;
      const wobble = Math.sin(p * Math.PI * 4);
      cpuLoad = Math.round(48 + wobble * 6);
      cpuTemp = Math.round(63 + wobble * 2);
      cpuPower = Math.round(75 + wobble * 6);
      cpuFanPct = 46;
      cpuFanRpm = 1040;
      gpuLoad = Math.round(95 + wobble * 3);
      gpuTemp = Math.round(66 + wobble * 1.5);
      gpuPower = Math.round(260 + wobble * 18);
      gpuFanPct = 54;
      gpuFanRpm = 1520;
      gpuVramMb = Math.round(11850 + wobble * 350);
      gpuEnc = Math.round(88 + wobble * 6);
      diskRead = Number((72 + wobble * 18).toFixed(1));
      diskWrite = Number((12 + Math.random() * 4).toFixed(1));
      netRecv = Number((82.4 + wobble * 5).toFixed(1));
      netSent = Number((3.6 + Math.random() * 0.6).toFixed(1));
      foregroundApp = "Cyberpunk 2077";
      foregroundLauncher = "steam";
      foregroundExe = "Cyberpunk2077.exe";
      foregroundPid = 14080;
      foregroundRuntime = "1h 14m";
      processes = [
        { name: "Cyberpunk2077.exe", pid: 14080, cpu: Number((45 + wobble * 4).toFixed(1)), mem_mb: 11420 },
        { name: "sunshine.exe", pid: 4812, cpu: 8.8, mem_mb: 420 },
        { name: "Discord.exe", pid: 9216, cpu: 1.4, mem_mb: 490 }
      ];
    } else {
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
      foregroundApp = "Cyberpunk 2077";
      foregroundLauncher = "steam";
      foregroundExe = "Cyberpunk2077.exe";
      foregroundPid = 14080;
      foregroundRuntime = "1h 18m";
      processes = [
        { name: "Cyberpunk2077.exe", pid: 14080, cpu: Number((8 + decay * 32).toFixed(1)), mem_mb: Math.round(4200 + decay * 6800) },
        { name: "sunshine.exe", pid: 4812, cpu: Number((1.5 + decay * 6).toFixed(1)), mem_mb: 340 },
        { name: "Steam.exe", pid: 5412, cpu: 2.2, mem_mb: 495 }
      ];
    }
    if (!demoState.sunshineReachable) {
      processes = processes.map((p) => p.name === "sunshine.exe" ? { name: "dwm.exe", pid: 820, cpu: 0.6, mem_mb: 145 } : p);
    }
    return {
      cpuLoad,
      cpuTemp,
      cpuPower,
      cpuFanPct,
      cpuFanRpm,
      gpuLoad,
      gpuTemp,
      gpuPower,
      gpuFanPct,
      gpuFanRpm,
      gpuVramMb,
      gpuEnc,
      diskRead,
      diskWrite,
      netRecv,
      netSent,
      foregroundApp,
      foregroundLauncher,
      foregroundExe,
      foregroundPid,
      foregroundRuntime,
      processes
    };
  }
  function generateDiagnosticsPayload() {
    const nowSec = Date.now() / 1e3;
    const m = getScenarioMetricsAtTime(nowSec);
    if (state && (!state.cpuHistory || state.cpuHistory.length <= 1)) {
      state.cpuHistory = [];
      state.gpuHistory = [];
      state.diskHistory = [];
      state.netHistory = [];
      for (let i = 29; i >= 1; i--) {
        const histSec = nowSec - i * 1.5;
        const hm = getScenarioMetricsAtTime(histSec);
        const histTime = Math.round(histSec * 1e3);
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
          vram: Number((hm.gpuVramMb / 16376 * 100).toFixed(1)),
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
    const topProcs = (m.processes || []).map((p) => ({
      pid: p.pid,
      name: p.name,
      cpu: p.cpu,
      mem: p.mem_mb >= 1024 ? (p.mem_mb / 1024).toFixed(1) + " GB" : p.mem_mb + " MB"
    }));
    return {
      status: "ok",
      cpu_name: "AMD Ryzen 7 7800X3D 8-Core Processor",
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
      cpu_fan_max: "N/A",
      ram_total: 32,
      ram_used: 12.6,
      ram_total_gb: 32,
      ram_used_gb: 12.6,
      ram_pct: 39.4,
      gpu_name: "NVIDIA GeForce RTX 4080",
      gpu_driver: "560.94",
      gpu_load: m.gpuLoad,
      gpu_freq: 2610,
      gpu_mem_used: m.gpuVramMb,
      gpu_mem_total: 16376,
      gpu_vram_used_mb: m.gpuVramMb,
      gpu_vram_total_mb: 16376,
      gpu_vram_pct: Number((m.gpuVramMb / 16376 * 100).toFixed(1)),
      gpu_enc: m.gpuEnc,
      gpu_temp: m.gpuTemp,
      gpu_power: m.gpuPower,
      gpu_power_limit: 320,
      gpu_fan: m.gpuFanPct,
      gpu_fan_cur: m.gpuFanRpm,
      gpu_fan_max: "N/A",
      disks: [
        {
          device: "C:",
          drive: "C:",
          fs: "NTFS",
          label: "Samsung 990 PRO 2TB (Windows 11)",
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
          device: "D:",
          drive: "D:",
          fs: "NTFS",
          label: "Seagate IronWolf 4TB (Games & Archive)",
          total: 3726,
          total_gb: 3726,
          used: 2422,
          used_gb: 2422,
          free: 1304,
          free_gb: 1304,
          pct: 65,
          used_pct: 65,
          read_mb_s: Number((m.diskRead * 0.15).toFixed(1)),
          write_mb_s: Number((m.diskWrite * 0.1).toFixed(1))
        }
      ],
      disk_read_mb: m.diskRead,
      disk_write_mb: m.diskWrite,
      net_adapter: "Intel I226-V 2.5GbE",
      net_recv_mb: m.netRecv,
      net_sent_mb: m.netSent,
      net: {
        adapter: "Intel I226-V 2.5GbE",
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
      win_edition: "Windows 11 Pro",
      win_ver: "24H2",
      win_build: "26100.1742 (x64)",
      reboot_pending: false,
      reboot_kb: null,
      win_update_date: "04/09/2026",
      win_update_raw: "2026-09-04 \xB7 KB5043076 \xB7 DirectX 12 Ultimate \xB7 WDDM 3.2",
      motherboard: "ASUS ROG STRIX B650E-I GAMING WIFI",
      bios_ver: "3024 (AGESA 1.2.0.2)",
      sunshine_running: Boolean(demoState.online && demoState.sunshineReachable),
      sunshine_clients: demoState.online && demoState.sunshineReachable ? m.gpuEnc > 0 ? 1 : 0 : 0,
      uptime: demoState.uptime || "4h 22m"
    };
  }
  async function handleDemoApi(action, opts = {}) {
    await new Promise((r) => setTimeout(r, 25 + Math.random() * 25));
    switch (action) {
      case "config":
        return {
          app_name: "RigPulse",
          target: {
            name: "RigPulse",
            host: demoState.ip,
            public_domain: "gaming.rigpulse.com"
          },
          sunshine: {
            enabled: true,
            wan_host: "gaming.rigpulse.com"
          },
          telemetry: {
            cpu_power_max_watts: 150
          },
          client: {}
        };
      case "auth":
        demoState.authenticated = true;
        return {
          success: true,
          role: demoState.role,
          csrf_token: "demo_csrf_token_888"
        };
      case "logout":
        demoState.authenticated = false;
        return { success: true, message: "Logged out" };
      case "status":
        if (!demoState.authenticated) {
          const err = new Error("auth");
          err.status = 401;
          throw err;
        }
        if (demoState.online) {
          return {
            status: "up",
            ip: demoState.ip,
            host: demoState.ip,
            ssh_ready: true,
            csrf_token: "demo_csrf_token_888",
            role: demoState.role,
            client_is_local: false,
            last_power_action: demoState.lastPowerAction || null
          };
        } else {
          return {
            status: "down",
            ip: null,
            host: demoState.ip,
            ssh_ready: false,
            csrf_token: "demo_csrf_token_888",
            role: demoState.role,
            client_is_local: false,
            last_power_action: demoState.lastPowerAction || null
          };
        }
      case "sunshine": {
        const isUp = Boolean(demoState.online && demoState.sunshineReachable);
        const now = Date.now();
        const wave = 5.8 + Math.sin(now / 3200) * 4.2 + Math.cos(now / 1300) * 2.4;
        const spike = Math.random() < 0.18 ? Math.random() * 4.5 : Math.random() * 1.8 - 0.9;
        const ping = Number(Math.max(1.1, Math.min(14.9, wave + spike)).toFixed(1));
        return {
          success: true,
          available: Boolean(demoState.online),
          reason: demoState.online ? demoState.sunshineReachable ? "Host reachable" : "Sunshine service is stopped" : "Host is offline",
          ports: [
            { name: "RTSP", port: 48010, status: isUp ? "up" : "down", desc: "RTSP Video/Audio Stream" },
            { name: "Control", port: 47999, status: isUp ? "up" : "down", desc: "Control Channel" },
            { name: "Video", port: 47998, status: isUp ? "up" : "down", desc: "Video Stream" },
            { name: "Audio", port: 48e3, status: isUp ? "up" : "down", desc: "Audio Stream" },
            { name: "Web", port: 47990, status: isUp ? "up" : "down", desc: "Sunshine Admin Web UI" }
          ],
          ping_ms: isUp ? ping : null
        };
      }
      case "uptime":
        if (!demoState.authenticated) {
          const err = new Error("auth");
          err.status = 401;
          throw err;
        }
        return {
          success: Boolean(demoState.online),
          uptime: demoState.online ? demoState.uptime || "4h 22m" : null
        };
      case "sysinfo":
      case "diagnostics":
        if (!demoState.authenticated) {
          const err = new Error("auth");
          err.status = 401;
          throw err;
        }
        if (!demoState.online) {
          return { available: false, debug: { message: "Host is offline" } };
        }
        return {
          available: true,
          stats: generateDiagnosticsPayload()
        };
      case "shutdown": {
        demoState.actionLogs.unshift({
          ts: Math.floor(Date.now() / 1e3),
          time: (/* @__PURE__ */ new Date()).toISOString(),
          action: "shutdown",
          ip: "192.168.1.200",
          result: "success"
        });
        if (demoState.powerTimer) clearTimeout(demoState.powerTimer);
        demoState.powerTimer = setTimeout(() => {
          demoState.online = false;
          demoState.sunshineReachable = false;
          demoState.lastPowerAction = "shutdown";
          if (typeof window !== "undefined") {
            if (window.updateDemoUI) window.updateDemoUI();
            window.dispatchEvent(new Event("focus"));
          }
        }, 15e3);
        return { success: true, message: "Host shutdown initiated" };
      }
      case "sleep": {
        demoState.actionLogs.unshift({
          ts: Math.floor(Date.now() / 1e3),
          time: (/* @__PURE__ */ new Date()).toISOString(),
          action: "sleep",
          ip: "192.168.1.200",
          result: "success"
        });
        if (demoState.powerTimer) clearTimeout(demoState.powerTimer);
        demoState.powerTimer = setTimeout(() => {
          demoState.online = false;
          demoState.sunshineReachable = false;
          demoState.lastPowerAction = "sleep";
          if (typeof window !== "undefined") {
            if (window.updateDemoUI) window.updateDemoUI();
            window.dispatchEvent(new Event("focus"));
          }
        }, 5e3);
        return { success: true, message: "Host sleep initiated" };
      }
      case "wol": {
        if (demoState.powerTimer) clearTimeout(demoState.powerTimer);
        demoState.online = false;
        demoState.sunshineReachable = false;
        demoState.lastPowerAction = "wol";
        if (typeof window !== "undefined" && window.updateDemoUI) window.updateDemoUI();
        demoState.actionLogs.unshift({
          ts: Math.floor(Date.now() / 1e3),
          time: (/* @__PURE__ */ new Date()).toISOString(),
          action: "wol",
          ip: "192.168.1.200",
          result: "success"
        });
        demoState.powerTimer = setTimeout(() => {
          demoState.online = true;
          demoState.sunshineReachable = true;
          demoState.lastPowerAction = "wol";
          demoState.powerTimer = null;
          if (typeof window !== "undefined") {
            if (window.updateDemoUI) window.updateDemoUI();
            window.dispatchEvent(new Event("focus"));
          }
        }, 3e4);
        return { success: true, message: `Magic packet sent to ${demoState.mac}` };
      }
      case "power": {
        let body = {};
        try {
          body = typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body || {};
        } catch (e) {
        }
        const sub = body.subaction || "wake";
        if (sub === "shutdown") return handleDemoApi("shutdown", opts);
        if (sub === "sleep") return handleDemoApi("sleep", opts);
        if (sub === "wake" || sub === "wol") return handleDemoApi("wol", opts);
        if (sub === "reboot") {
          demoState.online = false;
          demoState.lastPowerAction = "shutdown";
          setTimeout(() => {
            demoState.online = true;
            demoState.lastPowerAction = "wol";
            if (window.updateDemoUI) window.updateDemoUI();
            window.dispatchEvent(new Event("focus"));
          }, 2800);
          return { success: true, message: "Host reboot initiated" };
        }
        return { success: true, message: `Command ${sub} dispatched` };
      }
      case "sunshine_ctl": {
        let body = {};
        try {
          body = typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body || {};
        } catch (e) {
        }
        const rawCmd = body.cmd || body.subaction || "sunshine-restart";
        const sub = rawCmd.replace(/^sunshine-/, "");
        demoState.actionLogs.unshift({
          ts: Math.floor(Date.now() / 1e3),
          time: (/* @__PURE__ */ new Date()).toISOString(),
          action: `sunshine-${sub}`,
          ip: "192.168.1.200",
          result: "success"
        });
        if (sub === "restart") {
          demoState.sunshineReachable = false;
          setTimeout(() => {
            demoState.sunshineReachable = true;
            if (typeof window !== "undefined") {
              if (window.checkSunshine) window.checkSunshine();
              if (window.updateDemoUI) window.updateDemoUI();
            }
          }, 1200);
          return { success: true, message: "Sunshine restarted" };
        } else if (sub === "stop") {
          demoState.sunshineReachable = false;
          setTimeout(() => {
            if (typeof window !== "undefined") {
              if (window.checkSunshine) window.checkSunshine();
              if (window.updateDemoUI) window.updateDemoUI();
            }
          }, 100);
          return { success: true, message: "Sunshine stopped" };
        } else if (sub === "start") {
          demoState.sunshineReachable = true;
          setTimeout(() => {
            if (typeof window !== "undefined") {
              if (window.checkSunshine) window.checkSunshine();
              if (window.updateDemoUI) window.updateDemoUI();
            }
          }, 100);
          return { success: true, message: "Sunshine started" };
        }
        return { success: true, message: "Command executed" };
      }
      case "history":
        return {
          history: demoState.actionLogs,
          lock: { locked: false }
        };
      default:
        return { success: true };
    }
  }
  function initDemoToolbar() {
    if (!isDemoMode || document.getElementById("rigpulse-demo-bar") || hideToolbar) return;
    const bar = document.createElement("div");
    bar.id = "rigpulse-demo-bar";
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
            <span>\u26A1 Host:</span> <strong id="demo-power-txt">ONLINE</strong>
        </button>
        <button class="demo-chip-btn" id="demo-btn-diag">
            <span>\u{1F4CA} Diagnostics</span>
        </button>
        <button class="demo-chip-btn" id="demo-btn-lock">
            <span>\u{1F512} Lock</span>
        </button>
    `;
    document.body.appendChild(bar);
    const btnPower = document.getElementById("demo-btn-power");
    const powerTxt = document.getElementById("demo-power-txt");
    const btnDiag = document.getElementById("demo-btn-diag");
    const btnLock = document.getElementById("demo-btn-lock");
    function adjustDemoBarPosition() {
      const dBar = document.getElementById("rigpulse-demo-bar");
      const sunshine = document.getElementById("sunshine-bar");
      if (!dBar) return;
      if (!sunshine || sunshine.style.display === "none" || !demoState.online) {
        dBar.style.bottom = "52px";
        return;
      }
      if (sunshine.classList.contains("collapsed")) {
        dBar.style.bottom = "52px";
      } else {
        const h = sunshine.offsetHeight || 180;
        dBar.style.bottom = `${h + 12}px`;
      }
    }
    btnPower.addEventListener("click", () => {
      if (demoState.online) {
        demoState.online = false;
        demoState.sunshineReachable = false;
        demoState.lastPowerAction = "sleep";
      } else if (demoState.lastPowerAction === "sleep") {
        demoState.online = false;
        demoState.sunshineReachable = false;
        demoState.lastPowerAction = "shutdown";
      } else {
        demoState.online = true;
        demoState.sunshineReachable = true;
        demoState.lastPowerAction = "wol";
      }
      window.updateDemoUI();
      window.dispatchEvent(new Event("focus"));
    });
    btnDiag.addEventListener("click", () => {
      if (!demoState.online) {
        demoState.online = true;
        demoState.sunshineReachable = true;
        demoState.lastPowerAction = "wol";
        window.updateDemoUI();
      }
      const diagBtn = document.getElementById("diagnostics-toggle");
      if (diagBtn) diagBtn.click();
    });
    btnLock.addEventListener("click", () => {
      demoState.authenticated = false;
      const diagClose = document.getElementById("diagnostics-close");
      if (diagClose) diagClose.click();
      const diagOverlay = document.getElementById("diagnostics-overlay");
      if (diagOverlay) diagOverlay.style.display = "none";
      state.diagnosticsOpen = false;
      const histClose = document.getElementById("history-close");
      if (histClose) histClose.click();
      const histOverlay = document.getElementById("history-overlay");
      if (histOverlay) histOverlay.style.display = "none";
      const shutdownCancel = document.getElementById("modal-cancel");
      if (shutdownCancel) shutdownCancel.click();
      const shutdownModal2 = document.getElementById("shutdown-modal");
      if (shutdownModal2) shutdownModal2.style.display = "none";
      document.body.classList.remove("modal-open");
      const logoutToggle = document.getElementById("logout-toggle");
      if (logoutToggle && typeof logoutToggle.click === "function") {
        logoutToggle.click();
      }
      const lockScreen = document.getElementById("lock-screen");
      const mainContainer = document.getElementById("main-container");
      if (lockScreen) lockScreen.style.display = "flex";
      if (mainContainer) mainContainer.style.display = "none";
      if (logoutToggle) logoutToggle.style.display = "none";
      const historyToggle2 = document.getElementById("history-toggle");
      if (historyToggle2) historyToggle2.style.display = "none";
      const diagToggle = document.getElementById("diagnostics-toggle");
      if (diagToggle) diagToggle.style.display = "none";
      const refreshToggle = document.getElementById("refresh-toggle");
      if (refreshToggle) refreshToggle.style.display = "none";
      const gpuToggle = document.getElementById("gpu-toggle-btn");
      if (gpuToggle) gpuToggle.style.display = "none";
      const lockPassword = document.getElementById("lock-password");
      if (lockPassword) {
        lockPassword.value = "";
        lockPassword.focus();
      }
      const lockError = document.getElementById("lock-error");
      if (lockError) {
        lockError.textContent = "";
        lockError.className = "lock-error";
      }
      adjustDemoBarPosition();
    });
    window.updateDemoUI = function() {
      if (demoState.online) {
        btnPower.className = "demo-chip-btn active-online";
        powerTxt.textContent = "ONLINE";
      } else if (demoState.lastPowerAction === "sleep") {
        btnPower.className = "demo-chip-btn active-sleep";
        powerTxt.textContent = "SLEEP";
      } else {
        btnPower.className = "demo-chip-btn active-offline";
        powerTxt.textContent = "DOWN";
      }
      adjustDemoBarPosition();
    };
    window.addEventListener("resize", adjustDemoBarPosition);
    const sunCollapseBtn = document.getElementById("sunshine-collapse-btn");
    if (sunCollapseBtn) {
      sunCollapseBtn.addEventListener("click", () => {
        setTimeout(adjustDemoBarPosition, 50);
        setTimeout(adjustDemoBarPosition, 380);
      });
    }
    const sunBar = document.getElementById("sunshine-bar");
    if (sunBar) {
      sunBar.addEventListener("transitionend", adjustDemoBarPosition);
    }
    setTimeout(adjustDemoBarPosition, 200);
    setTimeout(adjustDemoBarPosition, 800);
    window.RigPulseDemo = {
      getState: () => demoState,
      setMode: (mode) => {
        if (mode === "online") {
          demoState.online = true;
          demoState.sunshineReachable = true;
          demoState.lastPowerAction = "wol";
        } else if (mode === "sleep") {
          demoState.online = false;
          demoState.sunshineReachable = false;
          demoState.lastPowerAction = "sleep";
        } else {
          demoState.online = false;
          demoState.sunshineReachable = false;
          demoState.lastPowerAction = "shutdown";
        }
        if (window.updateDemoUI) window.updateDemoUI();
        window.dispatchEvent(new Event("focus"));
      },
      setOnline: (val) => {
        window.RigPulseDemo.setMode(val ? "online" : "down");
      },
      setAuthenticated: (val) => {
        demoState.authenticated = !!val;
      }
    };
  }

  // docs/demo/js/api.js
  var API_URL = "api.php";
  var csrfToken = null;
  var onUnauthorizedCallback = null;
  function setCsrfToken(token) {
    csrfToken = token;
  }
  function setOnUnauthorized(callback) {
    onUnauthorizedCallback = callback;
  }
  async function apiFetch(action, opts = {}) {
    if (isDemoMode) {
      initDemoToolbar();
      try {
        return await handleDemoApi(action, opts);
      } catch (err) {
        if (err.status === 401 || err.message === "auth") {
          if (typeof onUnauthorizedCallback === "function") {
            onUnauthorizedCallback(action);
          }
        }
        throw err;
      }
    }
    const headers = opts.headers ? { ...opts.headers } : {};
    if (opts.method === "POST" && csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
    const signal = opts.signal || (AbortSignal.timeout ? AbortSignal.timeout(15e3) : void 0);
    const res = await fetch(`${API_URL}?action=${action}`, { ...opts, headers, signal });
    if (res.status === 401) {
      if (typeof onUnauthorizedCallback === "function") {
        onUnauthorizedCallback(action);
      }
      throw new Error("auth");
    }
    if (res.status === 409) {
      const lockData = await res.json();
      throw new Error(lockData.message || "Action blocked by another user");
    }
    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }
    const text = await res.text();
    if (!text || !text.trim()) {
      throw new Error("Empty response from server");
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`Invalid JSON: ${text.slice(0, 120)}`);
    }
  }

  // docs/demo/js/ui.js
  var elements = {
    lockScreen: document.getElementById("lock-screen"),
    lockTitle: document.getElementById("lock-title"),
    lockForm: document.getElementById("lock-form"),
    lockPassword: document.getElementById("lock-password"),
    lockSubmit: document.getElementById("lock-submit"),
    lockError: document.getElementById("lock-error"),
    mainContainer: document.getElementById("main-container"),
    statusPanel: document.getElementById("status-panel"),
    statusDot: document.getElementById("status-dot"),
    statusValue: document.getElementById("status-value"),
    statusIp: document.getElementById("status-ip"),
    sunshineHeaderPing: document.getElementById("sunshine-header-ping"),
    statusUptime: document.getElementById("status-uptime"),
    powerBtn: document.getElementById("power-btn"),
    sleepBtn: document.getElementById("sleep-btn"),
    sshNotice: document.getElementById("ssh-notice"),
    messageEl: document.getElementById("message"),
    offlineBanner: document.getElementById("offline-banner"),
    targetNameLabel: document.getElementById("target-name-label"),
    // Top action buttons
    refreshToggle: document.getElementById("refresh-toggle"),
    gpuToggleBtn: document.getElementById("gpu-toggle"),
    historyToggle: document.getElementById("history-toggle"),
    logoutToggle: document.getElementById("logout-toggle"),
    diagnosticsToggle: document.getElementById("diagnostics-toggle"),
    // Mini sysinfo preview card
    sysinfoPanel: document.getElementById("sysinfo-panel"),
    cpuFill: document.getElementById("cpu-fill"),
    cpuVal: document.getElementById("cpu-val"),
    ramFill: document.getElementById("ram-fill"),
    ramVal: document.getElementById("ram-val"),
    gpuFill: document.getElementById("gpu-fill"),
    gpuVal: document.getElementById("gpu-val"),
    vramFill: document.getElementById("vram-fill"),
    vramVal: document.getElementById("vram-val"),
    cyberLoader: document.getElementById("cyber-loader")
  };
  var messageTimeout = null;
  var activeDotInterval = null;
  function dismissCyberLoader() {
    const loader = elements.cyberLoader || document.getElementById("cyber-loader");
    if (!loader || loader.dataset.dismissed) return;
    loader.dataset.dismissed = "true";
    loader.classList.add("fade-out");
    setTimeout(() => {
      loader.style.display = "none";
    }, 420);
  }
  function showMessage(text, type = "info") {
    if (!elements.messageEl) return;
    elements.messageEl.textContent = text;
    elements.messageEl.className = "message " + type;
    elements.messageEl.style.opacity = "1";
    clearTimeout(messageTimeout);
    messageTimeout = setTimeout(() => {
      elements.messageEl.style.opacity = "0";
    }, 6e3);
  }
  function resetButton(btn, text) {
    if (!btn) return;
    const label = btn.querySelector(".wol-btn-text");
    if (label) label.textContent = text;
    btn.classList.remove("sending");
    btn.disabled = false;
  }
  function pingColor(ms, alpha = 1) {
    if (ms <= 30) return `rgba(74, 222, 128, ${alpha})`;
    if (ms <= 60) return `rgba(250, 204, 21, ${alpha})`;
    if (ms <= 100) return `rgba(251, 146, 60, ${alpha})`;
    return `rgba(248, 113, 113, ${alpha})`;
  }
  function formatPing(ms) {
    if (ms === null || ms === void 0 || ms < 0) return "";
    return ms < 1 ? "<1 ms" : `${Math.round(ms)} ms`;
  }
  function startDotAnimation(prefix, count, targetEl, intervalMs = 400) {
    stopDotAnimation();
    let dots = 0;
    const update = () => {
      dots = (dots + 1) % (count + 1);
      const text = prefix + ".".repeat(dots);
      if (targetEl) {
        const span = targetEl.querySelector(".wol-btn-text");
        if (span) span.textContent = text;
        else targetEl.textContent = text;
      }
    };
    update();
    activeDotInterval = setInterval(update, intervalMs);
  }
  function stopDotAnimation() {
    if (activeDotInterval) {
      clearInterval(activeDotInterval);
      activeDotInterval = null;
    }
  }
  function updateUserRoleUI() {
    if (!state.authenticated) return;
    if (elements.refreshToggle) elements.refreshToggle.style.display = "flex";
    if (elements.gpuToggleBtn) elements.gpuToggleBtn.style.display = "flex";
    if (elements.historyToggle) elements.historyToggle.style.display = "flex";
    if (elements.logoutToggle) elements.logoutToggle.style.display = "flex";
    if (state.userRole === "admin") {
      if (elements.diagnosticsToggle) elements.diagnosticsToggle.style.display = "flex";
      updateDiagnosticsButtonState();
    } else {
      if (elements.diagnosticsToggle) elements.diagnosticsToggle.style.display = "none";
    }
  }
  function updateDiagnosticsButtonState() {
    if (!elements.diagnosticsToggle) return;
    if (!state.authenticated || state.userRole !== "admin") {
      elements.diagnosticsToggle.style.display = "none";
      return;
    }
    elements.diagnosticsToggle.style.display = "flex";
    const canProbe = state.machineIsUp && state.sshReady && !state.isOffline;
    elements.diagnosticsToggle.disabled = !canProbe;
    elements.diagnosticsToggle.classList.toggle("disabled", !canProbe);
    elements.diagnosticsToggle.title = canProbe ? "Diagnostic Telemetry HUD" : `Diagnostics unavailable (${state.targetName} offline)`;
  }
  function showSysinfoPanel() {
    if (!elements.sysinfoPanel) return;
    if (elements.sysinfoPanel.style.display === "flex" && !elements.sysinfoPanel.classList.contains("hiding")) return;
    elements.sysinfoPanel.classList.remove("hiding");
    elements.sysinfoPanel.style.display = "flex";
    const sunshineBar2 = document.getElementById("sunshine-bar");
    if (sunshineBar2 && sunshineBar2.style.display === "none") {
      sunshineBar2.style.display = "flex";
    }
  }
  function hideSysinfoPanel() {
    if (!elements.sysinfoPanel) return;
    if (elements.sysinfoPanel.style.display === "none" || elements.sysinfoPanel.classList.contains("hiding")) return;
    elements.sysinfoPanel.classList.add("hiding");
    elements.sysinfoPanel.addEventListener("animationend", function onEnd() {
      elements.sysinfoPanel.removeEventListener("animationend", onEnd);
      elements.sysinfoPanel.style.display = "none";
      elements.sysinfoPanel.classList.remove("hiding");
    });
  }
  function setSysinfoBar(fill, valEl, pct, label) {
    if (!fill || !valEl) return;
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    fill.style.width = p + "%";
    fill.className = "sysinfo-fill " + (p < 50 ? "level-low" : p < 80 ? "level-medium" : "level-high");
    valEl.textContent = label;
  }
  function updateSysinfoPreview(s) {
    if (!s) return;
    showSysinfoPanel();
    let cpuLabel = (s.cpu !== void 0 ? s.cpu : s.cpu_usage || 0) + "%";
    if (s.cpu_freq && s.cpu_freq !== "N/A") cpuLabel += " \xB7 " + s.cpu_freq + "GHz";
    if (s.cpu_temp && s.cpu_temp !== "N/A" && s.cpu_temp !== null) cpuLabel += " \xB7 " + s.cpu_temp + "\xB0C";
    if (s.cpu_power && s.cpu_power !== "N/A" && s.cpu_power !== null) cpuLabel += " \xB7 " + s.cpu_power + "W";
    setSysinfoBar(elements.cpuFill, elements.cpuVal, (s.cpu !== void 0 ? s.cpu : s.cpu_usage) || 0, cpuLabel);
    if (s.ram_used !== void 0 && s.ram_total !== void 0) {
      const ramPct = Math.round(s.ram_used / s.ram_total * 100);
      setSysinfoBar(elements.ramFill, elements.ramVal, ramPct, s.ram_used + " / " + s.ram_total + " GB");
    }
    if (s.gpu_load !== "N/A" && s.gpu_load !== null && s.gpu_load !== void 0) {
      if (s.gpu_power && s.gpu_power !== "N/A" && parseInt(s.gpu_power, 10) > 0) {
        state.lastKnownGpuPower = parseInt(s.gpu_power, 10);
      }
      if (s.gpu_freq && s.gpu_freq !== "N/A" && parseInt(s.gpu_freq, 10) > 0) {
        state.lastKnownGpuFreq = parseInt(s.gpu_freq, 10);
      }
      const effectiveGpuPower = s.gpu_power && s.gpu_power !== "N/A" ? s.gpu_power : state.lastKnownGpuPower || null;
      const effectiveGpuFreq = s.gpu_freq && s.gpu_freq !== "N/A" ? s.gpu_freq : state.lastKnownGpuFreq || null;
      let gpuLabel = s.gpu_load + "%";
      if (effectiveGpuFreq) gpuLabel += " \xB7 " + effectiveGpuFreq + "MHz";
      if (s.gpu_temp && s.gpu_temp !== "N/A") gpuLabel += " \xB7 " + s.gpu_temp + "\xB0C";
      if (effectiveGpuPower) gpuLabel += " \xB7 " + effectiveGpuPower + "W";
      setSysinfoBar(elements.gpuFill, elements.gpuVal, parseInt(s.gpu_load, 10), gpuLabel);
      const vramUsed = parseInt(s.gpu_mem_used, 10);
      const vramTotal = parseInt(s.gpu_mem_total, 10);
      if (!isNaN(vramUsed) && !isNaN(vramTotal) && vramTotal > 0) {
        const vramPct = Math.round(vramUsed / vramTotal * 100);
        const usedGB = (vramUsed / 1024).toFixed(1);
        const totalGB = (vramTotal / 1024).toFixed(0);
        setSysinfoBar(elements.vramFill, elements.vramVal, vramPct, usedGB + " / " + totalGB + " GB");
      } else {
        setSysinfoBar(elements.vramFill, elements.vramVal, 0, "N/A");
      }
    } else {
      setSysinfoBar(elements.gpuFill, elements.gpuVal, 0, "N/A");
      setSysinfoBar(elements.vramFill, elements.vramVal, 0, "N/A");
    }
  }
  function setOfflineMode(offline) {
    state.isOffline = offline;
    if (elements.offlineBanner) {
      elements.offlineBanner.style.display = offline ? "block" : "none";
    }
    if (elements.powerBtn) elements.powerBtn.disabled = offline;
    if (elements.sleepBtn) elements.sleepBtn.disabled = offline;
  }

  // docs/demo/js/auth.js
  var onAuthSuccessCallback = null;
  var onLogoutCallback = null;
  function initAuth({ onAuthSuccess, onLogout }) {
    onAuthSuccessCallback = onAuthSuccess;
    onLogoutCallback = onLogout;
    setOnUnauthorized(async (action) => {
      if (elements.lockScreen && elements.lockScreen.style.display === "flex") {
        return;
      }
      if (action === "status" || !state.authenticated) {
        showLockScreen(false);
        return;
      }
      try {
        await apiFetch("status");
      } catch (e) {
        if (e.message === "auth" || e.status === 401) {
          showLockScreen(false);
        }
      }
    });
    if (elements.lockForm) {
      elements.lockForm.addEventListener("submit", handleLogin);
    }
    if (elements.logoutToggle) {
      elements.logoutToggle.addEventListener("click", logout);
    }
  }
  function showLockScreen(forceReset = false) {
    const isAlreadyLocked = elements.lockScreen && elements.lockScreen.style.display === "flex";
    state.authenticated = false;
    state.userRole = "user";
    setCsrfToken(null);
    dismissCyberLoader();
    if (typeof onLogoutCallback === "function") {
      onLogoutCallback();
    }
    if (elements.lockScreen) elements.lockScreen.style.display = "flex";
    if (elements.mainContainer) elements.mainContainer.style.display = "none";
    if (elements.refreshToggle) elements.refreshToggle.style.display = "none";
    if (elements.gpuToggleBtn) elements.gpuToggleBtn.style.display = "none";
    if (elements.historyToggle) elements.historyToggle.style.display = "none";
    if (elements.diagnosticsToggle) elements.diagnosticsToggle.style.display = "none";
    if (elements.logoutToggle) elements.logoutToggle.style.display = "none";
    if (elements.lockTitle) {
      if (state.targetName) {
        elements.lockTitle.textContent = `${state.targetName.toUpperCase()} ACCESS IS RESTRICTED`;
      } else {
        apiFetch("config").then((cfg) => {
          if (cfg && cfg.target && cfg.target.name) {
            state.targetName = cfg.target.name;
            if (elements.lockTitle) {
              elements.lockTitle.textContent = `${cfg.target.name.toUpperCase()} ACCESS IS RESTRICTED`;
            }
          }
        }).catch(() => {
        });
      }
    }
    if (!isAlreadyLocked || forceReset) {
      if (elements.lockPassword) elements.lockPassword.value = "";
      if (elements.lockError) {
        elements.lockError.textContent = "";
        elements.lockError.className = "lock-error";
      }
      if (elements.lockSubmit) {
        elements.lockSubmit.disabled = false;
        const submitText = elements.lockSubmit.querySelector(".lock-submit-text");
        if (submitText) submitText.textContent = "AUTHENTICATE";
      }
      if (elements.lockPassword) elements.lockPassword.focus();
    }
  }
  function onAuthenticated() {
    state.authenticated = true;
    dismissCyberLoader();
    if (elements.lockScreen) elements.lockScreen.style.display = "none";
    if (elements.mainContainer) elements.mainContainer.style.display = "flex";
    updateUserRoleUI();
    if (state.isOffline) {
      setOfflineMode(false);
    }
    if (typeof onAuthSuccessCallback === "function") {
      onAuthSuccessCallback();
    }
  }
  async function handleLogin(e) {
    e.preventDefault();
    const password = elements.lockPassword ? elements.lockPassword.value : "";
    if (!password) return;
    if (elements.lockSubmit) {
      elements.lockSubmit.disabled = true;
      const textSpan = elements.lockSubmit.querySelector(".lock-submit-text");
      if (textSpan) textSpan.textContent = "VERIFYING\u2026";
    }
    if (elements.lockError) {
      elements.lockError.textContent = "";
      elements.lockError.className = "lock-error";
    }
    try {
      const data = await apiFetch("auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (data.success) {
        if (data.csrf_token) setCsrfToken(data.csrf_token);
        if (data.role) state.userRole = data.role;
        if (elements.lockError) {
          elements.lockError.textContent = "\u2713 Access granted" + (state.userRole === "admin" ? " (Admin)" : "");
          elements.lockError.className = "lock-error success";
        }
        setTimeout(() => {
          onAuthenticated();
        }, 500);
      } else {
        if (elements.lockError) {
          elements.lockError.textContent = data.message || "Authentication failed";
          if (data.remaining !== void 0 && data.remaining <= 2) {
            elements.lockError.textContent += ` (${data.remaining} attempts remaining)`;
          }
          elements.lockError.className = "lock-error visible";
        }
        if (elements.lockPassword) {
          elements.lockPassword.value = "";
          elements.lockPassword.focus();
        }
      }
    } catch (err) {
      if (elements.lockError) {
        elements.lockError.textContent = "Failed to reach API";
        elements.lockError.className = "lock-error visible";
      }
    }
    if (elements.lockSubmit) {
      elements.lockSubmit.disabled = false;
      const textSpan = elements.lockSubmit.querySelector(".lock-submit-text");
      if (textSpan) textSpan.textContent = "AUTHENTICATE";
    }
  }
  async function logout() {
    try {
      await apiFetch("logout", { method: "POST" });
    } catch (err) {
    }
    showLockScreen(true);
  }

  // docs/demo/js/hero.js
  var heroBadgeEl = null;
  var heroTitleEl = null;
  var heroSubtitleEl = null;
  var marioEl = null;
  var marioWrapEl = null;
  var starEl = null;
  var pacmanWrapEl = null;
  var tetrisClusterEl = null;
  var lambdaWrapEl = null;
  var speedlinesWrapEl = null;
  var arcadeTimer = null;
  var isAnyArcadeAnimating = false;
  var lastHeroPicked = null;
  var lastPowerStateKey = null;
  var isMarioJumping = false;
  var isPacmanEating = false;
  var isTetrisClearing = false;
  var isWarpActive = false;
  var currentGpuMode = "eco";
  function triggerMarioJumpSequence(isSuperJump = false, onComplete = null) {
    if (!marioEl || isMarioJumping || !state.machineIsUp) return;
    isMarioJumping = true;
    isAnyArcadeAnimating = true;
    marioEl.style.transform = "translateY(2px)";
    marioEl.setAttribute("data-pose", "run");
    setTimeout(() => {
      if (!marioEl || !state.machineIsUp) {
        isMarioJumping = false;
        isAnyArcadeAnimating = false;
        if (typeof onComplete === "function") onComplete();
        return;
      }
      marioEl.style.transform = isSuperJump ? "translateY(-20px)" : "translateY(-14px)";
      marioEl.setAttribute("data-pose", "jump");
      if (starEl) starEl.classList.add("active");
      setTimeout(() => {
        if (!marioEl || !state.machineIsUp) {
          isMarioJumping = false;
          isAnyArcadeAnimating = false;
          if (typeof onComplete === "function") onComplete();
          return;
        }
        marioEl.style.transform = isSuperJump ? "translateY(-22px)" : "translateY(-16px)";
        setTimeout(() => {
          if (!marioEl || !state.machineIsUp) {
            isMarioJumping = false;
            isAnyArcadeAnimating = false;
            if (typeof onComplete === "function") onComplete();
            return;
          }
          marioEl.style.transform = "translateY(-6px)";
          setTimeout(() => {
            if (!marioEl) {
              isMarioJumping = false;
              isAnyArcadeAnimating = false;
              if (typeof onComplete === "function") onComplete();
              return;
            }
            if (!state.machineIsUp) {
              marioEl.style.transform = "none";
              marioEl.setAttribute("data-pose", "run");
              if (starEl) starEl.classList.remove("active");
              isMarioJumping = false;
              isAnyArcadeAnimating = false;
              if (typeof onComplete === "function") onComplete();
              return;
            }
            marioEl.style.transform = "translateY(1px)";
            marioEl.setAttribute("data-pose", "run");
            if (starEl) starEl.classList.remove("active");
            setTimeout(() => {
              if (marioEl) marioEl.style.transform = "none";
              isMarioJumping = false;
              isAnyArcadeAnimating = false;
              if (typeof onComplete === "function") {
                onComplete();
              } else if (state.machineIsUp) {
                scheduleNextArcadeAction();
              }
            }, 140);
          }, 180);
        }, 260);
      }, 300);
    }, 120);
  }
  function triggerPacmanEatSequence(onComplete = null) {
    if (!pacmanWrapEl || isPacmanEating || !state.machineIsUp) return;
    isPacmanEating = true;
    isAnyArcadeAnimating = true;
    pacmanWrapEl.classList.add("eating");
    setTimeout(() => {
      if (pacmanWrapEl) {
        pacmanWrapEl.classList.remove("eating");
      }
      isPacmanEating = false;
      isAnyArcadeAnimating = false;
      if (typeof onComplete === "function") {
        onComplete();
      } else if (state.machineIsUp) {
        scheduleNextArcadeAction();
      }
    }, 2240);
  }
  function triggerTetrisClearSequence(onComplete = null) {
    if (!tetrisClusterEl || isTetrisClearing || !state.machineIsUp) return;
    isTetrisClearing = true;
    isAnyArcadeAnimating = true;
    tetrisClusterEl.classList.remove("line-clear-flash");
    void tetrisClusterEl.offsetWidth;
    tetrisClusterEl.classList.add("line-clear-flash");
    setTimeout(() => {
      if (tetrisClusterEl) {
        tetrisClusterEl.classList.remove("line-clear-flash");
      }
      isTetrisClearing = false;
      isAnyArcadeAnimating = false;
      if (typeof onComplete === "function") {
        onComplete();
      } else if (state.machineIsUp) {
        scheduleNextArcadeAction();
      }
    }, 1140);
  }
  function scheduleNextArcadeAction(minMs = 3800, maxMs = 8200) {
    clearTimeout(arcadeTimer);
    arcadeTimer = null;
    if (!state.machineIsUp) return;
    if (currentGpuMode === "light" || currentGpuMode === "ultralight") return;
    const delay = minMs + Math.random() * (maxMs - minMs);
    arcadeTimer = setTimeout(() => {
      executeRandomArcadeAction();
    }, delay);
  }
  function executeRandomArcadeAction() {
    if (!state.machineIsUp || isAnyArcadeAnimating) {
      if (state.machineIsUp) scheduleNextArcadeAction(2500, 4500);
      return;
    }
    if (currentGpuMode === "light" || currentGpuMode === "ultralight") return;
    const candidates = ["mario", "pacman", "tetris"];
    const filtered = candidates.filter((c) => c !== lastHeroPicked);
    const chosen = filtered.length > 0 ? filtered[Math.floor(Math.random() * filtered.length)] : candidates[Math.floor(Math.random() * candidates.length)];
    lastHeroPicked = chosen;
    const onComplete = () => {
      if (state.machineIsUp) {
        scheduleNextArcadeAction(4e3, 8500);
      }
    };
    if (chosen === "mario") {
      triggerMarioJumpSequence(false, onComplete);
    } else if (chosen === "pacman") {
      triggerPacmanEatSequence(onComplete);
    } else if (chosen === "tetris") {
      triggerTetrisClearSequence(onComplete);
    }
  }
  function initHero() {
    heroBadgeEl = document.getElementById("hero-badge");
    heroTitleEl = document.getElementById("hero-title");
    heroSubtitleEl = document.getElementById("hero-subtitle");
    marioEl = document.getElementById("hero-mario-sprite");
    marioWrapEl = heroBadgeEl ? heroBadgeEl.querySelector(".hero-mario-wrap") : null;
    starEl = document.getElementById("hero-mario-star");
    pacmanWrapEl = document.getElementById("hero-pacman-wrap");
    tetrisClusterEl = document.getElementById("hero-tetris-cluster");
    lambdaWrapEl = document.getElementById("hero-lambda-wrap");
    speedlinesWrapEl = document.getElementById("hero-speedlines");
    if (heroBadgeEl) {
      if (heroTitleEl) {
        const initialLen = (heroTitleEl.textContent || "RIGPULSE").trim().length;
        heroBadgeEl.style.setProperty("--name-len", String(initialLen || 8));
      }
      setupInteractions();
      setHeroMode(state.gpuMode || "eco");
      startSpriteLoops();
    }
  }
  function setupInteractions() {
    if (marioWrapEl) {
      marioWrapEl.addEventListener("click", () => {
        if (!state.machineIsUp || isAnyArcadeAnimating) return;
        triggerMarioJumpSequence(true);
      });
    }
    if (pacmanWrapEl) {
      pacmanWrapEl.addEventListener("click", () => {
        if (!state.machineIsUp || isAnyArcadeAnimating) return;
        triggerPacmanEatSequence();
      });
    }
    if (tetrisClusterEl) {
      tetrisClusterEl.addEventListener("click", () => {
        if (!state.machineIsUp || isAnyArcadeAnimating) return;
        triggerTetrisClearSequence();
      });
    }
    if (lambdaWrapEl) {
      lambdaWrapEl.addEventListener("click", () => {
        if (!state.machineIsUp) return;
        triggerRadiationPulse();
      });
    }
  }
  function startSpriteLoops() {
    if (!state.machineIsUp) return;
    if (currentGpuMode === "light" || currentGpuMode === "ultralight") return;
    if (arcadeTimer || isAnyArcadeAnimating) return;
    scheduleNextArcadeAction(1800, 3600);
  }
  function setHeroName(name) {
    if (!name) name = "RIGPULSE";
    const upper = name.toUpperCase();
    if (heroTitleEl) {
      heroTitleEl.textContent = upper;
      heroTitleEl.setAttribute("data-text", upper);
      if (heroBadgeEl) {
        heroBadgeEl.style.setProperty("--name-len", String(upper.length));
      }
    }
  }
  function setHeroDomain(domain) {
    if (heroSubtitleEl) {
      heroSubtitleEl.textContent = (domain || "").toUpperCase();
    }
  }
  function setHeroState(isUp, isBooting, isSleeping = false) {
    if (!heroBadgeEl) return;
    const isOnline = Boolean(isUp);
    const isBoot = Boolean(isBooting);
    const isSleep = !isOnline && !isBoot && Boolean(isSleeping);
    const isOff = !isOnline && !isBoot && !isSleep;
    const currentKey = `${isOnline}_${isBoot}_${isSleep}_${isOff}`;
    const stateChanged = currentKey !== lastPowerStateKey;
    lastPowerStateKey = currentKey;
    heroBadgeEl.classList.toggle("online", isOnline);
    heroBadgeEl.classList.toggle("booting", isBoot);
    heroBadgeEl.classList.toggle("offline", !isOnline && !isBoot);
    heroBadgeEl.classList.toggle("sleeping", isSleep);
    heroBadgeEl.classList.toggle("off", isOff);
    if (isOnline) {
      if (stateChanged || !arcadeTimer && !isAnyArcadeAnimating) {
        startSpriteLoops();
      }
    } else {
      clearTimeout(arcadeTimer);
      arcadeTimer = null;
      isMarioJumping = false;
      isPacmanEating = false;
      isTetrisClearing = false;
      isAnyArcadeAnimating = false;
      if (marioEl) {
        marioEl.style.transform = "none";
        marioEl.setAttribute("data-pose", "run");
      }
      if (starEl) {
        starEl.classList.remove("active");
      }
      if (pacmanWrapEl) {
        pacmanWrapEl.classList.remove("eating");
      }
      if (tetrisClusterEl) {
        tetrisClusterEl.classList.remove("tetris-sliding", "line-clear-flash");
      }
    }
  }
  function setHeroMode(mode) {
    currentGpuMode = mode;
    if (!heroBadgeEl) return;
    heroBadgeEl.classList.remove("hero-mode-heavy", "hero-mode-eco", "hero-mode-light");
    heroBadgeEl.classList.add(`hero-mode-${mode}`);
    if (mode === "light" || mode === "ultralight") {
      clearTimeout(arcadeTimer);
      arcadeTimer = null;
    } else if (state.machineIsUp) {
      startSpriteLoops();
    }
  }
  function triggerHyperdriveWarp() {
    if (!heroBadgeEl || isWarpActive || !state.machineIsUp) return;
    isWarpActive = true;
    heroBadgeEl.classList.add("hyper-warp");
    triggerMarioJumpSequence(true);
    triggerPacmanEatSequence();
    triggerTetrisClearSequence();
    if (speedlinesWrapEl) {
      speedlinesWrapEl.classList.add("warp-burst");
    }
    triggerRadiationPulse();
    setTimeout(() => {
      if (heroBadgeEl) heroBadgeEl.classList.remove("hyper-warp");
      if (speedlinesWrapEl) speedlinesWrapEl.classList.remove("warp-burst");
      isWarpActive = false;
      startSpriteLoops();
    }, 3200);
  }
  function triggerRadiationPulse() {
    if (!lambdaWrapEl || !state.machineIsUp) return;
    const rings = lambdaWrapEl.querySelectorAll(".rad-shockwave");
    rings.forEach((ring, idx) => {
      ring.classList.remove("pulse");
      void ring.offsetWidth;
      setTimeout(() => {
        ring.classList.add("pulse");
      }, idx * 160);
    });
  }

  // docs/demo/js/power.js
  var shutdownModal = document.getElementById("shutdown-modal");
  var modalCancel = document.getElementById("modal-cancel");
  var modalConfirm = document.getElementById("modal-confirm");
  var pollRequestCallback = null;
  function initPower({ onPollRequested }) {
    pollRequestCallback = onPollRequested;
    if (elements.powerBtn) {
      elements.powerBtn.addEventListener("click", handlePowerBtnClick);
    }
    if (elements.sleepBtn) {
      elements.sleepBtn.addEventListener("click", () => {
        if (elements.sleepBtn.disabled || state.isBooting || state.sendingAction) return;
        doSleep();
      });
    }
    if (modalCancel) {
      modalCancel.addEventListener("click", hideShutdownModal);
    }
    if (shutdownModal) {
      shutdownModal.addEventListener("click", (e) => {
        if (e.target === shutdownModal) hideShutdownModal();
      });
    }
    if (modalConfirm) {
      modalConfirm.addEventListener("click", async () => {
        hideShutdownModal();
        await doShutdown();
      });
    }
  }
  function handlePowerBtnClick() {
    if (elements.powerBtn.disabled || state.isBooting || state.sendingAction) return;
    if (elements.powerBtn.dataset.mode === "shutdown") {
      showShutdownModal();
    } else {
      doWOL();
    }
  }
  function showShutdownModal() {
    if (shutdownModal) {
      shutdownModal.style.display = "flex";
      if (modalConfirm) modalConfirm.focus();
    }
  }
  function hideShutdownModal() {
    if (shutdownModal) shutdownModal.style.display = "none";
  }
  function isWakeUpAction(action) {
    return action === "sleep" || action === "wol";
  }
  function scheduleExtraPolls(intervals) {
    if (typeof pollRequestCallback !== "function") return;
    intervals.forEach((ms) => setTimeout(pollRequestCallback, ms));
  }
  function startSendingAction(action, btn, baseLabel, extraClasses) {
    clearTimeout(state.sendingTimer);
    state.sendingAction = action;
    if (btn) {
      btn.classList.add("sending");
    }
    startDotAnimation(baseLabel, 3, btn, 500);
    state.sendingTimer = setTimeout(() => {
      stopSendingAction();
      if (typeof pollRequestCallback === "function") {
        pollRequestCallback();
      }
    }, 45e3);
  }
  function stopSendingAction() {
    clearTimeout(state.sendingTimer);
    state.sendingAction = null;
    state.sendingTimer = null;
    if (elements.powerBtn) {
      elements.powerBtn.classList.remove("sending");
      elements.powerBtn.style.display = "flex";
    }
    if (elements.sleepBtn) elements.sleepBtn.classList.remove("sending");
    stopDotAnimation();
  }
  function enterBootingMode(isWakeUp) {
    state.isBooting = true;
    state.bootIsWakeUp = !!isWakeUp;
    state.bootStartTime = Date.now();
    const label = state.bootIsWakeUp ? "WAKING UP" : "BOOTING";
    if (elements.powerBtn) {
      elements.powerBtn.style.display = "flex";
      elements.powerBtn.disabled = false;
      elements.powerBtn.dataset.mode = "booting";
      elements.powerBtn.className = "wol-btn booting";
      startDotAnimation(label, 3, elements.powerBtn, 500);
    }
    if (elements.sleepBtn) {
      elements.sleepBtn.style.display = "none";
    }
    if (elements.statusPanel) {
      elements.statusPanel.className = "status-panel booting";
    }
    if (elements.statusDot) {
      elements.statusDot.className = "status-dot booting";
    }
    if (elements.statusValue) {
      elements.statusValue.textContent = state.bootIsWakeUp ? "WAKING UP\u2026" : "BOOTING\u2026";
    }
    setHeroState(false, true, false);
    const resetLabel = state.bootIsWakeUp ? "WAKE UP" : "POWER ON";
    const timeoutMsg = state.bootIsWakeUp ? `\u2717 Wake timed out \u2014 ${state.targetName} did not respond` : `\u2717 Boot timed out \u2014 ${state.targetName} did not respond`;
    state.bootTimeoutHandle = setTimeout(() => {
      if (!state.isBooting) return;
      exitBootingMode(false);
      resetButton(elements.powerBtn, resetLabel);
      if (elements.powerBtn) {
        elements.powerBtn.style.display = "flex";
        elements.powerBtn.className = "wol-btn";
        elements.powerBtn.dataset.mode = "wol";
      }
      showMessage(timeoutMsg, "error");
    }, state.bootTimeoutMs);
  }
  function exitBootingMode(completed = false) {
    if (completed && state.bootStartTime) {
      const elapsedSec = Math.round((Date.now() - state.bootStartTime) / 1e3);
      const actionLabel = state.bootIsWakeUp ? "woke up" : "booted";
      showMessage(`\u2713 ${state.targetName} is online \u2014 ${actionLabel} in ${elapsedSec}s`, "success");
    }
    state.isBooting = false;
    state.bootStartTime = null;
    clearTimeout(state.bootTimeoutHandle);
    state.bootTimeoutHandle = null;
    stopDotAnimation();
    if (elements.powerBtn) {
      elements.powerBtn.style.display = "flex";
    }
  }
  async function doWOL() {
    triggerHyperdriveWarp();
    const isWakeUp = isWakeUpAction(state.lastPowerAction);
    state.sendingAction = "wol";
    if (elements.powerBtn) {
      elements.powerBtn.style.display = "flex";
      elements.powerBtn.disabled = true;
      elements.powerBtn.classList.add("sending");
      const textSpan = elements.powerBtn.querySelector(".wol-btn-text");
      if (textSpan) textSpan.textContent = "SENDING\u2026";
    }
    if (elements.sleepBtn) {
      elements.sleepBtn.style.display = "none";
    }
    const wolLabel = isWakeUp ? "Sending wake-up packet\u2026" : "Sending magic packet\u2026";
    showMessage(wolLabel, "info");
    const resetLabel = isWakeUp ? "WAKE UP" : "POWER ON";
    try {
      const data = await apiFetch("wol", { method: "POST" });
      state.sendingAction = null;
      if (data.success) {
        showMessage("\u2713 " + data.message, "success");
        enterBootingMode(isWakeUp);
        scheduleExtraPolls([2e3, 5e3]);
      } else {
        showMessage("\u2717 " + data.message, "error");
        resetButton(elements.powerBtn, resetLabel);
      }
    } catch (e) {
      state.sendingAction = null;
      if (e.message === "auth") return;
      showMessage("\u2717 " + (e.message || "Failed to communicate with API"), "error");
      resetButton(elements.powerBtn, resetLabel);
    }
  }
  async function doShutdown() {
    startSendingAction("shutdown", elements.powerBtn, "POWERING OFF", "shutdown-btn");
    if (elements.powerBtn) {
      elements.powerBtn.disabled = false;
      elements.powerBtn.style.display = "flex";
    }
    if (elements.sleepBtn) elements.sleepBtn.style.display = "none";
    showMessage("Sending shutdown command\u2026", "info");
    try {
      const data = await apiFetch("shutdown", { method: "POST" });
      if (data.success) {
        if (elements.sshNotice) elements.sshNotice.style.display = "none";
        showMessage("\u2713 " + data.message, "success");
        scheduleExtraPolls([2e3, 4e3, 7e3, 12e3, 2e4]);
      } else {
        stopSendingAction();
        showMessage("\u2717 " + data.message, "error");
        resetButton(elements.powerBtn, "POWER OFF");
        if (elements.powerBtn) elements.powerBtn.className = "wol-btn shutdown-btn";
        if (elements.sleepBtn) {
          elements.sleepBtn.style.display = "flex";
          elements.sleepBtn.disabled = false;
        }
      }
    } catch (e) {
      if (e.message === "auth") return;
      stopSendingAction();
      showMessage("\u2717 " + (e.message || "Failed to communicate with API"), "error");
      resetButton(elements.powerBtn, "POWER OFF");
      if (elements.powerBtn) elements.powerBtn.className = "wol-btn shutdown-btn";
      if (elements.sleepBtn) {
        elements.sleepBtn.style.display = "flex";
        elements.sleepBtn.disabled = false;
      }
    }
  }
  async function doSleep() {
    startSendingAction("sleep", elements.sleepBtn, "SLEEPING", "sleep-btn");
    if (elements.sleepBtn) {
      elements.sleepBtn.disabled = false;
      elements.sleepBtn.style.display = "flex";
    }
    if (elements.powerBtn) elements.powerBtn.style.display = "none";
    showMessage("Sending sleep command\u2026", "info");
    try {
      const data = await apiFetch("sleep", { method: "POST" });
      if (data.success) {
        if (elements.sshNotice) elements.sshNotice.style.display = "none";
        showMessage("\u2713 " + data.message, "success");
        scheduleExtraPolls([2e3, 5e3, 1e4]);
      } else {
        stopSendingAction();
        showMessage("\u2717 " + data.message, "error");
        resetButton(elements.sleepBtn, "SLEEP");
        if (elements.sleepBtn) elements.sleepBtn.className = "wol-btn sleep-btn";
        if (elements.powerBtn) {
          elements.powerBtn.style.display = "flex";
          elements.powerBtn.disabled = false;
        }
      }
    } catch (e) {
      if (e.message === "auth") return;
      stopSendingAction();
      showMessage("\u2717 " + (e.message || "Failed to communicate with API"), "error");
      resetButton(elements.sleepBtn, "SLEEP");
      if (elements.sleepBtn) elements.sleepBtn.className = "wol-btn sleep-btn";
      if (elements.powerBtn) {
        elements.powerBtn.style.display = "flex";
        elements.powerBtn.disabled = false;
      }
    }
  }

  // docs/demo/js/sunshine.js
  var sunshineBar = document.getElementById("sunshine-bar");
  var sunshineStatus = document.getElementById("sunshine-status");
  var sunshinePorts = document.getElementById("sunshine-ports");
  var sunshineControls = document.getElementById("sunshine-controls");
  var sunStartBtn = document.getElementById("sun-start");
  var sunStopBtn = document.getElementById("sun-stop");
  var sunRestartBtn = document.getElementById("sun-restart");
  var sunshineHeaderPing = document.getElementById("sunshine-header-ping");
  var sunshineHeader = sunshineBar ? sunshineBar.querySelector(".sunshine-header") : null;
  var sunshineCollapseBtn = document.getElementById("sunshine-collapse-btn");
  var sunshineIsRunning = false;
  var lastSunshinePingMs = null;
  var lastSunshinePingType = null;
  var sunshinePingSamples = [];
  var sunshinePingTimes = [];
  var clientIsLocal = true;
  var sunshinePingInFlight = false;
  var lastSunshinePingTime = 0;
  var SUNSHINE_PING_INTERVAL_HOME = 6e3;
  var SUNSHINE_PING_INTERVAL_MODAL = 1500;
  function setSunshineIsRunning(val) {
    sunshineIsRunning = Boolean(val);
  }
  function resetSunshinePing() {
    lastSunshinePingMs = null;
    lastSunshinePingType = null;
    sunshinePingSamples.length = 0;
    sunshinePingTimes.length = 0;
  }
  function initSunshine() {
    if (typeof window !== "undefined") {
      window.checkSunshine = checkSunshine;
      if (isDemoMode && sunshinePingSamples.length === 0) {
        const base = Date.now() - 3e4;
        const seed = [2.4, 4.8, 1.9, 12.3, 7.5, 3.2, 14.1, 5.6, 2.1, 8.9, 3.7, 1.8];
        seed.forEach((v, i) => {
          sunshinePingSamples.push(v);
          sunshinePingTimes.push(base + i * 2500);
        });
        lastSunshinePingMs = 3.7;
        lastSunshinePingType = "LOCAL";
      }
    }
    if (sunStartBtn) sunStartBtn.addEventListener("click", () => doSunshineCtl("sunshine-start"));
    if (sunStopBtn) sunStopBtn.addEventListener("click", () => doSunshineCtl("sunshine-stop"));
    if (sunRestartBtn) sunRestartBtn.addEventListener("click", () => doSunshineCtl("sunshine-restart"));
    initSunshineCollapse();
  }
  function applySunshineCollapse(isCollapsed) {
    if (!sunshineBar) return;
    sunshineBar.classList.toggle("collapsed", isCollapsed);
    if (sunshineCollapseBtn) {
      sunshineCollapseBtn.setAttribute("title", isCollapsed ? "Expand Sunshine panel" : "Collapse Sunshine panel");
      sunshineCollapseBtn.setAttribute("aria-label", isCollapsed ? "Expand Sunshine panel" : "Collapse Sunshine panel");
    }
  }
  function collapseSunshineBar() {
    if (!sunshineBar) return;
    applySunshineCollapse(true);
    try {
      localStorage.setItem("sunshine_collapsed", "1");
    } catch (e) {
    }
  }
  function initSunshineCollapse() {
    if (!sunshineBar || !sunshineCollapseBtn) return;
    const shouldBeCollapsed = localStorage.getItem("sunshine_collapsed") !== "0";
    applySunshineCollapse(shouldBeCollapsed);
    function toggleCollapse(e) {
      if (e.currentTarget === sunshineHeader && !sunshineBar.classList.contains("collapsed")) {
        return;
      }
      e.stopPropagation();
      const isCollapsed = !sunshineBar.classList.contains("collapsed");
      applySunshineCollapse(isCollapsed);
      localStorage.setItem("sunshine_collapsed", isCollapsed ? "1" : "0");
    }
    sunshineCollapseBtn.addEventListener("click", toggleCollapse);
    if (sunshineHeader) sunshineHeader.addEventListener("click", toggleCollapse);
  }
  function setClientIsLocal(isLocal) {
    clientIsLocal = Boolean(isLocal);
  }
  function hideSunshineBar() {
    if (!sunshineBar || sunshineBar.style.display === "none" || sunshineBar.classList.contains("hiding")) return;
    sunshineBar.classList.add("hiding");
    sunshineBar.addEventListener("animationend", function onEnd() {
      sunshineBar.removeEventListener("animationend", onEnd);
      sunshineBar.style.display = "none";
      sunshineBar.classList.remove("hiding");
    });
  }
  function updateSunshinePingUI() {
    if (!sunshineHeaderPing) return;
    if (!state.machineIsUp || !sunshineIsRunning || lastSunshinePingMs === null) {
      sunshineHeaderPing.style.display = "none";
      return;
    }
    sunshineHeaderPing.style.display = "inline-flex";
    sunshineHeaderPing.className = "sunshine-header-ping " + (lastSunshinePingType === "LOCAL" ? "local" : "wan");
    const dot = sunshineHeaderPing.querySelector(".shp-dot") || document.createElement("span");
    dot.className = "shp-dot";
    dot.style.background = pingColor(lastSunshinePingMs);
    dot.style.boxShadow = `0 0 6px ${pingColor(lastSunshinePingMs, 0.6)}`;
    const text = sunshineHeaderPing.querySelector(".shp-text") || document.createElement("span");
    text.className = "shp-text";
    const typeLabel = lastSunshinePingType === "LOCAL" ? "LOC" : lastSunshinePingType || "";
    text.textContent = `${typeLabel} ${formatPing(lastSunshinePingMs)}`;
    if (!sunshineHeaderPing.contains(dot)) sunshineHeaderPing.appendChild(dot);
    if (!sunshineHeaderPing.contains(text)) sunshineHeaderPing.appendChild(text);
  }
  function recordSunshinePingSample(ping, type) {
    lastSunshinePingMs = ping;
    lastSunshinePingType = type;
    sunshinePingSamples.push(ping);
    sunshinePingTimes.push(Date.now());
    if (sunshinePingSamples.length > 40) {
      sunshinePingSamples.shift();
      sunshinePingTimes.shift();
    }
  }
  async function measureSunshinePing(force = false) {
    if (sunshinePingInFlight || !state.machineIsUp || state.isOffline || !sunshineIsRunning) {
      return lastSunshinePingMs !== null ? { ping: lastSunshinePingMs, type: lastSunshinePingType } : null;
    }
    const minInterval = state.diagnosticsOpen ? SUNSHINE_PING_INTERVAL_MODAL : SUNSHINE_PING_INTERVAL_HOME;
    const now = Date.now();
    if (!force && now - lastSunshinePingTime < minInterval) {
      return lastSunshinePingMs !== null ? { ping: lastSunshinePingMs, type: lastSunshinePingType } : null;
    }
    sunshinePingInFlight = true;
    lastSunshinePingTime = now;
    if (isDemoMode) {
      sunshinePingInFlight = false;
      if (!sunshineIsRunning) return null;
      const wave = 5.8 + Math.sin(now / 3200) * 4.2 + Math.cos(now / 1300) * 2.4;
      const spike = Math.random() < 0.18 ? Math.random() * 4.5 : Math.random() * 1.8 - 0.9;
      const ping = Number(Math.max(1.1, Math.min(14.9, wave + spike)).toFixed(1));
      recordSunshinePingSample(ping, "LOCAL");
      return { ping, type: "LOCAL" };
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
          mode: "no-cors",
          cache: "no-store",
          signal: controller.signal
        }).then(() => {
          clearTimeout(timer);
          resolve(Math.round(performance.now() - t0));
        }).catch((err) => {
          clearTimeout(timer);
          if (err.name === "AbortError") {
            resolve(null);
            return;
          }
          resolve(Math.round(performance.now() - t0));
        });
      });
      return Promise.all(ports.map(probeSingle)).then((results) => {
        const valid = results.filter((r) => r !== null && r > 0);
        return valid.length > 0 ? Math.min(...valid) : null;
      });
    };
    try {
      const localHost = state.targetHost || window.location.hostname;
      const wanHost = state.sunshineWanHost || localHost;
      if (clientIsLocal) {
        const ping = await probeHost(localHost, 900);
        if (ping !== null) {
          recordSunshinePingSample(ping, "LOCAL");
          return { ping, type: "LOCAL" };
        }
        const remotePing = await probeHost(wanHost, 2200);
        if (remotePing !== null) {
          recordSunshinePingSample(remotePing, "WAN");
          return { ping: remotePing, type: "WAN" };
        }
      } else {
        const ping = await probeHost(wanHost, 2200);
        if (ping !== null) {
          recordSunshinePingSample(ping, "WAN");
          return { ping, type: "WAN" };
        }
      }
      lastSunshinePingMs = null;
      lastSunshinePingType = null;
      return null;
    } finally {
      sunshinePingInFlight = false;
    }
  }
  async function checkSunshine() {
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
      const data = await apiFetch("sunshine");
      if (!state.machineIsUp) return;
      if (!data.available) {
        if (sunshineBar) {
          sunshineBar.style.display = "flex";
          sunshineBar.classList.remove("all-up", "partial", "all-down");
          sunshineBar.classList.add("warning");
          if (localStorage.getItem("sunshine_collapsed") !== "0") {
            sunshineBar.classList.add("collapsed");
          }
        }
        if (sunshineStatus) sunshineStatus.textContent = "\u26A0 " + data.reason;
        if (sunshinePorts) sunshinePorts.textContent = "";
        sunshineIsRunning = false;
        resetSunshinePing();
        updateSunshinePingUI();
        return;
      }
      const upCount = (data.ports || []).filter((p) => p.status === "up").length;
      const total = (data.ports || []).length;
      const allUp = total > 0 && upCount === total;
      const someUp = upCount > 0;
      sunshineIsRunning = Boolean((data.available || data.success) && someUp);
      if (!sunshineIsRunning) {
        resetSunshinePing();
      }
      if (sunshineBar) {
        sunshineBar.style.display = "flex";
        sunshineBar.classList.remove("warning", "all-up", "partial", "all-down");
        sunshineBar.classList.add(allUp ? "all-up" : someUp ? "partial" : "all-down");
        if (localStorage.getItem("sunshine_collapsed") !== "0") {
          sunshineBar.classList.add("collapsed");
        }
      }
      if (sunshineStatus) {
        sunshineStatus.textContent = allUp ? "ALL UP" : someUp ? `${upCount}/${total} UP` : "ALL DOWN";
      }
      if (state.machineIsUp && sunshineIsRunning) {
        measureSunshinePing().then(() => updateSunshinePingUI());
      } else {
        updateSunshinePingUI();
      }
      if (sunshinePorts) {
        sunshinePorts.textContent = "";
        (data.ports || []).forEach((p) => {
          const pill = document.createElement("span");
          pill.className = "port-pill " + (p.status === "up" ? "port-up" : "port-down");
          pill.title = p.desc;
          const dot = document.createElement("span");
          dot.className = "port-dot";
          pill.appendChild(dot);
          pill.appendChild(document.createTextNode(" " + p.name + " "));
          const num = document.createElement("span");
          num.className = "port-num";
          num.textContent = ":" + p.port;
          pill.appendChild(num);
          sunshinePorts.appendChild(pill);
        });
      }
      if (state.sshReady && !state.sunshineBusy) {
        if (sunStartBtn) sunStartBtn.disabled = someUp;
        if (sunStopBtn) sunStopBtn.disabled = !someUp;
        if (sunRestartBtn) sunRestartBtn.disabled = false;
      }
    } catch (e) {
    } finally {
      state.sunshineInFlight = false;
      if (!state.diagnosticsOpen && state.machineIsUp && !state.isOffline) {
        clearTimeout(state.sunshineTimer);
        state.sunshineTimer = setTimeout(checkSunshine, state.sunshinePollInterval);
      } else {
        state.sunshineTimer = null;
      }
    }
  }
  async function doSunshineCtl(cmd) {
    if (state.sunshineBusy) return;
    const btnMap = {
      "sunshine-start": sunStartBtn,
      "sunshine-stop": sunStopBtn,
      "sunshine-restart": sunRestartBtn
    };
    const textMap = {
      "sunshine-start": "STARTING\u2026",
      "sunshine-stop": "STOPPING\u2026",
      "sunshine-restart": "RESTARTING\u2026"
    };
    const activeBtn = btnMap[cmd];
    const allBtns = [sunStartBtn, sunStopBtn, sunRestartBtn].filter(Boolean);
    const originalTxt = activeBtn ? activeBtn.textContent : "";
    state.sunshineBusy = true;
    allBtns.forEach((b) => {
      if (b !== activeBtn) b.disabled = true;
    });
    if (activeBtn) {
      activeBtn.classList.add("sending");
      activeBtn.textContent = textMap[cmd];
    }
    const labels = { "sunshine-start": "Starting\u2026", "sunshine-stop": "Stopping\u2026", "sunshine-restart": "Restarting\u2026" };
    showMessage(labels[cmd] || "Sending\u2026", "info");
    try {
      const data = await apiFetch("sunshine_ctl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd })
      });
      if (data.success) {
        showMessage("\u2713 " + data.message, "success");
      } else {
        showMessage("\u2717 " + data.message, "error");
      }
    } catch (e) {
      if (e.message !== "auth") {
        showMessage("\u2717 " + (e.message || "Failed to communicate with API"), "error");
      }
    }
    const resetDelay = isDemoMode ? cmd === "sunshine-stop" ? 700 : cmd === "sunshine-start" ? 900 : 1400 : 1e4;
    setTimeout(() => {
      if (activeBtn) {
        activeBtn.classList.remove("sending");
        activeBtn.textContent = originalTxt;
      }
      allBtns.forEach((b) => {
        b.disabled = true;
      });
      state.sunshineBusy = false;
      checkSunshine();
    }, resetDelay);
  }

  // docs/demo/js/history.js
  var historyToggle = document.getElementById("history-toggle");
  var historyOverlay = document.getElementById("history-overlay");
  var historyClose = document.getElementById("history-close");
  var historyList = document.getElementById("history-list");
  function initHistory() {
    if (historyToggle) historyToggle.addEventListener("click", openHistory);
    if (historyClose) historyClose.addEventListener("click", closeHistory);
    if (historyOverlay) {
      historyOverlay.addEventListener("click", (e) => {
        if (e.target === historyOverlay) closeHistory();
      });
    }
  }
  async function openHistory() {
    if (!historyOverlay || !historyList) return;
    historyOverlay.style.display = "flex";
    historyList.innerHTML = `
        <div class="history-loading">
            <span class="history-spinner"></span>
            <span>LOADING HISTORY\u2026</span>
        </div>
    `;
    try {
      const data = await apiFetch("history");
      if (!data.history || data.history.length === 0) {
        historyList.innerHTML = '<div class="history-empty">No actions recorded yet.</div>';
        return;
      }
      historyList.textContent = "";
      data.history.forEach((entry) => {
        const item = document.createElement("div");
        item.className = "history-item";
        const actionSpan = document.createElement("span");
        let actionKey = entry.action ? entry.action.toLowerCase() : "";
        if (actionKey === "wake") actionKey = "wol";
        const isSunshine = actionKey.startsWith("sunshine");
        const actClass = isSunshine ? "act-sunshine" : "act-" + actionKey;
        actionSpan.className = "hi-action " + actClass;
        let displayLabel = actionKey.toUpperCase();
        if (displayLabel.startsWith("SUNSHINE-")) {
          displayLabel = displayLabel.replace("SUNSHINE-", "SNSH-");
        }
        actionSpan.textContent = displayLabel;
        item.appendChild(actionSpan);
        const ipSpan = document.createElement("span");
        ipSpan.className = "hi-ip";
        ipSpan.textContent = entry.ip;
        item.appendChild(ipSpan);
        const timeSpan = document.createElement("span");
        timeSpan.className = "hi-time";
        const d = new Date(entry.time);
        const datePart = d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
        const timePart = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        timeSpan.textContent = datePart + " " + timePart;
        item.appendChild(timeSpan);
        historyList.appendChild(item);
      });
    } catch (e) {
      historyList.innerHTML = '<div class="history-error">Failed to load history.</div>';
    }
  }
  function closeHistory() {
    if (historyOverlay) historyOverlay.style.display = "none";
  }

  // docs/demo/js/charts.js
  function formatMetricValue(val, unit) {
    if (val === void 0 || val === null || isNaN(val)) return "\u2014";
    if (unit === "MB/s") {
      return Number(val).toFixed(1) + " MB/s";
    }
    if (unit === "W") {
      return Math.round(val) + "W";
    }
    if (unit === "\xB0C") {
      return Math.round(val) + "\xB0C";
    }
    if (unit === "%") {
      return Math.round(val) + "%";
    }
    return Math.round(val) + (unit ? unit : "");
  }
  function formatMetricAge(ts) {
    if (!ts) return "now";
    const ageSec = Math.max(0, Math.round((Date.now() - ts) / 1e3));
    if (ageSec === 0) return "just now";
    if (ageSec < 60) return `${ageSec}s ago`;
    const m = Math.floor(ageSec / 60);
    const s = ageSec % 60;
    return `${m}m ${s}s ago`;
  }
  function getTimeAxisLabels(datasets, totalPoints, pipelineSpeed = 1) {
    let spanSec = 60;
    if (pipelineSpeed === 2) spanSec = 30;
    if (pipelineSpeed === 3) spanSec = 15;
    const dsWithTime = datasets ? datasets.find((d) => d && d.timestamps && d.timestamps.length >= 2) : null;
    if (dsWithTime) {
      const ts = dsWithTime.timestamps;
      const actualIntervalSec = (ts[ts.length - 1] - ts[0]) / ((ts.length - 1) * 1e3);
      if (actualIntervalSec > 0.05 && actualIntervalSec < 15) {
        spanSec = Math.round(actualIntervalSec * (totalPoints - 1));
      }
    }
    const formatSec = (s) => {
      if (s <= 0) return "now";
      if (s < 60) return `-${s}s`;
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return rem === 0 ? `-${m}m` : `-${m}m${rem}s`;
    };
    return [
      { frac: 0, label: formatSec(spanSec), align: "left" },
      { frac: 0.25, label: formatSec(Math.round(spanSec * 0.75)), align: "center" },
      { frac: 0.5, label: formatSec(Math.round(spanSec * 0.5)), align: "center" },
      { frac: 0.75, label: formatSec(Math.round(spanSec * 0.25)), align: "center" },
      { frac: 1, label: "now", align: "right" }
    ];
  }
  function drawLineChart(canvas, datasets, options = {}, state2 = {}) {
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
    const ctx = canvas.getContext("2d");
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
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.font = "8px monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const gridSteps = [0, 0.5, 1];
    gridSteps.forEach((step) => {
      const y = padTop + plotH * (1 - step);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();
      const pctLabel = options.unit ? `${Math.round(step * (options.maxLeftVal || 100))}${options.unit}` : `${Math.round(step * 100)}%`;
      ctx.fillText(pctLabel, padLeft - 4, y);
      if (options.rightAxis && options.maxRightVal) {
        ctx.textAlign = "left";
        const rightUnit = options.rightUnit !== void 0 ? options.rightUnit : "W";
        const rightVal = `${Math.round(step * options.maxRightVal)}${rightUnit}`;
        ctx.fillText(rightVal, w - padRight + 4, y);
        ctx.textAlign = "right";
      }
    });
    const pipelineSpeed = state2.pipelineSpeed || 1;
    const timeSteps = getTimeAxisLabels(datasets, totalPoints, pipelineSpeed);
    ctx.save();
    ctx.font = "7.5px monospace";
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    timeSteps.forEach((ts) => {
      const x = padLeft + plotW * ts.frac;
      if (ts.frac > 0 && ts.frac < 1) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, padTop + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.beginPath();
      ctx.moveTo(x, padTop + plotH);
      ctx.lineTo(x, padTop + plotH + 2.5);
      ctx.stroke();
      ctx.textAlign = ts.align;
      ctx.textBaseline = "top";
      ctx.fillText(ts.label, x, padTop + plotH + 3.5);
    });
    ctx.restore();
    const slideProgress = state2.slideProgress !== void 0 ? state2.slideProgress : 1;
    const gpuMode = state2.gpuMode || "eco";
    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop - 2, plotW + 3.5, plotH + 4);
    ctx.clip();
    const validDatasets = (datasets || []).filter(Boolean);
    [...validDatasets].reverse().forEach((ds) => {
      const data = ds.data;
      if (!data || data.length === 0) return;
      const maxVal = ds.maxVal || 100;
      const offset = totalPoints - data.length;
      const slideOffset = data.length > 1 ? (1 - slideProgress) * stepX : 0;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < data.length; i++) {
        const val = Math.max(0, Math.min(maxVal, data[i]));
        const x = data.length === 1 ? padLeft + plotW : padLeft + (offset + i) / (totalPoints - 1) * plotW + slideOffset;
        const y = padTop + plotH * (1 - val / maxVal);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      if (gpuMode === "light") {
        ctx.strokeStyle = ds.color;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      } else if (gpuMode === "eco") {
        ctx.save();
        ctx.strokeStyle = ds.color;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 3.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
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
      const lastIdx = data.length - 1;
      const lastVal = Math.max(0, Math.min(maxVal, data[lastIdx]));
      const lastX = data.length === 1 ? padLeft + plotW : padLeft + (offset + lastIdx) / (totalPoints - 1) * plotW + slideOffset;
      const lastY = padTop + plotH * (1 - lastVal / maxVal);
      ctx.save();
      ctx.beginPath();
      ctx.arc(lastX, lastY, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = ds.color;
      if (gpuMode === "heavy") {
        ctx.shadowColor = ds.color;
        ctx.shadowBlur = 5;
      }
      ctx.fill();
      ctx.restore();
    });
    if (canvas._activeHoverPoint) {
      const hp = canvas._activeHoverPoint;
      let activeX = hp.x;
      let activeY = hp.y;
      let pointFound = false;
      if (hp.timestamp) {
        const ds = validDatasets.find((d) => d.label === hp.label) || validDatasets[0];
        if (ds && ds.timestamps && ds.data) {
          const idx = ds.timestamps.indexOf(hp.timestamp);
          if (idx !== -1) {
            const val = Math.max(0, Math.min(ds.maxVal || 100, ds.data[idx]));
            const offset = totalPoints - ds.data.length;
            const slideOffset = ds.data.length > 1 ? (1 - slideProgress) * stepX : 0;
            activeX = ds.data.length === 1 ? padLeft + plotW : padLeft + (offset + idx) / Math.max(1, totalPoints - 1) * plotW + slideOffset;
            activeY = padTop + plotH * (1 - val / (ds.maxVal || 100));
            hp.x = activeX;
            hp.y = activeY;
            hp.valStr = formatMetricValue(ds.data[idx], ds.unit);
            hp.timeStr = formatMetricAge(hp.timestamp);
            pointFound = true;
          }
        }
      }
      const diagChartTooltip2 = document.getElementById("diag-chart-tooltip");
      if (!pointFound && hp.timestamp) {
        canvas._activeHoverPoint = null;
        if (diagChartTooltip2 && diagChartTooltip2._activeCanvas === canvas) {
          diagChartTooltip2._activeCanvas = null;
          diagChartTooltip2.classList.remove("visible");
          diagChartTooltip2.style.display = "none";
        }
      } else if (pointFound && activeX < padLeft - 2) {
        canvas._activeHoverPoint = null;
        if (diagChartTooltip2 && diagChartTooltip2._activeCanvas === canvas) {
          diagChartTooltip2._activeCanvas = null;
          diagChartTooltip2.classList.remove("visible");
          diagChartTooltip2.style.display = "none";
        }
      } else if (pointFound || !hp.timestamp) {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(activeX, padTop);
        ctx.lineTo(activeX, padTop + plotH);
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.arc(activeX, activeY, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(activeX, activeY, 5.5, 0, Math.PI * 2);
        ctx.strokeStyle = hp.color;
        ctx.lineWidth = 2;
        if (gpuMode === "heavy") {
          ctx.shadowColor = hp.color;
          ctx.shadowBlur = 8;
        }
        ctx.stroke();
        ctx.restore();
        if (diagChartTooltip2 && diagChartTooltip2.classList.contains("visible") && diagChartTooltip2._activeCanvas === canvas) {
          const rect = canvas.getBoundingClientRect();
          updateChartTooltipContentAndPos(rect.left + activeX, rect.top + activeY, hp, diagChartTooltip2);
        }
      }
    }
    ctx.restore();
    canvas._lastChartInfo = {
      padLeft,
      padRight,
      padTop,
      plotW,
      plotH,
      totalPoints,
      maxPoints,
      stepX,
      slideOffset: validDatasets.some((d) => d.data && d.data.length > 1) ? (1 - slideProgress) * stepX : 0,
      datasets: validDatasets,
      options
    };
    ctx.restore();
  }
  function getPingColor(ms) {
    if (ms <= 30) return "#4ade80";
    if (ms <= 50) return "#facc15";
    if (ms <= 100) return "#fb923c";
    return "#f87171";
  }
  function updateChartTooltipContentAndPos(clientX, clientY, info, tooltipEl) {
    const tooltip = tooltipEl || document.getElementById("diag-chart-tooltip");
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
  function showChartTooltip(clientX, clientY, info, canvas) {
    const tooltip = document.getElementById("diag-chart-tooltip");
    if (!tooltip) return;
    tooltip._activeCanvas = canvas || null;
    tooltip.style.display = "flex";
    updateChartTooltipContentAndPos(clientX, clientY, info, tooltip);
    tooltip.classList.add("visible");
  }
  function hideChartTooltip(canvas) {
    const tooltip = document.getElementById("diag-chart-tooltip");
    if (canvas && canvas._activeHoverPoint) {
      canvas._activeHoverPoint = null;
    } else if (!canvas) {
      document.querySelectorAll("canvas").forEach((c) => {
        if (c._activeHoverPoint) c._activeHoverPoint = null;
      });
    }
    if (tooltip) {
      tooltip._activeCanvas = null;
      tooltip.classList.remove("visible");
      tooltip.style.display = "none";
    }
  }

  // docs/demo/js/diagnostics.js
  var diagnosticsToggle = document.getElementById("diagnostics-toggle");
  var diagnosticsOverlay = document.getElementById("diagnostics-overlay");
  var diagnosticsClose = document.getElementById("diagnostics-close");
  var diagnosticsLoading = document.getElementById("diagnostics-loading");
  var diagnosticsContent = document.getElementById("diagnostics-content");
  var diagCpuName = document.getElementById("diag-cpu-name");
  var diagCpuVal = document.getElementById("diag-cpu-val");
  var diagCpuBar = document.getElementById("diag-cpu-bar");
  var diagRamVal = document.getElementById("diag-ram-val");
  var diagRamBar = document.getElementById("diag-ram-bar");
  var diagProcsList = document.getElementById("diag-procs-list");
  var diagGpuName = document.getElementById("diag-gpu-name");
  var diagGpuVal = document.getElementById("diag-gpu-val");
  var diagGpuBar = document.getElementById("diag-gpu-bar");
  var diagVramVal = document.getElementById("diag-vram-val");
  var diagVramBar = document.getElementById("diag-vram-bar");
  var diagGpuPower = document.getElementById("diag-gpu-power");
  var diagGpuEnc = document.getElementById("diag-gpu-enc");
  var diagGpuDriver = document.getElementById("diag-gpu-driver");
  var diagDiskIo = document.getElementById("diag-disk-io");
  var diagDisksContainer = document.getElementById("diag-disks-container");
  var diagUptime = document.getElementById("diag-uptime");
  var diagSunshineStatus = document.getElementById("diag-sunshine-status");
  var statusUptime = document.getElementById("status-uptime");
  var diagPingCur = document.getElementById("diag-ping-cur");
  var diagPingStatAvg = document.getElementById("diag-ping-stat-avg");
  var diagPingStatDev = document.getElementById("diag-ping-stat-dev");
  var diagPingCanvas = document.getElementById("diag-ping-sparkline");
  var diagPingCtx = diagPingCanvas ? diagPingCanvas.getContext("2d") : null;
  var diagNetLabel = document.getElementById("diag-net-label");
  var diagNetIo = document.getElementById("diag-net-io");
  var diagApp = document.getElementById("diag-app");
  var diagAppCard = document.getElementById("diag-app-card");
  var diagAppIconWrap = document.getElementById("diag-app-icon-wrap");
  var diagAppRuntime = document.getElementById("diag-app-runtime");
  var diagWinLabel = document.getElementById("diag-win-label");
  var diagWinBuild = document.getElementById("diag-win-build");
  var diagWinCard = document.getElementById("diag-win-card");
  var diagReboot = document.getElementById("diag-reboot");
  var diagCpuChartWrap = document.getElementById("diag-cpu-chart-wrap");
  var diagGpuChartWrap = document.getElementById("diag-gpu-chart-wrap");
  var diagCpuChartBtn = document.getElementById("diag-cpu-chart-btn");
  var diagGpuChartBtn = document.getElementById("diag-gpu-chart-btn");
  var diagCpuCanvas = document.getElementById("diag-cpu-canvas");
  var diagGpuCanvas = document.getElementById("diag-gpu-canvas");
  var diagChartCpuVal = document.getElementById("diag-chart-cpu-val");
  var diagChartRamVal = document.getElementById("diag-chart-ram-val");
  var diagChartCpuPwrPill = document.getElementById("diag-chart-cpu-pwr-pill");
  var diagChartCpuPowerVal = document.getElementById("diag-chart-cpu-power-val");
  var diagChartCpuMetricLabel = document.getElementById("diag-chart-cpu-metric-label");
  var diagChartCpuFanPill = document.getElementById("diag-chart-cpu-fan-pill");
  var diagChartCpuFanVal = document.getElementById("diag-chart-cpu-fan-val");
  var diagChartGpuVal = document.getElementById("diag-chart-gpu-val");
  var diagChartVramVal = document.getElementById("diag-chart-vram-val");
  var diagChartEncVal = document.getElementById("diag-chart-enc-val");
  var diagChartGpuFanPill = document.getElementById("diag-chart-gpu-fan-pill");
  var diagChartFanVal = document.getElementById("diag-chart-fan-val");
  var diagChartGpuPwrPill = document.getElementById("diag-chart-gpu-pwr-pill");
  var diagChartPowerVal = document.getElementById("diag-chart-power-val");
  var diagChartGpuMetricLabel = document.getElementById("diag-chart-gpu-metric-label");
  var diagDiskChartWrap = document.getElementById("diag-disk-chart-wrap");
  var diagNetChartWrap = document.getElementById("diag-net-chart-wrap");
  var diagDiskChartBtn = document.getElementById("diag-disk-chart-btn");
  var diagNetChartBtn = document.getElementById("diag-net-chart-btn");
  var diagDiskCanvas = document.getElementById("diag-disk-canvas");
  var diagNetCanvas = document.getElementById("diag-net-canvas");
  var diagChartDiskReadVal = document.getElementById("diag-chart-disk-read-val");
  var diagChartDiskWriteVal = document.getElementById("diag-chart-disk-write-val");
  var diagChartNetRecvVal = document.getElementById("diag-chart-net-recv-val");
  var diagChartNetSentVal = document.getElementById("diag-chart-net-sent-val");
  var diagMetricBtn = document.getElementById("diag-metric-btn");
  var diagPipelineBtn = document.getElementById("diag-pipeline-btn");
  var diagGpuModeBtn = document.getElementById("diag-gpu-mode-btn");
  var gpuToggleBtn = document.getElementById("gpu-toggle");
  var diagChartTooltip = document.getElementById("diag-chart-tooltip");
  var diagChartAnimFrame = null;
  var onPollingResumeCallback = null;
  function initDiagnostics({ onPollingResume }) {
    onPollingResumeCallback = onPollingResume;
    if (diagnosticsToggle) diagnosticsToggle.addEventListener("click", openDiagnostics);
    if (diagnosticsClose) diagnosticsClose.addEventListener("click", closeDiagnostics);
    if (diagnosticsOverlay) {
      diagnosticsOverlay.addEventListener("click", (e) => {
        if (e.target === diagnosticsOverlay) closeDiagnostics();
      });
    }
    if (diagChartCpuFanPill) {
      diagChartCpuFanPill.addEventListener("click", (e) => {
        e.stopPropagation();
        if (diagChartCpuFanPill.dataset.tooltip) {
          showMessage(diagChartCpuFanPill.dataset.tooltip, "info");
        }
      });
    }
    if (diagChartGpuFanPill) {
      diagChartGpuFanPill.addEventListener("click", (e) => {
        e.stopPropagation();
        if (diagChartGpuFanPill.dataset.tooltip) {
          showMessage(diagChartGpuFanPill.dataset.tooltip, "info");
        }
      });
    }
    if (diagCpuChartBtn) diagCpuChartBtn.addEventListener("click", toggleCpuChart);
    if (diagGpuChartBtn) diagGpuChartBtn.addEventListener("click", toggleGpuChart);
    if (diagDiskChartBtn) diagDiskChartBtn.addEventListener("click", toggleDiskChart);
    if (diagNetChartBtn) diagNetChartBtn.addEventListener("click", toggleNetChart);
    if (diagMetricBtn) diagMetricBtn.addEventListener("click", toggleSecondaryMetric);
    if (diagPipelineBtn) diagPipelineBtn.addEventListener("click", togglePipelineSpeed);
    if (diagGpuModeBtn) diagGpuModeBtn.addEventListener("click", toggleGpuMode);
    if (gpuToggleBtn) gpuToggleBtn.addEventListener("click", toggleGpuMode);
    setupCanvasHoverInteractivity(diagCpuCanvas);
    setupCanvasHoverInteractivity(diagGpuCanvas);
    setupCanvasHoverInteractivity(diagDiskCanvas);
    setupCanvasHoverInteractivity(diagNetCanvas);
    setupCanvasHoverInteractivity(diagPingCanvas);
    window.addEventListener("resize", () => {
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
  function setGpuMode(mode) {
    if (mode === true || mode === "eco") mode = "eco";
    else if (mode === "light") mode = "light";
    else if (mode === false || mode === "heavy") mode = "heavy";
    else mode = "eco";
    state.gpuMode = mode;
    try {
      localStorage.setItem("rigpulse_gpu_mode", mode);
    } catch (e) {
    }
    setHeroMode(mode);
    document.body.classList.remove("mode-eco", "mode-light", "mode-heavy", "mode-ultralight");
    document.body.classList.add("mode-" + mode);
    if (mode === "light") {
      document.body.classList.add("mode-ultralight");
    }
    if (gpuToggleBtn) {
      gpuToggleBtn.classList.remove("eco", "light", "heavy");
      gpuToggleBtn.classList.add(mode);
      if (mode === "eco") {
        gpuToggleBtn.textContent = "\u{1F343}";
        gpuToggleBtn.title = "Performance Mode: ECO 30FPS (Click for Light \u{1FAB6})";
      } else if (mode === "light") {
        gpuToggleBtn.textContent = "\u{1FAB6}";
        gpuToggleBtn.title = "Performance Mode: ULTRA LIGHT 0FPS (Click for Heavy \u2728)";
      } else {
        gpuToggleBtn.textContent = "\u2728";
        gpuToggleBtn.title = "Performance Mode: HEAVY 120FPS (Click for Eco \u{1F343})";
      }
    }
    if (diagGpuModeBtn) {
      diagGpuModeBtn.classList.remove("eco", "light", "heavy");
      diagGpuModeBtn.classList.add(mode);
      const iconSpan = diagGpuModeBtn.querySelector(".gpu-mode-icon");
      const textSpan = diagGpuModeBtn.querySelector(".gpu-mode-text");
      if (mode === "eco") {
        if (iconSpan) iconSpan.textContent = "\u{1F343}";
        if (textSpan) textSpan.textContent = "GPU: ECO";
        diagGpuModeBtn.title = "Performance Mode (Current: ECO 30FPS \u2014 Click for Light \u{1FAB6})";
      } else if (mode === "light") {
        if (iconSpan) iconSpan.textContent = "\u{1FAB6}";
        if (textSpan) textSpan.textContent = "GPU: LIGHT";
        diagGpuModeBtn.title = "Performance Mode (Current: ULTRA LIGHT \u2014 Click for Heavy \u2728)";
      } else {
        if (iconSpan) iconSpan.textContent = "\u2728";
        if (textSpan) textSpan.textContent = "GPU: HEAVY";
        diagGpuModeBtn.title = "Performance Mode (Current: HEAVY 120FPS \u2014 Click for Eco \u{1F343})";
      }
    }
    if (state.diagnosticsOpen) {
      renderAllDiagCharts();
    }
    if (state.machineIsUp && sunshineIsRunning) {
      renderPingSparkline();
    }
  }
  function toggleGpuMode() {
    let nextMode = "eco";
    if (state.gpuMode === "eco") nextMode = "light";
    else if (state.gpuMode === "light") nextMode = "heavy";
    else nextMode = "eco";
    setGpuMode(nextMode);
  }
  function initGpuMode(configuredDefault = null) {
    let saved = null;
    try {
      saved = localStorage.getItem("rigpulse_gpu_mode");
    } catch (e) {
    }
    if (saved === "eco" || saved === "light" || saved === "heavy") {
      setGpuMode(saved);
      return;
    }
    const targetMode = configuredDefault || state.gpuMode || "eco";
    setGpuMode(targetMode);
  }
  function applyConfiguredDefaultGpuMode(mode) {
    if (!mode || mode !== "eco" && mode !== "light" && mode !== "heavy") return;
    state.gpuMode = mode;
    let hasSaved = false;
    try {
      const saved = localStorage.getItem("rigpulse_gpu_mode");
      hasSaved = saved === "eco" || saved === "light" || saved === "heavy";
    } catch (e) {
    }
    if (!hasSaved) {
      setGpuMode(mode);
    }
  }
  function updatePipelineBtnUI() {
    if (!diagPipelineBtn) return;
    diagPipelineBtn.className = `diag-pipeline-btn speed-${state.pipelineSpeed}x`;
    if (state.pipelineSpeed === 1) {
      diagPipelineBtn.title = "Refresh speed: 1x (Standard / 500ms rest) \u2014 Click for 2x";
      diagPipelineBtn.innerHTML = '<span class="deb-mode">\u23F1\uFE0F REFRESH: 1x</span>';
    } else if (state.pipelineSpeed === 2) {
      diagPipelineBtn.title = "Refresh speed: 2x (Interleaved pipeline) \u2014 Click for 3x";
      diagPipelineBtn.innerHTML = '<span class="deb-mode">\u23F1\uFE0F REFRESH: 2x</span>';
    } else {
      diagPipelineBtn.title = "Refresh speed: 3x (Turbo multi-stream) \u2014 Click for 1x";
      diagPipelineBtn.innerHTML = '<span class="deb-mode">\u{1F680} REFRESH: 3x</span>';
    }
  }
  function togglePipelineSpeed() {
    state.pipelineSpeed = state.pipelineSpeed % 3 + 1;
    updatePipelineBtnUI();
    if (state.diagnosticsOpen) {
      renderAllDiagCharts();
      startDiagPipeline();
    }
  }
  function updateMetricBtnUI() {
    if (diagMetricBtn) {
      if (state.secondaryMetric === "temp") {
        diagMetricBtn.className = "diag-metric-btn temp";
        diagMetricBtn.title = "Active: Temperature (\xB0C) \u2014 Click to switch to Power (W)";
        diagMetricBtn.innerHTML = "\u{1F321}\uFE0F METRIC: TEMP";
      } else {
        diagMetricBtn.className = "diag-metric-btn power";
        diagMetricBtn.title = "Active: Power (W) \u2014 Click to switch to Temperature (\xB0C)";
        diagMetricBtn.innerHTML = "\u26A1 METRIC: PWR";
      }
    }
    if (diagChartCpuMetricLabel) {
      diagChartCpuMetricLabel.textContent = state.secondaryMetric === "temp" ? "TEMP" : "PWR";
    }
    if (diagChartGpuMetricLabel) {
      diagChartGpuMetricLabel.textContent = state.secondaryMetric === "temp" ? "TEMP" : "PWR";
    }
    if (diagChartCpuPwrPill) {
      diagChartCpuPwrPill.classList.toggle("gold", state.secondaryMetric === "power");
      diagChartCpuPwrPill.classList.toggle("red", state.secondaryMetric === "temp");
    }
    if (diagChartGpuPwrPill) {
      diagChartGpuPwrPill.classList.toggle("gold", state.secondaryMetric === "power");
      diagChartGpuPwrPill.classList.toggle("red", state.secondaryMetric === "temp");
    }
    const latestCpu = state.cpuHistory && state.cpuHistory.length > 0 ? state.cpuHistory[state.cpuHistory.length - 1] : null;
    if (diagChartCpuPowerVal) {
      if (latestCpu) {
        if (state.secondaryMetric === "temp") {
          const cpuTemp = latestCpu.temp || 0;
          if (cpuTemp > 0) {
            if (diagChartCpuPwrPill) diagChartCpuPwrPill.style.display = "inline-flex";
            diagChartCpuPowerVal.textContent = cpuTemp + "\xB0C";
          } else {
            if (diagChartCpuPwrPill) diagChartCpuPwrPill.style.display = "none";
            diagChartCpuPowerVal.textContent = "\u2014";
          }
        } else {
          const cpuPwr = latestCpu.power || 0;
          if (cpuPwr > 0) {
            if (diagChartCpuPwrPill) diagChartCpuPwrPill.style.display = "inline-flex";
            diagChartCpuPowerVal.textContent = cpuPwr + "W";
          } else {
            if (diagChartCpuPwrPill) diagChartCpuPwrPill.style.display = "none";
            diagChartCpuPowerVal.textContent = "\u2014";
          }
        }
      } else {
        diagChartCpuPowerVal.textContent = "\u2014";
      }
    }
    const latestGpu = state.gpuHistory && state.gpuHistory.length > 0 ? state.gpuHistory[state.gpuHistory.length - 1] : null;
    if (diagChartPowerVal) {
      if (latestGpu) {
        if (state.secondaryMetric === "temp") {
          const gpuTemp = latestGpu.temp || 0;
          diagChartPowerVal.textContent = gpuTemp > 0 ? gpuTemp + "\xB0C" : "\u2014";
        } else {
          const pwrW = latestGpu.power || 0;
          diagChartPowerVal.textContent = pwrW > 0 ? pwrW + "W" : "\u2014";
        }
      } else {
        diagChartPowerVal.textContent = "\u2014";
      }
    }
  }
  function toggleSecondaryMetric() {
    state.secondaryMetric = state.secondaryMetric === "power" ? "temp" : "power";
    updateMetricBtnUI();
    if (state.diagnosticsOpen) {
      renderCpuChart();
      renderGpuChart(state.lastKnownGpuPowerLimit);
    }
  }
  function toggleCpuChart() {
    state.cpuChartVisible = !state.cpuChartVisible;
    if (!state.cpuChartVisible) hideChartTooltip(diagCpuCanvas);
    if (diagCpuChartWrap) diagCpuChartWrap.classList.toggle("collapsed", !state.cpuChartVisible);
    if (diagCpuChartBtn) {
      diagCpuChartBtn.classList.toggle("active", state.cpuChartVisible);
      diagCpuChartBtn.title = state.cpuChartVisible ? "Hide CPU history chart" : "Show CPU history chart";
    }
    if (state.cpuChartVisible) renderCpuChart();
  }
  function toggleGpuChart() {
    state.gpuChartVisible = !state.gpuChartVisible;
    if (!state.gpuChartVisible) hideChartTooltip(diagGpuCanvas);
    if (diagGpuChartWrap) diagGpuChartWrap.classList.toggle("collapsed", !state.gpuChartVisible);
    if (diagGpuChartBtn) {
      diagGpuChartBtn.classList.toggle("active", state.gpuChartVisible);
      diagGpuChartBtn.title = state.gpuChartVisible ? "Hide GPU history chart" : "Show GPU history chart";
    }
    if (state.gpuChartVisible) renderGpuChart(state.lastKnownGpuPowerLimit);
  }
  function toggleDiskChart() {
    state.diskChartVisible = !state.diskChartVisible;
    if (!state.diskChartVisible) hideChartTooltip(diagDiskCanvas);
    if (diagDiskChartWrap) diagDiskChartWrap.classList.toggle("collapsed", !state.diskChartVisible);
    if (diagDiskChartBtn) {
      diagDiskChartBtn.classList.toggle("active", state.diskChartVisible);
      diagDiskChartBtn.title = state.diskChartVisible ? "Hide Storage history chart" : "Show Storage history chart";
    }
    if (state.diskChartVisible) renderDiskChart();
  }
  function toggleNetChart() {
    state.netChartVisible = !state.netChartVisible;
    if (!state.netChartVisible) hideChartTooltip(diagNetCanvas);
    if (diagNetChartWrap) diagNetChartWrap.classList.toggle("collapsed", !state.netChartVisible);
    if (diagNetChartBtn) {
      diagNetChartBtn.classList.toggle("active", state.netChartVisible);
      diagNetChartBtn.title = state.netChartVisible ? "Hide Network history chart" : "Show Network history chart";
    }
    if (state.netChartVisible) renderNetChart();
  }
  function openDiagnostics() {
    if (!state.authenticated || state.userRole !== "admin" || !state.machineIsUp || !state.sshReady || state.isOffline) return;
    state.diagnosticsOpen = true;
    state.lastRenderedSeq = 0;
    document.body.classList.add("modal-open");
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
    if (diagnosticsOverlay) diagnosticsOverlay.style.display = "flex";
    if (diagnosticsLoading) {
      diagnosticsLoading.style.display = "flex";
      diagnosticsLoading.className = "diagnostics-loading";
      diagnosticsLoading.innerHTML = '<span class="diagnostics-spinner"></span><span>PROBING SYSTEM TELEMETRY\u2026</span>';
    }
    if (diagnosticsContent) diagnosticsContent.style.display = "none";
    if (state.machineIsUp && sunshineIsRunning) {
      measureSunshinePing(true).then(() => {
        updateSunshinePingStatsUI();
        updateSunshinePingUI();
      });
    }
    startDiagPipeline();
  }
  function closeDiagnostics() {
    state.diagnosticsOpen = false;
    document.body.classList.remove("modal-open");
    if (diagnosticsOverlay) diagnosticsOverlay.style.display = "none";
    hideChartTooltip(null);
    stopDiagPipeline();
    state.cpuHistory = [];
    state.gpuHistory = [];
    state.diskHistory = [];
    state.netHistory = [];
    if (typeof onPollingResumeCallback === "function") {
      onPollingResumeCallback();
    }
  }
  function getMetronomeInterval() {
    if (state.pipelineSpeed === 1) {
      return Math.max(1200, state.measuredRtt + 500);
    } else if (state.pipelineSpeed === 2) {
      return Math.max(700, Math.round(state.measuredRtt / 2));
    } else {
      return Math.max(450, Math.round(state.measuredRtt / 3));
    }
  }
  function abortAllDiagRequests() {
    state.inFlightControllers.forEach((controller) => {
      try {
        controller.abort();
      } catch (e) {
      }
    });
    state.inFlightControllers.clear();
    state.inFlightCount = 0;
  }
  function stopDiagPipeline() {
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
  function startDiagPipeline() {
    stopDiagPipeline();
    triggerMetronomeTick();
  }
  function scheduleNextMetronomeTick(delay) {
    if (!state.diagnosticsOpen || !state.authenticated || state.userRole !== "admin") return;
    if (state.metronomeTimer) clearTimeout(state.metronomeTimer);
    const ms = delay !== void 0 ? delay : getMetronomeInterval();
    state.metronomeTimer = setTimeout(triggerMetronomeTick, ms);
  }
  function triggerMetronomeTick() {
    if (!state.diagnosticsOpen || !state.authenticated || state.userRole !== "admin") return;
    if (!state.machineIsUp || !state.sshReady || state.isOffline) {
      if (diagnosticsLoading) {
        diagnosticsLoading.style.display = "flex";
        diagnosticsLoading.innerHTML = '<span class="diagnostics-spinner"></span><span>WAITING FOR HOST TO BE ONLINE & SSH READY\u2026</span>';
      }
      if (diagnosticsContent) diagnosticsContent.style.display = "none";
      scheduleNextMetronomeTick(2e3);
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
      const data = await apiFetch("diagnostics", { signal: controller.signal });
      const rtt = Date.now() - t0;
      if (rtt > 200 && rtt < 15e3) {
        state.rttSamples.push(rtt);
        if (state.rttSamples.length > 4) state.rttSamples.shift();
        state.measuredRtt = Math.round(state.rttSamples.reduce((a, b) => a + b, 0) / state.rttSamples.length);
      }
      if (!state.diagnosticsOpen || controller.signal.aborted) return;
      if (!data.available || !data.stats) {
        if (state.lastRenderedSeq === 0 && diagnosticsLoading) {
          diagnosticsLoading.style.display = "flex";
          if (data.debug && data.debug.message) {
            diagnosticsLoading.className = "diagnostics-error";
            diagnosticsLoading.textContent = `\u26A0 ${data.debug.message}`;
          } else {
            diagnosticsLoading.className = "diagnostics-loading";
            diagnosticsLoading.innerHTML = '<span class="diagnostics-spinner"></span><span>PROBING SYSTEM TELEMETRY\u2026</span>';
          }
          if (diagnosticsContent) diagnosticsContent.style.display = "none";
        }
        return;
      }
      if (reqSeq > state.lastRenderedSeq) {
        state.lastRenderedSeq = reqSeq;
        if (diagnosticsLoading) diagnosticsLoading.style.display = "none";
        if (diagnosticsContent) diagnosticsContent.style.display = "flex";
        renderDiagnostics(data.stats);
      }
    } catch (e) {
      if (!state.diagnosticsOpen || e.name === "AbortError" || controller.signal.aborted) return;
      if (e.message === "auth") return;
      if (state.lastRenderedSeq === 0 && diagnosticsLoading) {
        diagnosticsLoading.style.display = "flex";
        diagnosticsLoading.className = "diagnostics-error";
        diagnosticsLoading.textContent = "\u2717 Diagnostic telemetry unavailable: " + (e.message || "error");
      }
    } finally {
      state.inFlightControllers.delete(controller);
      state.inFlightCount = Math.max(0, state.inFlightCount - 1);
      if (!controller.signal.aborted && state.pipelineSpeed === 1 && state.diagnosticsOpen) {
        scheduleNextMetronomeTick(500);
      }
    }
  }
  function getLauncherIconSvg(launcher) {
    switch (launcher) {
      case "steam":
        return `<svg class="diag-icon-svg steam" viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/></svg>`;
      case "xbox":
        return `<svg class="diag-icon-svg xbox" viewBox="0 0 24 24" fill="currentColor"><path d="M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.902-2.967 1.877-1.912-4.316-8.709-7.902-11.417-3.582 2.708-9.779 9.505-7.898 11.417zm11.16-14.406c2.5 2.961 7.484 10.313 6.076 12.912C23.002 17.48 24 14.861 24 12.004c0-3.34-1.365-6.362-3.57-8.536 0 0-.027-.022-.082-.042-.063-.022-.152-.045-.281-.045-.592 0-1.985.434-4.805 3.246zM3.654 3.426c-.057.02-.082.041-.086.042C1.365 5.642 0 8.664 0 12.004c0 2.854.998 5.473 2.661 7.533-1.401-2.605 3.579-9.951 6.08-12.91-2.82-2.813-4.216-3.245-4.806-3.245-.131 0-.223.021-.281.046v-.002zM12 3.551S9.055 1.828 6.755 1.746c-.903-.033-1.454.295-1.521.339C7.379.646 9.659 0 11.984 0H12c2.334 0 4.605.646 6.766 2.085-.068-.046-.615-.372-1.52-.339C14.946 1.828 12 3.545 12 3.545v.006z"/></svg>`;
      case "epic":
        return `<svg class="diag-icon-svg epic" viewBox="0 0 24 24" fill="currentColor"><path d="M3.537 0C2.165 0 1.66.506 1.66 1.879V18.44a4.262 4.262 0 00.02.433c.031.3.037.59.316.92.027.033.311.245.311.245.153.075.258.13.43.2l8.335 3.491c.433.199.614.276.928.27h.002c.314.006.495-.071.928-.27l8.335-3.492c.172-.07.277-.124.43-.2 0 0 .284-.211.311-.243.28-.33.285-.621.316-.92a4.261 4.261 0 00.02-.434V1.879c0-1.373-.506-1.88-1.878-1.88zm13.366 3.11h.68c1.138 0 1.688.553 1.688 1.696v1.88h-1.374v-1.8c0-.369-.17-.54-.523-.54h-.235c-.367 0-.537.17-.537.539v5.81c0 .369.17.54.537.54h.262c.353 0 .523-.171.523-.54V8.619h1.373v2.143c0 1.144-.562 1.71-1.7 1.71h-.694c-1.138 0-1.7-.566-1.7-1.71V4.82c0-1.144.562-1.709 1.7-1.709zm-12.186.08h3.114v1.274H6.117v2.603h1.648v1.275H6.117v2.774h1.74v1.275h-3.14zm3.816 0h2.198c1.138 0 1.7.564 1.7 1.708v2.445c0 1.144-.562 1.71-1.7 1.71h-.799v3.338h-1.4zm4.53 0h1.4v9.201h-1.4zm-3.13 1.235v3.392h.575c.354 0 .523-.171.523-.54V4.965c0-.368-.17-.54-.523-.54zm-3.74 10.147a1.708 1.708 0 01.591.108 1.745 1.745 0 01.49.299l-.452.546a1.247 1.247 0 00-.308-.195.91.91 0 00-.363-.068.658.658 0 00-.28.06.703.703 0 00-.224.163.783.783 0 00-.151.243.799.799 0 00-.056.299v.008a.852.852 0 00.056.31.7.7 0 00.157.245.736.736 0 00.238.16.774.774 0 00.303.058.79.79 0 00.445-.116v-.339h-.548v-.565H7.37v1.255a2.019 2.019 0 01-.524.307 1.789 1.789 0 01-.683.123 1.642 1.642 0 01-.602-.107 1.46 1.46 0 01-.478-.3 1.371 1.371 0 01-.318-.455 1.438 1.438 0 01-.115-.58v-.008a1.426 1.426 0 01.113-.57 1.449 1.449 0 01.312-.46 1.418 1.418 0 01.474-.309 1.58 1.58 0 01.598-.111 1.708 1.708 0 01.045 0zm11.963.008a2.006 2.006 0 01.612.094 1.61 1.61 0 01.507.277l-.386.546a1.562 1.562 0 00-.39-.205 1.178 1.178 0 00-.388-.07.347.347 0 00-.208.052.154.154 0 00-.07.127v.008a.158.158 0 00.022.084.198.198 0 00.076.066.831.831 0 00.147.06c.062.02.14.04.236.061a3.389 3.389 0 01.43.122 1.292 1.292 0 01.328.17.678.678 0 01.207.24.739.739 0 01.071.337v.008a.865.865 0 01-.081.382.82.82 0 01-.229.285 1.032 1.032 0 01-.353.18 1.606 1.606 0 01-.46.061 2.16 2.16 0 01-.71-.116 1.718 1.718 0 01-.593-.346l.43-.514c.277.223.578.335.9.335a.457.457 0 00.236-.05.157.157 0 00.082-.142v-.008a.15.15 0 00-.02-.077.204.204 0 00-.073-.066.753.753 0 00-.143-.062 2.45 2.45 0 00-.233-.062 5.036 5.036 0 01-.413-.113 1.26 1.26 0 01-.331-.16.72.72 0 01-.222-.243.73.73 0 01-.082-.36v-.008a.863.863 0 01.074-.359.794.794 0 01.214-.283 1.007 1.007 0 01.34-.185 1.423 1.423 0 01.448-.066 2.006 2.006 0 01.025 0zm-9.358.025h.742l1.183 2.81h-.825l-.203-.499H8.623l-.198.498h-.81zm2.197.02h.814l.663 1.08.663-1.08h.814v2.79h-.766v-1.602l-.711 1.091h-.016l-.707-1.083v1.593h-.754zm3.469 0h2.235v.658h-1.473v.422h1.334v.61h-1.334v.442h1.493v.658h-2.255zm-5.3.897l-.315.793h.624zm-1.145 5.19h8.014l-4.09 1.348z"/></svg>`;
      case "battlenet":
        return `<svg class="diag-icon-svg battlenet" viewBox="0 0 24 24" fill="currentColor"><path d="M18.94 8.296C15.9 6.892 11.534 6 7.426 6.332c.206-1.36.714-2.308 1.548-2.508 1.148-.275 2.4.48 3.594 1.854.782.102 1.71.28 2.355.429C12.747 2.013 9.828-.282 7.607.565c-1.688.644-2.553 2.97-2.448 6.094-2.2.468-3.915 1.3-5.013 2.495-.056.065-.181.227-.137.305.034.058.146-.008.194-.04 1.274-.89 2.904-1.373 5.027-1.676.303 3.333 1.713 7.56 4.055 10.952-1.28.502-2.356.536-2.946-.087-.812-.856-.784-2.318-.19-4.04a26.764 26.764 0 0 1-.807-2.254c-2.459 3.934-2.986 7.61-1.143 9.11 1.402 1.14 3.847.725 6.502-.926 1.505 1.672 3.083 2.74 4.667 3.094.084.015.287.043.332-.034.034-.06-.08-.124-.131-.149-1.408-.657-2.64-1.828-3.964-3.515 2.735-1.929 5.691-5.263 7.457-8.988 1.076.86 1.64 1.773 1.398 2.595-.336 1.131-1.615 1.84-3.403 2.185a27.697 27.697 0 0 1-1.548 1.826c4.634.16 8.08-1.22 8.458-3.565.286-1.786-1.295-3.696-4.053-5.17.696-2.139.832-4.04.346-5.588-.029-.08-.106-.27-.196-.27-.068 0-.067.13-.063.187.135 1.547-.263 3.2-1.062 5.19zm-8.533 9.869c-1.96-3.145-3.09-6.849-3.082-10.594 3.702-.124 7.474.748 10.714 2.627-1.743 3.269-4.385 6.1-7.633 7.966h.001z"/></svg>`;
      case "desktop":
        return `<svg class="diag-icon-svg desktop" viewBox="0 0 24 24" fill="currentColor"><path d="M20 3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h6l-2 2v1h8v-1l-2-2h6c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H4V5h16v11z"/></svg>`;
      case "standalone":
      default:
        return `<svg class="diag-icon-svg gamepad" viewBox="0 0 24 24" fill="currentColor"><path d="M21.58 16.09l-1.09-7.66C20.21 6.46 18.52 5 16.53 5H7.47C5.48 5 3.79 6.46 3.51 8.43l-1.09 7.66C2.2 17.63 3.39 19 4.94 19c.68 0 1.32-.27 1.8-.75L9 16h6l2.25 2.25c.48.48 1.13.75 1.81.75 1.55 0 2.74-1.37 2.52-2.91zM11 11H9v2H8v-2H6v-1h2V8h1v2h2v1zm4-1c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>`;
    }
  }
  function renderDiagnostics(s) {
    if (!s) return;
    if (diagCpuName) diagCpuName.textContent = s.cpu_name || "CPU";
    let hasCpuFan = false;
    let cpuFanPct = 0;
    const curFan = s.cpu_fan_cur !== "N/A" && s.cpu_fan_cur !== null && s.cpu_fan_cur !== void 0 ? parseFloat(s.cpu_fan_cur) : NaN;
    const maxFan = s.cpu_fan_max !== "N/A" && s.cpu_fan_max !== null && s.cpu_fan_max !== void 0 ? parseFloat(s.cpu_fan_max) : NaN;
    if (!isNaN(curFan) && !isNaN(maxFan) && maxFan > 0) {
      cpuFanPct = Math.min(100, Math.round(curFan / maxFan * 100));
      hasCpuFan = true;
    } else if (s.cpu_fan !== null && s.cpu_fan !== void 0 && s.cpu_fan !== "N/A") {
      const parsed = parseInt(s.cpu_fan, 10);
      if (!isNaN(parsed)) {
        cpuFanPct = Math.max(0, Math.min(100, parsed));
        hasCpuFan = true;
      }
    } else if (!isNaN(curFan)) {
      hasCpuFan = true;
    }
    let fanDisplay = hasCpuFan ? `${cpuFanPct}%` : "";
    let fanTooltip = "";
    if (!isNaN(curFan)) {
      fanTooltip = `CPU Fan: ${fanDisplay ? fanDisplay + " \xB7 " : ""}${Math.round(curFan)} RPM`;
      if (!isNaN(maxFan) && maxFan > 0 && (!hasCpuFan || cpuFanPct >= 80 || maxFan > curFan * 1.3)) {
        fanTooltip += ` (max ${Math.round(maxFan)} RPM)`;
      }
    } else if (hasCpuFan) {
      fanTooltip = `CPU Fan: ${fanDisplay}`;
    }
    let cpuDetail = `${s.cpu_load}%`;
    if (s.cpu_power && s.cpu_power !== "N/A" && s.cpu_power !== null) cpuDetail += ` \xB7 \u26A1 ${s.cpu_power}W`;
    if (s.cpu_freq && s.cpu_freq !== "N/A" && s.cpu_freq !== null) cpuDetail += ` \xB7 ${s.cpu_freq}GHz`;
    if (s.cpu_temp && s.cpu_temp !== "N/A" && s.cpu_temp !== null) cpuDetail += ` \xB7 ${s.cpu_temp}\xB0C`;
    if (hasCpuFan) cpuDetail += ` \xB7 \u{1F300} ${fanDisplay || Math.round(curFan) + " RPM"}`;
    if (diagCpuVal) {
      diagCpuVal.textContent = cpuDetail;
      if (fanTooltip) diagCpuVal.title = fanTooltip;
    }
    if (diagCpuBar) diagCpuBar.style.width = Math.max(0, Math.min(100, s.cpu_load)) + "%";
    if (diagChartCpuFanPill && diagChartCpuFanVal) {
      if (hasCpuFan) {
        diagChartCpuFanPill.style.display = "inline-flex";
        diagChartCpuFanVal.textContent = fanDisplay || Math.round(curFan) + " RPM";
        if (fanTooltip) {
          diagChartCpuFanPill.title = fanTooltip;
          diagChartCpuFanPill.dataset.tooltip = fanTooltip;
        }
      } else {
        diagChartCpuFanPill.style.display = "none";
      }
    }
    if (diagRamVal) diagRamVal.textContent = `${s.ram_used} / ${s.ram_total} GB (${s.ram_pct}%)`;
    if (diagRamBar) diagRamBar.style.width = Math.max(0, Math.min(100, s.ram_pct)) + "%";
    const cpuL = typeof s.cpu_load === "number" ? s.cpu_load : parseFloat(s.cpu_load) || 0;
    const ramP = typeof s.ram_pct === "number" ? s.ram_pct : parseFloat(s.ram_pct) || 0;
    const cpuPwr = s.cpu_power && s.cpu_power !== "N/A" ? parseFloat(s.cpu_power) || 0 : 0;
    const cpuTemp = s.cpu_temp && s.cpu_temp !== "N/A" ? parseFloat(s.cpu_temp) || 0 : 0;
    if (diagChartCpuVal) diagChartCpuVal.textContent = Math.round(cpuL) + "%";
    if (diagChartRamVal) diagChartRamVal.textContent = Math.round(ramP) + "%";
    if (diagChartCpuPwrPill && diagChartCpuPowerVal) {
      if (state.secondaryMetric === "temp") {
        if (cpuTemp > 0) {
          diagChartCpuPwrPill.style.display = "inline-flex";
          diagChartCpuPowerVal.textContent = cpuTemp + "\xB0C";
        } else {
          diagChartCpuPwrPill.style.display = "none";
        }
      } else {
        if (cpuPwr > 0) {
          diagChartCpuPwrPill.style.display = "inline-flex";
          diagChartCpuPowerVal.textContent = cpuPwr + "W";
        } else {
          diagChartCpuPwrPill.style.display = "none";
        }
      }
    }
    state.cpuHistory.push({ cpu: cpuL, ram: ramP, power: cpuPwr, temp: cpuTemp, fan: cpuFanPct, time: Date.now() });
    if (state.cpuHistory.length > state.historyMax) state.cpuHistory.shift();
    if (diagProcsList) {
      diagProcsList.textContent = "";
      const procs = s.top_procs || s.processes || s.top_processes || [];
      if (Array.isArray(procs) && procs.length > 0) {
        const activeExe = (s.foreground_exe || "").toLowerCase().trim();
        const activePid = s.foreground_pid ? String(s.foreground_pid) : "";
        const activeApp = (s.foreground_app || "").toLowerCase().trim();
        const isDesktop2 = !activeApp || activeApp.includes("desktop") || activeExe === "explorer.exe";
        procs.slice(0, 3).forEach((p, idx) => {
          const row = document.createElement("div");
          const pName = (p.name || "").toLowerCase().trim();
          const pPid = p.pid ? String(p.pid) : "";
          const matchesExe = activeExe && (pName === activeExe || pName.replace(/\.exe$/, "") === activeExe.replace(/\.exe$/, ""));
          const matchesPid = activePid && pPid && pPid === activePid;
          const isForeground = !isDesktop2 && (matchesExe || matchesPid);
          row.className = isForeground ? "diag-proc-row active-proc" : "diag-proc-row";
          const rank = document.createElement("span");
          rank.className = "dpr-rank";
          rank.textContent = idx + 1;
          const pid = document.createElement("span");
          pid.className = "dpr-pid";
          pid.textContent = p.pid ? p.pid : "\u2014";
          const name = document.createElement("span");
          name.className = "dpr-name";
          name.textContent = p.name || "\u2014";
          name.title = `${p.name || "Process"} (PID: ${p.pid || "N/A"})` + (isForeground ? " \u2022 [ACTIVE FOREGROUND APP]" : "");
          const cpu = document.createElement("span");
          cpu.className = "dpr-cpu";
          const cpuVal = typeof p.cpu === "number" ? p.cpu % 1 === 0 ? p.cpu : p.cpu.toFixed(1) : parseFloat(p.cpu) || 0;
          cpu.textContent = `${cpuVal}%`;
          const mem = document.createElement("span");
          mem.className = "dpr-mem";
          const memFormatted = typeof p.mem === "string" ? p.mem : typeof p.mem_mb === "number" ? p.mem_mb >= 1024 ? (p.mem_mb / 1024).toFixed(1) + " GB" : Math.round(p.mem_mb) + " MB" : p.mem !== void 0 && p.mem !== null ? `${p.mem}` : "\u2014";
          mem.textContent = memFormatted;
          row.appendChild(rank);
          row.appendChild(pid);
          row.appendChild(name);
          row.appendChild(cpu);
          row.appendChild(mem);
          diagProcsList.appendChild(row);
        });
      } else {
        const emptyRow = document.createElement("div");
        emptyRow.className = "diag-proc-row";
        emptyRow.style.color = "rgba(255,255,255,0.4)";
        emptyRow.textContent = "No process telemetry";
        diagProcsList.appendChild(emptyRow);
      }
    }
    if (diagGpuName) diagGpuName.textContent = s.gpu_name || "GPU";
    if (diagGpuDriver) {
      diagGpuDriver.textContent = s.gpu_driver && s.gpu_driver !== "N/A" ? `v${s.gpu_driver}` : "\u2014";
    }
    if (s.gpu_load !== "N/A" && s.gpu_load !== null && s.gpu_load !== void 0) {
      let hasGpuFan = false;
      let gpuFanPct = 0;
      const curGpuFan = s.gpu_fan_cur !== "N/A" && s.gpu_fan_cur !== null && s.gpu_fan_cur !== void 0 ? parseFloat(s.gpu_fan_cur) : NaN;
      const maxGpuFan = s.gpu_fan_max !== "N/A" && s.gpu_fan_max !== null && s.gpu_fan_max !== void 0 ? parseFloat(s.gpu_fan_max) : NaN;
      if (s.gpu_fan && s.gpu_fan !== "N/A" && s.gpu_fan !== "[Not Supported]") {
        const parsed = parseInt(s.gpu_fan, 10);
        if (!isNaN(parsed)) {
          gpuFanPct = Math.max(0, Math.min(100, parsed));
          hasGpuFan = true;
        }
      } else if (!isNaN(curGpuFan) && !isNaN(maxGpuFan) && maxGpuFan > 0) {
        gpuFanPct = Math.min(100, Math.round(curGpuFan / maxGpuFan * 100));
        hasGpuFan = true;
      } else if (!isNaN(curGpuFan)) {
        hasGpuFan = true;
      }
      let gpuFanDisplay = hasGpuFan ? `${gpuFanPct}%` : "";
      let gpuFanTooltip = "";
      if (!isNaN(curGpuFan)) {
        gpuFanTooltip = `GPU Fan: ${gpuFanDisplay ? gpuFanDisplay + " \xB7 " : ""}${Math.round(curGpuFan)} RPM`;
        if (!isNaN(maxGpuFan) && maxGpuFan > 0 && (!hasGpuFan || gpuFanPct >= 80 || maxGpuFan > curGpuFan * 1.3)) {
          gpuFanTooltip += ` (max ${Math.round(maxGpuFan)} RPM)`;
        }
      } else if (hasGpuFan) {
        gpuFanTooltip = `GPU Fan: ${gpuFanDisplay}`;
      }
      if (s.gpu_power && s.gpu_power !== "N/A" && parseInt(s.gpu_power, 10) > 0) {
        state.lastKnownGpuPower = parseInt(s.gpu_power, 10);
      }
      if (s.gpu_freq && s.gpu_freq !== "N/A" && parseInt(s.gpu_freq, 10) > 0) {
        state.lastKnownGpuFreq = parseInt(s.gpu_freq, 10);
      }
      const effectiveGpuPower = s.gpu_power && s.gpu_power !== "N/A" ? s.gpu_power : state.lastKnownGpuPower || null;
      const effectiveGpuFreq = s.gpu_freq && s.gpu_freq !== "N/A" ? s.gpu_freq : state.lastKnownGpuFreq || null;
      let gpuDetail = `${s.gpu_load}%`;
      if (effectiveGpuPower) gpuDetail += ` \xB7 \u26A1 ${effectiveGpuPower}W`;
      if (effectiveGpuFreq) gpuDetail += ` \xB7 ${effectiveGpuFreq}MHz`;
      if (s.gpu_temp && s.gpu_temp !== "N/A") gpuDetail += ` \xB7 ${s.gpu_temp}\xB0C`;
      if (hasGpuFan) gpuDetail += ` \xB7 \u{1F300} ${gpuFanDisplay || Math.round(curGpuFan) + " RPM"}`;
      if (diagGpuVal) {
        diagGpuVal.textContent = gpuDetail;
        if (gpuFanTooltip) diagGpuVal.title = gpuFanTooltip;
      }
      if (diagGpuBar) diagGpuBar.style.width = Math.max(0, Math.min(100, parseInt(s.gpu_load, 10) || 0)) + "%";
      const vramUsed = parseInt(s.gpu_mem_used, 10);
      const vramTotal = parseInt(s.gpu_mem_total, 10);
      let vramPct = 0;
      if (!isNaN(vramUsed) && !isNaN(vramTotal) && vramTotal > 0) {
        vramPct = Math.round(vramUsed / vramTotal * 100);
        const usedGB = (vramUsed / 1024).toFixed(1);
        const totalGB = (vramTotal / 1024).toFixed(0);
        if (diagVramVal) diagVramVal.textContent = `${usedGB} / ${totalGB} GB (${vramPct}%)`;
        if (diagVramBar) diagVramBar.style.width = Math.max(0, Math.min(100, vramPct)) + "%";
      }
      const pwrW = effectiveGpuPower ? parseInt(effectiveGpuPower, 10) || 0 : 0;
      const gpuTemp = s.gpu_temp && s.gpu_temp !== "N/A" ? parseFloat(s.gpu_temp) || 0 : 0;
      const encL = s.gpu_enc && s.gpu_enc !== "N/A" ? parseInt(s.gpu_enc, 10) || 0 : 0;
      const fanPct = gpuFanPct;
      const gpuL = parseInt(s.gpu_load, 10) || 0;
      if (diagGpuPower) diagGpuPower.textContent = effectiveGpuPower ? `${effectiveGpuPower}W` : "\u2014";
      if (diagGpuEnc) diagGpuEnc.textContent = s.gpu_enc && s.gpu_enc !== "N/A" ? `${s.gpu_enc}%` : "0%";
      if (diagChartGpuVal) diagChartGpuVal.textContent = gpuL + "%";
      if (diagChartVramVal) diagChartVramVal.textContent = vramPct + "%";
      if (diagChartEncVal) diagChartEncVal.textContent = encL + "%";
      if (diagChartFanVal) {
        diagChartFanVal.textContent = hasGpuFan ? fanPct + "%" : "\u2014";
        const pill = diagChartGpuFanPill || diagChartFanVal.parentElement;
        if (pill) {
          if (hasGpuFan && gpuFanTooltip) {
            pill.title = gpuFanTooltip;
            pill.dataset.tooltip = gpuFanTooltip;
          } else {
            pill.removeAttribute("title");
            delete pill.dataset.tooltip;
          }
        }
      }
      if (diagChartPowerVal) diagChartPowerVal.textContent = state.secondaryMetric === "temp" ? gpuTemp + "\xB0C" : pwrW + "W";
      state.gpuHistory.push({ gpu: gpuL, vram: vramPct, enc: encL, fan: fanPct, power: pwrW, temp: gpuTemp, time: Date.now() });
      if (state.gpuHistory.length > state.historyMax) state.gpuHistory.shift();
      if (s.gpu_power_limit && parseInt(s.gpu_power_limit, 10) > 0) {
        state.lastKnownGpuPowerLimit = parseInt(s.gpu_power_limit, 10);
      }
    } else {
      if (diagGpuVal) diagGpuVal.textContent = "N/A";
      if (diagGpuBar) diagGpuBar.style.width = "0%";
      if (diagVramVal) diagVramVal.textContent = "N/A";
      if (diagVramBar) diagVramBar.style.width = "0%";
      if (diagGpuPower) diagGpuPower.textContent = "\u2014";
      if (diagGpuEnc) diagGpuEnc.textContent = "\u2014";
      if (diagChartFanVal) diagChartFanVal.textContent = "\u2014";
    }
    const dRead = typeof s.disk_read_mb === "number" ? s.disk_read_mb : parseFloat(s.disk_read_mb) || 0;
    const dWrite = typeof s.disk_write_mb === "number" ? s.disk_write_mb : parseFloat(s.disk_write_mb) || 0;
    if (diagDiskIo) diagDiskIo.textContent = `\u{1F4D6} R: ${dRead.toFixed(1)} MB/s | \u270D\uFE0F W: ${dWrite.toFixed(1)} MB/s`;
    if (diagChartDiskReadVal) diagChartDiskReadVal.textContent = dRead.toFixed(1) + " MB/s";
    if (diagChartDiskWriteVal) diagChartDiskWriteVal.textContent = dWrite.toFixed(1) + " MB/s";
    state.diskHistory.push({ read: dRead, write: dWrite, time: Date.now() });
    if (state.diskHistory.length > state.historyMax) state.diskHistory.shift();
    if (diagDisksContainer) {
      diagDisksContainer.textContent = "";
      const visibleDisks = (s.disks || []).filter((d) => {
        const label = (d.label || "").toLowerCase();
        return !label.includes("r\xE9serv\xE9 au syst\xE8me") && !label.includes("reserve au systeme") && !label.includes("system reserved") && !label.includes("r\xE9cup\xE9ration") && !label.includes("recuperation") && !label.includes("recovery");
      });
      if (visibleDisks.length > 0) {
        visibleDisks.forEach((d) => {
          const item = document.createElement("div");
          item.className = "diag-disk-item";
          const header = document.createElement("div");
          header.className = "diag-disk-header";
          const dev = d.device || d.drive || "C:";
          const totalGb = Math.round(d.total !== void 0 ? d.total : d.total_gb || 0);
          const usedGb = Math.round(d.used !== void 0 ? d.used : d.used_gb || 0);
          const freeGb = Math.round(d.free !== void 0 ? d.free : d.free_gb || totalGb - usedGb);
          const pct = d.pct !== void 0 ? d.pct : d.used_pct !== void 0 ? d.used_pct : totalGb > 0 ? Math.round(usedGb / totalGb * 100) : 0;
          const name = document.createElement("span");
          name.className = "dd-name";
          name.textContent = `${dev} [${d.label || "Volume"}]`;
          const stats = document.createElement("span");
          stats.className = "dd-stats";
          stats.textContent = `${usedGb} / ${totalGb} GB (${pct}%) \xB7 ${freeGb} GB free`;
          header.appendChild(name);
          header.appendChild(stats);
          const bar = document.createElement("div");
          bar.className = "diag-disk-bar";
          const fill = document.createElement("div");
          const levelClass = d.pct < 75 ? "level-low" : d.pct < 85 ? "level-med" : "level-high";
          fill.className = `diag-disk-fill ${levelClass}`;
          fill.style.width = Math.max(0, Math.min(100, d.pct)) + "%";
          bar.appendChild(fill);
          item.appendChild(header);
          item.appendChild(bar);
          diagDisksContainer.appendChild(item);
        });
      } else {
        const emptyDisk = document.createElement("div");
        emptyDisk.style.fontSize = "0.65rem";
        emptyDisk.style.color = "rgba(255,255,255,0.4)";
        emptyDisk.textContent = "No storage volumes detected.";
        diagDisksContainer.appendChild(emptyDisk);
      }
    }
    if (diagUptime) diagUptime.textContent = `Uptime: ${s.uptime}`;
    const sunshineRunning = Boolean(s.sunshine_running !== false);
    setSunshineIsRunning(sunshineRunning);
    if (diagSunshineStatus) {
      if (!sunshineRunning) {
        diagSunshineStatus.textContent = "\u25CF DOWN";
        diagSunshineStatus.className = "dii-val stream-down";
        resetSunshinePing();
        updateSunshinePingStatsUI();
        updateSunshinePingUI();
      } else {
        if (s.sunshine_clients > 0) {
          diagSunshineStatus.innerHTML = `\u25CF STREAMING <span class="stream-clients">(${s.sunshine_clients} client${s.sunshine_clients > 1 ? "s" : ""})</span>`;
          diagSunshineStatus.className = "dii-val stream-active";
        } else {
          diagSunshineStatus.innerHTML = '\u25CB Idle <span class="stream-clients">(0 client)</span>';
          diagSunshineStatus.className = "dii-val stream-idle";
        }
        measureSunshinePing().then((res) => {
          if (!state.diagnosticsOpen) return;
          updateSunshinePingStatsUI();
          updateSunshinePingUI();
        });
        if (sunshinePingSamples.length > 0) {
          const pingClass = lastSunshinePingMs <= 30 ? "good" : lastSunshinePingMs <= 50 ? "medium" : lastSunshinePingMs <= 100 ? "warn" : "bad";
          renderPingSparkline(pingClass);
        }
      }
    }
    const nRecv = typeof s.net_recv_mb === "number" ? s.net_recv_mb : s.net && s.net.recv_mb_s !== void 0 ? s.net.recv_mb_s : parseFloat(s.net_recv_mb) || 0;
    const nSent = typeof s.net_sent_mb === "number" ? s.net_sent_mb : s.net && s.net.sent_mb_s !== void 0 ? s.net.sent_mb_s : parseFloat(s.net_sent_mb) || 0;
    const netAdapter = s.net_adapter || s.net && s.net.adapter || "";
    if (diagNetLabel) diagNetLabel.textContent = netAdapter ? `NETWORK TRAFFIC (${netAdapter})` : "NETWORK TRAFFIC";
    if (diagNetIo) diagNetIo.textContent = `\u2193 ${nRecv.toFixed(1)} MB/s | \u2191 ${nSent.toFixed(1)} MB/s`;
    if (diagChartNetRecvVal) diagChartNetRecvVal.textContent = nRecv.toFixed(2) + " MB/s";
    if (diagChartNetSentVal) diagChartNetSentVal.textContent = nSent.toFixed(2) + " MB/s";
    state.netHistory.push({ recv: nRecv, sent: nSent, time: Date.now() });
    if (state.netHistory.length > state.historyMax) state.netHistory.shift();
    const appName = s.foreground_app || "Windows Desktop";
    const isDesktop = appName === "Windows Desktop" || s.foreground_launcher === "desktop";
    if (diagApp) {
      if (s.foreground_healthy === false) {
        diagApp.textContent = `${appName} (Not Responding)`;
        diagApp.className = "dii-val app-frozen";
      } else {
        diagApp.textContent = appName;
        diagApp.className = "dii-val";
      }
    }
    if (diagAppRuntime) {
      diagAppRuntime.textContent = s.foreground_runtime && !isDesktop ? s.foreground_runtime : "";
    }
    if (diagAppIconWrap) {
      const launcher = s.foreground_launcher || (isDesktop ? "desktop" : "standalone");
      diagAppIconWrap.innerHTML = getLauncherIconSvg(launcher);
    }
    if (diagAppCard) {
      const details = [];
      if (appName) details.push(appName);
      if (s.foreground_exe && s.foreground_exe !== appName) details.push(s.foreground_exe);
      if (s.foreground_launcher && !isDesktop) {
        const launcherNames = {
          steam: "Steam",
          xbox: "Xbox / PC Game Pass",
          epic: "Epic Games",
          battlenet: "Battle.net",
          gog: "GOG Galaxy",
          ea: "EA App",
          ubisoft: "Ubisoft Connect",
          standalone: "Standalone"
        };
        details.push(launcherNames[s.foreground_launcher] || s.foreground_launcher);
      }
      if (s.foreground_pid) details.push(`PID ${s.foreground_pid}`);
      if (s.foreground_runtime && !isDesktop) details.push(`Session: ${s.foreground_runtime}`);
      if (s.foreground_healthy === false) details.push("\u26A0\uFE0F Status: Not Responding");
      diagAppCard.title = details.join(" \u2022 ");
    }
    if (diagWinLabel) {
      const ed = s.win_edition ? s.win_edition.toUpperCase() : "WINDOWS";
      diagWinLabel.textContent = ed + (s.win_ver ? " (" + s.win_ver + ")" : "");
    }
    if (diagWinBuild) {
      diagWinBuild.textContent = s.win_build ? "Build " + s.win_build : "";
    }
    if (diagReboot) {
      if (s.reboot_pending) {
        diagReboot.textContent = "\u26A0\uFE0F Reboot required" + (s.reboot_kb ? " (" + s.reboot_kb + ")" : "");
        diagReboot.style.color = "var(--neon-red)";
        diagReboot.style.textShadow = "0 0 8px rgba(255, 23, 68, 0.4)";
      } else {
        diagReboot.textContent = "\u2713 Up to date" + (s.win_update_date ? " (" + s.win_update_date + ")" : "");
        diagReboot.style.color = "var(--neon-green)";
        diagReboot.style.textShadow = "0 0 8px rgba(57, 255, 20, 0.4)";
      }
    }
    if (diagWinCard) {
      const details = [];
      if (s.win_edition) details.push(s.win_edition + (s.win_ver ? " (" + s.win_ver + ")" : ""));
      if (s.win_build) details.push("Build " + s.win_build);
      if (s.reboot_pending) {
        details.push("\u26A0\uFE0F Reboot pending" + (s.reboot_kb ? " for " + s.reboot_kb : ""));
      } else {
        details.push("\u2713 System up to date" + (s.win_update_raw ? " (Last update: " + s.win_update_raw + ")" : ""));
      }
      diagWinCard.title = details.join(" \u2022 ");
    }
    triggerChartsSlideAnimation();
  }
  function renderCpuChart() {
    if (!state.cpuChartVisible || !diagCpuCanvas) return;
    const cpuData = state.cpuHistory.map((h) => h.cpu);
    const ramData = state.cpuHistory.map((h) => h.ram);
    const fanData = state.cpuHistory.map((h) => h.fan || 0);
    const timestamps = state.cpuHistory.map((h) => h.time);
    const datasets = [
      { label: "CPU", data: cpuData, color: "#00f0ff", maxVal: 100, unit: "%", timestamps },
      { label: "RAM", data: ramData, color: "#ff00ff", maxVal: 100, unit: "%", timestamps }
    ];
    const hasFan = fanData.some((f) => f > 0);
    if (hasFan) {
      datasets.push({ label: "FAN SPEED", data: fanData, color: "#39ff14", maxVal: 100, unit: "%", timestamps });
    }
    let hasSecondary = false;
    let maxSecondary = 0;
    let rightUnit = "W";
    if (state.secondaryMetric === "temp") {
      const tempData = state.cpuHistory.map((h) => h.temp || 0);
      hasSecondary = tempData.some((t) => t > 0);
      const maxRecordedTemp = hasSecondary ? Math.max(...tempData) : 0;
      maxSecondary = Math.max(100, Math.ceil(maxRecordedTemp / 10) * 10);
      rightUnit = "\xB0C";
      if (hasSecondary) {
        datasets.push({ label: "CPU TEMP", data: tempData, color: "#ff1744", maxVal: maxSecondary, unit: "\xB0C", timestamps });
      }
    } else {
      const pwrData = state.cpuHistory.map((h) => h.power || 0);
      hasSecondary = pwrData.some((p) => p > 0);
      const maxRecordedPwr = hasSecondary ? Math.max(...pwrData) : 0;
      let maxPower = Math.max(maxRecordedPwr, state.cpuPowerMaxWatts);
      if (maxPower > state.cpuPowerMaxWatts) {
        maxPower = Math.ceil(maxPower / 50) * 50;
      }
      maxSecondary = maxPower;
      rightUnit = "W";
      if (hasSecondary) {
        datasets.push({ label: "CPU POWER", data: pwrData, color: "#ffd600", maxVal: maxSecondary, unit: "W", timestamps });
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
  function renderGpuChart(powerLimit = 0) {
    if (!state.gpuChartVisible || !diagGpuCanvas) return;
    const gpuData = state.gpuHistory.map((h) => h.gpu);
    const vramData = state.gpuHistory.map((h) => h.vram);
    const encData = state.gpuHistory.map((h) => h.enc);
    const fanData = state.gpuHistory.map((h) => h.fan || 0);
    const timestamps = state.gpuHistory.map((h) => h.time);
    let maxSecondary = 0;
    let rightUnit = "W";
    let secondaryDataset = null;
    if (state.secondaryMetric === "temp") {
      const tempData = state.gpuHistory.map((h) => h.temp || 0);
      const maxRecordedTemp = tempData.length > 0 ? Math.max(...tempData) : 0;
      maxSecondary = Math.max(100, Math.ceil(maxRecordedTemp / 10) * 10);
      rightUnit = "\xB0C";
      secondaryDataset = { label: "GPU TEMP", data: tempData, color: "#ff1744", maxVal: maxSecondary, unit: "\xB0C", timestamps };
    } else {
      const pwrData = state.gpuHistory.map((h) => h.power || 0);
      const maxRecordedPwr = pwrData.length > 0 ? Math.max(...pwrData) : 0;
      maxSecondary = Math.max(powerLimit || 0, maxRecordedPwr, 100);
      rightUnit = "W";
      secondaryDataset = { label: "GPU POWER", data: pwrData, color: "#ffd600", maxVal: maxSecondary, unit: "W", timestamps };
    }
    drawLineChart(diagGpuCanvas, [
      { label: "GPU LOAD", data: gpuData, color: "#00f0ff", maxVal: 100, unit: "%", timestamps },
      { label: "VRAM LOAD", data: vramData, color: "#ff00ff", maxVal: 100, unit: "%", timestamps },
      { label: "ENCODER", data: encData, color: "#ff7700", maxVal: 100, unit: "%", timestamps },
      { label: "FAN SPEED", data: fanData, color: "#39ff14", maxVal: 100, unit: "%", timestamps },
      secondaryDataset
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
  function renderDiskChart() {
    if (!state.diskChartVisible || !diagDiskCanvas) return;
    const readData = state.diskHistory.map((h) => h.read);
    const writeData = state.diskHistory.map((h) => h.write);
    const allData = [...readData, ...writeData];
    const maxThroughput = allData.length > 0 ? Math.max(...allData) : 0;
    const maxVal = Math.max(Math.ceil(maxThroughput), 5);
    const timestamps = state.diskHistory.map((h) => h.time);
    drawLineChart(diagDiskCanvas, [
      { label: "DISK READ", data: readData, color: "#ffd600", maxVal, unit: "MB/s", timestamps },
      { label: "DISK WRITE", data: writeData, color: "#ff9100", maxVal, unit: "MB/s", timestamps }
    ], {
      padLeft: 28,
      padRight: 8,
      unit: "M",
      maxLeftVal: maxVal,
      maxPoints: state.historyMax
    }, {
      pipelineSpeed: state.pipelineSpeed,
      slideProgress: state.chartSlideProgress,
      gpuMode: state.gpuMode
    });
  }
  function renderNetChart() {
    if (!state.netChartVisible || !diagNetCanvas) return;
    const recvData = state.netHistory.map((h) => h.recv);
    const sentData = state.netHistory.map((h) => h.sent);
    const allData = [...recvData, ...sentData];
    const maxThroughput = allData.length > 0 ? Math.max(...allData) : 0;
    const maxVal = Math.max(Math.ceil(maxThroughput), 2);
    const timestamps = state.netHistory.map((h) => h.time);
    drawLineChart(diagNetCanvas, [
      { label: "NET RECV", data: recvData, color: "#39ff14", maxVal, unit: "MB/s", timestamps },
      { label: "NET SENT", data: sentData, color: "#b388ff", maxVal, unit: "MB/s", timestamps }
    ], {
      padLeft: 28,
      padRight: 8,
      unit: "M",
      maxLeftVal: maxVal,
      maxPoints: state.historyMax
    }, {
      pipelineSpeed: state.pipelineSpeed,
      slideProgress: state.chartSlideProgress,
      gpuMode: state.gpuMode
    });
  }
  function renderAllDiagCharts() {
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
    if (state.gpuMode === "light" || state.cpuHistory.length <= 1) {
      state.chartSlideProgress = 1;
      renderAllDiagCharts();
      return;
    }
    const duration = 280;
    const startTime = performance.now();
    let lastRenderTime = startTime;
    const targetInterval = state.gpuMode === "eco" ? 33 : 0;
    function step(now) {
      const elapsed = now - startTime;
      const rawProgress = Math.min(1, elapsed / duration);
      if (rawProgress >= 1) {
        state.chartSlideProgress = 1;
        renderAllDiagCharts();
        diagChartAnimFrame = null;
        return;
      }
      if (state.gpuMode === "heavy" || now - lastRenderTime >= targetInterval) {
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
  function updateSunshinePingStatsUI() {
    if (!diagPingCur) return;
    if (!state.machineIsUp || !sunshineIsRunning || sunshinePingSamples.length === 0 || lastSunshinePingMs === null) {
      diagPingCur.textContent = "\u2014";
      diagPingCur.className = "dii-val";
      if (diagPingStatAvg) diagPingStatAvg.textContent = "avg: \u2014";
      if (diagPingStatDev) diagPingStatDev.textContent = "\u03C3: \u2014";
      if (diagPingCtx && diagPingCanvas) diagPingCtx.clearRect(0, 0, diagPingCanvas.width, diagPingCanvas.height);
      return;
    }
    const n = sunshinePingSamples.length;
    const min = Math.min(...sunshinePingSamples);
    const max = Math.max(...sunshinePingSamples);
    const avg = sunshinePingSamples.reduce((a, b) => a + b, 0) / n;
    const variance = sunshinePingSamples.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / n;
    const stddev = Math.sqrt(variance);
    const typeStr = lastSunshinePingType === "LOCAL" ? "Local" : "WAN";
    const pingClass = lastSunshinePingMs <= 30 ? "good" : lastSunshinePingMs <= 50 ? "medium" : lastSunshinePingMs <= 100 ? "warn" : "bad";
    diagPingCur.className = "dii-val";
    diagPingCur.innerHTML = `<span class="diag-ping-num ping-${pingClass}">${lastSunshinePingMs}ms</span> <span class="diag-ping-mode">(${typeStr})</span>`;
    if (diagPingStatAvg) diagPingStatAvg.textContent = `avg: ${avg.toFixed(1)}ms [${min}-${max}]`;
    if (diagPingStatDev) diagPingStatDev.textContent = `\u03C3: \xB1${stddev.toFixed(1)}ms`;
    renderPingSparkline(pingClass);
  }
  function renderPingSparkline(pingClass) {
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
        time: sunshinePingTimes && sunshinePingTimes[i] ? sunshinePingTimes[i] : null
      };
    });
    const gpuMode = state.gpuMode || "eco";
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      diagPingCtx.save();
      diagPingCtx.beginPath();
      diagPingCtx.moveTo(p1.x, p1.y);
      diagPingCtx.lineTo(p2.x, p2.y);
      if (gpuMode === "light") {
        diagPingCtx.strokeStyle = p2.color;
        diagPingCtx.lineWidth = 1.4;
        diagPingCtx.lineCap = "round";
        diagPingCtx.stroke();
      } else if (gpuMode === "eco") {
        if (p1.color === p2.color) {
          diagPingCtx.strokeStyle = p1.color;
        } else {
          const segGrad = diagPingCtx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
          segGrad.addColorStop(0, p1.color);
          segGrad.addColorStop(1, p2.color);
          diagPingCtx.strokeStyle = segGrad;
        }
        diagPingCtx.lineWidth = 1.6;
        diagPingCtx.lineCap = "round";
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
        diagPingCtx.lineCap = "round";
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
    if (gpuMode === "heavy") {
      diagPingCtx.shadowColor = last.color;
      diagPingCtx.shadowBlur = 5;
    }
    diagPingCtx.fill();
    diagPingCtx.restore();
    diagPingCanvas._lastChartInfo = {
      padLeft: padX,
      padRight: padX,
      padTop: padY,
      plotW: drawW,
      plotH: drawH,
      points: points.map((p) => ({ ...p })),
      totalPoints: data.length,
      maxPoints: data.length,
      stepX: step,
      slideOffset: 0,
      datasets: [{
        label: "LATENCY",
        data,
        color: last.color,
        maxVal: minVal + range,
        unit: "ms",
        timestamps: [...sunshinePingTimes]
      }],
      options: {}
    };
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
        if (gpuMode === "heavy") {
          diagPingCtx.shadowColor = hp.color;
          diagPingCtx.shadowBlur = 6;
        }
        diagPingCtx.stroke();
        diagPingCtx.restore();
        const tooltip = document.getElementById("diag-chart-tooltip");
        if (tooltip && tooltip.classList.contains("visible") && tooltip._activeCanvas === diagPingCanvas) {
          const r = diagPingCanvas.getBoundingClientRect();
          updateChartTooltipContentAndPos(r.left + activeX, r.top + activeY, hp, tooltip);
        }
      }
    }
    diagPingCtx.restore();
  }
  function redrawCanvasOnly(canvas) {
    if (canvas === diagCpuCanvas && state.cpuChartVisible) renderCpuChart();
    else if (canvas === diagGpuCanvas && state.gpuChartVisible) renderGpuChart(state.lastKnownGpuPowerLimit);
    else if (canvas === diagDiskCanvas && state.diskChartVisible) renderDiskChart();
    else if (canvas === diagNetCanvas && state.netChartVisible) renderNetChart();
    else if (canvas === diagPingCanvas) {
      const pingClass = lastSunshinePingType === "LOCAL" ? "good" : lastSunshinePingMs <= 30 ? "good" : lastSunshinePingMs <= 50 ? "medium" : lastSunshinePingMs <= 100 ? "warn" : "bad";
      renderPingSparkline(pingClass);
    }
  }
  function handleCanvasPointerMove(canvas, e) {
    const info = canvas._lastChartInfo;
    if (!info || !info.datasets || info.datasets.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches && e.touches.length > 0 ? e.touches[0] : e;
    const clientX = touch.clientX;
    const clientY = touch.clientY;
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    if (mx < 0 || mx > rect.width || my < 0 || my > rect.height) {
      hideChartTooltip(canvas);
      redrawCanvasOnly(canvas);
      return;
    }
    if (canvas === diagPingCanvas && info.points && info.points.length > 0) {
      let closestPoint2 = null;
      let minDistance2 = Infinity;
      info.points.forEach((pt, i) => {
        const dx = mx - pt.x;
        const dy = my - pt.y;
        const dist = Math.hypot(dx, dy * 0.85);
        if (dist < minDistance2) {
          minDistance2 = dist;
          const ptTime = pt.time || Date.now() - (info.points.length - 1 - i) * 2e3;
          closestPoint2 = {
            x: pt.x,
            y: pt.y,
            color: pt.color,
            label: "LATENCY",
            timestamp: ptTime,
            unit: "ms",
            valStr: `${Math.round(pt.val)} ms`,
            timeStr: formatMetricAge(ptTime)
          };
        }
      });
      if (closestPoint2) {
        const prevHp = canvas._activeHoverPoint;
        const isSamePoint = prevHp && prevHp.timestamp === closestPoint2.timestamp;
        canvas._activeHoverPoint = closestPoint2;
        if (!isSamePoint) {
          redrawCanvasOnly(canvas);
        }
        const ptScreenX = rect.left + closestPoint2.x;
        const ptScreenY = rect.top + closestPoint2.y;
        showChartTooltip(ptScreenX, ptScreenY, closestPoint2, canvas);
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
        const x = data.length === 1 ? padLeft + plotW : padLeft + (offset + i) / Math.max(1, totalPoints - 1) * plotW + (slideOffset || 0);
        const y = padTop + plotH * (1 - clampedVal / maxVal);
        const dx = mx - x;
        const dy = my - y;
        const dist = Math.hypot(dx, dy * 0.85);
        if (dist < minDistance) {
          minDistance = dist;
          const ptTime = ds.timestamps && ds.timestamps[i] ? ds.timestamps[i] : Date.now();
          closestPoint = {
            x,
            y,
            color: ds.color,
            label: ds.label || "METRIC",
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
      const isSamePoint = prevHp && prevHp.timestamp === closestPoint.timestamp && prevHp.datasetIndex === closestPoint.datasetIndex;
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
    canvas.addEventListener("mousemove", (e) => handleCanvasPointerMove(canvas, e));
    canvas.addEventListener("mouseleave", () => {
      hideChartTooltip(canvas);
      redrawCanvasOnly(canvas);
    });
    canvas.addEventListener("touchstart", (e) => handleCanvasPointerMove(canvas, e), { passive: true });
    canvas.addEventListener("touchmove", (e) => handleCanvasPointerMove(canvas, e), { passive: true });
    canvas.addEventListener("touchend", () => {
      hideChartTooltip(canvas);
      redrawCanvasOnly(canvas);
    });
  }
  async function checkUptime() {
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
      const data = await apiFetch("uptime");
      if (!state.machineIsUp) return;
      if (data && data.uptime) {
        const formattedUptime = data.uptime.replace(/^0d\s+/, "");
        if (statusUptime) {
          statusUptime.style.display = "inline-block";
          statusUptime.textContent = formattedUptime;
        }
        if (diagUptime) diagUptime.textContent = `Uptime: ${data.uptime}`;
      } else {
        if (statusUptime) statusUptime.style.display = "none";
      }
    } catch (e) {
    } finally {
      state.uptimeInFlight = false;
      if (!state.diagnosticsOpen && state.machineIsUp && state.sshReady && !state.isOffline) {
        clearTimeout(state.uptimeTimer);
        state.uptimeTimer = setTimeout(checkUptime, state.uptimePollInterval);
      }
    }
  }
  async function checkSysinfo() {
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
      const data = await apiFetch("sysinfo");
      if (!state.machineIsUp || !state.sshReady) return;
      if (data && data.available && data.stats) {
        updateSysinfoPreview(data.stats);
        if (data.stats.uptime && statusUptime && (!statusUptime.textContent || statusUptime.style.display === "none")) {
          statusUptime.style.display = "inline-block";
          statusUptime.textContent = data.stats.uptime.replace(/^0d\s+/, "");
        }
      } else {
        hideSysinfoPanel();
      }
    } catch (e) {
    } finally {
      state.sysinfoInFlight = false;
      if (!state.diagnosticsOpen && state.machineIsUp && state.sshReady && !state.isOffline) {
        clearTimeout(state.sysinfoTimer);
        state.sysinfoTimer = setTimeout(checkSysinfo, state.sysinfoPollInterval);
      }
    }
  }

  // docs/demo/js/app.js
  var statusRequestId = 0;
  var lastResumeTime = 0;
  async function checkStatus() {
    if (state.isOffline) return;
    const reqId = ++statusRequestId;
    const t0 = performance.now();
    try {
      const data = await apiFetch("status");
      if (reqId !== statusRequestId) return;
      const pingMs = Math.round(performance.now() - t0);
      if (data.csrf_token) setCsrfToken(data.csrf_token);
      if (data.role && data.role !== state.userRole) {
        state.userRole = data.role;
        updateUserRoleUI();
      }
      if (data.client_is_local !== void 0) {
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
      updateUI(data.status === "up", data.ip, data.ssh_ready || false, pingMs);
    } catch (e) {
      if (reqId !== statusRequestId) return;
      if (e.message === "auth") return;
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
    const statusText = isFullyUp ? "ONLINE" : state.isBooting ? state.bootIsWakeUp ? "WAKING UP\u2026" : "BOOTING\u2026" : isUp ? "STARTING\u2026" : "OFFLINE";
    const panelClass = isFullyUp ? "up" : state.isBooting ? "booting" : isUp ? "booting" : "down";
    if (elements.statusPanel) {
      elements.statusPanel.className = "status-panel " + panelClass;
    }
    if (elements.statusDot) {
      elements.statusDot.className = "status-dot " + panelClass;
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
        elements.statusIp.style.display = "inline-block";
        elements.statusIp.textContent = ip;
      }
    } else {
      if (elements.statusIp) elements.statusIp.style.display = "none";
    }
    if ((!isUp || !sshUp) && elements.statusUptime) {
      elements.statusUptime.style.display = "none";
    }
    if (!state.isBooting && elements.powerBtn) {
      const btnText = elements.powerBtn.querySelector(".wol-btn-text");
      const sleepBtnText = elements.sleepBtn ? elements.sleepBtn.querySelector(".wol-btn-text") : null;
      if (!isUp) {
        if (state.sendingAction === "wol") {
          if (elements.sshNotice) elements.sshNotice.style.display = "none";
          if (elements.sleepBtn) elements.sleepBtn.style.display = "none";
          if (elements.powerBtn) {
            elements.powerBtn.style.display = "flex";
            elements.powerBtn.classList.add("sending");
          }
        } else {
          const effectiveAction2 = state.sendingAction || state.lastPowerAction;
          stopSendingAction();
          if (elements.sshNotice) elements.sshNotice.style.display = "none";
          if (elements.sleepBtn) elements.sleepBtn.style.display = "none";
          if (elements.powerBtn) {
            elements.powerBtn.style.display = "flex";
            elements.powerBtn.className = "wol-btn";
            elements.powerBtn.disabled = false;
            elements.powerBtn.dataset.mode = "wol";
            if (btnText) btnText.textContent = isWakeUpAction(effectiveAction2) ? "WAKE UP" : "POWER ON";
            elements.powerBtn.title = state.targetName ? `Send Wake-on-LAN to ${state.targetName}` : "Power on host";
          }
        }
      } else if (!sshUp) {
        if (state.sendingAction === "sleep") {
          if (elements.powerBtn) elements.powerBtn.style.display = "none";
          if (elements.sleepBtn) {
            elements.sleepBtn.style.display = "flex";
            elements.sleepBtn.classList.add("sending");
          }
        } else if (state.sendingAction === "shutdown") {
          if (elements.sleepBtn) elements.sleepBtn.style.display = "none";
          if (elements.powerBtn) {
            elements.powerBtn.style.display = "flex";
            elements.powerBtn.classList.add("sending");
          }
        } else {
          if (elements.sleepBtn) elements.sleepBtn.style.display = "none";
          if (elements.powerBtn) elements.powerBtn.style.display = "flex";
          const isShuttingDown = state.lastPowerAction === "shutdown" || state.lastPowerAction === "sleep" || wasSshReady;
          if (isShuttingDown) {
            if (elements.sshNotice) elements.sshNotice.style.display = "none";
            elements.powerBtn.className = "wol-btn shutdown-btn";
            elements.powerBtn.disabled = true;
          } else {
            if (elements.sshNotice) elements.sshNotice.style.display = "flex";
            elements.powerBtn.className = "wol-btn shutdown-btn";
            elements.powerBtn.disabled = true;
            elements.powerBtn.dataset.mode = "shutdown";
            if (btnText) btnText.textContent = "POWER OFF";
            elements.powerBtn.title = state.targetName ? `Waiting for ${state.targetName} SSH bridge\u2026` : "Starting SSH\u2026";
          }
        }
      } else {
        if (elements.sshNotice) elements.sshNotice.style.display = "none";
        if (state.sendingAction === "shutdown") {
          if (elements.sleepBtn) elements.sleepBtn.style.display = "none";
          if (elements.powerBtn) {
            elements.powerBtn.style.display = "flex";
            elements.powerBtn.classList.add("sending");
          }
        } else if (state.sendingAction === "sleep") {
          if (elements.powerBtn) elements.powerBtn.style.display = "none";
          if (elements.sleepBtn) {
            elements.sleepBtn.style.display = "flex";
            elements.sleepBtn.classList.add("sending");
          }
        } else {
          if (elements.powerBtn) {
            elements.powerBtn.style.display = "flex";
            elements.powerBtn.classList.remove("sending");
            elements.powerBtn.className = "wol-btn shutdown-btn";
            elements.powerBtn.disabled = false;
            elements.powerBtn.dataset.mode = "shutdown";
            if (btnText) btnText.textContent = "POWER OFF";
            elements.powerBtn.title = state.targetName ? `Power off ${state.targetName}` : "Power off";
          }
          if (elements.sleepBtn) {
            elements.sleepBtn.style.display = "flex";
            elements.sleepBtn.classList.remove("sending");
            elements.sleepBtn.disabled = false;
            elements.sleepBtn.className = "wol-btn sleep-btn";
            if (sleepBtnText) sleepBtnText.textContent = "SLEEP";
            elements.sleepBtn.title = state.targetName ? `Suspend ${state.targetName} to RAM (S3 Sleep)` : "Sleep (S3)";
          }
        }
      }
    }
    const sunshineControls2 = document.getElementById("sunshine-controls");
    if (!isUp) {
      hideSunshineBar();
      if (sunshineControls2) sunshineControls2.style.display = "none";
      if (state.sunshineTimer) {
        clearTimeout(state.sunshineTimer);
        state.sunshineTimer = null;
      }
      state.sunshineInFlight = false;
    } else {
      if (sunshineControls2) sunshineControls2.style.display = sshUp ? "flex" : "none";
      if (!document.hidden && !state.diagnosticsOpen) {
        if (!wasMachineUp || !state.sunshineTimer && !state.sunshineInFlight) {
          if (state.sunshineTimer) clearTimeout(state.sunshineTimer);
          checkSunshine();
        }
      }
    }
    if (!isUp || !sshUp) {
      hideSysinfoPanel();
      if (state.sysinfoTimer) {
        clearTimeout(state.sysinfoTimer);
        state.sysinfoTimer = null;
      }
      state.sysinfoInFlight = false;
    } else {
      if (!document.hidden && !state.diagnosticsOpen) {
        if (!wasSshReady || !state.sysinfoTimer && !state.sysinfoInFlight) {
          if (state.sysinfoTimer) clearTimeout(state.sysinfoTimer);
          checkSysinfo();
        }
      }
    }
    if (!isUp || !sshUp) {
      if (elements.statusUptime) elements.statusUptime.style.display = "none";
      if (state.uptimeTimer) {
        clearTimeout(state.uptimeTimer);
        state.uptimeTimer = null;
      }
      state.uptimeInFlight = false;
    } else {
      if (!document.hidden && !state.diagnosticsOpen) {
        if (!wasSshReady || !state.uptimeTimer && !state.uptimeInFlight) {
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
    if (state.statusInterval) {
      clearInterval(state.statusInterval);
      state.statusInterval = null;
    }
    if (state.sunshineTimer) {
      clearTimeout(state.sunshineTimer);
      state.sunshineTimer = null;
    }
    if (state.uptimeTimer) {
      clearTimeout(state.uptimeTimer);
      state.uptimeTimer = null;
    }
    if (state.sysinfoTimer) {
      clearTimeout(state.sysinfoTimer);
      state.sysinfoTimer = null;
    }
    stopDiagPipeline();
    state.sunshineInFlight = false;
    state.uptimeInFlight = false;
    state.sysinfoInFlight = false;
  }
  function enterOfflineMode() {
    dismissCyberLoader();
    setOfflineMode(true);
    if (elements.lockScreen) elements.lockScreen.style.display = "none";
    if (elements.mainContainer) elements.mainContainer.style.display = "flex";
    if (elements.statusPanel) elements.statusPanel.className = "status-panel down";
    if (elements.statusDot) elements.statusDot.className = "status-dot down";
    updateDiagnosticsButtonState();
    if (state.diagnosticsOpen) closeDiagnostics();
    const effectiveAction = state.sendingAction || state.lastPowerAction;
    const isSleeping = !state.isBooting && isWakeUpAction(effectiveAction);
    setHeroState(false, false, isSleeping);
    if (elements.statusValue) elements.statusValue.textContent = "OFFLINE";
    if (elements.statusIp) elements.statusIp.style.display = "none";
    if (elements.statusUptime) elements.statusUptime.style.display = "none";
    hideSysinfoPanel();
    hideSunshineBar();
    const sunshineControls2 = document.getElementById("sunshine-controls");
    if (sunshineControls2) sunshineControls2.style.display = "none";
    if (state.statusInterval) clearInterval(state.statusInterval);
    state.statusInterval = setInterval(retryConnection, state.statusPollInterval);
  }
  async function retryConnection() {
    try {
      const data = await apiFetch("status");
      clearInterval(state.statusInterval);
      setOfflineMode(false);
      state.lastPowerAction = data.last_power_action || null;
      onAuthenticated();
      updateUI(data.status === "up", data.ip, data.ssh_ready || false);
    } catch (e) {
      if (e.message === "auth") {
        clearInterval(state.statusInterval);
        setOfflineMode(false);
        showLockScreen();
      }
    }
  }
  async function loadPublicConfig() {
    try {
      const cfg = await apiFetch("config");
      if (cfg && cfg.target && cfg.target.name) {
        state.targetName = cfg.target.name;
        const targetUpper = cfg.target.name.toUpperCase();
        if (cfg.target.host) state.targetHost = cfg.target.host;
        document.title = `${cfg.target.name} \u2014 RigPulse`;
        if (elements.targetNameLabel) elements.targetNameLabel.textContent = targetUpper;
        if (elements.lockTitle) elements.lockTitle.textContent = `${targetUpper} ACCESS IS RESTRICTED`;
        const shutdownModalTitle = document.getElementById("shutdown-modal-title");
        const shutdownModalBody = document.getElementById("shutdown-modal-body");
        if (shutdownModalTitle) shutdownModalTitle.textContent = `SHUTDOWN ${targetUpper}?`;
        if (shutdownModalBody) shutdownModalBody.innerHTML = `This will immediately power off ${cfg.target.name}.<br>Any unsaved work will be lost.`;
        const diagnosticsTitle = document.getElementById("diagnostics-title");
        if (diagnosticsTitle) diagnosticsTitle.textContent = `${targetUpper} DIAGNOSTICS`;
        const diagnosticsLoadingText = document.getElementById("diagnostics-loading-text");
        if (diagnosticsLoadingText) diagnosticsLoadingText.textContent = `PROBING ${targetUpper} TELEMETRY\u2026`;
        const historyTitle = document.getElementById("history-title");
        if (historyTitle) historyTitle.textContent = `${targetUpper} ACTION HISTORY`;
        const sshNoticeText = document.getElementById("ssh-notice-text");
        if (sshNoticeText) sshNoticeText.textContent = `SSH server starting on ${cfg.target.name}\u2026`;
        setHeroName(targetUpper);
        const resolvedDomain = (cfg.target.public_domain || cfg.sunshine && cfg.sunshine.wan_host || cfg.target.host || "").toUpperCase();
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
        if (cfg.client.default_metric && !localStorage.getItem("rigpulse_metric")) {
          state.secondaryMetric = cfg.client.default_metric;
          updateMetricBtnUI();
        }
      }
    } catch (e) {
    }
  }
  async function tryInitialAuth() {
    await loadPublicConfig();
    try {
      const data = await apiFetch("status");
      if (data.csrf_token) setCsrfToken(data.csrf_token);
      if (data.role) state.userRole = data.role;
      state.lastPowerAction = data.last_power_action || null;
      onAuthenticated();
      updateUI(data.status === "up", data.ip, data.ssh_ready || false);
    } catch (e) {
      if (e.message === "auth") return;
      enterOfflineMode();
    } finally {
      dismissCyberLoader();
    }
  }
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
  document.addEventListener("visibilitychange", () => {
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
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (state.diagnosticsOpen) closeDiagnostics();
      closeHistory();
      hideShutdownModal();
    }
  });
  window.addEventListener("pageshow", handleAppResume);
  window.addEventListener("focus", handleAppResume);
  window.addEventListener("online", handleAppResume);
  if (elements.refreshToggle) {
    elements.refreshToggle.addEventListener("click", () => {
      elements.refreshToggle.classList.add("spinning");
      setTimeout(() => window.location.reload(), 200);
    });
  }
  async function loadServerConfig() {
    try {
      const data = await apiFetch("config");
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
    }
  }
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
    loadServerConfig();
    tryInitialAuth();
    setTimeout(dismissCyberLoader, 4e3);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startApp);
  } else {
    startApp();
  }
})();
