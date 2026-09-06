<?php
/**
 * RigPulse — Configuration Manager
 * 
 * Strict PHP 7.0+ Compatibility (No typed properties, no match, no arrow functions).
 * Entirely relies on web/config.php without embedded defaults.
 */

namespace RigPulse;

class Config
{
    /** @var array */
    private static $config = [];

    /** @var bool */
    private static $loaded = false;

    /**
     * Load configuration from file.
     * Entirely relies on config.php with zero hardcoded defaults.
     * Throws an explicit RuntimeException if config.php is missing or malformed.
     *
     * @param string|null $path
     * @return array
     * @throws \RuntimeException
     */
    public static function load($path = null)
    {
        if (self::$loaded && $path === null) {
            return self::$config;
        }

        $configFile = $path ? $path : dirname(__DIR__) . '/config.php';

        if (!file_exists($configFile)) {
            throw new \RuntimeException(sprintf(
                "RigPulse configuration file not found at '%s'. Please run 'php web/bootstrap.php' to initialize your installation.",
                $configFile
            ));
        }

        if (!is_readable($configFile)) {
            throw new \RuntimeException(sprintf(
                "RigPulse configuration file at '%s' is not readable. Please verify file permissions.",
                $configFile
            ));
        }

        $data = include $configFile;

        if (!is_array($data)) {
            throw new \RuntimeException(sprintf(
                "RigPulse configuration file at '%s' is malformed: it must return a PHP associative array.",
                $configFile
            ));
        }

        // Validate required configuration sections
        $requiredSections = ['target', 'ssh', 'auth', 'history'];
        foreach ($requiredSections as $section) {
            if (!isset($data[$section]) || !is_array($data[$section])) {
                throw new \RuntimeException(sprintf(
                    "RigPulse configuration file is malformed: missing or invalid '%s' section.",
                    $section
                ));
            }
        }

        // Validate required keys within sections
        $requiredKeys = [
            'target'  => ['name', 'host', 'mac', 'broadcast', 'wol_port'],
            'ssh'     => ['user', 'host', 'port', 'dir', 'key_filename'],
            'auth'    => ['user_password_hash', 'admin_password_hash'],
            'history' => ['dir', 'actions_filename'],
        ];

        foreach ($requiredKeys as $section => $keys) {
            foreach ($keys as $key) {
                if (!array_key_exists($key, $data[$section])) {
                    throw new \RuntimeException(sprintf(
                        "RigPulse configuration file is malformed: missing required key '%s.%s'.",
                        $section,
                        $key
                    ));
                }
            }
        }

        // Validate that critical connection & security parameters are not blank
        if (trim((string)$data['target']['host']) === '') {
            throw new \RuntimeException("RigPulse configuration file is malformed: 'target.host' cannot be empty.");
        }
        if (trim((string)$data['target']['mac']) === '') {
            throw new \RuntimeException("RigPulse configuration file is malformed: 'target.mac' cannot be empty.");
        }
        if (trim((string)$data['ssh']['user']) === '') {
            throw new \RuntimeException("RigPulse configuration file is malformed: 'ssh.user' cannot be empty.");
        }
        if (trim((string)$data['auth']['user_password_hash']) === '') {
            throw new \RuntimeException("RigPulse configuration file is malformed: 'auth.user_password_hash' cannot be empty.");
        }
        if (trim((string)$data['auth']['admin_password_hash']) === '') {
            throw new \RuntimeException("RigPulse configuration file is malformed: 'auth.admin_password_hash' cannot be empty.");
        }

        self::$config = $data;

        // Dynamically compute key_path and actions_file from directory and filename if not explicitly provided
        if (empty(self::$config['ssh']['key_path']) && !empty(self::$config['ssh']['dir']) && !empty(self::$config['ssh']['key_filename'])) {
            self::$config['ssh']['key_path'] = rtrim(self::$config['ssh']['dir'], '/\\') . '/' . ltrim(self::$config['ssh']['key_filename'], '/\\');
        }
        if (empty(self::$config['history']['actions_file']) && !empty(self::$config['history']['dir']) && !empty(self::$config['history']['actions_filename'])) {
            self::$config['history']['actions_file'] = rtrim(self::$config['history']['dir'], '/\\') . '/' . ltrim(self::$config['history']['actions_filename'], '/\\');
        }

        // Populate legacy constants if not already defined
        self::populateConstants();

        self::$loaded = true;
        return self::$config;
    }

    /**
     * Get a config value using dot-notation (e.g. 'target.host').
     *
     * @param string $key
     * @param mixed $default
     * @return mixed
     */
    public static function get($key, $default = null)
    {
        if (!self::$loaded) {
            self::load();
        }

        $segments = explode('.', $key);
        $current = self::$config;

        foreach ($segments as $segment) {
            if (!is_array($current) || !array_key_exists($segment, $current)) {
                return $default;
            }
            $current = $current[$segment];
        }

        return $current;
    }

    /**
     * Returns sanitized non-sensitive public configuration for frontend bootstrap.
     *
     * @return array
     */
    public static function getPublicConfig()
    {
        if (!self::$loaded) {
            self::load();
        }

        $publicDomain = self::get('target.public_domain');
        $wanHost = self::get('sunshine.wan_host');
        if (empty($wanHost)) {
            $wanHost = !empty($publicDomain) ? $publicDomain : self::get('target.host');
        }

        return [
            'app_name'  => 'RigPulse',
            'target'    => [
                'name'          => self::get('target.name'),
                'host'          => self::get('target.host'),
                'public_domain' => $publicDomain,
            ],
            'sunshine'  => [
                'enabled'  => (bool) self::get('sunshine.enabled', false),
                'wan_host' => $wanHost,
            ],
            'client'    => array_merge([
                'cpu_power_max_watts' => (int) self::get('client.cpu_power_max_watts', self::get('telemetry.cpu_power_max_watts', 150)),
            ], self::get('client', [])),
        ];
    }

    /**
     * Reset loaded state and in-memory configuration (useful for tests).
     */
    public static function reset()
    {
        self::$config = [];
        self::$loaded = false;
    }

    /**
     * Define legacy global constants if not already defined.
     */
    private static function populateConstants()
    {
        $map = [
            'TARGET_HOST'         => isset(self::$config['target']['host']) ? self::$config['target']['host'] : null,
            'TARGET_MAC'          => isset(self::$config['target']['mac']) ? self::$config['target']['mac'] : null,
            'TARGET_BROADCAST'    => isset(self::$config['target']['broadcast']) ? self::$config['target']['broadcast'] : null,
            'PING_TIMEOUT'        => isset(self::$config['target']['ping_timeout']) ? self::$config['target']['ping_timeout'] : null,
            'PORT_TIMEOUT'        => isset(self::$config['target']['port_timeout']) ? self::$config['target']['port_timeout'] : null,
            'SSH_KEY_PATH'        => isset(self::$config['ssh']['key_path']) ? self::$config['ssh']['key_path'] : null,
            'SSH_USER'            => isset(self::$config['ssh']['user']) ? self::$config['ssh']['user'] : null,
            'SSH_TIMEOUT'         => isset(self::$config['ssh']['timeout']) ? self::$config['ssh']['timeout'] : null,
            'ACTIONS_FILE'        => isset(self::$config['history']['actions_file']) ? self::$config['history']['actions_file'] : null,
            'ACTIONS_MAX'         => isset(self::$config['history']['actions_max']) ? self::$config['history']['actions_max'] : null,
            'ACTIONS_DISPLAY_MAX' => isset(self::$config['history']['actions_display_max']) ? self::$config['history']['actions_display_max'] : null,
            'ACTION_LOCK_SECONDS' => isset(self::$config['history']['action_lock_seconds']) ? self::$config['history']['action_lock_seconds'] : null,
            'AUTH_PASSWORD_HASH'  => isset(self::$config['auth']['user_password_hash']) ? self::$config['auth']['user_password_hash'] : null,
            'ADMIN_PASSWORD_HASH' => isset(self::$config['auth']['admin_password_hash']) ? self::$config['auth']['admin_password_hash'] : null,
            'SESSION_LIFETIME'    => isset(self::$config['auth']['session_lifetime']) ? self::$config['auth']['session_lifetime'] : null,
        ];

        foreach ($map as $const => $val) {
            if (!defined($const) && $val !== null) {
                define($const, $val);
            }
        }
    }
}
