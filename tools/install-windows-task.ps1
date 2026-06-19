param(
    [string]$TaskName = "PopOutPick Website",
    [string]$NodePath = "C:\Program Files\nodejs\node.exe",
    [string]$ProjectPath = "C:\PopOutPickWeb\Seperate"
)

$scriptPath = Join-Path $ProjectPath "server.js"
$action = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$scriptPath`"" -WorkingDirectory $ProjectPath
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
Write-Host "Installed scheduled task: $TaskName"
