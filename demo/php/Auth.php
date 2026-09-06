<?php
/**
 * RigPulse — Authentication & Security Service
 * 
 * Strict PHP 7.0+ Compatibility (No typed properties, no match, no arrow functions).
 */

namespace RigPulse;

class Auth
{
    /**
     * Initialize secure session with periodic rotation.
     */
    public static function initSession()
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        $lifetime = (int) Config::get('auth.session_lifetime', 86400);
        $isHttps = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on')
            || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
            || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443);

        session_set_cookie_params($lifetime, '/', '', $isHttps, true);
        session_start();

        // Check if session has exceeded configured lifetime
        if (!isset($_SESSION['_created'])) {
            $_SESSION['_created'] = time();
        } elseif ((time() - $_SESSION['_created']) > $lifetime) {
            // Gracefully expire stale session without deleting active in-flight states
            $_SESSION = [];
            $_SESSION['_created'] = time();
        }
        $_SESSION['_last_activity'] = time();
    }

    /**
     * Check if current session is authenticated.
     *
     * @return bool
     */
    public static function isAuthenticated(): bool
    {
        return isset($_SESSION['authenticated']) && $_SESSION['authenticated'] === true;
    }

    /**
     * Check if current session has admin privileges.
     *
     * @return bool
     */
    public static function isAdmin(): bool
    {
        return self::isAuthenticated() && isset($_SESSION['role']) && $_SESSION['role'] === 'admin';
    }

    /**
     * Require authentication or terminate with 401.
     */
    public static function requireAuth()
    {
        if (!self::isAuthenticated()) {
            http_response_code(401);
            echo json_encode(['error' => 'Authentication required']);
            exit;
        }
    }

    /**
     * Require admin authentication or terminate with 403.
     */
    public static function requireAdminAuth()
    {
        self::requireAuth();
        if (!self::isAdmin()) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Admin privileges required']);
            exit;
        }
    }

    /**
     * Check rate limiting for password attempts (max 5 attempts per 5 minutes).
     *
     * @return bool
     */
    public static function checkRateLimit(): bool
    {
        $maxAttempts = 5;
        $windowSec   = 300; // 5 minutes

        if (!isset($_SESSION['auth_attempts']) || !is_array($_SESSION['auth_attempts'])) {
            $_SESSION['auth_attempts'] = [];
        }

        $now = time();
        $_SESSION['auth_attempts'] = array_filter(
            $_SESSION['auth_attempts'],
            function ($t) use ($now, $windowSec) {
                return ($now - $t) < $windowSec;
            }
        );

        return count($_SESSION['auth_attempts']) < $maxAttempts;
    }

    /**
     * Record a failed password attempt.
     */
    public static function recordAuthAttempt()
    {
        if (!isset($_SESSION['auth_attempts']) || !is_array($_SESSION['auth_attempts'])) {
            $_SESSION['auth_attempts'] = [];
        }
        $_SESSION['auth_attempts'][] = time();
    }

    /**
     * Generate and store a CSRF token for the current session.
     *
     * @return string
     */
    public static function generateCsrfToken(): string
    {
        $token = bin2hex(random_bytes(32));
        $_SESSION['csrf_token'] = $token;
        return $token;
    }

    /**
     * Validate the CSRF token from HTTP headers or terminate with 403.
     */
    public static function requireCsrf()
    {
        $header = isset($_SERVER['HTTP_X_CSRF_TOKEN'])
            ? $_SERVER['HTTP_X_CSRF_TOKEN']
            : '';

        if (empty($header) || !isset($_SESSION['csrf_token'])
            || !hash_equals($_SESSION['csrf_token'], $header)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Invalid or missing CSRF token']);
            exit;
        }
    }

    /**
     * Perform authentication against user or admin hashes.
     *
     * @param string $password
     * @return array
     */
    public static function authenticate(string $password): array
    {
        $userHash  = Config::get('auth.user_password_hash');
        $adminHash = Config::get('auth.admin_password_hash');

        $hasUserHash  = !empty($userHash)  && $userHash  !== '$2y$12$e0MYzXy5Z0m9.exampleUserHashHere';
        $hasAdminHash = !empty($adminHash) && $adminHash !== '$2y$12$e0MYzXy5Z0m9.exampleAdminHashHere';

        if (!$hasUserHash && !$hasAdminHash) {
            return [
                'status'  => 500,
                'payload' => [
                    'success' => false,
                    'message' => 'Password not configured. Run: php setup_password.php',
                ],
            ];
        }

        if (!self::checkRateLimit()) {
            return [
                'status'  => 429,
                'payload' => [
                    'success' => false,
                    'message' => 'Too many failed attempts. Please wait 5 minutes.',
                ],
            ];
        }

        $authenticated = false;
        $role = 'user';

        // Check admin hash first (try raw password, then trimmed fallback)
        $trimmed = trim($password);
        if ($hasAdminHash && (password_verify($password, $adminHash) || ($trimmed !== $password && password_verify($trimmed, $adminHash)))) {
            $authenticated = true;
            $role = 'admin';
        } elseif ($hasUserHash && (password_verify($password, $userHash) || ($trimmed !== $password && password_verify($trimmed, $userHash)))) {
            $authenticated = true;
            $role = 'user';
        }

        if ($authenticated) {
            session_regenerate_id(true);
            $_SESSION['authenticated'] = true;
            $_SESSION['role']          = $role;
            $_SESSION['_created']      = time();
            $_SESSION['auth_attempts'] = [];

            $csrf = self::generateCsrfToken();
            return [
                'status'  => 200,
                'payload' => [
                    'success'    => true,
                    'message'    => 'Authenticated',
                    'role'       => $role,
                    'csrf_token' => $csrf,
                ],
            ];
        }

        self::recordAuthAttempt();
        $remaining = 5 - count($_SESSION['auth_attempts']);

        return [
            'status'  => 401,
            'payload' => [
                'success'   => false,
                'message'   => 'Invalid password',
                'remaining' => max(0, $remaining),
            ],
        ];
    }

    /**
     * Destroy current session.
     *
     * @return array
     */
    public static function logout(): array
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(),
                '',
                time() - 42000,
                $params['path'],
                $params['domain'],
                $params['secure'],
                $params['httponly']
            );
        }
        session_destroy();
        return ['success' => true];
    }
}
