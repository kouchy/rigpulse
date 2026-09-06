# RigPulse — Windows Host Agent Setup

This guide details how to install and configure the **RigPulse Agent** on a Windows 10/11 gaming or workstation host, allowing the RigPulse web dashboard to monitor and manage it remotely over SSH.

---

## 1. Prerequisites & Windows OpenSSH Installation

On the Windows target machine, open an **elevated PowerShell (Run as Administrator)**:

```powershell
# 1. Install OpenSSH Server capability
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0

# 2. Start OpenSSH service and set to Automatic start
Start-Service sshd
Set-Service -Name sshd -StartupType 'Automatic'

# 3. Confirm firewall rule exists
Get-NetFirewallRule -Name *ssh*
```

---

## 2. Deploy the RigPulse Agent

Copy `rigpulse_agent.ps1` to a permanent system directory on the Windows host and restrict its permissions:

```powershell
# Recommended system location:
New-Item -ItemType Directory -Force -Path "C:\ProgramData\ssh"
Copy-Item ".\rigpulse_agent.ps1" "C:\ProgramData\ssh\rigpulse_agent.ps1"

# Lock down NTFS permissions (prevents unprivileged local privilege escalation):
icacls.exe "C:\ProgramData\ssh\rigpulse_agent.ps1" /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"
```

> [!IMPORTANT]
> **Privilege Escalation Prevention**: Because `rigpulse_agent.ps1` is executed with elevated Administrator / SYSTEM privileges when invoked over OpenSSH, removing inherited permissions (`/inheritance:r`) ensures that standard users or unprivileged background processes on the Windows PC cannot modify or overwrite the script to execute arbitrary code.

---

## 3. Configure PowerShell as Default SSH Shell

Ensure OpenSSH invokes PowerShell instead of `cmd.exe`:

```powershell
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force
```

---

## 4. Setup SSH Public Key Authentication

### A. For Windows Administrator Accounts
Windows OpenSSH uses a dedicated file for administrative users: `C:\ProgramData\ssh\administrators_authorized_keys`.

1. Append your RigPulse server's public key (from `web/ssh/id_ed25519.pub`) into:
   ```powershell
   # Locked down mode (see template in .\administrators_authorized_keys):
   command="powershell.exe -ExecutionPolicy Bypass -NonInteractive -File C:\ProgramData\ssh\rigpulse_agent.ps1",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAAC3NzaC1lZDI1NTE5... rigpulse-bridge
   ```
   Or without forced command (the agent is invoked via standard SSH exec).

2. Set strict NTFS permissions (OpenSSH will reject keys with broad permissions):
   ```powershell
   icacls.exe "C:\ProgramData\ssh\administrators_authorized_keys" /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"
   ```

### B. For Standard User Accounts
Append the public key to `C:\Users\<username>\.ssh\authorized_keys`:
```powershell
icacls.exe "$env:USERPROFILE\.ssh\authorized_keys" /inheritance:r /grant "$($env:USERNAME):(F)" /grant "SYSTEM:F"
```

---

## 5. Multi-Vendor GPU Telemetry (NVIDIA, AMD & Intel)

`rigpulse_agent.ps1` natively supports GPUs from NVIDIA, AMD Radeon, and Intel Arc on Windows 10 and 11:

| Vendor | Primary Telemetry Source | Optional Sensor Fallback | Supported Metrics |
| :--- | :--- | :--- | :--- |
| **NVIDIA** | `nvidia-smi` CLI | Windows WDDM Counters | Load %, VRAM (Used/Total), Encoder %, Temp, Power, Fan % |
| **AMD Radeon** | Windows WDDM Performance Counters | LibreHardwareMonitor / WMI | 3D Load %, VRAM (Dedicated/Total), Video Encoder %, Temp, Power, Fan |
| **Intel Arc / Xe** | Windows WDDM Performance Counters | LibreHardwareMonitor / WMI | 3D Load %, VRAM (Dedicated/Total), Video Encoder %, Temp, Power, Fan |

### Zero-Config WDDM Metrics (AMD & Intel)
For AMD Radeon and Intel Arc/Xe graphics cards, Windows 10/11 natively exposes real-time 3D engine utilization, video encoding load, and dedicated VRAM usage through Windows WDDM Performance Counters (`Win32_PerfFormattedData_GPUPerformanceCounters_*`) and `Win32_VideoController`. This requires **no extra software or drivers beyond standard display drivers**.

### Accurate CPU Temperature & Fan Speed Telemetry (LibreHardwareMonitor)

#### Why does CPU temperature stay stuck at 20°C (or 25°C) by default?
On almost all modern desktop motherboards (ASUS, MSI, Gigabyte, ASRock), the native Windows ACPI WMI class (`MSAcpi_ThermalZoneTemperature`) returns a **hardcoded dummy value** (`2932` deci-Kelvin = `20.0°C`). Motherboard manufacturers do not route internal CPU on-die DTS (Digital Thermal Sensor) registers into standard ACPI tables on desktop PCs.

Furthermore, Windows provides **no native API or WMI counter for motherboard fan headers** (CPU Fan, Pump Fan, Chassis Fans).

#### The Recommended Fix: LibreHardwareMonitor
To obtain 100% accurate, live CPU temperatures and fan telemetry, run **LibreHardwareMonitor** in the background:

1. Download the portable zip from [LibreHardwareMonitor GitHub Releases](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases).
2. Extract to `C:\Program Files\LibreHardwareMonitor\` (or any folder of your choice).
3. Open `LibreHardwareMonitor.exe` as **Administrator** once and configure:
   - **For modern LibreHardwareMonitor (v0.9.5+)**:
     - **Options** → **Remote Web Server** → Click **Run** (listening on default port `8085`).
     - *(Note: Once started, LibreHardwareMonitor saves this setting in `LibreHardwareMonitor.config` and automatically relaunches the web server on every reboot).*
   - **For older LibreHardwareMonitor (≤ v0.9.4) or OpenHardwareMonitor**:
     - **Options** → **WMI** → Check **Enable WMI**.
   - **Startup & tray options**:
     - **Options** → Check **Run On Windows Startup**.
     - **Options** → Check **Minimize to System Tray** and **Minimize On Close**.
4. *(Optional service mode)*: LibreHardwareMonitor also provides a headless background service `LibreHardwareMonitorService.exe` if you prefer running it without a tray icon.

#### Performance & Gaming Optimization (Zero Background Overhead)
On a dedicated gaming or Sunshine streaming host, you can optimize LibreHardwareMonitor to run with virtually 0% CPU overhead and zero interference with games:

1. **Permanent 'Below Normal' Priority (Windows Registry)**:
   Configure Windows to automatically launch `LibreHardwareMonitor.exe` with lower priority so games and streaming processes always take precedence:
   ```powershell
   # Run in an elevated PowerShell prompt:
   $reg = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\LibreHardwareMonitor.exe\PerfOptions"
   New-Item -Path $reg -Force | Out-Null
   Set-ItemProperty -Path $reg -Name "CpuPriorityClass" -Value 5 -Type DWord
   ```
   *(Value `5` = Below Normal, ensuring gaming threads never compete with sensor reads).*

2. **Disable Unused Hardware Sensors**:
   In the LibreHardwareMonitor window, open the **Hardware** top menu and **uncheck**:
   - ❌ **RAM** *(prevents heavy continuous SMBus/I2C memory timing queries)*
   - ❌ **Storage** *(disk I/O and capacities are already monitored directly by the agent)*
   - ❌ **Network**
   - Keep checked: ✔️ **Mainboard**, ✔️ **CPU**, and ✔️ **GPU**.

3. **Tune Update Interval**:
   Go to **Options** → **Update Interval** and set it to **2s** or **3s** (instead of the default 1s). The local JSON endpoint will continue responding instantaneously from memory cache with a fraction of the polling overhead.

Once enabled, `rigpulse_agent.ps1` automatically queries the local endpoint (`http://127.0.0.1:8085/data.json`) or WMI and unlocks:
- **Real dynamic CPU temperature** (Ryzen `Tctl/Tdie` or Intel `CPU Package`, accurately tracking idle and gaming loads).
- **Fan speeds** (CPU / Chassis fan RPM and control %).
- **Accurate CPU Package Power** (Watts).
- **GPU thermals and fans** for AMD Radeon and Intel Arc graphics cards.

### CPU Power (RAPL) Telemetry
To allow `[System.Diagnostics.PerformanceCounter]` access to CPU Energy counters without running SSH as a raw elevated interactive session:
- Install **LibreHardwareMonitor** (as above, which exposes power via WMI).
- Alternatively, add the SSH service account to the Windows **Performance Monitor Users** group:
  ```powershell
  Add-LocalGroupMember -Group "Performance Monitor Users" -Member "YourUser"
  ```

---

## 6. Testing Agent Manually

From your web server or laptop, run:
```bash
# Test capabilities discovery
ssh -i web/ssh/id_ed25519 user@host capabilities

# Test fast system telemetry
ssh -i web/ssh/id_ed25519 user@host sysinfo

# Test advanced diagnostic telemetry
ssh -i web/ssh/id_ed25519 user@host diagnostics
```
