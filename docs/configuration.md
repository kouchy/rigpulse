# Configuration Reference (`web/config.php`)

All operational parameters in RigPulse are centralized within a single file: `web/config.php`.

This file returns an associative array structured into logical sections. It is created interactively when you run `php web/bootstrap.php` from the template `web/config.tpl.php`.

---

## Complete Configuration Schema

```php
return [
    'target'    => [ ... ],
    'ssh'       => [ ... ],
    'auth'      => [ ... ],
    'sunshine'  => [ ... ],
    'history'   => [ ... ],
    'client'    => [ ... ],
];
```

---

## 1. `target` Section

Configures the physical machine being controlled and monitored.

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `name` | `string` | `'GamingRig'` | Human-readable name of the machine displayed in the HUD and dialogs. |
| `host` | `string` | `'192.168.1.100'` | Target machine IP address or local DNS hostname. |
| `public_domain` | `string\|null` | `null` | Optional public domain or FQDN for the UI badge and WAN ping (e.g. `'gaming.example.com'`). |
| `mac` | `string` | `'00:11:22:33:44:55'` | Physical Ethernet MAC address required to build Wake-on-LAN magic packets. |
| `broadcast` | `string` | `'192.168.1.255'` | Subnet directed broadcast IP address used to send UDP magic packets. |
| `wol_port` | `int` | `9` | UDP destination port for WOL packets (typically 7 or 9). |
| `ping_timeout` | `int` | `2` | Timeout in seconds for ICMP ping reachability probes. |
| `port_timeout` | `int` | `1` | Timeout in seconds for TCP port checks (SSH and Sunshine). |

---

## 2. `ssh` Section

Configures the SSH remote command bridge between the companion server and target host.

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `user` | `string` | `'gamer'` | Remote username configured on target machine OpenSSH. |
| `host` | `string` | *(falls back to `target.host`)* | SSH host address (if different from primary IP). |
| `port` | `int` | `22` | SSH daemon listening port. |
| `dir` | `string` | `__DIR__ . '/ssh'` | Directory containing private SSH keys. |
| `key_filename` | `string` | `'id_ed25519'` | Filename of the private SSH key inside `dir`. |
| `timeout` | `int` | `5` | Connection timeout in seconds before aborting an SSH command. |

---

## 3. `auth` Section

Configures access credentials, roles, and session persistence.

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `user_password_hash` | `string` | *(bcrypt hash)* | Bcrypt hash for standard user access. Generated via `php web/bootstrap.php` or `php web/update_password.php`. |
| `admin_password_hash` | `string` | *(bcrypt hash)* | Bcrypt hash for admin access (required for Diagnostics HUD and advanced power controls). |
| `session_lifetime` | `int` | `86400` | Session cookie validity duration in seconds (86400 = 24 hours). |

---

## 4. `sunshine` Section

Configures Sunshine game streaming health probes and controls.

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `enabled` | `bool` | `true` | When `true`, displays the Sunshine status bar and port probes in the UI. |
| `wan_host` | `string\|null`| `null` | Optional external public hostname for WAN latency testing (e.g. `play.mydomain.com`). If null, latency tests probe local `target.host`. |
| `ports` | `array` | *(4 ports)* | List of TCP ports probed to determine Sunshine service health. |

Default ports:
```php
'ports' => [
    ['port' => 48010, 'name' => 'RTSP',   'desc' => 'Handshake'],
    ['port' => 47984, 'name' => 'HTTPS',  'desc' => 'Sunshine API'],
    ['port' => 47989, 'name' => 'HTTP',   'desc' => 'Sunshine HTTP'],
    ['port' => 47990, 'name' => 'Web UI', 'desc' => 'Admin Panel'],
],
```

---

## 5. `history` Section

Configures the persistent audit log file and concurrency locks.

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `dir` | `string` | `__DIR__ . '/data'` | Directory containing audit log files. |
| `actions_filename` | `string` | `'actions.json'` | Filename of the audit log JSON storage file inside `dir`. |
| `actions_max` | `int` | `10000` | Maximum number of historical records preserved on disk (~1.5 MB). |
| `actions_display_max`| `int` | `100` | Maximum number of entries returned to the UI history modal. |
| `action_lock_seconds`| `int` | `30` | Duration of the concurrency lock after a power command is issued. |

---

## 6. `client` Section

Configures frontend dashboard defaults sent to the browser upon initialization.

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `default_gpu_mode` | `string` | `'eco'` | Initial performance mode for both desktop and mobile (`'eco'`, `'light'`, or `'heavy'`). No difference between devices. |
| `default_pipeline_speed` | `int` | `1` | Default diagnostic telemetry polling speed: `1` (3s), `2` (1.5s), or `3` (750ms). |
| `default_metric` | `string` | `'power'` | Secondary metric displayed on the CPU telemetry chart (`'power'` for Watts or `'temp'` for °C). |
| `poll_interval_ms` | `int` | `3000` | Host reachability status check interval in milliseconds. |
| `poll_booting_ms` | `int` | `2000` | Accelerated polling interval when the machine is transitioning/booting up. |
| `sunshine_poll_ms` | `int` | `3000` | Sunshine streaming service check interval in milliseconds. |
| `uptime_poll_ms` | `int` | `10000` | System uptime query interval in milliseconds. |
| `chart_history_max` | `int` | `60` | Number of sliding data points preserved on real-time charts. |
| `cpu_power_max_watts` | `int` | `150` | Baseline CPU power wattage ceiling for chart right-axis scaling. Auto-scales upward if higher readings are recorded. |

