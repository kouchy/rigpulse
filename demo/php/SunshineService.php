<?php
/**
 * RigPulse — Sunshine Streaming Server Service
 * 
 * Strict PHP 7.0+ Compatibility (No typed properties, no match, no arrow functions).
 */

namespace RigPulse;

class SunshineService
{
    /**
     * Check status of all configured Sunshine streaming ports.
     *
     * @return array
     */
    public static function checkPorts(): array
    {
        if (!function_exists('fsockopen')) {
            return [
                'available' => false,
                'reason'    => 'fsockopen is disabled on this web server',
            ];
        }

        $host    = Config::get('target.host');
        $ports   = Config::get('sunshine.ports', []);
        $timeout = (int) Config::get('target.port_timeout', 1);

        $results = [];
        foreach ($ports as $svc) {
            $status = 'down';
            $errNo  = 0;
            $errStr = '';

            $sock = @fsockopen($host, (int)$svc['port'], $errNo, $errStr, $timeout);
            if ($sock) {
                $status = 'up';
                fclose($sock);
            }

            $results[] = [
                'port'   => (int)$svc['port'],
                'name'   => $svc['name'],
                'desc'   => isset($svc['desc']) ? $svc['desc'] : '',
                'status' => $status,
            ];
        }

        return [
            'success'   => true,
            'available' => true,
            'ports'     => $results,
        ];
    }

    /**
     * Send service control command to Sunshine via SSH.
     *
     * @param string $command 'sunshine-start' | 'sunshine-stop' | 'sunshine-restart'
     * @return array
     */
    public static function control(string $command): array
    {
        $allowed = ['sunshine-start', 'sunshine-stop', 'sunshine-restart'];
        if (!in_array($command, $allowed, true)) {
            return [
                'status'  => 400,
                'payload' => ['success' => false, 'message' => 'Invalid command'],
            ];
        }

        $result = SshBridge::exec($command);
        ActionLogger::log($command, $result['success'] ? 'success' : 'fail');

        if ($result['success']) {
            $labels = [
                'sunshine-start'   => 'Sunshine started',
                'sunshine-stop'    => 'Sunshine stopped',
                'sunshine-restart' => 'Sunshine restarted',
            ];
            $result['message'] = isset($labels[$command]) ? $labels[$command] : 'Sunshine command executed';
        }

        return [
            'status'  => 200,
            'payload' => $result,
        ];
    }
}
