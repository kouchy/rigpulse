<?php
/**
 * RigPulse — Guided First-Time Bootstrap & Initialization Wizard
 * 
 * Run this once after cloning the repository:
 *   php web/bootstrap.php
 * 
 * It will:
 *   1. Read default values dynamically from web/config.tpl.php (no hardcoded config)
 *   2. Prompt for key target machine, network, SSH, and Sunshine settings
 *   3. Prompt and securely hash User and Admin passwords (BCrypt cost 12)
 *   4. Generate web/config.php with strict permissions (0640)
 *   5. Create ssh/ and data/ directories with security .htaccess protections
 * 
 * Strict PHP 7.0+ Compatibility (No typed properties, no match, no arrow functions).
 */

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    die("This script must be run from the command line.\n");
}

$webDir     = __DIR__;
$rootDir    = dirname(__DIR__);
$configPath = $webDir . '/config.php';
$tplPath    = $webDir . '/config.tpl.php';

echo "\n";
echo "╔════════════════════════════════════════════════════════════╗\n";
echo "║             ⚡ RigPulse — Installation Wizard ⚡             ║\n";
echo "╚════════════════════════════════════════════════════════════╝\n\n";

// Guard: refuse execution if web/config.php already exists
if (file_exists($configPath)) {
    echo "✗ Configuration file already exists at: web/config.php\n\n";
    echo "  • To change your passwords: run 'php web/update_password.php'\n";
    echo "  • To reconfigure from scratch: delete 'web/config.php' and rerun 'php web/bootstrap.php'\n\n";
    exit(1);
}

// Ensure template file exists
if (!file_exists($tplPath)) {
    echo "✗ Error: Configuration template not found at: web/config.tpl.php\n\n";
    exit(1);
}

// Load default values dynamically from template file (NO hardcoded configuration)
$defaults = include $tplPath;
if (!is_array($defaults)) {
    echo "✗ Error: Configuration template at web/config.tpl.php did not return a valid configuration array.\n\n";
    exit(1);
}

// Helper: prompt with default fallback
function promptWithDefault($label, $default) {
    echo "  " . $label . " [" . $default . "]: ";
    $line = fgets(STDIN);
    if ($line === false) {
        echo "\n";
        return $default;
    }
    $val = trim($line);
    return (strlen($val) > 0) ? $val : $default;
}

// Helper: prompt hidden password
function promptPassword($label) {
    echo "  " . $label;
    $isTty = function_exists('posix_isatty') && posix_isatty(STDIN);
    if ($isTty) {
        system('stty -echo 2>/dev/null');
        $line = fgets(STDIN);
        system('stty echo 2>/dev/null');
        echo "\n";
    } else {
        $line = fgets(STDIN);
        if ($line !== false) {
            echo "\n";
        }
    }
    if ($line === false) {
        die("\n✗ Unexpected end of input.\n");
    }
    return trim($line);
}

// Helper: format path for display (relative to root if within project)
function formatPathForDisplay($path, $rootDir) {
    $normPath = str_replace('\\', '/', $path);
    $normRoot = str_replace('\\', '/', $rootDir);
    if (strpos($normPath, $normRoot . '/') === 0) {
        return substr($normPath, strlen($normRoot) + 1);
    }
    return $path;
}

// Helper: resolve user input into absolute path
function resolveAbsolutePath($input, $rootDir) {
    $input = trim($input);
    if ($input === '') {
        return '';
    }
    if ($input[0] === '/' || (strlen($input) > 2 && $input[1] === ':')) {
        return rtrim($input, '/\\');
    }
    return rtrim($rootDir . '/' . ltrim($input, '/\\'), '/\\');
}

// Helper: convert absolute path into a clean, portable PHP expression for config.php
function toPhpPathExpr($absPath, $webDir, $rootDir) {
    $normAbs  = str_replace('\\', '/', $absPath);
    $normWeb  = str_replace('\\', '/', $webDir);
    $normRoot = str_replace('\\', '/', $rootDir);

    if ($normAbs === $normWeb) {
        return '__DIR__';
    }
    if (strpos($normAbs, $normWeb . '/') === 0) {
        $rel = substr($normAbs, strlen($normWeb));
        return "__DIR__ . '" . $rel . "'";
    }
    if ($normAbs === $normRoot) {
        return 'dirname(__DIR__)';
    }
    if (strpos($normAbs, $normRoot . '/') === 0) {
        $rel = substr($normAbs, strlen($normRoot));
        return "dirname(__DIR__) . '" . $rel . "'";
    }
    return "'" . addcslashes($normAbs, "'\\") . "'";
}

// ── 1. Target Machine Configuration ───────────────────────────
echo "┌── 1. TARGET MACHINE CONFIGURATION ───────────────────────────┐\n";
echo "  The 'Target' is the remote gaming rig or PC that you want to\n";
echo "  power on via Wake-on-LAN (WOL), monitor, and control remotely.\n\n";

$defName         = $defaults['target']['name'];
$defHost         = $defaults['target']['host'];
$defPublicDomain = (string) $defaults['target']['public_domain'];
$defMac          = $defaults['target']['mac'];
$defBroadcast    = $defaults['target']['broadcast'];
$defWolPort      = (int) $defaults['target']['wol_port'];
$defPingSec      = (int) $defaults['target']['ping_timeout'];

$targetName         = promptWithDefault("Target display name (friendly label for the UI)", $defName);
$targetHost         = promptWithDefault("Target IP or hostname (used for ICMP ping & reachability)", $defHost);
$targetPublicDomain = promptWithDefault("Target public domain / WAN hostname for UI badge & WAN latency ping (or leave blank)", $defPublicDomain);
$targetMac          = promptWithDefault("Target Ethernet MAC address (required for WOL magic packet)", $defMac);
$targetBroadcast    = promptWithDefault("Subnet broadcast address (e.g. 192.168.1.255)", $defBroadcast);
$targetWolPort      = (int) promptWithDefault("WOL UDP destination port (standard is 9, sometimes 7)", (string)$defWolPort);
$targetPingSec      = (int) promptWithDefault("ICMP ping reachability timeout in seconds", (string)$defPingSec);

echo "\n";

// ── 2. SSH Bridge Configuration ───────────────────────────────
echo "┌── 2. SSH BRIDGE CONFIGURATION ───────────────────────────────┐\n";
echo "  The 'SSH Bridge' allows RigPulse to connect to your gaming rig\n";
echo "  to trigger power actions (sleep, shutdown) and collect live\n";
echo "  telemetry (CPU/GPU load, temps, power watts, active apps).\n";
echo "  An OpenSSH server must be installed & running on the target PC.\n\n";

$defSshUser = $defaults['ssh']['user'];
$defSshPort = (int) $defaults['ssh']['port'];

// Directory & key filename from template defaults
$defSshDirRaw   = $defaults['ssh']['dir'];
$displaySshDir  = formatPathForDisplay($defSshDirRaw, $rootDir);
$defKeyFilename = $defaults['ssh']['key_filename'];

$sshUser       = promptWithDefault("Target SSH username (remote user account on gaming rig)", $defSshUser);
$sshPort       = (int) promptWithDefault("Target SSH port (default OpenSSH port is 22)", (string)$defSshPort);
$inputSshDir   = promptWithDefault("SSH keys storage directory", $displaySshDir);
$sshDir        = resolveAbsolutePath($inputSshDir, $rootDir);

$keyFilename   = promptWithDefault("Private SSH key filename (inside the SSH directory)", $defKeyFilename);
$sshKey        = $sshDir . '/' . ltrim($keyFilename, '/\\');

$genSshKey = false;
if (!file_exists($sshKey)) {
    if (!is_dir($sshDir)) {
        echo "  ℹ SSH directory does not exist yet. RigPulse can generate a new key pair for you.\n";
    } else {
        echo "  ℹ SSH key file not found. RigPulse can generate a new key pair for you.\n";
    }
    $genChoice = strtolower(promptWithDefault("Generate a new Ed25519 SSH key pair now? (Y/n)", "Y"));
    $genSshKey = ($genChoice === 'y' || $genChoice === 'yes');
}

echo "\n";

// ── 3. Data & Audit Directory ─────────────────────────────────
echo "┌── 3. DATA & AUDIT DIRECTORY ─────────────────────────────────┐\n";
echo "  RigPulse keeps an audit history log of power actions.\n";
echo "  This directory will be protected against direct HTTP access.\n\n";

$defDataDirRaw      = $defaults['history']['dir'];
$displayDataDir     = formatPathForDisplay($defDataDirRaw, $rootDir);
$defActionsFilename = $defaults['history']['actions_filename'];

$inputDataDir    = promptWithDefault("Data & audit directory", $displayDataDir);
$dataDir         = resolveAbsolutePath($inputDataDir, $rootDir);
$actionsFilename = promptWithDefault("Actions log filename (inside data directory)", $defActionsFilename);
$actionsFile     = $dataDir . '/' . ltrim($actionsFilename, '/\\');

echo "\n";

// ── 4. Sunshine Streaming Monitor ─────────────────────────────
echo "┌── 4. SUNSHINE STREAMING MONITOR ─────────────────────────────┐\n";
echo "  Sunshine is the open-source game stream host (for Moonlight).\n";
echo "  RigPulse can monitor its HTTP/HTTPS/RTSP ports and display\n";
echo "  whether an active game streaming session is currently running.\n\n";

$defSunshine = !empty($defaults['sunshine']['enabled']) ? 'Y' : 'n';
$sunChoice   = strtolower(promptWithDefault("Enable Sunshine port & stream monitoring? (Y/n)", $defSunshine));
$sunshineEnabled = ($sunChoice === 'y' || $sunChoice === 'yes');

echo "\n";

// ── 5. Dashboard Passwords ───────────────────────────────────
echo "┌── 5. DASHBOARD PASSWORDS ────────────────────────────────────┐\n";
echo "  RigPulse uses two distinct access tiers for security:\n";
echo "    • USER : Standard access to wake, sleep, power off & view stream.\n";
echo "    • ADMIN: Full access + unlocks the Diagnostics HUD\n";
echo "             (live CPU/GPU load graphs, temps, wattage, active apps).\n\n";

// 4.1 User password
while (true) {
    $userPw = promptPassword("Enter User password (min 4 chars): ");
    if (strlen($userPw) < 4) {
        echo "  ✗ Password too short. Please use at least 4 characters.\n";
        continue;
    }
    $userConfirm = promptPassword("Confirm User password: ");
    if ($userPw !== $userConfirm) {
        echo "  ✗ Passwords do not match. Please re-enter.\n";
        continue;
    }
    break;
}
$userHash = password_hash($userPw, PASSWORD_BCRYPT, ['cost' => 12]);

echo "\n";

// 4.2 Admin password
while (true) {
    $adminPw = promptPassword("Enter Admin password (for Diagnostics & advanced actions): ");
    if (strlen($adminPw) < 4) {
        echo "  ✗ Password too short. Please use at least 4 characters.\n";
        continue;
    }
    if ($adminPw === $userPw) {
        echo "  ✗ Admin password must be different from User password.\n";
        continue;
    }
    $adminConfirm = promptPassword("Confirm Admin password: ");
    if ($adminPw !== $adminConfirm) {
        echo "  ✗ Passwords do not match. Please re-enter.\n";
        continue;
    }
    break;
}
$adminHash = password_hash($adminPw, PASSWORD_BCRYPT, ['cost' => 12]);

echo "\n";

// ── 6. Directory Initialization & Security ────────────────────
echo "┌── 6. INITIALIZING SECURE DIRECTORIES ────────────────────────┐\n";

// 6.1 ssh/ directory
if (!is_dir($sshDir)) {
    mkdir($sshDir, 0700, true);
    echo "  ✓ Created directory: " . formatPathForDisplay($sshDir, $rootDir) . " (permissions 0700)\n";
}
$sshHtaccess = $sshDir . '/.htaccess';
if (!file_exists($sshHtaccess)) {
    $htaccessContent = "# Apache 2.4+\n<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n\n# Apache 2.2 fallback\n<IfModule !mod_authz_core.c>\n    Order deny,allow\n    Deny from all\n</IfModule>\n";
    file_put_contents($sshHtaccess, $htaccessContent);
    chmod($sshHtaccess, 0644);
    echo "  ✓ Created " . formatPathForDisplay($sshHtaccess, $rootDir) . " (blocked all HTTP access)\n";
}

// 6.1.1 SSH key pair generation
$keyGenerated = false;
if ($genSshKey && !file_exists($sshKey)) {
    $keygenCheck = trim((string)shell_exec('which ssh-keygen 2>/dev/null'));
    if ($keygenCheck !== '') {
        $cmd = sprintf(
            'ssh-keygen -t ed25519 -N %s -f %s -C %s 2>&1',
            escapeshellarg(''),
            escapeshellarg($sshKey),
            escapeshellarg('rigpulse-bridge')
        );
        $keygenOutput = [];
        $keygenReturn = 0;
        exec($cmd, $keygenOutput, $keygenReturn);
        if ($keygenReturn === 0 && file_exists($sshKey)) {
            chmod($sshKey, 0600);
            if (file_exists($sshKey . '.pub')) {
                chmod($sshKey . '.pub', 0644);
            }
            $keyGenerated = true;
            echo "  ✓ Generated new Ed25519 SSH key pair:\n";
            echo "    • Private key: " . formatPathForDisplay($sshKey, $rootDir) . " (permissions 0600)\n";
            if (file_exists($sshKey . '.pub')) {
                echo "    • Public key : " . formatPathForDisplay($sshKey . '.pub', $rootDir) . "\n";
            }
        } else {
            echo "  ⚠ Failed to generate SSH key: " . implode(' ', $keygenOutput) . "\n";
        }
    } else {
        echo "  ⚠ 'ssh-keygen' command not found. Skipping automated key generation.\n";
    }
}

// 6.2 data/ directory
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0750, true);
    echo "  ✓ Created directory: " . formatPathForDisplay($dataDir, $rootDir) . " (permissions 0750)\n";
}
$dataHtaccess = $dataDir . '/.htaccess';
if (!file_exists($dataHtaccess)) {
    $htaccessContent = "# Apache 2.4+\n<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n\n# Apache 2.2 fallback\n<IfModule !mod_authz_core.c>\n    Order deny,allow\n    Deny from all\n</IfModule>\n";
    file_put_contents($dataHtaccess, $htaccessContent);
    chmod($dataHtaccess, 0644);
    echo "  ✓ Created " . formatPathForDisplay($dataHtaccess, $rootDir) . " (blocked all HTTP access)\n";
}
if (!file_exists($actionsFile)) {
    file_put_contents($actionsFile, "[]\n");
    chmod($actionsFile, 0660);
    echo "  ✓ Initialized audit log: " . formatPathForDisplay($actionsFile, $rootDir) . "\n";
}

echo "\n";

// ── 7. Generate web/config.php from web/config.tpl.php ─────────
echo "┌── 7. GENERATING CONFIGURATION ───────────────────────────────┐\n";

// Read the raw template file directly
$tplContent = file_get_contents($tplPath);

// 1. Remove the direct access protection guard from the generated config
$cfg = preg_replace("/\/\/ Guard: allow only inclusion.*?\n\}\n+/s", "", $tplContent);

// 2. Update docblock title
$cfg = str_replace(
    "RigPulse — Configuration Template",
    "RigPulse — Application Configuration\n * Generated by web/bootstrap.php on: " . date('Y-m-d H:i:s'),
    $cfg
);
$cfg = str_replace(
    " * Direct HTTP access is forbidden.\n * Used by web/bootstrap.php to generate web/config.php.\n",
    " * DO NOT commit your production config.php to version control.\n",
    $cfg
);

// 3. Substitute configured values non-destructively
// Target settings
$cfg = preg_replace_callback("/('name'\s*=>\s*)'[^']*'/", function($m) use ($targetName) {
    return $m[1] . "'" . addcslashes($targetName, "'\\") . "'";
}, $cfg, 1);

$cfg = preg_replace_callback("/('host'\s*=>\s*)'[^']*'/", function($m) use ($targetHost) {
    return $m[1] . "'" . addcslashes($targetHost, "'\\") . "'";
}, $cfg, 1);

$cfg = preg_replace_callback("/('public_domain'\s*=>\s*)[^,\n]+/", function($m) use ($targetPublicDomain) {
    return $targetPublicDomain !== '' ? $m[1] . "'" . addcslashes($targetPublicDomain, "'\\") . "'" : $m[1] . 'null';
}, $cfg, 1);

$cfg = preg_replace_callback("/('mac'\s*=>\s*)'[^']*'/", function($m) use ($targetMac) {
    return $m[1] . "'" . addcslashes($targetMac, "'\\") . "'";
}, $cfg, 1);

$cfg = preg_replace_callback("/('broadcast'\s*=>\s*)'[^']*'/", function($m) use ($targetBroadcast) {
    return $m[1] . "'" . addcslashes($targetBroadcast, "'\\") . "'";
}, $cfg, 1);

$cfg = preg_replace_callback("/('wol_port'\s*=>\s*)\d+/", function($m) use ($targetWolPort) {
    return $m[1] . $targetWolPort;
}, $cfg, 1);

$cfg = preg_replace_callback("/('ping_timeout'\s*=>\s*)\d+/", function($m) use ($targetPingSec) {
    return $m[1] . $targetPingSec;
}, $cfg, 1);

// SSH settings
$cfg = preg_replace_callback("/('user'\s*=>\s*)'[^']*'/", function($m) use ($sshUser) {
    return $m[1] . "'" . addcslashes($sshUser, "'\\") . "'";
}, $cfg, 1);

// SSH host (in ssh section, replace the second host occurrence if present)
$cfg = preg_replace_callback("/('ssh'\s*=>\s*\[.*?'host'\s*=>\s*)'[^']*'/s", function($m) use ($targetHost) {
    return $m[1] . "'" . addcslashes($targetHost, "'\\") . "'";
}, $cfg, 1);

$cfg = preg_replace_callback("/('ssh'\s*=>\s*\[.*?'port'\s*=>\s*)\d+/s", function($m) use ($sshPort) {
    return $m[1] . $sshPort;
}, $cfg, 1);

// Paths for SSH and Data
$sshDirExpr  = toPhpPathExpr($sshDir, $webDir, $rootDir);
$dataDirExpr = toPhpPathExpr($dataDir, $webDir, $rootDir);

// SSH dir & key filename
$cfg = preg_replace_callback("/('ssh'\s*=>\s*\[.*?'dir'\s*=>\s*)[^,\n]+/s", function($m) use ($sshDirExpr) {
    return $m[1] . $sshDirExpr;
}, $cfg, 1);

$cfg = preg_replace_callback("/('key_filename'\s*=>\s*)'[^']*'/", function($m) use ($keyFilename) {
    return $m[1] . "'" . addcslashes($keyFilename, "'\\") . "'";
}, $cfg, 1);

// History dir & actions filename
$cfg = preg_replace_callback("/('history'\s*=>\s*\[.*?'dir'\s*=>\s*)[^,\n]+/s", function($m) use ($dataDirExpr) {
    return $m[1] . $dataDirExpr;
}, $cfg, 1);

$cfg = preg_replace_callback("/('actions_filename'\s*=>\s*)'[^']*'/", function($m) use ($actionsFilename) {
    return $m[1] . "'" . addcslashes($actionsFilename, "'\\") . "'";
}, $cfg, 1);

// Passwords
$cfg = preg_replace_callback("/('user_password_hash'\s*=>\s*)'[^']*'/", function($m) use ($userHash) {
    return $m[1] . "'" . $userHash . "'";
}, $cfg, 1);

$cfg = preg_replace_callback("/('admin_password_hash'\s*=>\s*)'[^']*'/", function($m) use ($adminHash) {
    return $m[1] . "'" . $adminHash . "'";
}, $cfg, 1);

// Sunshine
$sunshineBoolStr = $sunshineEnabled ? 'true' : 'false';
$cfg = preg_replace_callback("/('sunshine'\s*=>\s*\[.*?'enabled'\s*=>\s*)(true|false)/s", function($m) use ($sunshineBoolStr) {
    return $m[1] . $sunshineBoolStr;
}, $cfg, 1);

file_put_contents($configPath, $cfg);
chmod($configPath, 0640);

echo "  ✓ Configuration written to: web/config.php (permissions 0640)\n\n";

// ── 8. Summary & Next Steps ───────────────────────────────────
echo "╔══════════════════════════════════════════════════════════╗\n";
echo "║                 🎉 RigPulse is Ready! 🎉                 ║\n";
echo "╚══════════════════════════════════════════════════════════╝\n\n";
echo "Next steps:\n";

if ($keyGenerated && file_exists($sshKey . '.pub')) {
    $pubKey = trim(file_get_contents($sshKey . '.pub'));
    $lockedLine = 'command="powershell -ExecutionPolicy Bypass -NonInteractive -File C:\ProgramData\ssh\rigpulse_agent.ps1",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ' . $pubKey;

    echo "  1. Authorize your generated public SSH key on the target gaming rig:\n\n";
    echo "     🔑 Public Key:\n";
    echo "        " . $pubKey . "\n\n";
    echo "     🔒 Locked-Down Line (Windows Recommended — restricts SSH to the agent script):\n";
    echo "        " . $lockedLine . "\n\n";
    echo "     • Windows : Append to C:\\ProgramData\\ssh\\administrators_authorized_keys\n";
    echo "     • Linux   : Append to ~/.ssh/authorized_keys\n\n";
    echo "  2. Start the local development server:\n";
    echo "     php -S 0.0.0.0:8000 -t web/\n\n";
    echo "  3. Open in your browser: http://localhost:8000\n\n";
} else {
    echo "  1. Copy your private SSH key (without passphrase) to:\n";
    echo "     " . formatPathForDisplay($sshKey, $rootDir) . "\n";
    echo "     chmod 600 " . formatPathForDisplay($sshKey, $rootDir) . "\n\n";
    echo "  2. Ensure your target gaming rig has authorized this key in:\n";
    echo "     • Windows : C:\\ProgramData\\ssh\\administrators_authorized_keys\n";
    echo "     • Linux   : ~/.ssh/authorized_keys\n\n";
    echo "  3. Start the local development server:\n";
    echo "     php -S 0.0.0.0:8000 -t web/\n\n";
    echo "  4. Open in your browser: http://localhost:8000\n\n";
}

echo "  • To update passwords later: php web/update_password.php\n\n";
