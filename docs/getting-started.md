# Getting Started with RigPulse

This walkthrough guides you through installing and configuring RigPulse on your 24/7 web companion (e.g. Raspberry Pi) and target gaming rig.

---

## 1. Hardware & Network Prerequisites

Before setting up RigPulse, ensure your target desktop rig is configured for Wake-on-LAN:

1. **Motherboard BIOS / UEFI**:
   - Enable **Wake on LAN (WOL)** or **PCIe Power On**.
   - Disable **ErP / EuP** (or Deep Sleep) energy saving modes that cut standby power to the Ethernet NIC when the PC is turned off.
2. **Operating System Network Settings**:
   - **Windows 10 / 11**:
     - In **Device Manager** → **Network adapters** → Ethernet adapter → **Properties** → **Power Management**: check *Allow this device to wake the computer* and *Only allow a magic packet to wake the computer*.
     - In the **Advanced** tab: set *Wake on Magic Packet* to **Enabled** and disable *Energy Efficient Ethernet*.
     - Disable Windows Fast Startup (*Control Panel* → *Power Options* → *Choose what the power buttons do*).
   - **Linux (SteamOS / Bazzite / Ubuntu / Arch)**:
     - Check status: `sudo ethtool eth0 | grep Wake-on` (flag `g` indicates magic packet is active).
     - Enable if needed: `sudo ethtool -s eth0 wol g`.
     - In NetworkManager: `nmcli connection modify "Wired connection 1" 802-3-ethernet.wake-on-lan magic`.
3. **24/7 LAN Companion**:
     - A Raspberry Pi, mini PC, or NAS on the same physical local subnet (e.g. `192.168.1.0/24`) with PHP 7.0 or newer.

---

## 2. Server Installation (Companion / Raspberry Pi)

### A. Install Web Server & PHP

On your Raspberry Pi or Debian/Ubuntu server:

```bash
sudo apt update
sudo apt install -y git php-cli php-curl php-mbstring wakeonlan
```

### B. Clone the RigPulse Repository

```bash
cd /var/www
sudo git clone https://github.com/your-username/rigpulse.git
cd rigpulse
```

### C. Run the Guided Bootstrap Wizard

Run the interactive bootstrap wizard:

```bash
php web/bootstrap.php
```

This wizard:
1. Reads defaults from `web/config.tpl.php` and prompts for target name, host IP, MAC address, broadcast IP, and SSH port.
2. Prompts and securely hashes your **Gamer** and **Admin** passwords (BCrypt cost 12).
3. Automatically generates an Ed25519 SSH key pair (`web/ssh/id_ed25519`) with permissions `0600`.
4. Automatically creates the `web/data/` directory with `.htaccess` security protections.
5. Generates your initial `web/config.php` with strict permissions (`0640`).

### D. (Optional) Manual SSH Key Generation

If `ssh-keygen` was not available during bootstrap, generate your dedicated ED25519 SSH key manually:

```bash
ssh-keygen -t ed25519 -f web/ssh/id_ed25519 -C "rigpulse-bridge" -N ""
chmod 600 web/ssh/id_ed25519
```

*(Optional: Run `php web/update_password.php` anytime to update passwords non-destructively).*

---

## 3. Web Server Configuration (`web/`)

Point your web server's `DocumentRoot` to the `web/` subfolder:

```bash
# For development / bare-metal:
php -S 0.0.0.0:8000 -t web/
```

### Option B: Running with Docker Compose

If you run Docker on your Raspberry Pi, server, or NAS:

```bash
# Launch container with host networking (required for Layer-2 WOL broadcast):
docker compose up -d
```

*(Note: Run `php web/bootstrap.php` once prior to starting the container to generate your `web/config.php` and SSH keys).*

If needed, inspect or adjust parameters in `web/config.php`:

```php
return [
    'target' => [
        'name'         => 'GamingRig',
        'host'         => '192.168.1.100',           // Target LAN IP or hostname
        'mac'          => '00:11:22:33:44:55',       // Target Ethernet MAC address
        'broadcast'    => '192.168.1.255',           // Subnet broadcast address
        'wol_port'     => 9,
    ],
    'ssh' => [
        'user'         => 'gamer',                   // Target username (Windows or Linux)
        'host'         => '192.168.1.100',
        'port'         => 22,
        'dir'          => __DIR__ . '/ssh',
        'key_filename' => 'id_ed25519',
        'timeout'      => 5,
    ],
    // ...
];
```

---

## 4. Target Host Setup

RigPulse supports both **Windows 10/11** and **Linux (SteamOS, Bazzite, ChimeraOS, Arch, Ubuntu, Debian)** gaming rigs with zero third-party background services or compilation. Select your target operating system below:

=== "Windows 10 / 11"

    On the target Windows PC, open an **Administrator PowerShell** prompt:

    ```powershell
    # 1. Install Windows OpenSSH Server
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
    Start-Service sshd
    Set-Service -Name sshd -StartupType 'Automatic'

    # 2. Set PowerShell as default SSH shell
    New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force

    # 3. Create SSH directory, deploy the agent script, and lock down NTFS permissions:
    New-Item -ItemType Directory -Force -Path "C:\ProgramData\ssh"
    Copy-Item ".\backends\windows\rigpulse_agent.ps1" "C:\ProgramData\ssh\rigpulse_agent.ps1"

    # Restrict permissions to Administrators and SYSTEM (prevents unprivileged privilege escalation):
    icacls.exe "C:\ProgramData\ssh\rigpulse_agent.ps1" /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"
    ```

    #### Install Public Key (`administrators_authorized_keys`)

    When using an administrative account on Windows, OpenSSH reads authorized keys from `C:\ProgramData\ssh\administrators_authorized_keys`. A template is provided in `backends/windows/administrators_authorized_keys`.

    **Option A: Locked-down Mode (Recommended)**
    Prefix your companion's public key (from `web/ssh/id_ed25519.pub`) with a forced command restriction:
    ```text
    command="powershell.exe -ExecutionPolicy Bypass -NonInteractive -File C:\ProgramData\ssh\rigpulse_agent.ps1",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 <PASTE_ID_ED25519_PUB_HERE> rigpulse-bridge
    ```

    **Option B: Standard Key Authentication**
    Paste the raw public key string directly into `C:\ProgramData\ssh\administrators_authorized_keys`.

    **Set Strict NTFS Permissions**:
    ```powershell
    icacls.exe "C:\ProgramData\ssh\administrators_authorized_keys" /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"
    ```

=== "Linux (SteamOS / Bazzite / Ubuntu / Arch)"

    On the target Linux machine, open a terminal:

    ```bash
    # 1. Install OpenSSH Server & Hardware Sensors
    # Ubuntu / Debian:
    sudo apt update && sudo apt install -y openssh-server lm-sensors
    # Arch Linux / SteamOS / Bazzite / ChimeraOS:
    sudo pacman -S --needed openssh

    # Enable and start SSH service
    sudo systemctl enable --now sshd

    # 2. Deploy the RigPulse Agent Script
    sudo cp backends/linux/rigpulse_agent.sh /usr/local/bin/rigpulse_agent.sh
    sudo chown root:root /usr/local/bin/rigpulse_agent.sh
    sudo chmod 755 /usr/local/bin/rigpulse_agent.sh
    ```

    #### Configure Passwordless Power Controls (Sudoers)

    Allow the agent to suspend, power off, or restart Sunshine cleanly without an interactive password prompt:
    ```bash
    sudo visudo -f /etc/sudoers.d/rigpulse
    ```
    Add the following rule (replace `gamer` with your Linux username):
    ```text
    gamer ALL=(ALL) NOPASSWD: /usr/bin/systemctl poweroff, /usr/bin/systemctl suspend, /usr/bin/systemctl start sunshine, /usr/bin/systemctl stop sunshine, /usr/bin/systemctl restart sunshine
    ```
    Lock down permissions on the sudoers drop-in:
    ```bash
    sudo chmod 0440 /etc/sudoers.d/rigpulse
    ```

    #### Install Public Key (`~/.ssh/authorized_keys`)

    On the target Linux machine, add your companion server's public key (`web/ssh/id_ed25519.pub`):

    **Option A: Locked-down Mode (Recommended)**
    Prefix your public key with a forced command restriction:
    ```text
    command="/usr/local/bin/rigpulse_agent.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 <PASTE_ID_ED25519_PUB_HERE> rigpulse-bridge
    ```

    **Option B: Standard Key Authentication**
    Append the raw public key string directly into `~/.ssh/authorized_keys`.

    **Set Strict POSIX Permissions**:
    ```bash
    chmod 700 ~/.ssh
    chmod 600 ~/.ssh/authorized_keys
    ```

---

## 5. Verifying Connection

From your Raspberry Pi terminal, test the connection to your gaming rig:

```bash
# Test capabilities discovery
ssh -i web/ssh/id_ed25519 gamer@192.168.1.100 capabilities

# Test instant system telemetry
ssh -i web/ssh/id_ed25519 gamer@192.168.1.100 sysinfo
```

If the JSON response returns cleanly, your bridge is fully operational!

---

## 6. Access the Web Dashboard

Point your browser to your companion's IP (e.g. `https://192.168.1.200/rigpulse`):

1. Enter your User or Admin password.
2. If your PC is offline, click **POWER ON** to send a Wake-on-LAN magic packet.
3. Once booted, monitor hardware vitals, trigger S3 sleep, or shut down cleanly with a single click.
