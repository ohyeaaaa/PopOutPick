param(
    [string]$TaskName = "PopOutPick Website"
)

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Removed scheduled task: $TaskName"
