<?php
/**
 * RigPulse — SSH Remote Bridge
 * 
 * Strict PHP 7.0+ Compatibility (No typed properties, no match, no arrow functions).
 */

namespace RigPulse;

class SshBridge
{
    /**
     * Check if the SSH daemon on the target host is reachable.
     *
     * @param int $timeout
     * @return bool
     */
    public static function isSshReachable(int $timeout = 2): bool
    {
        $host = Config::get('ssh.host', Config::get('target.host'));
        $port = (int) Config::get('ssh.port', 22);

        if (!function_exists('fsockopen') || empty($host)) {
            return false;
        }

        $sock = @fsockopen($host, $port, $errNo, $errStr, $timeout);
        if ($sock) {
            fclose($sock);
            return true;
        }

        return false;
    }

    /**
     * Run an agent command on the target host via SSH.
     *
     * @param string $command
     * @param int|null $timeout
     * @return array ['success' => bool, 'message' => string, 'output' => string, 'ssh_ready' => bool]
     */
    public static function exec(string $command, $timeout = null): array
    {
        $host    = Config::get('ssh.host', Config::get('target.host'));
        $port    = (int) Config::get('ssh.port', 22);
        $user    = Config::get('ssh.user');
        $keyPath = Config::get('ssh.key_path');
        $sshTime = $timeout !== null ? (int)$timeout : (int) Config::get('ssh.timeout', 5);

        if (empty($keyPath) || !file_exists($keyPath)) {
            return [
                'success'   => false,
                'ssh_ready' => false,
                'message'   => 'SSH key file not found: ' . $keyPath,
                'output'    => '',
            ];
        }

        if (!self::isSshReachable($sshTime > 2 ? 2 : $sshTime)) {
            return [
                'success'   => false,
                'ssh_ready' => false,
                'message'   => 'SSH server not reachable on ' . $host . ':' . $port,
                'output'    => '',
            ];
        }

        $sshCmd = sprintf(
            'ssh -i %s -p %d -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ConnectTimeout=%d -o BatchMode=yes -o ServerAliveInterval=2 -o ServerAliveCountMax=2 %s@%s %s 2>&1',
            escapeshellarg($keyPath),
            $port,
            $sshTime,
            escapeshellarg($user),
            escapeshellarg($host),
            escapeshellarg($command)
        );

        // Release session lock before long-running SSH subprocess
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        $output = [];
        $code = 0;
        exec($sshCmd, $output, $code);

        $rawOut = implode("\n", $output);
        $cleanOut = self::toUtf8($rawOut);

        $failed = ($code !== 0 ||
            strpos($cleanOut, 'Permission denied') !== false ||
            strpos($cleanOut, 'Connection refused') !== false ||
            strpos($cleanOut, 'Unknown command') !== false);

        if ($failed) {
            return [
                'success'   => false,
                'ssh_ready' => true,
                'message'   => 'SSH error: ' . $cleanOut,
                'output'    => $cleanOut,
            ];
        }

        return [
            'success'   => true,
            'ssh_ready' => true,
            'message'   => 'Command sent: ' . $command,
            'output'    => $cleanOut,
        ];
    }

    /**
     * Recursively convert strings and arrays to valid UTF-8.
     * Prevents json_encode from failing on CP850/Windows-1252 strings from Windows.
     *
     * @param mixed $data
     * @return mixed
     */
    public static function toUtf8($data)
    {
        if (is_array($data)) {
            $clean = [];
            foreach ($data as $k => $v) {
                $cleanKey = is_string($k) ? self::toUtf8($k) : $k;
                $clean[$cleanKey] = self::toUtf8($v);
            }
            return $clean;
        }

        if (!is_string($data)) {
            return $data;
        }

        if (function_exists('mb_convert_encoding')) {
            return mb_convert_encoding($data, 'UTF-8', 'UTF-8, Windows-1252, ISO-8859-1, CP850');
        }

        if (function_exists('iconv')) {
            return @iconv('UTF-8', 'UTF-8//IGNORE', $data);
        }

        return $data;
    }
}
