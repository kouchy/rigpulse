#!/usr/bin/env bash
# ==============================================================================
# RigPulse — Linux Host Agent (Protocol v1.0)
# Compatible with Ubuntu, Debian, Arch Linux, SteamOS, Bazzite, ChimeraOS
# ==============================================================================
set -e

# Priority adjustment: BelowNormal / nice to avoid interrupting foreground game workloads
renice -n 10 -p $$ >/dev/null 2>&1 || true

CMD="${SSH_ORIGINAL_COMMAND:-$1}"
CMD="$(echo "$CMD" | tr -d '\r\n')"

# ── Helper: Format Uptime ─────────────────────────────────────────────────────
get_uptime() {
    if [ -f /proc/uptime ]; then
        local up_sec
        up_sec=$(cut -d. -f1 /proc/uptime)
        local days=$((up_sec / 86400))
        local hours=$(((up_sec % 86400) / 3600))
        local minutes=$(((up_sec % 3600) / 60))
        echo "${days}d ${hours}h ${minutes}m"
    else
        uptime -p 2>/dev/null || echo "0d 0h 0m"
    fi
}

# ── Helper: CPU Temperature (°C) ──────────────────────────────────────────────
get_cpu_temp() {
    for zone in /sys/class/thermal/thermal_zone*/temp; do
        if [ -r "$zone" ]; then
            local raw
            raw=$(cat "$zone" 2>/dev/null || echo 0)
            if [ "$raw" -gt 1000 ]; then
                echo $((raw / 1000))
                return
            fi
        fi
    done
    for hwmon in /sys/class/hwmon/hwmon*/temp1_input; do
        if [ -r "$hwmon" ]; then
            local raw
            raw=$(cat "$hwmon" 2>/dev/null || echo 0)
            if [ "$raw" -gt 1000 ]; then
                echo $((raw / 1000))
                return
            fi
        fi
    done
    echo "null"
}

# ── Helper: CPU Fan (% and RPM) ───────────────────────────────────────────────
get_cpu_fan_data() {
    local cpu_fan_pct="null"
    local cpu_fan_cur="null"
    local cpu_fan_max="null"

    for hwmon in /sys/class/hwmon/hwmon*; do
        if [ -d "$hwmon/device" ] && [ -r "$hwmon/device/vendor" ]; then
            continue
        fi
        for f in "$hwmon"/fan[0-9]*_input; do
            if [ -r "$f" ]; then
                local rpm
                rpm=$(cat "$f" 2>/dev/null || echo 0)
                if [ "$rpm" -gt 0 ] 2>/dev/null; then
                    cpu_fan_cur="$rpm"
                    local fmax="${f%_input}_max"
                    if [ -r "$fmax" ]; then
                        local m
                        m=$(cat "$fmax" 2>/dev/null || echo 0)
                        if [ "$m" -gt 0 ] 2>/dev/null; then
                            cpu_fan_max="$m"
                        fi
                    fi
                    break 2
                fi
            fi
        done
        for p in "$hwmon"/pwm[0-9]*; do
            case "$p" in *_max|*_min|*_enable|*_mode) continue ;; esac
            if [ -r "$p" ]; then
                local pwm
                pwm=$(cat "$p" 2>/dev/null || echo 0)
                if [ "$pwm" -gt 0 ] 2>/dev/null; then
                    local pmax="${p}_max"
                    local max_val=255
                    if [ -r "$pmax" ]; then
                        local pm
                        pm=$(cat "$pmax" 2>/dev/null || echo 255)
                        if [ "$pm" -gt 0 ] 2>/dev/null; then max_val="$pm"; fi
                    fi
                    cpu_fan_pct=$(( pwm * 100 / max_val ))
                    break 2
                fi
            fi
        done
    done

    if [ "$cpu_fan_pct" = "null" ] && [ "$cpu_fan_cur" != "null" ] && [ "$cpu_fan_max" != "null" ]; then
        if [ "$cpu_fan_max" -gt 0 ] 2>/dev/null; then
            cpu_fan_pct=$(( cpu_fan_cur * 100 / cpu_fan_max ))
            if [ "$cpu_fan_pct" -gt 100 ]; then cpu_fan_pct=100; fi
        fi
    fi

    echo "$cpu_fan_pct $cpu_fan_cur $cpu_fan_max"
}

# ── Helper: CPU Frequency (GHz) ───────────────────────────────────────────────
get_cpu_freq() {
    if [ -r /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq ]; then
        local khz
        khz=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq 2>/dev/null || echo 0)
        if [ "$khz" -gt 0 ]; then
            awk "BEGIN {printf \"%.2f\", $khz / 1000000}"
            return
        fi
    fi
    if [ -r /proc/cpuinfo ]; then
        local mhz
        mhz=$(grep -m1 "cpu MHz" /proc/cpuinfo 2>/dev/null | awk '{print $4}' || echo 0)
        if [ -n "$mhz" ] && [ "$(echo "$mhz > 0" | bc 2>/dev/null || echo 0)" -eq 1 ]; then
            awk "BEGIN {printf \"%.2f\", $mhz / 1000}"
            return
        fi
    fi
    echo "0.00"
}

# ── Helper: RAM Metrics (GB & %) ──────────────────────────────────────────────
get_ram() {
    local total_kb=0 avail_kb=0
    if [ -r /proc/meminfo ]; then
        total_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
        avail_kb=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
    fi
    local used_kb=$((total_kb - avail_kb))
    local total_gb used_gb pct
    total_gb=$(awk "BEGIN {printf \"%.1f\", $total_kb / 1048576}")
    used_gb=$(awk "BEGIN {printf \"%.1f\", $used_kb / 1048576}")
    if [ "$total_kb" -gt 0 ]; then
        pct=$((used_kb * 100 / total_kb))
    else
        pct=0
    fi
    echo "$used_gb $total_gb $pct"
}

# ── Helper: CPU Load % (80ms sampling delta) ──────────────────────────────────
get_cpu_load() {
    if [ ! -r /proc/stat ]; then
        echo 0
        return
    fi
    read -r _ user nice system idle iowait irq softirq steal _ < /proc/stat
    local prev_idle=$((idle + iowait))
    local prev_total=$((user + nice + system + idle + iowait + irq + softirq + steal))

    sleep 0.08

    read -r _ user nice system idle iowait irq softirq steal _ < /proc/stat
    local curr_idle=$((idle + iowait))
    local curr_total=$((user + nice + system + idle + iowait + irq + softirq + steal))

    local diff_idle=$((curr_idle - prev_idle))
    local diff_total=$((curr_total - prev_total))

    if [ "$diff_total" -gt 0 ]; then
        echo $(((diff_total - diff_idle) * 100 / diff_total))
    else
        echo 0
    fi
}

# ── Helper: Sunshine Service Control ──────────────────────────────────────────
sunshine_ctl() {
    local action="$1"
    # Try systemd user service first (standard for desktop sessions)
    if systemctl --user "$action" sunshine >/dev/null 2>&1; then
        echo "Sunshine service $action succeeded (user)"
        return 0
    fi
    # Fallback to system service
    if systemctl "$action" sunshine >/dev/null 2>&1 || sudo systemctl "$action" sunshine >/dev/null 2>&1; then
        echo "Sunshine service $action succeeded (system)"
        return 0
    fi
    echo "Failed to $action Sunshine service" >&2
    return 1
}

# ── Helper: Check Sunshine Service Status ─────────────────────────────────────
is_sunshine_available() {
    if command -v sunshine >/dev/null 2>&1 || \
       pgrep -x sunshine >/dev/null 2>&1 || \
       systemctl --user is-enabled sunshine >/dev/null 2>&1 || \
       systemctl is-enabled sunshine >/dev/null 2>&1; then
        echo "true"
    else
        echo "false"
    fi
}

# ── Helper: Multi-Vendor GPU Telemetry (NVIDIA, AMD amdgpu/rocm, Intel Arc) ─
get_gpu_stats() {
    gpu_vendor="none"
    gpu_detected=false
    gpu_load="0"
    gpu_mem_used="0"
    gpu_mem_total="0"
    gpu_enc="0"
    gpu_power="0"
    gpu_power_limit="0"
    gpu_fan="0"
    gpu_fan_cur="N/A"
    gpu_fan_max="N/A"
    gpu_temp="0"

    # 1. NVIDIA check via nvidia-smi
    if command -v nvidia-smi >/dev/null 2>&1; then
        local gpu_csv
        gpu_csv=$(nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,utilization.encoder,power.draw,power.limit,fan.speed,temperature.gpu --format=csv,noheader,nounits 2>/dev/null | head -n1 || echo "")
        if [ -n "$gpu_csv" ]; then
            IFS=',' read -r g_load g_used g_tot g_enc g_pwr g_limit g_fan g_temp <<< "$gpu_csv"
            gpu_vendor="nvidia"
            gpu_detected=true
            gpu_load=$(echo "$g_load" | tr -d ' ')
            gpu_mem_used=$(echo "$g_used" | tr -d ' ')
            gpu_mem_total=$(echo "$g_tot" | tr -d ' ')
            gpu_enc=$(echo "$g_enc" | tr -d ' ')
            gpu_power=$(echo "$g_pwr" | tr -d ' ' | cut -d. -f1)
            gpu_power_limit=$(echo "$g_limit" | tr -d ' ' | cut -d. -f1)
            gpu_fan=$(echo "$g_fan" | tr -d ' ')
            gpu_temp=$(echo "$g_temp" | tr -d ' ')
            return
        fi
    fi

    # 2. AMD Radeon via Linux Kernel Sysfs (amdgpu driver - native on SteamOS/Bazzite)
    for dev_path in /sys/class/drm/card[0-9]*/device; do
        if [ -d "$dev_path" ]; then
            local vendor
            vendor=$(cat "$dev_path/vendor" 2>/dev/null || echo "")
            if [ "$vendor" = "0x1002" ] || [ -f "$dev_path/gpu_busy_percent" ]; then
                gpu_vendor="amd"
                gpu_detected=true

                # Load %
                if [ -r "$dev_path/gpu_busy_percent" ]; then
                    gpu_load=$(cat "$dev_path/gpu_busy_percent" 2>/dev/null || echo 0)
                fi

                # VRAM (bytes -> MB)
                if [ -r "$dev_path/mem_info_vram_used" ]; then
                    local v_used v_tot
                    v_used=$(cat "$dev_path/mem_info_vram_used" 2>/dev/null || echo 0)
                    v_tot=$(cat "$dev_path/mem_info_vram_total" 2>/dev/null || echo 0)
                    gpu_mem_used=$((v_used / 1048576))
                    gpu_mem_total=$((v_tot / 1048576))
                fi

                # Hwmon: Temperature, Power, Fan
                for hwmon in "$dev_path"/hwmon/hwmon*; do
                    if [ -d "$hwmon" ]; then
                        if [ -r "$hwmon/temp1_input" ]; then
                            local t_raw
                            t_raw=$(cat "$hwmon/temp1_input" 2>/dev/null || echo 0)
                            if [ "$t_raw" -gt 0 ]; then gpu_temp=$((t_raw / 1000)); fi
                        fi
                        if [ -r "$hwmon/power1_average" ]; then
                            local p_raw
                            p_raw=$(cat "$hwmon/power1_average" 2>/dev/null || echo 0)
                            if [ "$p_raw" -gt 0 ]; then gpu_power=$((p_raw / 1000000)); fi
                        elif [ -r "$hwmon/power1_input" ]; then
                            local p_raw
                            p_raw=$(cat "$hwmon/power1_input" 2>/dev/null || echo 0)
                            if [ "$p_raw" -gt 0 ]; then gpu_power=$((p_raw / 1000000)); fi
                        fi
                        if [ -r "$hwmon/power1_cap" ]; then
                            local pl_raw
                            pl_raw=$(cat "$hwmon/power1_cap" 2>/dev/null || echo 0)
                            if [ "$pl_raw" -gt 0 ]; then gpu_power_limit=$((pl_raw / 1000000)); fi
                        fi
                        if [ -r "$hwmon/pwm1" ]; then
                            local pwm
                            pwm=$(cat "$hwmon/pwm1" 2>/dev/null || echo 0)
                            if [ "$pwm" -gt 0 ]; then gpu_fan=$((pwm * 100 / 255)); fi
                        fi
                        if [ -r "$hwmon/fan1_input" ]; then
                            local f_in
                            f_in=$(cat "$hwmon/fan1_input" 2>/dev/null || echo 0)
                            if [ "$f_in" -gt 0 ]; then gpu_fan_cur="$f_in"; fi
                        fi
                        if [ -r "$hwmon/fan1_max" ]; then
                            local f_mx
                            f_mx=$(cat "$hwmon/fan1_max" 2>/dev/null || echo 0)
                            if [ "$f_mx" -gt 0 ]; then gpu_fan_max="$f_mx"; fi
                        fi
                    fi
                done
                return
            fi
        fi
    done

    # 3. AMD fallback via rocm-smi CLI (if ROCm is installed)
    if command -v rocm-smi >/dev/null 2>&1; then
        local rsmi_out
        rsmi_out=$(rocm-smi --showuse --showmeminfo vram --showtemp --showpower 2>/dev/null || echo "")
        if [ -n "$rsmi_out" ]; then
            gpu_vendor="amd"
            gpu_detected=true
            local use_val
            use_val=$(echo "$rsmi_out" | grep -i "GPU use" | awk '{print $NF}' | tr -d '% ' || echo "")
            if [ -n "$use_val" ]; then gpu_load="$use_val"; fi
            local temp_val
            temp_val=$(echo "$rsmi_out" | grep -i "Temperature" | head -n1 | awk '{print $NF}' | cut -d. -f1 | tr -d 'C ' || echo "")
            if [ -n "$temp_val" ]; then gpu_temp="$temp_val"; fi
            local pwr_val
            pwr_val=$(echo "$rsmi_out" | grep -i "Power" | head -n1 | awk '{print $NF}' | cut -d. -f1 | tr -d 'W ' || echo "")
            if [ -n "$pwr_val" ]; then gpu_power="$pwr_val"; fi
            local vram_used vram_tot
            vram_used=$(echo "$rsmi_out" | grep -i "VRAM Total Used Memory" | awk '{print $NF}' | tr -d ' ' || echo 0)
            vram_tot=$(echo "$rsmi_out" | grep -i "VRAM Total Memory" | awk '{print $NF}' | tr -d ' ' || echo 0)
            if [ "$vram_used" -gt 1048576 ] 2>/dev/null; then gpu_mem_used=$((vram_used / 1048576)); fi
            if [ "$vram_tot" -gt 1048576 ] 2>/dev/null; then gpu_mem_total=$((vram_tot / 1048576)); fi
            return
        fi
    fi

    # 4. Intel Arc / Xe / iGPU (vendor 0x8086)
    for dev_path in /sys/class/drm/card[0-9]*/device; do
        if [ -d "$dev_path" ]; then
            local vendor
            vendor=$(cat "$dev_path/vendor" 2>/dev/null || echo "")
            if [ "$vendor" = "0x8086" ]; then
                gpu_vendor="intel"
                gpu_detected=true

                # Intel Arc discrete VRAM (lmem_total_bytes / lmem_used_bytes)
                if [ -r "$dev_path/lmem_total_bytes" ]; then
                    local l_tot l_used
                    l_tot=$(cat "$dev_path/lmem_total_bytes" 2>/dev/null || echo 0)
                    l_used=$(cat "$dev_path/lmem_used_bytes" 2>/dev/null || echo 0)
                    if [ "$l_tot" -gt 0 ] 2>/dev/null; then gpu_mem_total=$((l_tot / 1048576)); fi
                    if [ "$l_used" -gt 0 ] 2>/dev/null; then gpu_mem_used=$((l_used / 1048576)); fi
                fi

                # Intel Hwmon (temperature, power & fan)
                for hwmon in "$dev_path"/hwmon/hwmon*; do
                    if [ -d "$hwmon" ]; then
                        if [ -r "$hwmon/temp1_input" ]; then
                            local t_raw
                            t_raw=$(cat "$hwmon/temp1_input" 2>/dev/null || echo 0)
                            if [ "$t_raw" -gt 0 ]; then gpu_temp=$((t_raw / 1000)); fi
                        fi
                        if [ -r "$hwmon/power1_average" ]; then
                            local p_raw
                            p_raw=$(cat "$hwmon/power1_average" 2>/dev/null || echo 0)
                            if [ "$p_raw" -gt 0 ]; then gpu_power=$((p_raw / 1000000)); fi
                        elif [ -r "$hwmon/power1_input" ]; then
                            local p_raw
                            p_raw=$(cat "$hwmon/power1_input" 2>/dev/null || echo 0)
                            if [ "$p_raw" -gt 0 ]; then gpu_power=$((p_raw / 1000000)); fi
                        fi
                        if [ -r "$hwmon/power1_cap" ]; then
                            local pl_raw
                            pl_raw=$(cat "$hwmon/power1_cap" 2>/dev/null || echo 0)
                            if [ "$pl_raw" -gt 0 ]; then gpu_power_limit=$((pl_raw / 1000000)); fi
                        fi
                        if [ -r "$hwmon/pwm1" ]; then
                            local pwm
                            pwm=$(cat "$hwmon/pwm1" 2>/dev/null || echo 0)
                            if [ "$pwm" -gt 0 ]; then gpu_fan=$((pwm * 100 / 255)); fi
                        fi
                    fi
                done

                # Intel Engine frequency (estimate load if active & max freq are available)
                local act_f=0 max_f=0
                for f_dir in "$dev_path"/drm/card* "$dev_path"/gt/gt0; do
                    if [ -r "$f_dir/gt_act_freq_mhz" ] && [ -r "$f_dir/gt_max_freq_mhz" ]; then
                        act_f=$(cat "$f_dir/gt_act_freq_mhz" 2>/dev/null || echo 0)
                        max_f=$(cat "$f_dir/gt_max_freq_mhz" 2>/dev/null || echo 0)
                        break
                    elif [ -r "$f_dir/act_freq_mhz" ] && [ -r "$f_dir/max_freq_mhz" ]; then
                        act_f=$(cat "$f_dir/act_freq_mhz" 2>/dev/null || echo 0)
                        max_f=$(cat "$f_dir/max_freq_mhz" 2>/dev/null || echo 0)
                        break
                    fi
                done
                if [ "$max_f" -gt 0 ] 2>/dev/null && [ "$act_f" -gt 0 ] 2>/dev/null; then
                    gpu_load=$((act_f * 100 / max_f))
                fi
                return
            fi
        fi
    done

    # 5. Intel fallback via xpu-smi CLI (if Intel XPU Manager is installed)
    if command -v xpu-smi >/dev/null 2>&1; then
        local xpu_out
        xpu_out=$(xpu-smi dump -d 0 -m 0,1,18 -n 1 2>/dev/null || echo "")
        if [ -n "$xpu_out" ]; then
            gpu_vendor="intel"
            gpu_detected=true
            return
        fi
    fi
}

# ── Command Dispatcher ────────────────────────────────────────────────────────
case "$CMD" in
    "shutdown")
        systemctl poweroff 2>/dev/null || sudo systemctl poweroff 2>/dev/null || sudo shutdown -h now
        ;;

    "sleep")
        systemctl suspend 2>/dev/null || sudo systemctl suspend 2>/dev/null
        ;;

    "uptime")
        get_uptime
        ;;

    "sunshine-start")
        sunshine_ctl start
        ;;

    "sunshine-stop")
        sunshine_ctl stop
        ;;

    "sunshine-restart")
        sunshine_ctl restart
        ;;

    "capabilities")
        get_gpu_stats
        has_rapl=false
        if [ -r /sys/class/powercap/intel-rapl/intel-rapl:0/energy_uj ]; then
            has_rapl=true
        fi

        has_sunshine=$(is_sunshine_available)

        cat <<EOF
{
  "protocol_version": "1.0",
  "os": "linux",
  "supported_commands": [
    "shutdown", "sleep", "uptime", "sysinfo", "diagnostics",
    "capabilities", "sunshine-start", "sunshine-stop", "sunshine-restart"
  ],
  "features": {
    "gpu": $gpu_detected,
    "gpu_vendor": "$gpu_vendor",
    "cpu_power": $has_rapl,
    "cpu_temp": true,
    "disk_io": true,
    "net_io": true,
    "sunshine": $has_sunshine,
    "foreground_app": true,
    "os_updates": false
  }
}
EOF
        ;;

    "sysinfo")
        cpu_load=$(get_cpu_load)
        cpu_freq=$(get_cpu_freq)
        cpu_temp=$(get_cpu_temp)
        read -r cpu_fan cpu_fan_cur cpu_fan_max <<< "$(get_cpu_fan_data)"
        read -r ram_used ram_total ram_pct <<< "$(get_ram)"

        get_gpu_stats

        cat <<EOF
{
  "cpu": $cpu_load,
  "cpu_freq": "$cpu_freq",
  "cpu_temp": $cpu_temp,
  "cpu_fan": $cpu_fan,
  "cpu_fan_cur": $cpu_fan_cur,
  "cpu_fan_max": $cpu_fan_max,
  "cpu_power": 0,
  "ram_used": $ram_used,
  "ram_total": $ram_total,
  "ram_pct": $ram_pct,
  "gpu_load": $gpu_load,
  "gpu_mem_used": $gpu_mem_used,
  "gpu_mem_total": $gpu_mem_total,
  "gpu_temp": $gpu_temp,
  "gpu_power": $gpu_power
}
EOF
        ;;

    "diagnostics")
        cpu_load=$(get_cpu_load)
        cpu_freq=$(get_cpu_freq)
        cpu_temp=$(get_cpu_temp)
        read -r cpu_fan cpu_fan_cur cpu_fan_max <<< "$(get_cpu_fan_data)"
        read -r ram_used ram_total ram_pct <<< "$(get_ram)"

        get_gpu_stats

        # Primary Filesystem Storage (Root /)
        disk_pct=0
        disk_used_gb=0
        disk_total_gb=0
        if df -Pk / >/dev/null 2>&1; then
            disk_info=$(df -Pk / | awk 'NR==2 {print $2, $3, $5}')
            read -r tot_k used_k pct_str <<< "$disk_info"
            disk_total_gb=$(awk "BEGIN {printf \"%d\", $tot_k / 1048576}")
            disk_used_gb=$(awk "BEGIN {printf \"%d\", $used_k / 1048576}")
            disk_pct=$(echo "$pct_str" | tr -d '%')
        fi

        # Top CPU / RAM Processes
        procs_json=""
        if command -v ps >/dev/null 2>&1; then
            while read -r pid comm pcpu pmem; do
                [ -z "$pid" ] && continue
                procs_json="${procs_json}{\"pid\": \"$pid\", \"name\": \"$comm\", \"cpu\": $pcpu, \"mem\": \"${pmem}%\"},"
            done < <(ps -eo pid,comm,%cpu,%mem --sort=-%cpu 2>/dev/null | awk 'NR>1 && NR<=4 {print $1, $2, $3, $4}')
            procs_json="[${procs_json%,}]"
        else
            procs_json="[]"
        fi

        cat <<EOF
{
  "cpu_load": $cpu_load,
  "cpu_freq": "$cpu_freq",
  "cpu_temp": $cpu_temp,
  "cpu_fan": $cpu_fan,
  "cpu_fan_cur": $cpu_fan_cur,
  "cpu_fan_max": $cpu_fan_max,
  "cpu_power": 0,
  "ram_used": "$ram_used",
  "ram_total": "$ram_total",
  "ram_pct": $ram_pct,
  "gpu_load": "$gpu_load",
  "gpu_mem_used": "$gpu_mem_used",
  "gpu_mem_total": "$gpu_mem_total",
  "gpu_enc": "$gpu_enc",
  "gpu_power": "$gpu_power",
  "gpu_power_limit": "$gpu_power_limit",
  "gpu_fan": "$gpu_fan",
  "gpu_fan_cur": "$gpu_fan_cur",
  "gpu_fan_max": "$gpu_fan_max",
  "gpu_temp": "$gpu_temp",
  "disk_read_mb": "0.0",
  "disk_write_mb": "0.0",
  "disks": [
    { "drive": "/", "label": "Root", "used_gb": $disk_used_gb, "total_gb": $disk_total_gb, "pct": $disk_pct }
  ],
  "net_recv_mb": "0.0",
  "net_sent_mb": "0.0",
  "top_procs": $procs_json
}
EOF
        ;;

    *)
        echo "RigPulse Linux Agent Protocol v1.0"
        echo "Usage: $0 {capabilities|uptime|sysinfo|diagnostics|shutdown|sleep|sunshine-start|sunshine-stop|sunshine-restart}"
        exit 1
        ;;
esac
