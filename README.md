# RigPulse ⚡

<p align="center">
  <strong>The missing remote power & telemetry link for self-hosted cloud gaming rigs (Moonlight + Sunshine).</strong><br>
  <em>Keep your 500W PC at 0W, wake it in seconds, stream to any screen, monitor hardware vitals, and suspend it from your couch.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Companion-Raspberry%20Pi%20%7C%20NAS-ED1C24?style=flat-square&logo=raspberrypi&logoColor=white" alt="Raspberry Pi Companion">
  <img src="https://img.shields.io/badge/Streaming-Moonlight%20%2B%20Sunshine-F7931E?style=flat-square" alt="Moonlight + Sunshine">
  <img src="https://img.shields.io/badge/PHP-7.0%E2%80%938.3%2B-777BB4?style=flat-square&logo=php&logoColor=white" alt="PHP 7.0+">
  <img src="https://img.shields.io/badge/Frontend-Vanilla%20JS%20%7C%20CSS3-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="Vanilla JS">
  <img src="https://img.shields.io/badge/Dependencies-Zero%20NPM-brightgreen?style=flat-square" alt="Zero NPM">
  <img src="https://img.shields.io/badge/Protocol-v1.0-cyan?style=flat-square" alt="Agent Protocol v1.0">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT License">
</p>

---

### 📱 Mobile-First Cyberpunk Interface

| 🔒 **Access Lock** | 🔴 **Server Offline (WOL)** | 🟢 **Server Online (Sunshine)** | 📈 **Live Diagnostics HUD** |
| :---: | :---: | :---: | :---: |
| <a href="docs/assets/screenshots/01_password_screen.png"><img src="docs/assets/screenshots/01_password_screen.png" alt="Access Lock" width="200" /></a> | <a href="docs/assets/screenshots/02_home_offline.png"><img src="docs/assets/screenshots/02_home_offline.png" alt="Server Offline" width="200" /></a> | <a href="docs/assets/screenshots/03_home_online_sunshine.png"><img src="docs/assets/screenshots/03_home_online_sunshine.png" alt="Server Online" width="200" /></a> | <a href="docs/assets/screenshots/04_diagnostics_modal.gif"><img src="docs/assets/screenshots/04_diagnostics_modal.gif" alt="Live Diagnostics HUD" width="200" /></a> |
| *Role-based authentication* | *One-tap Wake-on-LAN* | *Live controls & sysinfo* | *Animated telemetry & charts* |

---

## 🎮 The Vision: Your Personal, Private Cloud Gaming Station

Open-source game streaming has reached parity with—and in many ways surpassed—commercial cloud gaming services like GeForce NOW, Xbox Cloud Gaming, and PlayStation Remote Play. The combination of **[Sunshine](https://github.com/LizardByte/Sunshine)** (host) and **[Moonlight](https://moonlight-stream.org/)** (client) provides:

- **Zero recurring subscription fees**, zero queue times, and zero catalog restrictions.
- **Pure raw performance**: 4K HDR, 120+ FPS, AV1/HEVC encoding, and sub-5ms local network latency.
- **Universal compatibility**: Stream your entire game library (Steam, Epic, GOG, Game Pass, emulators) seamlessly to your Steam Deck, ROG Ally, iPad, Apple TV, living room TV, or smartphone.

### The Missing Link: The 500W Idle Dilemma

A modern high-end gaming desktop draws **70W to 120W doing absolutely nothing at idle**, and upwards of **450W to 600W under full gaming load**.

Leaving your PC running 24/7 just so you can stream whenever the mood strikes wastes **150€ to 250€ in electricity every year**, wears down liquid cooling pumps and fans, and turns your room into a heater. But if you turn the PC off:
1. Standard Wake-on-LAN packets are local broadcast frames that **cannot cross Internet gateways, subnets, or VPNs**.
2. Sunshine occasionally hangs after video driver updates, leaving you with an unresponsive **black screen** and no way to restart it without remote desktop tools that break display drivers.
3. Shutting down your PC completely closes all your open games, requiring a cold boot, user login, and manual launcher restarts every time.

### The Solution: RigPulse

**RigPulse is the lightweight companion platform that makes self-hosted cloud gaming reliable, effortless, and eco-friendly.**

Running 24/7 on an ultra-low-power companion device (such as a **3W Raspberry Pi**, an existing home server, or router), RigPulse acts as your remote gaming command center:

```mermaid
flowchart TD
    subgraph Clients["📱 Stream Anywhere"]
        C1["Steam Deck / ROG Ally"]
        C2["Smart TV / Apple TV / Shield"]
        C3["Phone / Tablet / Laptop"]
    end

    subgraph Companion["🍓 24/7 Companion Server (~3W)"]
        RP["RigPulse Web HUD<br>(Pure PHP + Vanilla JS)"]
    end

    subgraph Host["🖥️ High-Power Gaming Rig (0W Off / 450W Gaming)"]
        PC["Gaming Rig<br>(Windows 10/11 or Linux / Bazzite / SteamOS)"]
        Sun["Sunshine Streaming Service"]
    end

    Clients -->|"1. HTTPS Control HUD (WOL / Sleep / Status)"| RP
    RP -->|"2. Raw Hardware WOL Packet (LAN Broadcast)"| PC
    RP -->|"3. SSH Telemetry & ACPI S3 Sleep"| PC
    RP -->|"4. Port Watchdog & Service Restarter"| Sun
    Clients -.->|"5. Direct 4K 120FPS Game Stream (Moonlight)"| Sun
```

---

## 🎯 Real-World Scenarios

| Scenario | The Pain Point | The RigPulse Fix |
| :--- | :--- | :--- |
| **🛋️ Couch & Living Room Gaming** | Your gaming PC is in the office upstairs. You want to play on your 4K TV via Apple TV or Shield, but walking upstairs to turn it on and off breaks the console experience. | Tap **POWER ON** on your phone from the sofa. The PC wakes in 3 seconds. When you're done, tap **SLEEP** to suspend your rig without getting up. |
| **🎒 Handhelds on the Go** | You're in bed or traveling with a Steam Deck or ROG Ally. Leaving your home PC on all day consumes 100W idle, but Moonlight alone cannot wake a sleeping PC across subnets or WANs. | Connect via your public domain (direct HTTPS/DDNS) or home VPN, open RigPulse, and wake the PC on demand. Put it to sleep when you arrive at your destination. |
| **📺 Headless Rigs & Virtual Displays** | Your PC runs headless in a closet with a dummy HDMI plug or virtual display driver (*IddSampleDriver*). You have no physical monitor to see what the host OS is doing. | RigPulse gives you a full hardware dashboard (GPU temps, wattage, VRAM, and Sunshine health) without needing to attach a screen or fire up remote desktop. |
| **🚨 The "Black Screen" Rescue** | Sunshine occasionally crashes or freezes after a driver update. Launching RDP or TeamViewer from your phone disrupts Windows display drivers and breaks HDR. | RigPulse's watchdog displays live port states (RTSP 48010, HTTPS 47984, HTTP, Web UI) and lets you **Restart Sunshine** in 1 click over SSH without touching your display setup. |
| **🌱 Real Energy Savings** | A 3W Raspberry Pi costs **~6€/year** in electricity. A 100W idle gaming rig left running 24/7 costs **~180€/year**. | Keep your rig at **0W** when not in use. You save up to 175€/year while enjoying instant access whenever you want to play. |

---

## ⚡ Highlights

- **One-Tap Wake-on-LAN**: Broadcasts standard 102-byte UDP magic packets directly onto the target's physical Ethernet segment.
- **ACPI S3 Suspend vs. Full Shutdown**: Put your PC into S3 sleep (resumes your active game in **2 to 3 seconds**) or trigger a clean OS shutdown.
- **Sunshine Game Streaming Watchdog**:
    - Live TCP health checks for RTSP (48010), HTTPS API (47984), HTTP (47989), and Web UI (47990).
    - One-click service start, stop, and restart controls over SSH.
    - Live ping latency sparkline to verify network health before connecting.
- **Diagnostics Live Hardware Telemetry HUD**:
    - GPU Core Load %, VRAM allocation, Video Encoder usage, Fan speed %, Core Temp (°C), and Board Power (Watts via NVIDIA SMI).
    - CPU Load %, Clock frequency, Core Temp (°C), and Package Power (Watts via Intel/AMD RAPL).
    - Real-time disk and network interface throughput.
- **Synchronized Metric Curves**: Single toggle (`[ ⚡ METRIC: PWR ]` ⇄ `[ 🌡️ METRIC: TEMP ]`) dynamically swaps telemetry curves with crisp HiDPI rendering.
- **Zero-Scroll, Mobile-First Cyberpunk HUD**:
    - Designed specifically for smartphone screens (`100dvh` zero-scroll).
    - Multi-tier GPU rendering modes: **Eco Mode** (30 FPS universal default for desktop & mobile), **Light / UltraLight Mode** (0 FPS continuous overhead for battery savings), and **Heavy Mode** (120 FPS uncapped glow).
- **Security & Privacy by Design**:
    - Dual-tier RBAC (Gamer vs. Admin) with BCrypt-hashed password authentication.
    - Ed25519 key-only SSH bridge with forced-command lockdown support.
    - Strictly whitelisted operations (zero arbitrary command injection vectors).
    - Cryptographic CSRF tokens and atomic 30-second concurrency action locks.
    - 100% private and self-hosted: zero external telemetry, zero tracking, zero cloud dependencies.
- **Ultra-Lean Stack (Zero NPM / No Bloat)**:
    - Backend: Pure PHP 7.0–8.3+. Runs on any Linux server, Raspberry Pi, or NAS with minimal RAM usage (~15MB).
    - Frontend: 100% Vanilla ES Modules and CSS3. No build steps, no webpack, no node_modules.
    - Host Agents: Native scripts for Windows 10/11 (PowerShell) and Linux (SteamOS / Bazzite / Ubuntu / Arch) with zero third-party background services or compilation.

---

## 🚀 Quick Start

### 1. Server Setup (Raspberry Pi / Linux Server)

Clone the repository:

```bash
git clone https://github.com/your-username/rigpulse.git /var/www/rigpulse
cd /var/www/rigpulse
```

Run the guided bootstrap wizard:

```bash
php web/bootstrap.php
```

This wizard interactively:
1. Reads default values from `web/config.tpl.php` and prompts for target machine name, IP/hostname, MAC address, broadcast IP, and SSH port.
2. Prompts and securely hashes your **Gamer** and **Admin** passwords (BCrypt cost 12).
3. Automatically generates an Ed25519 SSH key pair (`web/ssh/id_ed25519`) if `ssh-keygen` is available.
4. Generates `web/config.php` with strict permissions (`0640`) and creates `web/data/` with `.htaccess` protections.

*(If you prefer to generate your private SSH key manually)*:

```bash
ssh-keygen -t ed25519 -f web/ssh/id_ed25519 -C "rigpulse-bridge" -N ""
chmod 600 web/ssh/id_ed25519
```

*(Optional: To update passwords later without touching machine settings, run `php web/update_password.php`).*

### 2. Configure Your Web Server (DocumentRoot `web/`)

Point your web server's `DocumentRoot` to the `web/` subfolder (or start the PHP built-in server for testing):

```bash
php -S 0.0.0.0:8000 -t web/
```

Or configure Nginx / Apache with root set to `/var/www/rigpulse/web`.

#### Alternatively: Run with Docker Compose

```bash
docker compose up -d
```
*(Uses `network_mode: host` to allow Layer-2 Wake-on-LAN broadcasts to reach your LAN).*

### 3. Target Host Setup

RigPulse supports both **Windows 10 / 11** and **Linux (SteamOS / Bazzite / ChimeraOS / Ubuntu / Arch / Debian)** gaming rigs with lightweight native scripts that require zero third-party agent daemons or compilation. Choose your host operating system below:

#### Option A: Windows 10 / 11 Host (`rigpulse_agent.ps1`)

On the target Windows PC, open an **Administrator PowerShell** prompt:

```powershell
# 1. Install Windows OpenSSH Server
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType 'Automatic'

# 2. Set PowerShell as default SSH shell
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force

# 3. Deploy agent script and lock down NTFS permissions:
New-Item -ItemType Directory -Force -Path "C:\ProgramData\ssh"
Copy-Item ".\backends\windows\rigpulse_agent.ps1" "C:\ProgramData\ssh\rigpulse_agent.ps1"
icacls.exe "C:\ProgramData\ssh\rigpulse_agent.ps1" /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"
```

**Configure `administrators_authorized_keys`**:
Edit `C:\ProgramData\ssh\administrators_authorized_keys` (see template in `backends/windows/administrators_authorized_keys`). Lock down the SSH key with a forced command restriction (recommended):
```text
command="powershell.exe -ExecutionPolicy Bypass -NonInteractive -File C:\ProgramData\ssh\rigpulse_agent.ps1",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 <YOUR_PUBLIC_KEY_CONTENT> rigpulse-bridge
```
Apply strict NTFS permissions (mandatory for Windows OpenSSH):
```powershell
icacls.exe "C:\ProgramData\ssh\administrators_authorized_keys" /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"
```

#### Option B: Linux Host (`rigpulse_agent.sh`)

On the target Linux machine (SteamOS, Bazzite, ChimeraOS, Arch, Ubuntu, Debian), open a terminal:

```bash
# 1. Install OpenSSH Server & Hardware Sensors
# Ubuntu / Debian:
sudo apt update && sudo apt install -y openssh-server lm-sensors
# Arch Linux / SteamOS / Bazzite / ChimeraOS:
sudo pacman -S --needed openssh

# Enable and start SSH service
sudo systemctl enable --now sshd

# 2. Deploy agent script
sudo cp backends/linux/rigpulse_agent.sh /usr/local/bin/rigpulse_agent.sh
sudo chown root:root /usr/local/bin/rigpulse_agent.sh
sudo chmod 755 /usr/local/bin/rigpulse_agent.sh
```

**Configure Sudoers for Passwordless Power Controls**:
Allow the agent to suspend, power off, or restart Sunshine cleanly:
```bash
sudo visudo -f /etc/sudoers.d/rigpulse
```
Add the following line (replace `gamer` with your Linux username):
```text
gamer ALL=(ALL) NOPASSWD: /usr/bin/systemctl poweroff, /usr/bin/systemctl suspend, /usr/bin/systemctl start sunshine, /usr/bin/systemctl stop sunshine, /usr/bin/systemctl restart sunshine
```
Lock down permissions: `sudo chmod 0440 /etc/sudoers.d/rigpulse`.

**Install Public Key in `~/.ssh/authorized_keys`**:
Add your companion server's public key with forced-command lockdown (recommended):
```text
command="/usr/local/bin/rigpulse_agent.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 <YOUR_PUBLIC_KEY_CONTENT> rigpulse-bridge
```
Set strict POSIX permissions:
```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

---

## 📖 Full Documentation

Comprehensive documentation built with Material for MkDocs is available in the `docs/` directory:

- **[Getting Started](docs/getting-started.md)**: Complete guide to BIOS settings, Wake-on-LAN configuration, and network prerequisites.
- **[Architecture](docs/architecture.md)**: Deep dive into the 24/7 companion model, security boundary, and rendering pipeline.
- **[Configuration Reference](docs/configuration.md)**: Complete guide to every option in `config.php`.
- **[Agent Protocol v1.0](docs/agent-protocol.md)**: Specification for writing custom Linux/macOS/BSD host agents.

To preview the documentation locally:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
mkdocs serve
```

---

## 📄 License

RigPulse is open-source software licensed under the [MIT License](LICENSE).
