[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Set process priority to BelowNormal to prevent artificial CPU turbo boosting & avoid interrupting foreground tasks
try {
    [System.Diagnostics.Process]::GetCurrentProcess().PriorityClass = [System.Diagnostics.ProcessPriorityClass]::BelowNormal
} catch {}

# Ensure NVIDIA persistence mode is enabled so driver keeps telemetry active across sleep/idle
try {
    nvidia-smi -pm 1 2>$null
} catch {}

function Get-SafeNumeric($val, $round = $null) {
    if ($null -eq $val) { return "N/A" }
    $s = ([string]$val).Trim()
    if ($s -eq "" -or $s -eq "N/A" -or $s -match "\[Not Supported\]|Unknown|Err") { return "N/A" }
    $clean = $s -replace ',', '.'
    $d = 0.0
    if ([double]::TryParse($clean, [System.Globalization.NumberStyles]::Float -bor [System.Globalization.NumberStyles]::AllowThousands, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$d)) {
        if ($null -ne $round) {
            return [math]::Round($d, $round)
        }
        return $d
    }
    return "N/A"
}

function Get-HardwareSensors {
    $res = [PSCustomObject]@{
        Temp        = "N/A"
        Fan         = "N/A"
        FanCur      = "N/A"
        FanMax      = "N/A"
        Power       = $null
        GpuTemp     = "N/A"
        GpuFan      = "N/A"
        GpuFanCur   = "N/A"
        GpuFanMax   = "N/A"
        GpuPower    = "N/A"
        GpuFreq     = "N/A"
    }

    # 1. First Priority: LibreHardwareMonitor Remote Web Server (http://127.0.0.1:8085/data.json)
    try {
        $req = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:8085/data.json")
        $req.Timeout = 300
        $resp = $req.GetResponse()
        $stream = $resp.GetResponseStream()
        $reader = [System.IO.StreamReader]::new($stream)
        $raw = $reader.ReadToEnd()
        $reader.Close()
        $resp.Close()

        if ($raw) {
            $json = ConvertFrom-Json $raw
            if ($json) {
                $stack = [System.Collections.Generic.Stack[PSObject]]::new()
                $stack.Push($json)
                $temps = [System.Collections.Generic.List[PSObject]]::new()
                $gpuTemps = [System.Collections.Generic.List[PSObject]]::new()
                $fans = [System.Collections.Generic.List[PSObject]]::new()
                $gpuFans = [System.Collections.Generic.List[PSObject]]::new()
                $controls = [System.Collections.Generic.List[PSObject]]::new()
                $gpuControls = [System.Collections.Generic.List[PSObject]]::new()
                $powers = [System.Collections.Generic.List[PSObject]]::new()
                $gpuPowers = [System.Collections.Generic.List[PSObject]]::new()
                $gpuClocks = [System.Collections.Generic.List[PSObject]]::new()

                while ($stack.Count -gt 0) {
                    $node = $stack.Pop()
                    if ($node.Children -and $node.Children.Count -gt 0) {
                        foreach ($c in $node.Children) { $stack.Push($c) }
                    } else {
                        $txt = [string]$node.Text
                        $val = [string]$node.Value
                        $maxVal = [string]$node.Max
                        $sid = [string]$node.SensorId
                        $stype = [string]$node.Type

                        # Culture-invariant numeric extraction (handles both comma and dot)
                        $num = $null
                        if ($val -and ($val -match '[-+]?\d+(?:[.,]\d+)?')) {
                            $cleanStr = $matches[0] -replace ',', '.'
                            $num = [double]::Parse($cleanStr, [System.Globalization.CultureInfo]::InvariantCulture)
                        }

                        $maxNum = $null
                        if ($maxVal -and ($maxVal -match '[-+]?\d+(?:[.,]\d+)?')) {
                            $cleanMax = $matches[0] -replace ',', '.'
                            $maxNum = [double]::Parse($cleanMax, [System.Globalization.CultureInfo]::InvariantCulture)
                        }

                        # Check Temperature
                        if ($stype -eq "Temperature" -or $sid -match "/temperature/" -or ($val -match "C" -and $val -notmatch "V|W|%|RPM")) {
                            if ($num -ne $null -and $num -gt 0) {
                                if ($sid -match "/intelcpu/|/amdcpu/" -or (($txt -match "CPU|Core|Package|Tctl|CCD") -and $txt -notmatch "GPU")) {
                                    if ($txt -notmatch "Distance to TjMax") {
                                        $temps.Add([PSCustomObject]@{ Name = $txt; Value = $num; Id = $sid })
                                    }
                                } elseif ($sid -match "/gpu" -or $txt -match "GPU") {
                                    $gpuTemps.Add([PSCustomObject]@{ Name = $txt; Value = $num; Id = $sid })
                                }
                            }
                        }
                        # Check Fan (RPM)
                        elseif ($stype -eq "Fan" -or $sid -match "/fan/" -or $val -match "RPM") {
                            if ($num -ne $null) {
                                $curRpm = [int][math]::Round($num, 0)
                                $mRpm = if ($maxNum -ne $null) { [int][math]::Round($maxNum, 0) } else { 0 }
                                if ($sid -match "/gpu" -or $txt -match "GPU") {
                                    $gpuFans.Add([PSCustomObject]@{ Name = $txt; Value = $curRpm; Max = $mRpm; Id = $sid })
                                } else {
                                    $fans.Add([PSCustomObject]@{ Name = $txt; Value = $curRpm; Max = $mRpm; Id = $sid })
                                }
                            }
                        }
                        # Check Control (%)
                        elseif ($stype -eq "Control" -or $sid -match "/control/" -or ($val -match "%" -and $txt -match "Fan|Control")) {
                            if ($num -ne $null) {
                                $pct = [int][math]::Round($num, 0)
                                if ($sid -match "/gpu" -or $txt -match "GPU") {
                                    $gpuControls.Add([PSCustomObject]@{ Name = $txt; Value = $pct; Id = $sid })
                                } elseif ($sid -match "/lpc/" -or $txt -match "Fan|CPU") {
                                    $controls.Add([PSCustomObject]@{ Name = $txt; Value = $pct; Id = $sid })
                                }
                            }
                        }
                        # Check Power (W)
                        elseif ($stype -eq "Power" -or $sid -match "/power/" -or ($val -match "W" -and $val -notmatch "V|RPM")) {
                            if ($num -ne $null -and $num -gt 0) {
                                if ($sid -match "/gpu" -or $txt -match "GPU") {
                                    $gpuPowers.Add([PSCustomObject]@{ Name = $txt; Value = [math]::Round($num, 0); Id = $sid })
                                } elseif ($sid -match "/intelcpu/|/amdcpu/|/cpu" -or (($txt -match "CPU Package|CPU Total|Package") -and $txt -notmatch "GPU")) {
                                    $powers.Add([PSCustomObject]@{ Name = $txt; Value = [math]::Round($num, 1); Id = $sid })
                                }
                            }
                        }
                        # Check Clock (MHz)
                        elseif ($stype -eq "Clock" -or $sid -match "/clock/" -or ($val -match "MHz" -and $val -notmatch "V|RPM|W")) {
                            if ($num -ne $null -and $num -gt 0) {
                                if ($sid -match "/gpu" -or $txt -match "GPU") {
                                    if ($txt -match "GPU Core|Graphics|Core") {
                                        $gpuClocks.Add([PSCustomObject]@{ Name = $txt; Value = [math]::Round($num, 0); Id = $sid })
                                    }
                                }
                            }
                        }
                    }
                }

                # 1. CPU Temperature Selection
                if ($temps.Count -gt 0) {
                    $pkg = $temps | Where-Object { $_.Name -match "CPU Package|Package|Tctl" } | Select-Object -First 1
                    if (-not $pkg) { $pkg = $temps | Where-Object { $_.Name -match "Core Max" } | Select-Object -First 1 }
                    if (-not $pkg) { $pkg = $temps | Where-Object { $_.Id -match "/intelcpu/|/amdcpu/" } | Sort-Object -Property Value -Descending | Select-Object -First 1 }
                    if (-not $pkg) { $pkg = $temps | Where-Object { $_.Name -eq "CPU" } | Select-Object -First 1 }
                    if (-not $pkg) { $pkg = $temps[0] }
                    if ($pkg) { $res.Temp = [math]::Round($pkg.Value, 0) }
                }

                # 2. CPU Fan Selection
                if ($fans.Count -gt 0) {
                    $fan = $fans | Where-Object { $_.Name -match "^CPU Fan" } | Select-Object -First 1
                    if (-not $fan) { $fan = $fans | Where-Object { $_.Name -match "Fan #1" -or $_.Value -gt 0 } | Select-Object -First 1 }
                    if (-not $fan) { $fan = $fans[0] }

                    if ($fan) {
                        $res.FanCur = $fan.Value
                    }
                }

                # 3. CPU Fan Control %
                if ($controls.Count -gt 0) {
                    $ctrl = $controls | Where-Object { $_.Name -match "^CPU Fan" } | Select-Object -First 1
                    if (-not $ctrl) { $ctrl = $controls | Where-Object { $_.Name -match "Fan #1" } | Select-Object -First 1 }
                    if (-not $ctrl) { $ctrl = $controls[0] }
                    if ($ctrl) { $res.Fan = $ctrl.Value }
                }
                if ($res.Fan -eq "N/A" -and $res.FanCur -ne "N/A" -and $res.FanMax -ne "N/A" -and $res.FanMax -gt 0) {
                    $res.Fan = [int][math]::Min(100, [math]::Round(($res.FanCur / $res.FanMax) * 100, 0))
                }

                # 4. CPU Power
                if ($powers.Count -gt 0) {
                    $cPwr = $powers | Where-Object { $_.Name -match "CPU Package|Package" } | Select-Object -First 1
                    if (-not $cPwr) { $cPwr = $powers[0] }
                    if ($cPwr) { $res.Power = $cPwr.Value }
                }

                # 5. GPU Thermals & Fans (from LHM)
                if ($gpuTemps.Count -gt 0) {
                    $gCore = $gpuTemps | Where-Object { $_.Name -match "GPU Core|GPU Temperature" } | Select-Object -First 1
                    if (-not $gCore) { $gCore = $gpuTemps[0] }
                    if ($gCore) { $res.GpuTemp = [math]::Round($gCore.Value, 0) }
                }

                if ($gpuFans.Count -gt 0) {
                    $gFan = $gpuFans | Where-Object { $_.Value -gt 0 } | Select-Object -First 1
                    if (-not $gFan) { $gFan = $gpuFans[0] }
                    if ($gFan) {
                        $res.GpuFanCur = $gFan.Value
                    }
                }

                if ($gpuControls.Count -gt 0) {
                    $gCtrl = $gpuControls | Where-Object { $_.Name -match "Fan" } | Select-Object -First 1
                    if (-not $gCtrl) { $gCtrl = $gpuControls | Where-Object { $_.Value -gt 0 } | Select-Object -First 1 }
                    if (-not $gCtrl) { $gCtrl = $gpuControls[0] }
                    if ($gCtrl) { $res.GpuFan = $gCtrl.Value }
                }
                if ($res.GpuFan -eq "N/A" -and $res.GpuFanCur -ne "N/A" -and $res.GpuFanMax -ne "N/A" -and $res.GpuFanMax -gt 0) {
                    $res.GpuFan = [int][math]::Min(100, [math]::Round(($res.GpuFanCur / $res.GpuFanMax) * 100, 0))
                }

                # 6. GPU Power Selection (from LHM)
                if ($gpuPowers.Count -gt 0) {
                    $gPwr = $gpuPowers | Where-Object { $_.Name -match "GPU Package|GPU Total|Board Power|Package|Power" } | Select-Object -First 1
                    if (-not $gPwr) { $gPwr = $gpuPowers[0] }
                    if ($gPwr) { $res.GpuPower = $gPwr.Value }
                }

                # 7. GPU Core Clock Selection (from LHM)
                if ($gpuClocks.Count -gt 0) {
                    $gClk = $gpuClocks | Where-Object { $_.Name -match "GPU Core|Graphics" } | Select-Object -First 1
                    if (-not $gClk) { $gClk = $gpuClocks[0] }
                    if ($gClk) { $res.GpuFreq = $gClk.Value }
                }

                if ($res.Temp -ne "N/A" -or $res.FanCur -ne "N/A" -or $res.GpuFanCur -ne "N/A" -or $res.GpuPower -ne "N/A" -or $res.GpuFreq -ne "N/A") {
                    return $res
                }
            }
        }
    } catch {}

    # 2. Second Priority: WMI (for OpenHardwareMonitor or LHM <= 0.9.4 with WMI enabled)
    foreach ($ns in @("root/LibreHardwareMonitor", "root/OpenHardwareMonitor")) {
        try {
            $lhmSensors = Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction SilentlyContinue
            if ($lhmSensors) {
                $cpuTempSensors = $lhmSensors | Where-Object { $_.SensorType -eq "Temperature" -and ($_.Name -match "CPU|Core|Package|Tctl" -or $_.Identifier -match "cpu") }
                if ($cpuTempSensors) {
                    $pkg = $cpuTempSensors | Where-Object { $_.Name -match "Package|Tctl|Total" } | Select-Object -First 1
                    if (-not $pkg) { $pkg = $cpuTempSensors | Sort-Object -Property Value -Descending | Select-Object -First 1 }
                    if ($pkg -and $pkg.Value -gt 0) {
                        $res.Temp = [math]::Round($pkg.Value, 0)
                    }
                }

                $fanSensors = $lhmSensors | Where-Object { $_.SensorType -eq "Fan" -and $_.Name -notmatch "GPU" -and ($_.Identifier -notmatch "gpu" -or -not $_.Identifier) }
                $controlSensors = $lhmSensors | Where-Object { $_.SensorType -eq "Control" -and $_.Name -notmatch "GPU" -and ($_.Identifier -notmatch "gpu" -or -not $_.Identifier) }

                $fanRpm = $fanSensors | Where-Object { $_.Name -match "CPU" } | Select-Object -First 1
                if (-not $fanRpm) { $fanRpm = $fanSensors | Where-Object { $_.Name -match "Fan #1" } | Select-Object -First 1 }
                if (-not $fanRpm) { $fanRpm = $fanSensors | Where-Object { $_.Value -gt 0 } | Select-Object -First 1 }

                if ($fanRpm -and $fanRpm.Value -ge 0) {
                    $res.FanCur = [int][math]::Round($fanRpm.Value, 0)
                }

                $fanCtrl = $controlSensors | Where-Object { $_.Name -match "CPU" } | Select-Object -First 1
                if (-not $fanCtrl) { $fanCtrl = $controlSensors | Where-Object { $_.Name -match "Fan #1" } | Select-Object -First 1 }
                if (-not $fanCtrl) { $fanCtrl = $controlSensors | Where-Object { $_.Value -ge 0 } | Select-Object -First 1 }

                if ($fanCtrl -and $fanCtrl.Value -ge 0) {
                    $res.Fan = [int][math]::Round($fanCtrl.Value, 0)
                } elseif ($res.FanCur -ne "N/A" -and $res.FanMax -ne "N/A" -and $res.FanMax -gt 0) {
                    $res.Fan = [int][math]::Min(100, [math]::Round(($res.FanCur / $res.FanMax) * 100, 0))
                }

                $pwr = $lhmSensors | Where-Object { $_.SensorType -eq "Power" -and ($_.Identifier -match "cpu" -or ($_.Name -match "CPU Package|CPU Total|Package" -and $_.Name -notmatch "GPU")) } | Select-Object -First 1
                if ($pwr -and $pwr.Value -gt 0) {
                    $res.Power = [math]::Round($pwr.Value, 1)
                }

                $gTemp = $lhmSensors | Where-Object { $_.SensorType -eq "Temperature" -and $_.Name -match "GPU" } | Select-Object -First 1
                if ($gTemp -and $gTemp.Value -gt 0) {
                    $res.GpuTemp = [math]::Round($gTemp.Value, 0)
                }

                $gFanSensors = $lhmSensors | Where-Object { $_.SensorType -eq "Fan" -and ($_.Name -match "GPU" -or $_.Identifier -match "gpu") }
                if ($gFanSensors) {
                    $gFanRpm = $gFanSensors | Where-Object { $_.Value -gt 0 } | Select-Object -First 1
                    if (-not $gFanRpm) { $gFanRpm = $gFanSensors[0] }
                    if ($gFanRpm -and $gFanRpm.Value -ge 0) {
                        $res.GpuFanCur = [int][math]::Round($gFanRpm.Value, 0)
                    }
                }

                $gCtrlSensors = $lhmSensors | Where-Object { $_.SensorType -eq "Control" -and ($_.Name -match "GPU" -or $_.Identifier -match "gpu") }
                if ($gCtrlSensors) {
                    $gFanCtrl = $gCtrlSensors | Where-Object { $_.Name -match "Fan" } | Select-Object -First 1
                    if (-not $gFanCtrl) { $gFanCtrl = $gCtrlSensors | Where-Object { $_.Value -gt 0 } | Select-Object -First 1 }
                    if (-not $gFanCtrl) { $gFanCtrl = $gCtrlSensors[0] }
                    if ($gFanCtrl -and $gFanCtrl.Value -ge 0) {
                        $res.GpuFan = [int][math]::Round($gFanCtrl.Value, 0)
                    }
                }
                if ($res.GpuFan -eq "N/A" -and $res.GpuFanCur -ne "N/A" -and $res.GpuFanMax -ne "N/A" -and $res.GpuFanMax -gt 0) {
                    $res.GpuFan = [int][math]::Min(100, [math]::Round(($res.GpuFanCur / $res.GpuFanMax) * 100, 0))
                }

                $gPwrWmi = $lhmSensors | Where-Object { $_.SensorType -eq "Power" -and ($_.Name -match "GPU Package|GPU Total|GPU Power|Board Power" -or $_.Identifier -match "gpu.*power") } | Select-Object -First 1
                if ($gPwrWmi -and $gPwrWmi.Value -gt 0) {
                    $res.GpuPower = [math]::Round($gPwrWmi.Value, 0)
                }

                $gClkWmi = $lhmSensors | Where-Object { $_.SensorType -eq "Clock" -and ($_.Name -match "GPU Core|Graphics" -or $_.Identifier -match "gpu.*clock") } | Select-Object -First 1
                if ($gClkWmi -and $gClkWmi.Value -gt 0) {
                    $res.GpuFreq = [math]::Round($gClkWmi.Value, 0)
                }
                break
            }
        } catch {}
    }

    # 3. Third Priority: MSAcpi Fallback (Only if temp still N/A)
    if ($res.Temp -eq "N/A") {
        try {
            $tz = Get-CimInstance MSAcpi_ThermalZoneTemperature -Namespace root/wmi -Property CurrentTemperature -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($tz -and $tz.CurrentTemperature -gt 2732) {
                $res.Temp = [math]::Round(($tz.CurrentTemperature - 2732) / 10, 0)
            }
        } catch {}
    }

    return $res
}

$cmd = if ($env:SSH_ORIGINAL_COMMAND) { $env:SSH_ORIGINAL_COMMAND } elseif ($args.Count -gt 0) { $args[0] } else { "" }
switch ($cmd) {
    "shutdown"           { shutdown /s /t 0 }
    "sleep" {
        try { nvidia-smi -pm 1 2>$null } catch {}
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class SuspendHelper {
    [DllImport("powrprof.dll", SetLastError = true)]
    public static extern bool SetSuspendState(bool hibernate, bool forceCritical, bool disableWakeEvent);
}
"@ -ErrorAction SilentlyContinue
        [SuspendHelper]::SetSuspendState($false, $true, $false)
    }
    "sunshine-start"     { Start-Service SunshineService }
    "sunshine-stop"      { Stop-Service SunshineService }
    "sunshine-restart"   { Restart-Service SunshineService }
    "uptime" {
        $os = Get-CimInstance Win32_OperatingSystem
        $boot = $os.LastBootUpTime
        $ts = (Get-Date) - $boot
        $uptimeStr = "{0}d {1}h {2}m" -f $ts.Days, $ts.Hours, $ts.Minutes
        Write-Output $uptimeStr
    }
    "capabilities" {
        $hasNvidia = $false
        $hasAmd = $false
        $hasIntel = $false
        $gpuVendor = "none"

        try {
            $nvsmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
            if ($nvsmi) { 
                $hasNvidia = $true 
                $gpuVendor = "nvidia"
            }
        } catch {}

        if (-not $hasNvidia) {
            try {
                $vcs = Get-CimInstance Win32_VideoController -Property Name, PNPDeviceID -ErrorAction SilentlyContinue
                foreach ($vc in $vcs) {
                    if ($vc.PNPDeviceID -match "VEN_1002" -or $vc.Name -match "AMD|Radeon") {
                        $hasAmd = $true
                        $gpuVendor = "amd"
                        break
                    } elseif ($vc.PNPDeviceID -match "VEN_8086" -or $vc.Name -match "Intel|Arc") {
                        $hasIntel = $true
                        $gpuVendor = "intel"
                        break
                    }
                }
            } catch {}
        }
        $hasGpu = $hasNvidia -or $hasAmd -or $hasIntel

        $hasRapl = $false
        try {
            $cat = [System.Diagnostics.PerformanceCounterCategory]::Exists("Energy Meter")
            if ($cat) { $hasRapl = $true }
        } catch {}

        $hasSunshine = $false
        try {
            $svc = Get-Service SunshineService -ErrorAction SilentlyContinue
            if ($svc) { $hasSunshine = $true }
        } catch {}

        [PSCustomObject]@{
            protocol_version   = "1.0"
            os                 = "windows"
            supported_commands = @("shutdown", "sleep", "uptime", "sysinfo", "diagnostics", "capabilities", "sunshine-start", "sunshine-stop", "sunshine-restart")
            features           = [PSCustomObject]@{
                gpu                  = $hasGpu
                gpu_vendor           = $gpuVendor
                cpu_power            = $hasRapl
                cpu_temp             = $true
                disk_io              = $true
                net_io               = $true
                sunshine             = $hasSunshine
                foreground_app       = $true
                os_updates           = $true
            }
        } | ConvertTo-Json -Compress
    }
    "sysinfo" {
        # Initialize RAPL counter early so it samples in parallel with WMI and nvidia-smi (0ms extra wait)
        $energyCounter = $null
        try {
            $energyCounter = [System.Diagnostics.PerformanceCounter]::new("Energy Meter", "Power", "RAPL_Package0_PKG")
            [void]$energyCounter.NextValue() # Baseline sample (t0)
        } catch {}

        $proc = Get-CimInstance Win32_Processor -Property LoadPercentage, CurrentClockSpeed, MaxClockSpeed -ErrorAction SilentlyContinue | Select-Object -First 1
        $cpu = if ($proc) { [int]$proc.LoadPercentage } else { 0 }
        $cpuFreq = if ($proc -and $proc.CurrentClockSpeed) { [math]::Round($proc.CurrentClockSpeed / 1000, 2) } else { 0 }
        try {
            $perf = Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -Filter "Name='_Total'" -Property PercentProcessorPerformance -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($perf -and $proc.MaxClockSpeed) {
                $cpuFreq = [math]::Round(($proc.MaxClockSpeed * ($perf.PercentProcessorPerformance / 100)) / 1000, 2)
            }
        } catch {}

        # CPU temperature & fan (Priority: LibreHardwareMonitor Remote Web Server or WMI, then MSAcpi fallback)
        $hw = Get-HardwareSensors
        $cpuTemp = $hw.Temp
        $cpuFan = $hw.Fan
        $cpuFanCur = $hw.FanCur
        $cpuFanMax = $hw.FanMax
        $lhmCpuPower = $hw.Power

        $os = Get-CimInstance Win32_OperatingSystem -Property FreePhysicalMemory, TotalVisibleMemorySize -ErrorAction SilentlyContinue
        $ramFree = if ($os) { $os.FreePhysicalMemory } else { 0 }
        $ramTot = if ($os) { $os.TotalVisibleMemorySize } else { 0 }
        $ramUsed = [math]::Round(($ramTot - $ramFree) / 1048576, 1)
        $ramTotal = [math]::Round($ramTot / 1048576, 1)

        $gpuLoad = "N/A"
        $gpuTemp = "N/A"
        $gpuMemUsed = "N/A"
        $gpuMemTotal = "N/A"
        $gpuPower = "N/A"
        $gpuFreq = "N/A"
        $gpuFan = "N/A"
        $gpuFanCur = $hw.GpuFanCur
        $gpuFanMax = $hw.GpuFanMax

        try {
            $gpuRaw = nvidia-smi --query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw,clocks.current.graphics,fan.speed --format=csv,noheader,nounits 2>$null
            if ($gpuRaw) {
                $firstLine = ($gpuRaw | Out-String).Trim() -split "`n" | Select-Object -First 1
                $parts = $firstLine.Trim() -split ",\s*"
                if ($parts.Count -ge 4) {
                    $l = Get-SafeNumeric $parts[0] 0; if ($l -ne "N/A") { $gpuLoad = $l }
                    $t = Get-SafeNumeric $parts[1] 0; if ($t -ne "N/A") { $gpuTemp = $t }
                    $mu = Get-SafeNumeric $parts[2] 0; if ($mu -ne "N/A") { $gpuMemUsed = $mu }
                    $mt = Get-SafeNumeric $parts[3] 0; if ($mt -ne "N/A") { $gpuMemTotal = $mt }
                }
                if ($parts.Count -ge 5) {
                    $p = Get-SafeNumeric $parts[4] 0; if ($p -ne "N/A") { $gpuPower = $p }
                }
                if ($parts.Count -ge 6) {
                    $f = Get-SafeNumeric $parts[5] 0; if ($f -ne "N/A") { $gpuFreq = $f }
                }
                if ($parts.Count -ge 7) {
                    $fn = Get-SafeNumeric $parts[6] 0; if ($fn -ne "N/A") { $gpuFan = $fn }
                }
            }
        } catch {}

        # Fallbacks for GPU power & freq from LibreHardwareMonitor or alternate queries
        if (($gpuPower -eq "N/A" -or $gpuPower -le 0) -and $hw.GpuPower -and $hw.GpuPower -ne "N/A" -and $hw.GpuPower -gt 0) {
            $gpuPower = $hw.GpuPower
        }
        if ($gpuPower -eq "N/A" -or $gpuPower -le 0) {
            try {
                $altP = nvidia-smi --query-gpu=power.draw.instant,power.draw.average --format=csv,noheader,nounits 2>$null
                if ($altP) {
                    $altPartsP = (($altP | Out-String).Trim() -split "`n")[0].Trim() -split ",\s*"
                    foreach ($ap in $altPartsP) {
                        $p = Get-SafeNumeric $ap 0
                        if ($p -ne "N/A" -and $p -gt 0) { $gpuPower = $p; break }
                    }
                }
            } catch {}
        }
        if ($gpuFreq -eq "N/A" -and $hw.GpuFreq -and $hw.GpuFreq -ne "N/A" -and $hw.GpuFreq -gt 0) {
            $gpuFreq = $hw.GpuFreq
        }
        if ($gpuFreq -eq "N/A") {
            try {
                $alt = nvidia-smi --query-gpu=clocks.current.sm,clocks.sm,clocks.max.graphics --format=csv,noheader,nounits 2>$null
                if ($alt) {
                    $altParts = (($alt | Out-String).Trim() -split "`n")[0].Trim() -split ",\s*"
                    foreach ($ap in $altParts) {
                        $f = Get-SafeNumeric $ap 0
                        if ($f -ne "N/A" -and $f -gt 0) { $gpuFreq = $f; break }
                    }
                }
            } catch {}
        }

        if ($gpuFan -eq "N/A" -and $hw.GpuFan -ne "N/A") {
            $gpuFan = $hw.GpuFan
        }

        # Fallback for AMD Radeon / Intel Arc / Other GPUs via Windows WDDM Performance Counters
        if ($gpuLoad -eq "N/A") {
            try {
                $gpuEngines = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -Filter "Name like '%engtype_3D%'" -Property UtilizationPercentage -ErrorAction SilentlyContinue
                if ($gpuEngines) {
                    $maxLoad = ($gpuEngines | Measure-Object -Property UtilizationPercentage -Maximum).Maximum
                    if ($maxLoad -ne $null) {
                        $gpuLoad = [int]$maxLoad
                    }
                }
            } catch {}

            try {
                $adapterMems = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory -Property DedicatedUsage -ErrorAction SilentlyContinue
                if ($adapterMems) {
                    $totalDed = ($adapterMems | Measure-Object -Property DedicatedUsage -Sum).Sum
                    if ($totalDed -gt 0) {
                        $gpuMemUsed = [math]::Round($totalDed / 1MB, 0)
                    }
                }
            } catch {}

            try {
                $vc = Get-CimInstance Win32_VideoController -Property Name, AdapterRAM -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch "Basic Display|Remote|Virtual" } | Select-Object -First 1
                if ($vc) {
                    $totalVramBytes = 0
                    try {
                        $regKeys = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\000*" -ErrorAction SilentlyContinue
                        foreach ($rk in $regKeys) {
                            if ($rk.DriverDesc -eq $vc.Name -and $rk."HardwareInformation.qwMemorySize") {
                                $totalVramBytes = [int64]$rk."HardwareInformation.qwMemorySize"
                                break
                            }
                        }
                    } catch {}
                    if ($totalVramBytes -gt 0) {
                        $gpuMemTotal = [math]::Round($totalVramBytes / 1MB, 0)
                    } elseif ($vc.AdapterRAM -gt 0) {
                        $gpuMemTotal = [math]::Round($vc.AdapterRAM / 1MB, 0)
                    }
                }
            } catch {}

            # Optional thermal reading via LibreHardwareMonitor / OpenHardwareMonitor
            if ($gpuTemp -eq "N/A" -and $hw.GpuTemp -ne "N/A") {
                $gpuTemp = $hw.GpuTemp
            }
        }

        # Read RAPL power now that WMI & nvidia-smi queries have elapsed naturally
        $cpuPower = "N/A"
        if ($energyCounter) {
            try {
                $rawPwr = $energyCounter.NextValue()
                if ($rawPwr -le 0) {
                    Start-Sleep -Milliseconds 40
                    $rawPwr = $energyCounter.NextValue()
                }
                if ($rawPwr -gt 0) {
                    $cpuPower = [math]::Round($rawPwr / 1000, 1)
                }
                $energyCounter.Dispose()
            } catch {}
        }

        if ($cpuPower -eq "N/A" -and $lhmCpuPower) {
            $cpuPower = $lhmCpuPower
        }

        [PSCustomObject]@{
            cpu           = $cpu
            cpu_power     = $cpuPower
            cpu_temp      = $cpuTemp
            cpu_fan       = $cpuFan
            cpu_fan_cur   = $cpuFanCur
            cpu_fan_max   = $cpuFanMax
            cpu_freq      = $cpuFreq
            ram_used      = $ramUsed
            ram_total     = $ramTotal
            gpu_load      = $gpuLoad
            gpu_temp      = $gpuTemp
            gpu_fan       = $gpuFan
            gpu_fan_cur   = $gpuFanCur
            gpu_fan_max   = $gpuFanMax
            gpu_freq      = $gpuFreq
            gpu_mem_used  = $gpuMemUsed
            gpu_mem_total = $gpuMemTotal
            gpu_power     = $gpuPower
        } | ConvertTo-Json -Compress
    }
    "diagnostics" {
        # Initialize RAPL counter early so it samples in parallel with WMI queries (0ms extra wait)
        $energyCounter = $null
        try {
            $energyCounter = [System.Diagnostics.PerformanceCounter]::new("Energy Meter", "Power", "RAPL_Package0_PKG")
            [void]$energyCounter.NextValue() # Baseline sample (t0)
        } catch {}

        # ── 1. Fast CPU, RAM & Power ──
        $proc = Get-CimInstance Win32_Processor -Property LoadPercentage, CurrentClockSpeed, MaxClockSpeed, Name -ErrorAction SilentlyContinue | Select-Object -First 1
        $cpu = if ($proc) { [int]$proc.LoadPercentage } else { 0 }
        $cpuName = if ($proc -and $proc.Name) { $proc.Name.Trim() } else { "CPU" }
        $cpuFreq = if ($proc -and $proc.CurrentClockSpeed) { [math]::Round($proc.CurrentClockSpeed / 1000, 2) } else { 0 }
        try {
            $perf = Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -Filter "Name='_Total'" -Property PercentProcessorPerformance -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($perf -and $proc.MaxClockSpeed) {
                $cpuFreq = [math]::Round(($proc.MaxClockSpeed * ($perf.PercentProcessorPerformance / 100)) / 1000, 2)
            }
        } catch {}

        # CPU temperature & fan (Priority: LibreHardwareMonitor Remote Web Server or WMI, then MSAcpi fallback)
        $hw = Get-HardwareSensors
        $cpuTemp = $hw.Temp
        $cpuFan = $hw.Fan
        $cpuFanCur = $hw.FanCur
        $cpuFanMax = $hw.FanMax
        $lhmCpuPower = $hw.Power

        $os = Get-CimInstance Win32_OperatingSystem -Property FreePhysicalMemory, TotalVisibleMemorySize, LastBootUpTime -ErrorAction SilentlyContinue
        $ramFree = if ($os) { $os.FreePhysicalMemory } else { 0 }
        $ramTot = if ($os) { $os.TotalVisibleMemorySize } else { 0 }
        $ramUsed = [math]::Round(($ramTot - $ramFree) / 1048576, 1)
        $ramTotal = [math]::Round($ramTot / 1048576, 1)
        $ramPct = if ($ramTot -gt 0) { [math]::Round((($ramTot - $ramFree) / $ramTot) * 100, 0) } else { 0 }

        # Read RAPL power now that WMI queries have elapsed naturally
        $cpuPower = "N/A"
        if ($energyCounter) {
            try {
                $rawPwr = $energyCounter.NextValue()
                if ($rawPwr -le 0) {
                    Start-Sleep -Milliseconds 40
                    $rawPwr = $energyCounter.NextValue()
                }
                if ($rawPwr -gt 0) {
                    $cpuPower = [math]::Round($rawPwr / 1000, 1)
                }
                $energyCounter.Dispose()
            } catch {}
        }
        if ($cpuPower -eq "N/A" -and $lhmCpuPower) {
            $cpuPower = $lhmCpuPower
        }

        # Single .NET in-memory process snapshot (<5ms vs multiple Get-Process scans)
        $allProcs = [System.Diagnostics.Process]::GetProcesses()

        # Top 3 processes by CPU % & RAM (Lightweight targeted WMI Perf counter)
        $topProcs = @()
        try {
            $cpuCores = [Environment]::ProcessorCount
            if ($cpuCores -lt 1) { $cpuCores = 1 }
            
            $perfProcs = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "PercentProcessorTime > 0 and Name != '_Total' and Name != 'Idle'" -Property IDProcess, Name, PercentProcessorTime, WorkingSetPrivate -ErrorAction SilentlyContinue | Sort-Object -Property PercentProcessorTime -Descending | Select-Object -First 3
            if ($perfProcs) {
                foreach ($p in $perfProcs) {
                    $pName = ($p.Name -replace '#\d+$', '') + ".exe"
                    $cpuPct = [math]::Round($p.PercentProcessorTime / $cpuCores, 0)
                    $memMB = [math]::Round($p.WorkingSetPrivate / 1MB, 0)
                    $memStr = if ($memMB -ge 1024) { "{0:N1} GB" -f ($memMB / 1024) } else { "$memMB MB" }
                    $topProcs += [PSCustomObject]@{
                        pid  = [int]$p.IDProcess
                        name = $pName
                        cpu  = $cpuPct
                        mem  = $memStr
                    }
                }
            }
            
            if ($topProcs.Count -lt 3) {
                $memProcs = $allProcs | Where-Object { 
                    $_.Id -gt 4 -and $_.ProcessName -notin @("Idle", "System", "Memory Compression") -and $_.ProcessName -notin ($topProcs.name -replace '\.exe$', '') 
                } | Sort-Object -Property WorkingSet64 -Descending | Select-Object -First (3 - $topProcs.Count)
                foreach ($p in $memProcs) {
                    $memMB = [math]::Round($p.WorkingSet64 / 1MB, 0)
                    $memStr = if ($memMB -ge 1024) { "{0:N1} GB" -f ($memMB / 1024) } else { "$memMB MB" }
                    $topProcs += [PSCustomObject]@{
                        pid  = [int]$p.Id
                        name = $p.ProcessName + ".exe"
                        cpu  = 0
                        mem  = $memStr
                    }
                }
            }
        } catch {}

        # ── 2. GPU & VRAM ──
        $gpuName = "GPU"
        $gpuDriver = "N/A"
        $gpuLoad = "N/A"
        $gpuTemp = "N/A"
        $gpuMemUsed = "N/A"
        $gpuMemTotal = "N/A"
        $gpuPower = "N/A"
        $gpuPowerLimit = 0
        $gpuFreq = "N/A"
        $gpuFan = "N/A"
        $gpuFanCur = $hw.GpuFanCur
        $gpuFanMax = $hw.GpuFanMax
        $gpuEnc = "N/A"

        try {
            $gpuRaw = nvidia-smi --query-gpu=name,driver_version,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw,clocks.current.graphics,fan.speed,utilization.encoder,power.limit --format=csv,noheader,nounits 2>$null
            if ($gpuRaw) {
                $firstLine = ($gpuRaw | Out-String).Trim() -split "`n" | Select-Object -First 1
                $parts = $firstLine.Trim() -split ",\s*"
                if ($parts.Count -ge 6) {
                    if ($parts[0] -and $parts[0].Trim() -ne "N/A") { $gpuName = $parts[0].Trim() }
                    if ($parts[1] -and $parts[1].Trim() -ne "N/A") { $gpuDriver = $parts[1].Trim() }
                    $l = Get-SafeNumeric $parts[2] 0; if ($l -ne "N/A") { $gpuLoad = $l }
                    $t = Get-SafeNumeric $parts[3] 0; if ($t -ne "N/A") { $gpuTemp = $t }
                    $mu = Get-SafeNumeric $parts[4] 0; if ($mu -ne "N/A") { $gpuMemUsed = $mu }
                    $mt = Get-SafeNumeric $parts[5] 0; if ($mt -ne "N/A") { $gpuMemTotal = $mt }
                }
                if ($parts.Count -ge 7) {
                    $p = Get-SafeNumeric $parts[6] 0; if ($p -ne "N/A") { $gpuPower = $p }
                }
                if ($parts.Count -ge 8) {
                    $f = Get-SafeNumeric $parts[7] 0; if ($f -ne "N/A") { $gpuFreq = $f }
                }
                if ($parts.Count -ge 9) {
                    $fn = Get-SafeNumeric $parts[8] 0; if ($fn -ne "N/A") { $gpuFan = $fn }
                }
                if ($parts.Count -ge 10) {
                    $enc = Get-SafeNumeric $parts[9] 0; if ($enc -ne "N/A") { $gpuEnc = $enc }
                }
                if ($parts.Count -ge 11) {
                    $pl = Get-SafeNumeric $parts[10] 0; if ($pl -ne "N/A") { $gpuPowerLimit = $pl }
                }
            }
        } catch {}

        # Fallbacks for GPU power & freq from LibreHardwareMonitor or alternate queries
        if (($gpuPower -eq "N/A" -or $gpuPower -le 0) -and $hw.GpuPower -and $hw.GpuPower -ne "N/A" -and $hw.GpuPower -gt 0) {
            $gpuPower = $hw.GpuPower
        }
        if ($gpuPower -eq "N/A" -or $gpuPower -le 0) {
            try {
                $altP = nvidia-smi --query-gpu=power.draw.instant,power.draw.average --format=csv,noheader,nounits 2>$null
                if ($altP) {
                    $altPartsP = (($altP | Out-String).Trim() -split "`n")[0].Trim() -split ",\s*"
                    foreach ($ap in $altPartsP) {
                        $p = Get-SafeNumeric $ap 0
                        if ($p -ne "N/A" -and $p -gt 0) { $gpuPower = $p; break }
                    }
                }
            } catch {}
        }
        if ($gpuPowerLimit -le 0) {
            try {
                $altPl = nvidia-smi --query-gpu=enforced.power.limit,power.default_limit,power.max_limit --format=csv,noheader,nounits 2>$null
                if ($altPl) {
                    $altPlParts = (($altPl | Out-String).Trim() -split "`n")[0].Trim() -split ",\s*"
                    foreach ($ap in $altPlParts) {
                        $pl = Get-SafeNumeric $ap 0
                        if ($pl -ne "N/A" -and $pl -gt 0) { $gpuPowerLimit = $pl; break }
                    }
                }
            } catch {}
        }
        if ($gpuPowerLimit -le 0) {
            if ($gpuName -match "4090") { $gpuPowerLimit = 450 }
            elseif ($gpuName -match "4080") { $gpuPowerLimit = 320 }
            elseif ($gpuName -match "4070") { $gpuPowerLimit = 200 }
            elseif ($gpuName -match "3090") { $gpuPowerLimit = 350 }
            elseif ($gpuName -match "3080") { $gpuPowerLimit = 320 }
        }
        if ($gpuFreq -eq "N/A" -and $hw.GpuFreq -and $hw.GpuFreq -ne "N/A" -and $hw.GpuFreq -gt 0) {
            $gpuFreq = $hw.GpuFreq
        }
        if ($gpuFreq -eq "N/A") {
            try {
                $alt = nvidia-smi --query-gpu=clocks.current.sm,clocks.sm,clocks.max.graphics --format=csv,noheader,nounits 2>$null
                if ($alt) {
                    $altParts = (($alt | Out-String).Trim() -split "`n")[0].Trim() -split ",\s*"
                    foreach ($ap in $altParts) {
                        $f = Get-SafeNumeric $ap 0
                        if ($f -ne "N/A" -and $f -gt 0) { $gpuFreq = $f; break }
                    }
                }
            } catch {}
        }

        # Fallback for AMD Radeon / Intel Arc / Other GPUs via Win32_VideoController & WDDM Performance Counters
        if ($gpuLoad -eq "N/A") {
            try {
                $vc = Get-CimInstance Win32_VideoController -Property Name, DriverVersion, AdapterRAM -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch "Basic Display|Remote|Virtual" } | Select-Object -First 1
                if ($vc) {
                    $gpuName = $vc.Name
                    $gpuDriver = if ($vc.DriverVersion) { $vc.DriverVersion } else { "N/A" }

                    # 64-bit Total VRAM from registry or 32-bit AdapterRAM
                    $totalVramBytes = 0
                    try {
                        $regKeys = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\000*" -ErrorAction SilentlyContinue
                        foreach ($rk in $regKeys) {
                            if ($rk.DriverDesc -eq $vc.Name -and $rk."HardwareInformation.qwMemorySize") {
                                $totalVramBytes = [int64]$rk."HardwareInformation.qwMemorySize"
                                break
                            }
                        }
                    } catch {}
                    if ($totalVramBytes -gt 0) {
                        $gpuMemTotal = [math]::Round($totalVramBytes / 1MB, 0)
                    } elseif ($vc.AdapterRAM -gt 0) {
                        $gpuMemTotal = [math]::Round($vc.AdapterRAM / 1MB, 0)
                    }

                    # VRAM Dedicated Usage
                    try {
                        $adapterMems = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory -Property DedicatedUsage -ErrorAction SilentlyContinue
                        if ($adapterMems) {
                            $totalDed = ($adapterMems | Measure-Object -Property DedicatedUsage -Sum).Sum
                            if ($totalDed -gt 0) {
                                $gpuMemUsed = [math]::Round($totalDed / 1MB, 0)
                            }
                        }
                    } catch {}

                    # GPU 3D Load %
                    try {
                        $gpuEngines = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -Filter "Name like '%engtype_3D%'" -Property UtilizationPercentage -ErrorAction SilentlyContinue
                        if ($gpuEngines) {
                            $maxLoad = ($gpuEngines | Measure-Object -Property UtilizationPercentage -Maximum).Maximum
                            if ($maxLoad -ne $null) {
                                $gpuLoad = [int]$maxLoad
                            }
                        }
                    } catch {}

                    # Video Encoder %
                    try {
                        $gpuEncEngines = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -Filter "Name like '%engtype_VideoEncode%'" -Property UtilizationPercentage -ErrorAction SilentlyContinue
                        if ($gpuEncEngines) {
                            $maxEnc = ($gpuEncEngines | Measure-Object -Property UtilizationPercentage -Maximum).Maximum
                            if ($maxEnc -ne $null) {
                                $gpuEnc = [int]$maxEnc
                            }
                        }
                    } catch {}
                }
            } catch {}

            # Check LibreHardwareMonitor / OpenHardwareMonitor for AMD/Intel GPU thermals
            if ($gpuTemp -eq "N/A" -and $hw.GpuTemp -ne "N/A") {
                $gpuTemp = $hw.GpuTemp
            }
        }

        # Fallback for GPU fan from LibreHardwareMonitor / OpenHardwareMonitor
        if (($gpuFan -eq "N/A" -or $gpuFan -match "\[Not Supported\]") -and $hw.GpuFan -ne "N/A") {
            $gpuFan = $hw.GpuFan
        }

        # ── 3. Disks / Partitions ──
        $disks = @()
        try {
            $drives = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -Property DeviceID, VolumeName, Size, FreeSpace -ErrorAction SilentlyContinue
            foreach ($d in $drives) {
                $totalGB = [math]::Round($d.Size / 1GB, 1)
                $freeGB  = [math]::Round($d.FreeSpace / 1GB, 1)
                $usedGB  = [math]::Round(($d.Size - $d.FreeSpace) / 1GB, 1)
                $pct     = if ($d.Size -gt 0) { [math]::Round((($d.Size - $d.FreeSpace) / $d.Size) * 100, 0) } else { 0 }
                $label   = if ($d.VolumeName) { $d.VolumeName } else { "Local Disk" }
                $disks += [PSCustomObject]@{
                    device = $d.DeviceID
                    label  = $label
                    total  = $totalGB
                    free   = $freeGB
                    used   = $usedGB
                    pct    = $pct
                }
            }
        } catch {}

        # Disk I/O throughput (Read / Write MB/s)
        $diskReadMB = 0
        $diskWriteMB = 0
        try {
            $diskPerf = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -Filter "Name='_Total'" -Property DiskReadBytesPerSec, DiskWriteBytesPerSec -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($diskPerf) {
                $diskReadMB  = [math]::Round($diskPerf.DiskReadBytesPerSec / 1MB, 1)
                $diskWriteMB = [math]::Round($diskPerf.DiskWriteBytesPerSec / 1MB, 1)
            }
        } catch {}

        # ── 4. Network Bandwidth (Fast WMI NetConnectionStatus = 2) ──
        $netRecvMB = 0
        $netSentMB = 0
        $netAdapterName = "Ethernet"
        try {
            # Fast WMI check without importing the heavy NetAdapter CDXML module
            $upNics = @(Get-CimInstance Win32_NetworkAdapter -Filter "NetConnectionStatus = 2" -Property Name, NetConnectionID -ErrorAction SilentlyContinue)
            $upNames = @($upNics | ForEach-Object { ($_.Name -replace '\(', '[' -replace '\)', ']').Trim() })

            $allNics = Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface -Property Name, BytesReceivedPerSec, BytesSentPerSec, BytesTotalPerSec -ErrorAction SilentlyContinue | Where-Object { 
                $_.Name -notmatch "isatap|Teredo|Loopback|Pseudo|6to4|TAP|VPN" 
            }

            $netInterfaces = if ($upNames.Count -gt 0) {
                $allNics | Where-Object { $upNames -contains $_.Name.Trim() }
            } else {
                $allNics
            }

            if ($netInterfaces) {
                $totalRecvBytes = ($netInterfaces | Measure-Object -Property BytesReceivedPerSec -Sum).Sum
                $totalSentBytes = ($netInterfaces | Measure-Object -Property BytesSentPerSec -Sum).Sum
                if ($totalRecvBytes) { $netRecvMB = [math]::Round($totalRecvBytes / 1MB, 2) }
                if ($totalSentBytes) { $netSentMB = [math]::Round($totalSentBytes / 1MB, 2) }

                $activeNic = $netInterfaces | Sort-Object -Property BytesTotalPerSec -Descending | Select-Object -First 1
                if ($activeNic) {
                    $cleanName = ($activeNic.Name -replace '\[.*?\]', '').Trim()
                    $cleanName = $cleanName -replace '\(R\)|\(TM\)|Gigabit Network Connection|Ethernet Connection \(\d+\)|Family Controller|PCIe Controller', '' -replace '\s+', ' '
                    $netAdapterName = $cleanName.Trim()
                }
            }
        } catch {}

        # ── 5. Sunshine Streams & Session (Fast in-memory check) ──
        $sunshineRunning = $false
        $sunshineClients = 0
        try {
            $sunProc = $allProcs | Where-Object { $_.ProcessName -eq "sunshine" } | Select-Object -First 1
            if ($sunProc) {
                $sunshineRunning = $true
                $conns = Get-NetTCPConnection -State Established -OwningProcess $sunProc.Id -ErrorAction SilentlyContinue | Where-Object { 
                    $_.RemoteAddress -and $_.RemoteAddress -ne "127.0.0.1" -and $_.RemoteAddress -ne "::1" 
                }
                if ($conns) {
                    $uniqueIps = @($conns | Select-Object -ExpandProperty RemoteAddress -Unique)
                    $sunshineClients = $uniqueIps.Count
                }
                if ($sunshineClients -eq 0 -and $gpuEnc -ne "N/A" -and [int]$gpuEnc -gt 0) {
                    $sunshineClients = 1
                }
            }
        } catch {}

        # Windows Uptime
        $uptimeStr = "N/A"
        try {
            if ($os -and $os.LastBootUpTime) {
                $ts = (Get-Date) - $os.LastBootUpTime
                $uptimeStr = "{0}d {1}h {2}m" -f $ts.Days, $ts.Hours, $ts.Minutes
            }
        } catch {}

        # ── Windows Edition, Version, Build & Update Status ──
        $winEdition = "Windows"
        $winVer = ""
        $winBuild = ""
        try {
            $cv = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion" -ErrorAction SilentlyContinue
            if ($cv) {
                $prod = [string]$cv.ProductName
                $buildNum = [int]$cv.CurrentBuild
                if ($buildNum -ge 22000 -and $prod -match "Windows 10") {
                    $prod = $prod -replace "Windows 10", "Windows 11"
                }
                $winEdition = $prod
                $winVer = [string]$cv.DisplayVersion
                $ubr = $cv.UBR
                if ($ubr) {
                    $winBuild = "$($cv.CurrentBuild).$ubr"
                } else {
                    $winBuild = "$($cv.CurrentBuild)"
                }
            }
        } catch {}

        # Last successful Windows Update install date
        $winUpdateDate = ""
        $winUpdateRaw = ""
        try {
            $auInstall = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\Results\Install" -ErrorAction SilentlyContinue
            if ($auInstall -and $auInstall.LastSuccessTime) {
                $winUpdateRaw = [string]$auInstall.LastSuccessTime
                try {
                    $dt = [datetime]$auInstall.LastSuccessTime
                    $winUpdateDate = $dt.ToString("dd/MM")
                } catch {
                    if ($winUpdateRaw -match "\d{4}-\d{2}-\d{2}") {
                        $parts = $matches[0].Split('-')
                        $winUpdateDate = "$($parts[2])/$($parts[1])"
                    } else {
                        $winUpdateDate = $winUpdateRaw.Split(' ')[0]
                    }
                }
            }
        } catch {}

        # Windows Update reboot required & pending KB detection
        $rebootPending = $false
        $rebootKb = $null
        try {
            $wuPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired"
            $cbsPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending"

            if (Test-Path $wuPath) {
                $rebootPending = $true
                $k = Get-Item $wuPath -ErrorAction SilentlyContinue
                if ($k) {
                    $items = @($k.GetValueNames()) + @($k.GetSubKeyNames())
                    foreach ($item in $items) {
                        if ($item -match "KB\d{6,8}") {
                            $rebootKb = $matches[0]
                            break
                        }
                    }
                }
            }

            if (Test-Path $cbsPath) {
                $rebootPending = $true
                if (-not $rebootKb) {
                    $k = Get-Item $cbsPath -ErrorAction SilentlyContinue
                    if ($k) {
                        $items = @($k.GetValueNames()) + @($k.GetSubKeyNames())
                        foreach ($item in $items) {
                            if ($item -match "KB\d{6,8}") {
                                $rebootKb = $matches[0]
                                break
                            }
                        }
                    }
                }
            }
        } catch {}

        # Active Game / Top User App detection (Using in-memory process list)
        $foregroundApp = "Windows Desktop"
        $foregroundExe = "explorer.exe"
        $foregroundRuntime = ""
        $foregroundLauncher = "desktop"
        $foregroundHealthy = $true
        $foregroundPid = $null
        try {
            $excludedProcs = @(
                "explorer", "ApplicationFrameHost", "ShellExperienceHost", "SearchHost", "SearchApp",
                "TextInputHost", "StartMenuExperienceHost", "LockApp", "dwm", "dwmp", "audiodg",
                "svchost", "conhost", "cmd", "powershell", "sshd", "System", "Idle", "Registry",
                "smss", "csrss", "wininit", "services", "lsass", "fontdrvhost", "sihost", "taskhostw",
                "ctfmon", "RuntimeBroker", "SecurityHealthService", "SecurityHealthSystray", "smartscreen",
                "msedgewebview2", "WmiPrvSE", "taskmgr",
                "steam", "steamwebhelper", "steamservice", "EpicGamesLauncher", "EpicWebHelper",
                "EADesktop", "EABackgroundService", "Origin", "OriginWebHelperService",
                "Battle.net", "Agent", "upc", "Uplay", "UplayWebCore", "GalaxyClient", "GalaxyClientService",
                "sunshine", "nvcontainer", "NVIDIA Share", "nvspcaps64", "RTSS", "RTSSHooksLoader64",
                "RadeonSoftware", "AMDRSServ", "AMDOWrapper", "IntelArcControl", "igfxEM", "igfxCUIService64",
                "MSIAfterburner", "Discord", "Spotify", "chrome", "firefox", "msedge",
                "RazerSynapse", "RzSDKServer", "iCUE", "Corsair.Service", "LGDCore", "lghub",
                "lghub_agent", "steelseries-gg", "ArmouryCrate"
            )

            $windowProc = $allProcs | Where-Object { 
                $_.SessionId -gt 0 -and $_.MainWindowHandle -ne 0 -and $_.ProcessName -notin $excludedProcs 
            } | Sort-Object -Property WorkingSet64 -Descending | Select-Object -First 1

            $targetProc = $null
            if ($windowProc) {
                $targetProc = $windowProc
            } else {
                $heavyProc = $allProcs | Where-Object { 
                    $_.SessionId -gt 0 -and $_.ProcessName -notin $excludedProcs -and $_.WorkingSet64 -gt 350MB
                } | Sort-Object -Property WorkingSet64 -Descending | Select-Object -First 1

                if ($heavyProc) {
                    $targetProc = $heavyProc
                }
            }

            if ($targetProc) {
                # 1. Detect executable path first
                $p = $null
                try {
                    $p = $targetProc.Path
                    if (-not $p -and $targetProc.MainModule) {
                        $p = $targetProc.MainModule.FileName
                    }
                } catch {}

                # 2. Extract best human-friendly game / application name
                $cleanTitle = ""
                try {
                    if ($targetProc.MainWindowTitle) {
                        $t = $targetProc.MainWindowTitle.Trim()
                        if ($t -and $t -notmatch "\.exe$") {
                            $cleanTitle = $t
                        }
                    }
                } catch {}

                # If window title is empty (common in exclusive fullscreen DirectX 12 games), inspect PE FileDescription
                if (-not $cleanTitle -and $p) {
                    try {
                        if (Test-Path $p) {
                            $fvi = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($p)
                            if ($fvi.FileDescription -and $fvi.FileDescription.Trim()) {
                                $cleanTitle = $fvi.FileDescription.Trim()
                            } elseif ($fvi.ProductName -and $fvi.ProductName.Trim()) {
                                $cleanTitle = $fvi.ProductName.Trim()
                            }
                        }
                    } catch {}
                }

                if ($cleanTitle) {
                    $cleanTitle = $cleanTitle -replace "(?i)\s+-\s+Steam$", "" -replace "(?i)\s+\(64-bit\)$", ""
                    $foregroundApp = $cleanTitle
                } else {
                    $foregroundApp = $targetProc.ProcessName + ".exe"
                }

                $foregroundExe = $targetProc.ProcessName + ".exe"
                $foregroundPid = $targetProc.Id
                try { $foregroundHealthy = $targetProc.Responding } catch {}

                # Session runtime
                try {
                    if ($targetProc.StartTime) {
                        $ts = (Get-Date) - $targetProc.StartTime
                        if ($ts.TotalHours -ge 1) {
                            $foregroundRuntime = "{0}h {1}m" -f [int][math]::Floor($ts.TotalHours), $ts.Minutes
                        } else {
                            $foregroundRuntime = "{0}m" -f [int][math]::Max(1, [math]::Floor($ts.TotalMinutes))
                        }
                    }
                } catch {}

                # Launcher platform detection
                try {
                    if ($p) {
                        if ($p -match "(?i)\\steamapps\\|\\Steam\\") {
                            $foregroundLauncher = "steam"
                        } elseif ($p -match "(?i)\\Epic Games\\") {
                            $foregroundLauncher = "epic"
                        } elseif ($p -match "(?i)\\WindowsApps\\|\\XboxGames\\") {
                            $foregroundLauncher = "xbox"
                        } elseif ($p -match "(?i)\\Battle\.net\\") {
                            $foregroundLauncher = "battlenet"
                        } elseif ($p -match "(?i)\\Ubisoft\\|\\Ubisoft Game Launcher\\") {
                            $foregroundLauncher = "ubisoft"
                        } elseif ($p -match "(?i)\\GOG Galaxy\\|\\GOG Games\\") {
                            $foregroundLauncher = "gog"
                        } elseif ($p -match "(?i)\\EA Games\\|\\Electronic Arts\\") {
                            $foregroundLauncher = "ea"
                        } else {
                            $foregroundLauncher = "standalone"
                        }
                    } else {
                        $foregroundLauncher = "standalone"
                    }
                } catch {
                    $foregroundLauncher = "standalone"
                }
            }
        } catch {}

        [PSCustomObject]@{
            cpu_name         = $cpuName
            cpu_load         = $cpu
            cpu_power        = $cpuPower
            cpu_temp         = $cpuTemp
            cpu_fan          = $cpuFan
            cpu_fan_cur      = $cpuFanCur
            cpu_fan_max      = $cpuFanMax
            cpu_freq         = $cpuFreq
            ram_used         = $ramUsed
            ram_total        = $ramTotal
            ram_pct          = $ramPct
            top_procs        = $topProcs
            gpu_name         = $gpuName
            gpu_driver       = $gpuDriver
            gpu_load         = $gpuLoad
            gpu_temp         = $gpuTemp
            gpu_freq         = $gpuFreq
            gpu_fan          = $gpuFan
            gpu_fan_cur      = $gpuFanCur
            gpu_fan_max      = $gpuFanMax
            gpu_enc          = $gpuEnc
            gpu_mem_used     = $gpuMemUsed
            gpu_mem_total    = $gpuMemTotal
            gpu_power        = $gpuPower
            gpu_power_limit  = $gpuPowerLimit
            disks            = $disks
            disk_read_mb     = $diskReadMB
            disk_write_mb    = $diskWriteMB
            net_recv_mb      = $netRecvMB
            net_sent_mb      = $netSentMB
            net_adapter      = $netAdapterName
            sunshine_running = $sunshineRunning
            sunshine_clients = $sunshineClients
            uptime           = $uptimeStr
            win_edition      = $winEdition
            win_ver          = $winVer
            win_build        = $winBuild
            win_update_date  = $winUpdateDate
            win_update_raw   = $winUpdateRaw
            reboot_pending      = $rebootPending
            reboot_kb           = $rebootKb
            foreground_app      = $foregroundApp
            foreground_exe      = $foregroundExe
            foreground_runtime  = $foregroundRuntime
            foreground_launcher = $foregroundLauncher
            foreground_healthy  = $foregroundHealthy
            foreground_pid      = $foregroundPid
        } | ConvertTo-Json -Compress -Depth 4
    }
    default              { Write-Error "Unknown command: $cmd"; exit 1 }
}
