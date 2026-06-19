param(
    [string]$TaskName = "PopOutPick Monitor",
    [string]$NodePath = "C:\Program Files\nodejs\node.exe",
    [string]$ProjectPath = "C:\PopOutPickWeb\Seperate"
)

$scriptPath = Join-Path $ProjectPath "tools\monitor.js"
$action = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$scriptPath`"" -WorkingDirectory $ProjectPath
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
Write-Host "Installed scheduled task: $TaskName"
