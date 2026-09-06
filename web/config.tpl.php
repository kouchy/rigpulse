<?php
/**
 * RigPulse — Configuration Template
 *
 * Direct HTTP access is forbidden.
 * Used by web/bootstrap.php to generate web/config.php.
 */

// Guard: allow only inclusion, reject direct web / CLI execution
if (count(get_included_files()) === 1 || basename(__FILE__) === basename(isset($_SERVER['SCRIPT_FILENAME']) ? $_SERVER['SCRIPT_FILENAME'] : '')) {
    http_response_code(403);
    die("Direct access forbidden.\n");
}

return [
    // Target Machine (Remote Rig) Details
    'target' => [
        'name'          => 'GamingRig',
        'host'          => '192.168.1.100', // Local IP or local FQDN
        'public_domain' => null,            // Optional: Public domain/FQDN for UI badge & WAN latency ping (e.g. 'gaming.example.com')
        'mac'           => '00:11:22:33:44:55',
        'broadcast'     => '192.168.1.255',
        'wol_port'      => 9,
        'ping_timeout'  => 2, // seconds
        'port_timeout'  => 1, // seconds
    ],

    // SSH Bridge Credentials
    'ssh' => [
        'user'         => 'gamer',
        'host'         => '192.168.1.100',
        'port'         => 22,
        'dir'          => __DIR__ . '/ssh',
        'key_filename' => 'id_ed25519',
        'timeout'      => 5, // seconds
    ],

    // Authentication & Security
    'auth' => [
        // User password hash (standard access) - generated via web/bootstrap.php or web/update_password.php
        'user_password_hash'  => '$2y$12$e0MYzXy5Z0m9.exampleUserHashHere',
        // Admin password hash (full access + Diagnostics HUD)
        'admin_password_hash' => '$2y$12$e0MYzXy5Z0m9.exampleAdminHashHere',
        // Session lifetime in seconds (default: 86400 = 24 hours)
        'session_lifetime'    => 86400,
    ],

    // Sunshine Streaming Server
    'sunshine' => [
        'enabled'  => true,
        'wan_host' => null, // Optional public hostname for WAN latency test (defaults to target.public_domain if set)
        'ports'    => [
            ['port' => 48010, 'name' => 'RTSP',   'desc' => 'Handshake'],
            ['port' => 47984, 'name' => 'HTTPS',  'desc' => 'Sunshine API'],
            ['port' => 47989, 'name' => 'HTTP',   'desc' => 'Sunshine HTTP'],
            ['port' => 47990, 'name' => 'Web UI', 'desc' => 'Admin Panel'],
        ],
    ],

    // Audit History & Action Locking
    'history' => [
        'dir'                 => __DIR__ . '/data',
        'actions_filename'    => 'actions.json',
        'actions_max'         => 10000,
        'actions_display_max' => 100,
        'action_lock_seconds' => 30,
    ],

    // Client Dashboard & Polling Timers (sent to frontend via ?action=config)
    'client' => [
        'poll_interval_ms'       => 3000,   // Reachability ping interval (ms)
        'poll_booting_ms'        => 2000,   // Boot polling interval (ms)
        'sunshine_poll_ms'       => 3000,   // Sunshine port check interval (ms)
        'uptime_poll_ms'         => 10000,  // Uptime refresh interval (ms)
        'chart_history_max'      => 60,     // Number of sliding data points on charts
        'cpu_power_max_watts'    => 150,    // Default CPU power wattage ceiling
        'default_gpu_mode'       => 'eco',  // Default performance mode for both desktop & mobile ('eco' | 'light' | 'heavy')
        'default_pipeline_speed' => 1,      // 1 (3s), 2 (1.5s), 3 (750ms)
        'default_metric'         => 'power', // 'power' | 'temp'
    ],
];
