<#
.SYNOPSIS
Removes one machine that New-WorldwideAiVm.ps1 created, and its disk. Nothing else.

.DESCRIPTION
Takes the record New-WorldwideAiVm.ps1 wrote beside the disk. It refuses unless the machine it names is registered,
still has the recorded name and is switched off, and unless its only hard disk is the recorded one. It detaches the
installer image first, so the image is never deleted, then unregisters the machine and deletes its disk and folder.

.EXAMPLE
.\Remove-WorldwideAiVm.ps1 -Record "C:\Users\me\VirtualBox VMs\Worldwide AI OS\worldwide-ai-vm.json"
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
	[Parameter(Mandatory)] [string] $Record,
	[string] $VBoxManage = (Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Fail([string] $message) { Write-Error $message -ErrorAction Continue; exit 1 }
function VBox([string[]] $arguments) {
	$output = & $VBoxManage @arguments 2>&1
	if ($LASTEXITCODE -ne 0) { Fail "VBoxManage $($arguments[0]) failed: $($output -join ' ')" }
	return $output
}

if (-not (Test-Path -LiteralPath $Record -PathType Leaf)) { Fail "There is no record at $Record." }
$state = Get-Content -LiteralPath $Record -Raw | ConvertFrom-Json
if ($state.uuid -notmatch '^[0-9a-f-]{36}$') { Fail "$Record doesn't name a machine." }

$info = VBox @('showvminfo', $state.uuid, '--machinereadable')
$value = { param($key) ($info | Where-Object { $_ -like "$key=*" } | Select-Object -First 1) -replace "^$key=", '' -replace '^"|"$', '' }
if ((& $value 'name') -ne $state.name) { Fail "Machine {$($state.uuid)} is now called ""$(& $value 'name')"", not ""$($state.name)"". Nothing was removed." }
if ((& $value 'VMState') -ne 'poweroff') { Fail """$($state.name)"" is $(& $value 'VMState'). Shut it down first. Nothing was removed." }
$disks = @($info | Where-Object { $_ -match '^"SATA-\d+-\d+"=' -and $_ -match '\.vdi"$' } | ForEach-Object { ($_ -split '=', 2)[1].Trim('"') })
if ($disks.Count -ne 1 -or (Resolve-Path -LiteralPath $disks[0]).Path -ne $state.disk) {
	Fail """$($state.name)"" has disks other than the one this script made: $($disks -join ', '). Nothing was removed."
}

if ($PSCmdlet.ShouldProcess("""$($state.name)"" {$($state.uuid)} and $($state.disk)", 'Remove')) {
	# The image is detached first, so deleting the machine's media can't touch it.
	VBox @('storageattach', $state.uuid, '--storagectl', 'SATA', '--port', '1', '--device', '0', '--type', 'dvddrive', '--medium', 'emptydrive') | Out-Null
	VBox @('unregistervm', $state.uuid, '--delete') | Out-Null
	Write-Host "Removed ""$($state.name)"" {$($state.uuid)} and its disk. The image at $($state.iso) was left where it is."
}
