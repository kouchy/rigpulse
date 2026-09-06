<?php
/**
 * RigPulse — Wake-on-LAN Service
 * 
 * Strict PHP 7.0+ Compatibility (No typed properties, no match, no arrow functions).
 */

namespace RigPulse;

class Wol
{
    /**
     * Send a Wake-on-LAN magic packet to target.
     *
     * @param string|null $mac
     * @param string|null $broadcast
     * @param int|null $port
     * @return array ['success' => bool, 'message' => string]
     */
    public static function send($mac = null, $broadcast = null, $port = null): array
    {
        $targetMac       = $mac ? $mac : Config::get('target.mac');
        $targetBroadcast = $broadcast ? $broadcast : Config::get('target.broadcast', '255.255.255.255');
        $targetPort      = $port ? $port : (int) Config::get('target.wol_port', 9);

        if (empty($targetMac)) {
            return [
                'success' => false,
                'message' => 'No target MAC address configured.',
            ];
        }

        // 1. Try native PHP UDP socket broadcast first (portable, no external CLI binary required)
        $packet = self::buildMagicPacket($targetMac);
        $targetName = Config::get('target.name', 'host');

        if ($packet !== null) {
            $sent = self::sendRawUdp($packet, $targetBroadcast, $targetPort);
            if ($sent) {
                return [
                    'success' => true,
                    'message' => 'Magic packet sent to ' . $targetName,
                ];
            }
        }

        // 2. Fallback to CLI wakeonlan if socket broadcast failed or disabled
        $cmd = sprintf(
            'wakeonlan -i %s -p %d %s 2>&1',
            escapeshellarg($targetBroadcast),
            $targetPort,
            escapeshellarg($targetMac)
        );
        exec($cmd, $output, $returnCode);

        if ($returnCode === 0) {
            return [
                'success' => true,
                'message' => 'Magic packet sent to ' . $targetName,
            ];
        }

        return [
            'success' => false,
            'message' => 'Failed to send magic packet: ' . implode(' ', $output),
        ];
    }

    /**
     * Construct a standard 102-byte WOL magic packet:
     * 6 bytes of 0xFF followed by the 6-byte MAC address repeated 16 times.
     *
     * @param string $mac
     * @return string|null
     */
    public static function buildMagicPacket(string $mac)
    {
        $cleanMac = preg_replace('/[^0-9a-fA-F]/', '', $mac);
        if (strlen($cleanMac) !== 12) {
            return null;
        }

        $macBytes = hex2bin($cleanMac);
        if ($macBytes === false || strlen($macBytes) !== 6) {
            return null;
        }

        return str_repeat(chr(0xFF), 6) . str_repeat($macBytes, 16);
    }

    /**
     * Send raw UDP packet with broadcast flag enabled.
     *
     * @param string $packet
     * @param string $broadcast
     * @param int $port
     * @return bool
     */
    private static function sendRawUdp(string $packet, string $broadcast, int $port): bool
    {
        // Try sockets extension first if loaded
        if (function_exists('socket_create')) {
            $sock = @socket_create(AF_INET, SOCK_DGRAM, SOL_UDP);
            if ($sock) {
                @socket_set_option($sock, SOL_SOCKET, SO_BROADCAST, 1);
                $len = strlen($packet);
                $sentBytes = @socket_sendto($sock, $packet, $len, 0, $broadcast, $port);
                @socket_close($sock);
                if ($sentBytes === $len) {
                    return true;
                }
            }
        }

        // Fallback to stream/fsockopen UDP
        $fp = @fsockopen('udp://' . $broadcast, $port, $errno, $errstr, 2);
        if ($fp) {
            @fwrite($fp, $packet);
            @fclose($fp);
            return true;
        }

        return false;
    }
}
