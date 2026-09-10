<#
.SYNOPSIS
Install bridge.mjs as a named scheduled task on Windows.

.DESCRIPTION
Every N minutes, one short check of the Telegram inbox. If a message is waiting, it runs the
agent on it in -WorkDir and sends the answer back. Nothing runs between checks - one tick costs
about 0.16s of CPU.

Why a named task and not a background script: a detached loop is what once kept sending messages
for hours after its files were deleted, because it had no name. A named task is listed, stops
with one line, and cannot silently multiply.

READ THIS FIRST. The bridge and a live session read the same mailbox, and the bridge usually
wins - see "The bridge and a live session compete" in references/reachability.md. If you sit at
an open session and want your messages to land *in it*, you want the Stop hook, not this. This
script refuses to install silently over a wired Stop hook; pass -Force if you meant it.

.PARAMETER WorkDir
Directory the agent runs in. Defaults to the current directory. The bridge answers from here, so
point it at the project you want to be reachable about.

.PARAMETER Minutes
Poll interval. Default 2.

.PARAMETER TaskName
Scheduled task name. Default 'claude-telegram'. Keep it fixed - every stop command names it.

.PARAMETER Force
Install even though a Stop hook is wired.

.EXAMPLE
cd ~\Desktop\my-project; .\install-bridge.ps1

.EXAMPLE
.\install-bridge.ps1 -WorkDir ~\Desktop\my-project -Minutes 5
#>
[CmdletBinding()]
param(
    [string] $WorkDir = (Get-Location).Path,
    [int]    $Minutes = 2,
    [string] $TaskName = 'claude-telegram',
    [switch] $Force
)

$ErrorActionPreference = 'Stop'

$Script = Join-Path $env:USERPROFILE '.claude\skills\telegram-notify\scripts\bridge.mjs'
$WorkDir = (Resolve-Path $WorkDir).Path

if (-not (Test-Path $Script))  { throw "bridge.mjs not found: $Script" }
if (-not (Test-Path $WorkDir)) { throw "working directory not found: $WorkDir" }
if ($Minutes -lt 1)            { throw "-Minutes must be at least 1 - got $Minutes" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'node is not on PATH' }

# The conflict that is worth one prompt. Both this task and the Stop hook acknowledge the same
# getUpdates offset, so whichever polls first consumes the message and the other never sees it.
# A 2-minute task beats a hook that only fires at the end of a turn, so with both installed a
# message sent mid-turn is answered by a headless run here instead of by the session the user is
# watching. That reads as "Telegram stopped reaching my session".
$settingsPath = Join-Path $env:USERPROFILE '.claude\settings.json'
$stopWired = $false
if (Test-Path $settingsPath) {
    $stopWired = (Get-Content $settingsPath -Raw) -match 'stop-hook\.mjs'
}
if ($stopWired -and -not $Force) {
    Write-Host ''
    Write-Host 'A Stop hook is already wired in ~/.claude/settings.json.' -ForegroundColor Yellow
    Write-Host 'Installing this task as well means the task wins: it polls every few minutes,'
    Write-Host 'the hook only fires when a turn ends, and the first one to poll consumes the'
    Write-Host 'message. Your messages would be answered here, not in the session you are'
    Write-Host 'watching.'
    Write-Host ''
    Write-Host '  keep the Stop hook  -> stop now; live sessions stay reachable' -ForegroundColor Gray
    Write-Host '  install anyway      -> re-run with -Force, and disable the task while you sit at a session' -ForegroundColor Gray
    Write-Host ''
    throw 'refusing to install over a wired Stop hook (pass -Force to override)'
}

$action = New-ScheduledTaskAction -Execute 'node' -Argument "`"$Script`"" -WorkingDirectory $WorkDir

# IgnoreNew is the important one: a tick that is still working must never be joined by a second.
# The script keeps its own lock too, but the scheduler should not be creating the race at all.
$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries

$interval = New-TimeSpan -Minutes $Minutes

# How long the repetition keeps going. [TimeSpan]::MaxValue is the idiom everyone reaches for and
# Task Scheduler rejects it - it serialises to P99999999DT23H59M59S, which fails XML validation
# with 0x80041318. So: try real durations, longest first, and fall back to a daily trigger that
# renews itself. Registering is the only way to find out which shape this build accepts, so it is
# done by trying rather than by guessing.
$attempts = @(
    @{ Name = '10 years'; Trigger = { New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval $interval -RepetitionDuration (New-TimeSpan -Days 3650) } },
    @{ Name = '1 year';   Trigger = { New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval $interval -RepetitionDuration (New-TimeSpan -Days 365) } },
    @{ Name = 'daily, renewing'; Trigger = {
            # A daily trigger repeating for 24h: it re-arms every day on its own, so it never
            # needs a duration long enough to be rejected.
            $t = New-ScheduledTaskTrigger -Daily -At (Get-Date)
            $t.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval $interval -RepetitionDuration (New-TimeSpan -Hours 24)).Repetition
            $t
        } }
)

$installed = $null
foreach ($a in $attempts) {
    try {
        $trigger = & $a.Trigger
        Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
        $installed = $a.Name
        break
    } catch {
        Write-Host ("  '{0}' rejected: {1}" -f $a.Name, $_.Exception.Message.Split("`n")[0]) -ForegroundColor DarkGray
    }
}
if (-not $installed) { throw 'every trigger shape was rejected - nothing was installed' }

Write-Host ''
Write-Host ("installed ({0} repetition, every {1} min)." -f $installed, $Minutes) -ForegroundColor Green
Write-Host ("  answers from: {0}" -f $WorkDir)
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State | Format-Table -AutoSize

Write-Host 'Send the bot a message; a reply should come back within about one interval.'
Write-Host ("Log: {0}" -f (Join-Path $env:USERPROFILE '.claude\local\telegram-bridge.log'))
Write-Host ''
Write-Host 'Keep these three lines:' -ForegroundColor Yellow
Write-Host "  Get-ScheduledTask -TaskName '$TaskName'          # is it there"
Write-Host "  Disable-ScheduledTask -TaskName '$TaskName'      # off"
Write-Host "  Unregister-ScheduledTask -TaskName '$TaskName'   # gone"
Write-Host ''
Write-Host 'Anyone who can message the bot can make the agent run here. The token is the only' -ForegroundColor DarkYellow
Write-Host 'thing in the way - revoke it with @BotFather if it ever leaks.' -ForegroundColor DarkYellow
