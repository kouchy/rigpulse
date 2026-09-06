<?php
/**
 * RigPulse — Action History & Concurrency Locking
 * 
 * Strict PHP 7.0+ Compatibility (No typed properties, no match, no arrow functions).
 */

namespace RigPulse;

class ActionLogger
{
    /**
     * Read the action history list from disk.
     *
     * @return array
     */
    public static function read(): array
    {
        $file = Config::get('history.actions_file');
        if (empty($file) || !file_exists($file)) {
            return [];
        }

        $json = @file_get_contents($file);
        if ($json === false) {
            return [];
        }

        $data = json_decode($json, true);
        return is_array($data) ? $data : [];
    }

    /**
     * Log an action to the audit history file.
     *
     * @param string $action
     * @param string $result 'success' | 'fail'
     */
    public static function log(string $action, string $result)
    {
        $file = Config::get('history.actions_file');
        if (empty($file)) {
            return;
        }

        $dir = dirname($file);
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }

        $maxEntries = (int) Config::get('history.actions_max', 10000);
        $actions = self::read();

        $actions[] = [
            'ts'     => time(),
            'time'   => date('c'),
            'ip'     => self::getClientIp(),
            'action' => $action,
            'result' => $result,
        ];

        if (count($actions) > $maxEntries) {
            $actions = array_slice($actions, -$maxEntries);
        }

        @file_put_contents($file, json_encode($actions, JSON_PRETTY_PRINT), LOCK_EX);
    }

    /**
     * Check if another client IP has an active power action in progress.
     *
     * @return array|null The blocking action record, or null if lock is free.
     */
    public static function checkLock()
    {
        $actions = self::read();
        if (empty($actions)) {
            return null;
        }

        $now         = time();
        $lockSeconds = (int) Config::get('history.action_lock_seconds', 30);
        $myIp        = self::getClientIp();
        $powerOps    = ['wol', 'shutdown', 'sleep'];

        for ($i = count($actions) - 1; $i >= 0; $i--) {
            $a = $actions[$i];
            if (!in_array($a['action'], $powerOps, true)) {
                continue;
            }
            if ($now - $a['ts'] > $lockSeconds) {
                break; // Entry expired
            }
            if ($a['ip'] !== $myIp) {
                return $a; // Conflicting in-flight action from another user
            }
            break; // Same user, allowed
        }

        return null;
    }

    /**
     * Retrieve the last power-related action to show whether machine was shutdown, slept, or WOL'd.
     *
     * @return string|null 'shutdown' | 'sleep' | 'wol' | null
     */
    public static function getLastPowerAction()
    {
        $actions = self::read();
        for ($i = count($actions) - 1; $i >= 0; $i--) {
            $a = $actions[$i];
            if ($a['action'] === 'shutdown' && $a['result'] === 'success') return 'shutdown';
            if ($a['action'] === 'sleep'    && $a['result'] === 'success') return 'sleep';
            if ($a['action'] === 'wol'      && $a['result'] === 'success') return 'wol';
        }
        return null;
    }

    /**
     * Determine the real client IP address.
     *
     * @return string
     */
    public static function getClientIp(): string
    {
        if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
            return $_SERVER['HTTP_CF_CONNECTING_IP'];
        }

        $ip = isset($_SERVER['HTTP_X_FORWARDED_FOR']) ? $_SERVER['HTTP_X_FORWARDED_FOR'] : (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '127.0.0.1');

        if (strpos($ip, ',') !== false) {
            $parts = explode(',', $ip);
            $ip = trim($parts[0]);
        }

        return $ip;
    }

    /**
     * Determine if the connecting client is on the local network.
     *
     * @return bool
     */
    public static function isClientLocal(): bool
    {
        // Through Cloudflare CDN implies external WAN client
        if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
            return false;
        }

        $ip = self::getClientIp();
        if (empty($ip)) {
            return false;
        }

        if ($ip === '127.0.0.1' || $ip === '::1') {
            return true;
        }

        // Check if IP belongs to private subnet
        if (strpos($ip, '192.168.') === 0 || strpos($ip, '10.') === 0 || strpos($ip, '172.') === 0) {
            return true;
        }

        return false;
    }
}
