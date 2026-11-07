<#
.SYNOPSIS
Creates one new VirtualBox machine for installing Worldwide AI OS, attaches the installer image, and starts it.

.DESCRIPTION
Checks before it creates anything: the image exists and has the SHA-256 it should, it is an amd64 image on an x64 host,
the host can spare the memory, processors and disk asked for, and nothing it would create already exists. It then
creates exactly one machine and one new, empty, dynamically allocated disk, and records them in a file beside the disk,
so Remove-WorldwideAiVm.ps1 can later remove that machine and nothing else.

It never changes an existing machine or disk. If the machine it recorded already exists, it says so and stops. If
another machine already has the name, the new one gets a numbered name instead.

The profile is the starting one in the specification: EFI, VMSVGA with 3D off, NAT with no port forwarding, and the
shared clipboard, drag and drop, remote display and nested virtualization off. Nothing here changes Windows' own
virtualization or security settings.

.EXAMPLE
.\New-WorldwideAiVm.ps1 -IsoPath C:\Users\me\wai-os-build\out\worldwide-ai-os-0.1.0-amd64.iso -Sha256 <64 hex digits>
#>
[CmdletBinding()]
param(
	[Parameter(Mandatory)] [string] $IsoPath,
	# The image's SHA-256, from the SHA256SUMS written when it was built.
	[Parameter(Mandatory)] [ValidatePattern('^[0-9a-fA-F]{64}$')] [string] $Sha256,
	[string] $Name = 'Worldwide AI OS',
	[string] $VmDirectory = (Join-Path $env:USERPROFILE 'VirtualBox VMs'),
	[ValidateRange(2048, 65536)] [int] $MemoryMB = 8192,
	[ValidateRange(1, 32)] [int] $Cpus = 4,
	[ValidateRange(25, 2048)] [int] $DiskGB = 64,
	[string] $VBoxManage = (Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'),
	# Create and configure the machine without starting it.
	[switch] $NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Fail([string] $message) { Write-Error $message -ErrorAction Continue; exit 1 }

# Runs VBoxManage with each argument passed as it is: nothing is put together into a command line by hand.
function VBox([string[]] $arguments) {
	$output = & $VBoxManage @arguments 2>&1
	if ($LASTEXITCODE -ne 0) { Fail "VBoxManage $($arguments[0]) failed: $($output -join ' ')" }
	return $output
}

# ---- What is asked for, checked -------------------------------------------------------------------------
if (-not (Test-Path -LiteralPath $VBoxManage -PathType Leaf)) { Fail "VBoxManage isn't at $VBoxManage. Install VirtualBox or pass -VBoxManage." }
if (-not (Test-Path -LiteralPath $IsoPath -PathType Leaf)) { Fail "There is no image at $IsoPath." }
$IsoPath = (Resolve-Path -LiteralPath $IsoPath).Path
if ($IsoPath -notmatch '-amd64\.iso$') { Fail "$IsoPath isn't named as an amd64 image (…-amd64.iso). This machine is for the amd64 build only." }
if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { Fail "This host is $env:PROCESSOR_ARCHITECTURE, not x64. An amd64 image won't run in it." }

Write-Host 'Checking the image''s SHA-256 (this reads the whole file)…'
$actual = (Get-FileHash -LiteralPath $IsoPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $Sha256.ToLowerInvariant()) { Fail "The image's SHA-256 is $actual, not $Sha256. Nothing was created." }

$totalMB = [math]::Floor((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1MB)
if ($MemoryMB -gt $totalMB - 4096) { Fail "$MemoryMB MB for the machine would leave less than 4 GB for Windows (it has $totalMB MB). Ask for less with -MemoryMB." }
$logical = [Environment]::ProcessorCount
if ($Cpus -gt $logical - 2) { Fail "$Cpus processors would leave fewer than 2 of $logical for Windows. Ask for fewer with -Cpus." }

if (-not (Test-Path -LiteralPath $VmDirectory -PathType Container)) { New-Item -ItemType Directory -Path $VmDirectory | Out-Null }
$VmDirectory = (Resolve-Path -LiteralPath $VmDirectory).Path
$drive = Get-PSDrive -Name ($VmDirectory.Substring(0, 1))
$needGB = $DiskGB + 10
if ($drive.Free / 1GB -lt $needGB) { Fail "$($drive.Name): has $([math]::Floor($drive.Free / 1GB)) GB free. A $DiskGB GB disk can grow to fill that, so at least $needGB GB is needed." }

# ---- Nothing that would be created already exists ----------------------------------------------------------
$registered = @(VBox @('list', 'vms')) | ForEach-Object {
	if ($_ -match '^"(.*)" \{([0-9a-f-]+)\}$') { [pscustomobject]@{ Name = $Matches[1]; Uuid = $Matches[2] } }
}
$baseName = $Name
$suffix = 1
while ($true) {
	$record = Join-Path (Join-Path $VmDirectory $Name) 'worldwide-ai-vm.json'
	if (Test-Path -LiteralPath $record) {
		$recorded = Get-Content -LiteralPath $record -Raw | ConvertFrom-Json
		if ($registered | Where-Object { $_.Uuid -eq $recorded.uuid }) {
			Write-Host "This machine already exists: ""$($recorded.name)"" {$($recorded.uuid)}. Nothing was changed."
			exit 0
		}
		Fail "$record names machine {$($recorded.uuid)}, which VirtualBox doesn't have any more. Look at that folder before creating another."
	}
	if (-not ($registered | Where-Object { $_.Name -eq $Name }) -and -not (Test-Path -LiteralPath (Join-Path $VmDirectory $Name))) { break }
	# The name belongs to a machine or a folder this script didn't make. Leave it alone and use the next name.
	$suffix++
	$Name = "$baseName $suffix"
}
$folder = Join-Path $VmDirectory $Name
$disk = Join-Path $folder "$Name.vdi"
if (Test-Path -LiteralPath $disk) { Fail "$disk already exists. Nothing was created." }

# ---- Create exactly one machine and one disk ---------------------------------------------------------------
$version = (VBox @('--version')) -join ''
$created = VBox @('createvm', '--name', $Name, '--ostype', 'Ubuntu_64', '--basefolder', $VmDirectory, '--register')
$uuid = ($created | Select-String -Pattern 'UUID:\s*([0-9a-f-]+)').Matches[0].Groups[1].Value
if (-not $uuid) { Fail "VirtualBox didn't report the new machine's UUID. Check VirtualBox for a machine called ""$Name""." }

# Recorded first, so the machine can be found and removed even if a later step fails.
$state = [ordered]@{
	name = $Name
	uuid = $uuid
	folder = $folder
	disk = $disk
	iso = $IsoPath
	isoSha256 = $actual
	virtualbox = $version
	memoryMB = $MemoryMB
	cpus = $Cpus
	diskGB = $DiskGB
	createdAt = (Get-Date).ToUniversalTime().ToString('o')
}
$state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $folder 'worldwide-ai-vm.json') -Encoding UTF8

VBox @(
	'modifyvm', $uuid,
	"--memory=$MemoryMB", "--cpus=$Cpus",
	'--firmware=efi',
	'--graphicscontroller=vmsvga', '--vram=128', '--accelerate-3d=off',
	'--nic1=nat',
	'--clipboard-mode=disabled', '--drag-and-drop=disabled',
	'--vrde=off', '--nested-hw-virt=off',
	'--boot1=dvd', '--boot2=disk', '--boot3=none', '--boot4=none'
) | Out-Null
VBox @('createmedium', 'disk', '--filename', $disk, '--size', [string]($DiskGB * 1024), '--format', 'VDI', '--variant', 'Standard') | Out-Null
VBox @('storagectl', $uuid, '--name', 'SATA', '--add', 'sata', '--controller', 'IntelAhci', '--portcount', '2', '--bootable', 'on') | Out-Null
VBox @('storageattach', $uuid, '--storagectl', 'SATA', '--port', '0', '--device', '0', '--type', 'hdd', '--medium', $disk) | Out-Null
VBox @('storageattach', $uuid, '--storagectl', 'SATA', '--port', '1', '--device', '0', '--type', 'dvddrive', '--medium', $IsoPath) | Out-Null

Write-Host "Created ""$Name"" {$uuid} with a new $DiskGB GB disk at $disk, and attached the image."
Write-Host "Recorded in $(Join-Path $folder 'worldwide-ai-vm.json')."
if ($NoStart) { exit 0 }
VBox @('startvm', $uuid, '--type', 'gui') | Out-Null
Write-Host 'Started. In the installer, choose the new virtual disk; it is the only disk this machine has.'
Write-Host 'To leave the machine''s window, press the host key (Right Ctrl by default), shown at the bottom right of the window.'
