<?php
/**
 * RigPulse — Password Update Script
 * 
 * Run this to change User and Admin passwords non-destructively:
 *   php web/update_password.php
 * 
 * It will prompt for:
 *   1. User password (standard dashboard access)
 *   2. Admin password (access + Diagnostics HUD & advanced actions)
 * 
 * It updates ONLY the password hashes in web/config.php,
 * preserving all your existing target, MAC, IP, SSH, and Sunshine settings.
 */

// Guard: forbid any remote / web execution (CLI only)
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    die("This script must be run from the command line.\n");
}

$configPath = __DIR__ . '/config.php';

if (!file_exists($configPath)) {
    echo "╔══════════════════════════════════════════════╗\n";
    echo "║     RigPulse — Password Update Error         ║\n";
    echo "╚══════════════════════════════════════════════╝\n\n";
    echo "✗ Configuration file not found at: web/config.php\n";
    echo "  Please run 'php web/bootstrap.php' first to initialize your installation.\n\n";
    exit(1);
}

function promptPassword($label) {
    echo $label;
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

echo "╔══════════════════════════════════════════════╗\n";
echo "║     RigPulse — User & Admin Password Update  ║\n";
echo "╚══════════════════════════════════════════════╝\n\n";

// 1. User Password
$userPw = promptPassword("Enter User password: ");
if (strlen($userPw) < 4) {
    echo "✗ User password must be at least 4 characters.\n";
    exit(1);
}
$userConfirm = promptPassword("Confirm User password: ");
if ($userPw !== $userConfirm) {
    echo "✗ User passwords do not match.\n";
    exit(1);
}
$userHash = password_hash($userPw, PASSWORD_BCRYPT, ['cost' => 12]);

// 2. Admin Password
echo "\n";
$adminPw = promptPassword("Enter Admin password (for Diagnostics & advanced actions): ");
if (strlen($adminPw) < 4) {
    echo "✗ Admin password must be at least 4 characters.\n";
    exit(1);
}
if ($adminPw === $userPw) {
    echo "✗ Admin password must be different from User password.\n";
    exit(1);
}
$adminConfirm = promptPassword("Confirm Admin password: ");
if ($adminPw !== $adminConfirm) {
    echo "✗ Admin passwords do not match.\n";
    exit(1);
}
$adminHash = password_hash($adminPw, PASSWORD_BCRYPT, ['cost' => 12]);

// Non-destructive update of existing web/config.php
$content = file_get_contents($configPath);
$updated = $content;

// 1. Update array format ('user_password_hash' and 'admin_password_hash')
if (strpos($content, 'user_password_hash') !== false) {
    $updated = preg_replace_callback(
        "/'user_password_hash'\s*=>\s*('[^']*'|\"[^\"]*\")/",
        function () use ($userHash) {
            return "'user_password_hash'  => '{$userHash}'";
        },
        $updated
    );
    $updated = preg_replace_callback(
        "/'admin_password_hash'\s*=>\s*('[^']*'|\"[^\"]*\")/",
        function () use ($adminHash) {
            return "'admin_password_hash' => '{$adminHash}'";
        },
        $updated
    );
}

// 2. Update legacy define format if present
if (strpos($content, 'AUTH_PASSWORD_HASH') !== false) {
    $updated = preg_replace_callback(
        "/define\(\s*['\"]AUTH_PASSWORD_HASH['\"]\s*,\s*['\"][^'\"]*['\"]\s*\);/",
        function () use ($userHash) {
            return "define('AUTH_PASSWORD_HASH', '{$userHash}');";
        },
        $updated
    );
    $updated = preg_replace_callback(
        "/define\(\s*['\"]ADMIN_PASSWORD_HASH['\"]\s*,\s*['\"][^'\"]*['\"]\s*\);/",
        function () use ($adminHash) {
            return "define('ADMIN_PASSWORD_HASH', '{$adminHash}');";
        },
        $updated
    );
}

file_put_contents($configPath, $updated);
chmod($configPath, 0640);

echo "\n✓ Passwords successfully updated in web/config.php!\n";
echo "  (Target host, MAC, SSH keys, and ports were preserved intact)\n\n";
