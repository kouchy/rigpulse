<?php
/**
 * RigPulse — HTTP API Router & Action Dispatcher
 * 
 * Strict PHP 7.0+ Compatibility (No typed properties, no match, no arrow functions).
 */

namespace RigPulse;

class Router
{
    /**
     * Dispatch the current HTTP request.
     */
    public static function handle()
    {
        $action = isset($_GET['action']) ? $_GET['action'] : 'status';

        switch ($action) {
            // ── Public Application Configuration Bootstrap ───────────
            case 'config':
                echo json_encode(Config::getPublicConfig());
                break;

            // ── Authentication ───────────────────────────────────────
            case 'auth':
                if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                    http_response_code(405);
                    echo json_encode(['success' => false, 'message' => 'POST required']);
                    break;
                }

                $input = json_decode(file_get_contents('php://input'), true);
                $password = (is_array($input) && isset($input['password'])) ? (string)$input['password'] : '';

                $result = Auth::authenticate($password);
                http_response_code($result['status']);
                echo json_encode($result['payload']);
                break;

            // ── Logout ───────────────────────────────────────────────
            case 'logout':
                echo json_encode(Auth::logout());
                break;

            // ── Host Reachability & System Status ────────────────────
            case 'status':
                Auth::requireAuth();

                // Ensure CSRF token exists for session
                if (empty($_SESSION['csrf_token'])) {
                    Auth::generateCsrfToken();
                }
                $csrfToken = $_SESSION['csrf_token'];
                $role = isset($_SESSION['role']) ? $_SESSION['role'] : 'user';

                // Release session lock before network checks
                if (session_status() === PHP_SESSION_ACTIVE) {
                    session_write_close();
                }

                $host = Config::get('target.host');
                $isUp = false;
                $ip   = null;

                // Resolve hostname
                $resolved = @gethostbyname($host);
                if ($resolved !== $host) {
                    $ip = $resolved;
                }

                // ICMP ping probe
                $pingTimeout = (int) Config::get('target.ping_timeout', 2);
                $pingCmd = sprintf('ping -c 1 -W %d %s > /dev/null 2>&1', $pingTimeout, escapeshellarg($host));
                $output = [];
                $returnCode = 0;
                exec($pingCmd, $output, $returnCode);
                $isUp = ($returnCode === 0);

                if (!$isUp) {
                    $ip = null;
                }

                // Check SSH reachability when host is up
                $sshReady = false;
                if ($isUp) {
                    $sshReady = SshBridge::isSshReachable(2);
                }

                echo json_encode([
                    'status'            => $isUp ? 'up' : 'down',
                    'ip'                => $ip,
                    'host'              => $host,
                    'ssh_ready'         => $sshReady,
                    'csrf_token'        => $csrfToken,
                    'role'              => $role,
                    'client_is_local'   => ActionLogger::isClientLocal(),
                    'last_power_action' => $isUp ? null : ActionLogger::getLastPowerAction(),
                ]);
                break;

            // ── Shutdown Target Host via SSH ─────────────────────────
            case 'shutdown':
                Auth::requireAuth();
                if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                    http_response_code(405);
                    echo json_encode(['success' => false, 'message' => 'POST required']);
                    break;
                }
                Auth::requireCsrf();

                $lock = ActionLogger::checkLock();
                if ($lock) {
                    http_response_code(409);
                    echo json_encode([
                        'success' => false,
                        'message' => 'Action in progress by ' . $lock['ip'] . ' (' . $lock['action'] . ')',
                        'lock'    => $lock,
                    ]);
                    break;
                }

                $result = SshBridge::exec('shutdown');
                if (isset($result['ssh_ready']) && !$result['ssh_ready']) {
                    ActionLogger::log('shutdown', 'fail');
                    echo json_encode($result);
                } else {
                    ActionLogger::log('shutdown', 'success');
                    echo json_encode([
                        'success' => true,
                        'message' => 'Shutdown command sent to ' . Config::get('target.name', 'host'),
                    ]);
                }
                break;

            // ── Suspend / Sleep (S3) Target Host via SSH ─────────────
            case 'sleep':
                Auth::requireAuth();
                if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                    http_response_code(405);
                    echo json_encode(['success' => false, 'message' => 'POST required']);
                    break;
                }
                Auth::requireCsrf();

                $lock = ActionLogger::checkLock();
                if ($lock) {
                    http_response_code(409);
                    echo json_encode([
                        'success' => false,
                        'message' => 'Action in progress by ' . $lock['ip'] . ' (' . $lock['action'] . ')',
                        'lock'    => $lock,
                    ]);
                    break;
                }

                $result = SshBridge::exec('sleep');
                if (isset($result['ssh_ready']) && !$result['ssh_ready']) {
                    ActionLogger::log('sleep', 'fail');
                    echo json_encode($result);
                } else {
                    ActionLogger::log('sleep', 'success');
                    echo json_encode([
                        'success' => true,
                        'message' => Config::get('target.name', 'Host') . ' is going to sleep (S3)',
                    ]);
                }
                break;

            // ── Sunshine Service Control via SSH ─────────────────────
            case 'sunshine_ctl':
                Auth::requireAuth();
                if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                    http_response_code(405);
                    echo json_encode(['success' => false, 'message' => 'POST required']);
                    break;
                }
                Auth::requireCsrf();

                $input = json_decode(file_get_contents('php://input'), true);
                $cmd = (is_array($input) && isset($input['cmd'])) ? (string)$input['cmd'] : '';

                $res = SunshineService::control($cmd);
                http_response_code($res['status']);
                echo json_encode($res['payload']);
                break;

            // ── Wake-on-LAN Magic Packet Broadcast ───────────────────
            case 'wol':
                Auth::requireAuth();
                if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                    http_response_code(405);
                    echo json_encode(['success' => false, 'message' => 'POST required']);
                    break;
                }
                Auth::requireCsrf();

                $lock = ActionLogger::checkLock();
                if ($lock) {
                    http_response_code(409);
                    echo json_encode([
                        'success' => false,
                        'message' => 'Action in progress by ' . $lock['ip'] . ' (' . $lock['action'] . ')',
                        'lock'    => $lock,
                    ]);
                    break;
                }

                $result = Wol::send();
                ActionLogger::log('wol', $result['success'] ? 'success' : 'fail');
                echo json_encode($result);
                break;

            // ── Sunshine Streaming Port Probes ───────────────────────
            case 'sunshine':
                Auth::requireAuth();
                if (session_status() === PHP_SESSION_ACTIVE) {
                    session_write_close();
                }
                echo json_encode(SunshineService::checkPorts());
                break;

            // ── Target Machine Uptime via Agent ──────────────────────
            case 'uptime':
                Auth::requireAuth();
                if (session_status() === PHP_SESSION_ACTIVE) {
                    session_write_close();
                }

                $result = SshBridge::exec('uptime');
                if ($result['success'] && !empty($result['output'])) {
                    $raw = trim($result['output']);
                    if (preg_match('/(?:\d+d\s+)?\d+h\s+\d+m/', $raw, $matches)) {
                        echo json_encode([
                            'success' => true,
                            'uptime'  => $matches[0],
                        ]);
                        break;
                    }
                }
                echo json_encode([
                    'success' => false,
                    'uptime'  => null,
                ]);
                break;

            // ── Audit History & Active Locks ─────────────────────────
            case 'history':
                Auth::requireAuth();
                if (session_status() === PHP_SESSION_ACTIVE) {
                    session_write_close();
                }

                $displayMax = (int) Config::get('history.actions_display_max', 100);
                $actions = ActionLogger::read();
                $recent = array_reverse(array_slice($actions, -$displayMax));
                $lock = ActionLogger::checkLock();

                echo json_encode([
                    'history' => $recent,
                    'lock'    => $lock,
                ]);
                break;

            // ── RigPulse Agent Protocol v1.0 Capabilities Discovery ──
            case 'capabilities':
                Auth::requireAuth();
                if (session_status() === PHP_SESSION_ACTIVE) {
                    session_write_close();
                }

                $result = SshBridge::exec('capabilities', 5);
                if ($result['success'] && !empty($result['output'])) {
                    $raw = SshBridge::toUtf8($result['output']);
                    if (preg_match('/\{.*\}/s', $raw, $matches)) {
                        $parsed = json_decode($matches[0], true);
                        if (is_array($parsed)) {
                            echo json_encode([
                                'available'    => true,
                                'capabilities' => SshBridge::toUtf8($parsed),
                            ]);
                            break;
                        }
                    }
                }
                echo json_encode(['available' => false, 'debug' => SshBridge::toUtf8($result)]);
                break;

            // ── System Telemetry (Fast Path) ─────────────────────────
            case 'sysinfo':
            case 'sysinfooptim':
                Auth::requireAuth();
                if (session_status() === PHP_SESSION_ACTIVE) {
                    session_write_close();
                }

                $result = SshBridge::exec('sysinfo');
                if ($result['success'] && !empty($result['output'])) {
                    $raw = SshBridge::toUtf8($result['output']);
                    if (preg_match('/\{.*\}/s', $raw, $matches)) {
                        $parsed = json_decode($matches[0], true);
                        if (is_array($parsed)) {
                            echo json_encode([
                                'available' => true,
                                'stats'     => SshBridge::toUtf8($parsed),
                            ]);
                            break;
                        }
                    }
                }
                echo json_encode(['available' => false, 'debug' => SshBridge::toUtf8($result)]);
                break;

            // ── Advanced Diagnostics (Admin only) ────────────────────
            case 'diagnostics':
                Auth::requireAdminAuth();
                if (session_status() === PHP_SESSION_ACTIVE) {
                    session_write_close();
                }

                $result = SshBridge::exec('diagnostics', 10);
                if ($result['success'] && !empty($result['output'])) {
                    $raw = SshBridge::toUtf8($result['output']);
                    if (preg_match('/\{.*\}/s', $raw, $matches)) {
                        $parsed = json_decode($matches[0], true);
                        if (is_array($parsed)) {
                            echo json_encode([
                                'available' => true,
                                'stats'     => SshBridge::toUtf8($parsed),
                            ]);
                            break;
                        }
                    }
                }
                echo json_encode(['available' => false, 'debug' => SshBridge::toUtf8($result)]);
                break;

            // ── Fallback ─────────────────────────────────────────────
            default:
                http_response_code(400);
                echo json_encode([
                    'error' => 'Unknown action. Valid actions include: status, wol, sleep, shutdown, sunshine, uptime, history, sysinfo, diagnostics, capabilities, config, auth, logout.',
                ]);
                break;
        }
    }
}
