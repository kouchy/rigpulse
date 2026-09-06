# RigPulse Agent Protocol v1.0

The **RigPulse Agent Protocol** is an open, versioned specification defining how remote host agents communicate hardware metrics and power actions to the RigPulse web dashboard.

Any operating system (Windows, Linux, FreeBSD, macOS) or hardware platform (NVIDIA, AMD Radeon, Intel Arc) can be monitored by RigPulse simply by implementing an agent script that adheres to this protocol.

---

## 1. Transport & Invocation Contract

- **Transport**: Standard SSH (OpenSSH).
- **Execution**: The server executes the agent with a single argument specifying the action:
  ```bash
  ssh -i <key> <user>@<host> <action>
  ```
- **Output Format**: Clean UTF-8 JSON printed to `STDOUT`. Diagnostics and errors may be written to `STDERR`.
- **Exit Code**: `0` on success, non-zero on failure.

---

## 2. Agent Subcommand Tiers

Protocol v1.0 organizes subcommands into **three progressive tiers**. An agent is not required to implement all commands—RigPulse gracefully adapts and hides unsupported features:

### Tier 1: Minimum Viable Agent (Essential)
Only **two commands** are strictly required to create a functional RigPulse agent:

| Command | Output | Description |
| :--- | :--- | :--- |
| `sysinfo` | JSON | Fast lightweight metrics for background polling (CPU & RAM). |
| `shutdown` | String | Initiates OS shutdown when the user triggers power-off. |

*(A simple 20-line script implementing only `sysinfo` and `shutdown` is already a fully working RigPulse agent).*

### Tier 2: Extended Host Management (Recommended)
Adds sleep suspend, uptime display, feature discovery, and deep diagnostics:

| Command | Output | Description | UI Behavior if Omitted |
| :--- | :--- | :--- | :--- |
| `sleep` | String | Initiates ACPI S3 sleep suspend. | Clicking SLEEP displays an error; host remains awake. |
| `uptime` | String | Human-readable uptime (e.g. `2d 5h 32m`). | Uptime pill badge is automatically hidden from UI. |
| `capabilities` | JSON | Discovers supported features and hardware sensors. | Frontend uses standard defaults and degradation rules. |
| `diagnostics` | JSON | Deep hardware metrics and process listing. | Diagnostics modal displays "Telemetry unavailable". |

### Tier 3: Streaming Service Controls (Sunshine)
Only needed if the host runs Sunshine and Sunshine controls are enabled in `config.php`:

| Command | Output | Description | UI Behavior if Omitted |
| :--- | :--- | :--- | :--- |
| `sunshine-start` | String | Starts Sunshine streaming service. | Clicking Start displays execution error. |
| `sunshine-stop` | String | Stops Sunshine streaming service. | Clicking Stop displays execution error. |
| `sunshine-restart` | String | Restarts Sunshine streaming service. | Clicking Restart displays execution error. |

---

## 3. Capabilities Discovery Schema (`capabilities`)

When invoked with `capabilities`, the agent returns a JSON payload describing its features and declaring which subcommands it actually supports:

```json
{
  "protocol_version": "1.0",
  "os": "linux",
  "supported_commands": [
    "shutdown", "sleep", "uptime", "sysinfo", "diagnostics", 
    "capabilities", "sunshine-start", "sunshine-stop", "sunshine-restart"
  ],
  "features": {
    "gpu": true,
    "gpu_vendor": "amd",
    "cpu_power": true,
    "cpu_temp": true,
    "disk_io": true,
    "net_io": true,
    "sunshine": true,
    "foreground_app": false,
    "os_updates": false
  }
}
```

---

## 4. Mandatory Core vs. Optional JSON Fields (`sysinfo`)

Within the JSON payload returned by `sysinfo`, RigPulse minimizes requirements so that any platform or virtual machine can be monitored:

### Mandatory Core Metrics (3 fields)
Only **three data fields** are strictly mandatory for basic operation:

| Field | Type | Description |
| :--- | :--- | :--- |
| `cpu` / `cpu_load` | `number` | CPU overall load percentage (0–100). |
| `ram_used` | `number` | Used RAM in gigabytes (e.g. `14.2`). |
| `ram_total` | `number` | Total installed RAM in gigabytes (e.g. `32.0`). |

All other fields (`gpu_load`, `gpu_temp`, `gpu_power`, `cpu_temp`, `cpu_power`, `cpu_freq`, `cpu_fan`, etc.) are **optional**. If omitted or `null`, the dashboard gracefully hides the corresponding badges or displays `N/A`.

---

## 5. Graceful UI Degradation Matrix

If optional sensors are unavailable on a particular machine (e.g. no dedicated GPU, missing RAPL driver, or read-only filesystem), RigPulse degrades gracefully:

| Metric Field | Missing / Null State | Frontend UI Adaptation |
| :--- | :--- | :--- |
| `cpu_temp` | `null` or absent | The CPU temperature label is hidden. If the secondary metric is toggled to `TEMP`, only available temperatures render. |
| `cpu_fan` | `null` or absent | The CPU fan speed badge and fan legend pill are hidden. |
| `cpu_power` | `null` or `0` | The CPU power pill is hidden. The power curve flattens to 0W or hides cleanly. |
| `cpu_freq` | `null` or absent | Frequency badge is hidden from the CPU card. |
| `gpu_load` / `gpu` | `null` or `false` | GPU card displays `N/A`. GPU chart collapses or displays "No discrete GPU detected". |
| `gpu_temp` / `gpu_power` | `null` or absent | GPU metric pill and corresponding secondary chart curves are omitted. |
| `gpu_fan` / `gpu_fan_cur` / `gpu_fan_max` | `null` or absent | GPU fan indicator displays `N/A` or hides. RPM details are omitted from hover/click. |
| `gpu_enc` | `null` or absent | Encoder percentage indicator displays `N/A` or `—`. |
| `disks` | empty array `[]` | Disk storage list is hidden. |
| `disk_read_mb` / `write` | `null` or absent | Disk throughput text is hidden. Storage history chart stays at 0 MB/s. |
| `net_recv_mb` / `sent` | `null` or absent | Network throughput text is hidden. Network history chart stays at 0 MB/s. |
| `top_procs` | empty array `[]` | The top process table displays *"Process monitoring unavailable"*. |
| `sunshine` | `false` / absent | Sunshine status bar is hidden entirely from the main dashboard. |

---

## 6. Telemetry Schemas

### `sysinfo` Response Schema (Summary)
```json
{
  "cpu": 18,
  "cpu_freq": "4.85",
  "cpu_temp": 48,
  "cpu_fan": 40,
  "cpu_fan_cur": 1250,
  "cpu_fan_max": 2500,
  "cpu_power": 42.5,
  "ram_used": 14.2,
  "ram_total": 31.9,
  "ram_pct": 45,
  "gpu_load": 35,
  "gpu_mem_used": 3450,
  "gpu_mem_total": 12288,
  "gpu_fan": 45,
  "gpu_fan_cur": 1150,
  "gpu_fan_max": 2200,
  "gpu_temp": 52,
  "gpu_power": 115
}
```

### `diagnostics` Response Schema (Diagnostic HUD)
```json
{
  "cpu_load": 22,
  "cpu_freq": "4.85",
  "cpu_temp": 51,
  "cpu_fan": 40,
  "cpu_fan_cur": 1250,
  "cpu_fan_max": 2500,
  "cpu_power": 54.2,
  "ram_used": "14.6",
  "ram_total": "31.9",
  "ram_pct": 46,
  "gpu_load": "42",
  "gpu_mem_used": "4200",
  "gpu_mem_total": "12288",
  "gpu_enc": "12",
  "gpu_power": "135",
  "gpu_power_limit": "285",
  "gpu_fan": "45",
  "gpu_fan_cur": 1150,
  "gpu_fan_max": 2200,
  "gpu_temp": "55",
  "disk_read_mb": "12.4",
  "disk_write_mb": "4.8",
  "disks": [
    { "drive": "C:", "label": "System", "used_gb": 320, "total_gb": 1000, "pct": 32 }
  ],
  "net_recv_mb": "4.2",
  "net_sent_mb": "1.8",
  "top_procs": [
    { "pid": "4812", "name": "cyberpunk2077.exe", "cpu": 16.4, "mem": "6.2 GB" },
    { "pid": "1044", "name": "sunshine.exe", "cpu": 3.8, "mem": "180 MB" }
  ]
}
```

---

## 7. Official Host Agents

RigPulse includes two official, production-ready host agent implementations:

- **Windows 10 / 11 Agent** (`backends/windows/rigpulse_agent.ps1`): Compatible with Windows 10 & 11 (PowerShell 5.1 & Core 7+). Features tri-vendor GPU telemetry (NVIDIA `nvidia-smi`, AMD Radeon & Intel Arc via native WDDM Performance Counters and LibreHardwareMonitor WMI). See `backends/windows/README.md` for installation and OpenSSH configuration.
- **Linux Agent** (`backends/linux/rigpulse_agent.sh`): Compatible with **Bazzite, ChimeraOS, SteamOS, Arch Linux, Ubuntu, and Debian**. Features zero-dependency tri-vendor GPU telemetry (NVIDIA `nvidia-smi`, AMD Radeon kernel sysfs / `rocm-smi`, and Intel Arc `xe` / `i915` / `xpu-smi`). See `backends/linux/README.md` for sudoers and OpenSSH setup.

Creating a custom agent in Python, Go, or Rust is as simple as handling the subcommands for your target tier (Tier 1 minimal, Tier 2 extended, or Tier 3 streaming) and printing the JSON schemas to `STDOUT`.

