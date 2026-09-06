<?php
/**
 * RigPulse — REST API Entrypoint & Controller
 * 
 * Provides unified management, power controls, and real-time telemetry for remote rigs.
 * Strict PHP 7.0+ Compatibility (No typed properties, no match, no arrow functions).
 */

// ─── HTTP Security & JSON Response Headers ───────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');

// ─── Class Autoloader & Core Modules ──────────────────────────────────
spl_autoload_register(function ($class) {
    $prefix = 'RigPulse\\';
    $baseDir = __DIR__ . '/php/';
    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }
    $relativeClass = substr($class, $len);
    $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';
    if (file_exists($file)) {
        require_once $file;
    }
});

// Core server modules
require_once __DIR__ . '/php/Config.php';
require_once __DIR__ . '/php/Auth.php';
require_once __DIR__ . '/php/Wol.php';
require_once __DIR__ . '/php/SshBridge.php';
require_once __DIR__ . '/php/SunshineService.php';
require_once __DIR__ . '/php/ActionLogger.php';
require_once __DIR__ . '/php/Router.php';

// ─── Bootstrap Environment & Session ──────────────────────────────────
try {
    \RigPulse\Config::load();
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage(),
    ]);
    exit;
}
\RigPulse\Auth::initSession();

// ─── Legacy Procedural Bridge Functions ──────────────────────────────
// Maintained for backward compatibility with external scripts.

if (!function_exists('isAuthenticated')) {
    function isAuthenticated(): bool {
        return \RigPulse\Auth::isAuthenticated();
    }
}

if (!function_exists('isAdmin')) {
    function isAdmin(): bool {
        return \RigPulse\Auth::isAdmin();
    }
}

if (!function_exists('requireAuth')) {
    function requireAuth() {
        \RigPulse\Auth::requireAuth();
    }
}

if (!function_exists('requireAdminAuth')) {
    function requireAdminAuth() {
        \RigPulse\Auth::requireAdminAuth();
    }
}

if (!function_exists('generateCsrfToken')) {
    function generateCsrfToken(): string {
        return \RigPulse\Auth::generateCsrfToken();
    }
}

if (!function_exists('requireCsrf')) {
    function requireCsrf() {
        \RigPulse\Auth::requireCsrf();
    }
}

if (!function_exists('readActions')) {
    function readActions(): array {
        return \RigPulse\ActionLogger::read();
    }
}

if (!function_exists('logAction')) {
    function logAction(string $action, string $result) {
        \RigPulse\ActionLogger::log($action, $result);
    }
}

if (!function_exists('checkActionLock')) {
    function checkActionLock() {
        return \RigPulse\ActionLogger::checkLock();
    }
}

if (!function_exists('getLastPowerAction')) {
    function getLastPowerAction() {
        return \RigPulse\ActionLogger::getLastPowerAction();
    }
}

if (!function_exists('isClientLocal')) {
    function isClientLocal(): bool {
        return \RigPulse\ActionLogger::isClientLocal();
    }
}

if (!function_exists('toUtf8')) {
    function toUtf8($data) {
        return \RigPulse\SshBridge::toUtf8($data);
    }
}

if (!function_exists('sshExec')) {
    function sshExec(string $command, $timeout = null): array {
        return \RigPulse\SshBridge::exec($command, $timeout);
    }
}

// ─── Dispatch Request ────────────────────────────────────────────────
\RigPulse\Router::handle();
