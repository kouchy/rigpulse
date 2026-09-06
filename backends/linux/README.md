# RigPulse — Linux Host Agent Setup

This guide details how to install and configure the **RigPulse Linux Agent** on a dedicated Linux gaming rig or streaming host running **Bazzite, ChimeraOS, SteamOS, Arch Linux, Ubuntu, or Debian**.

---

## 1. Prerequisites & OpenSSH Server

On the Linux target host, ensure OpenSSH server is installed and running:

```bash
# Ubuntu / Debian
sudo apt update && sudo apt install -y openssh-server lm-sensors

# Arch Linux / Manjaro / SteamOS / Bazzite
sudo pacman -S --needed openssh

# Enable and start SSH service
sudo systemctl enable --now sshd
```

---

## 2. Deploy the RigPulse Agent Script

Copy `rigpulse_agent.sh` to `/usr/local/bin/rigpulse_agent.sh` and make it executable:

```bash
sudo cp backends/linux/rigpulse_agent.sh /usr/local/bin/rigpulse_agent.sh
sudo chown root:root /usr/local/bin/rigpulse_agent.sh
sudo chmod 755 /usr/local/bin/rigpulse_agent.sh
```

---

## 3. Configure Passwordless Power Commands (Sudoers)

To allow the agent to suspend (`sleep`) or shut down the machine cleanly without an interactive sudo password prompt, create a dedicated sudoers drop-in file:

```bash
sudo visudo -f /etc/sudoers.d/rigpulse
```

Add the following line (replace `gamer` with your Linux username):

```text
gamer ALL=(ALL) NOPASSWD: /usr/bin/systemctl poweroff, /usr/bin/systemctl suspend, /usr/bin/systemctl start sunshine, /usr/bin/systemctl stop sunshine, /usr/bin/systemctl restart sunshine
```

Set strict permissions on the sudoers file:
```bash
sudo chmod 0440 /etc/sudoers.d/rigpulse
```

---

## 4. Install the Companion SSH Public Key (`~/.ssh/authorized_keys`)

On the target Linux machine, add your RigPulse companion server's public key (from `web/ssh/id_ed25519.pub` on the Raspberry Pi) to `~/.ssh/authorized_keys`:

### Option A: Locked-down Mode (Recommended)
Prefix your public key with a forced command restriction so this SSH key can **only** run the RigPulse agent:

```text
command="/usr/local/bin/rigpulse_agent.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 <PASTE_YOUR_ID_ED25519_PUB_HERE> rigpulse-bridge
```

### Option B: Standard Key Authentication
Append the raw public key string to `~/.ssh/authorized_keys`.

Set strict POSIX permissions:
```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

---

## 5. Enable Wake-on-LAN on Linux

Ensure your Linux Ethernet network interface has WOL enabled:

```bash
# Check current WOL status ('g' means magic packet is active):
sudo ethtool eth0 | grep Wake-on

# Enable magic packet WOL if needed:
sudo ethtool -s eth0 wol g
```

*(To persist across reboots, configure your systemd-networkd, NetworkManager, or TLP settings to keep WOL active).*

---

## 6. GPU Telemetry Support (NVIDIA, AMD & Intel)

`rigpulse_agent.sh` natively detects and monitors GPUs from all three major vendors with **zero required external Python or runtime dependencies**:

| Vendor | Primary Method | Fallback Method | Supported Metrics |
| :--- | :--- | :--- | :--- |
| **NVIDIA** | `nvidia-smi` | — | Load %, VRAM (Used/Total), Encoder %, Temp, Power, Fan % |
| **AMD Radeon** | Linux Kernel sysfs (`amdgpu`) | `rocm-smi` CLI | Load %, VRAM (Used/Total), Temp, Power, Fan % |
| **Intel Arc / Xe** | Linux Kernel sysfs (`xe` / `i915`) | `xpu-smi` CLI | Discrete VRAM (LMEM), Frequency Load, Temp, Power, Fan % |

> [!TIP]
> **Zero-Config on SteamOS / Bazzite / ChimeraOS**: For AMD Radeon (and Steam Deck), the agent directly queries `/sys/class/drm/card*/device/` and `hwmon`. You do **not** need to install the heavy ROCm SDK (~15 GB) to get real-time GPU load, VRAM, temperature, and power metrics. If `rocm-smi` is installed, the agent also detects and queries it seamlessly.

---

## 7. Manual Testing

From your companion server (Raspberry Pi), test communication with your Linux rig:

```bash
# Test capabilities discovery:
ssh -i web/ssh/id_ed25519 gamer@192.168.1.100 capabilities

# Test fast system telemetry:
ssh -i web/ssh/id_ed25519 gamer@192.168.1.100 sysinfo

# Test advanced diagnostic telemetry:
ssh -i web/ssh/id_ed25519 gamer@192.168.1.100 diagnostics
```

