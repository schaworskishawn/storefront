# Worldwide AI OS

The Linux desktop and installer image for the Worldwide AI workspace: an Ubuntu installation that opens the workspace in its own window, built as a real bootable installer ISO and installed in VirtualBox first.

**Nothing has been built yet.** No Worldwide AI OS image exists. What exists is the pinned, verified Ubuntu base image, the scripts below, and the findings that decide how the image will be put together.

## Where it stands

| Part                                            | State                                                                                                                                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base image pinned and verified                  | Done. Downloaded on 2026-11-07 and checked by `linux/iso/fetch-base.sh`: signature, signed checksum, size, SHA-256.                                                                                |
| Base image inspected                            | Done, read only. Findings below.                                                                                                                                                                   |
| VirtualBox scripts                              | Written. Not run: no machine has been created.                                                                                                                                                     |
| Application package (standalone server, `.deb`) | Not started. Needs a Linux Node.js 24 runtime and the Linux builds of the app's native packages.                                                                                                   |
| Desktop window (Electron)                       | Not started. Needs Electron.                                                                                                                                                                       |
| Desktop session, services, first-boot setup     | Not started. A first package, `worldwide-ai-os-base`, records which image a computer came from and carries the settings as an example with no values. Built and inspected; not installed anywhere. |
| Installer image build                           | Script written (`linux/iso/build-iso.sh`), with the installer file `linux/iso/autoinstall.yaml`. Not run: `xorriso` isn't installed yet.                                                           |
| Boot, install, reboot in VirtualBox             | Not tested.                                                                                                                                                                                        |
| Secure Boot, a mini PC, any other architecture  | Not tested. Only amd64 is in scope.                                                                                                                                                                |

## The base image

`linux/iso/base.env` pins it: **Ubuntu 26.04.1 LTS (Resolute Raccoon)**, `ubuntu-26.04.1-desktop-amd64.iso`, 6,482,409,472 bytes, SHA-256 `601e30fbf5d97759367c632e2c33630665039b7e2158fd068403da3ccf1bda1f`, from `releases.ubuntu.com`. Ubuntu's `SHA256SUMS` for the release carries a good signature from the Ubuntu CD image signing key `843938DF228D22F7B3742BC0D94AA3F0EFE21092`, checked against the `ubuntu-keyring` package's archive keyring.

```bash
linux/iso/fetch-base.sh <directory outside the repository> /usr/share/keyrings/ubuntu-archive-keyring.gpg
```

It downloads about 6.5 GB, and stops unless the signature, the signed checksum, the size and the SHA-256 all match.

What the image is, read from it without changing it:

- It boots with GRUB through Ubuntu's signed shim, from `EFI/boot/bootx64.efi`, and also carries the files for BIOS boot.
- The live system is in layers: `minimal.squashfs` (3.4 GB), `minimal.standard.squashfs` (590 MB) and `minimal.standard.live.squashfs` (793 MB), with a language layer for each of eight languages.
- The installer is Ubuntu's desktop installer, the `ubuntu-desktop-bootstrap` snap, installing from the layers listed in `casper/install-sources.yaml`.
- A signed package archive for the installer is on the disc, under `dists/resolute` and `pool/`.
- Neither Node.js nor Electron is in it.

## How the image will be put together

Proposed, and to be proved by installing it:

1. **The Ubuntu parts stay as Ubuntu made them.** The boot files, the kernel and the live layers aren't changed or rebuilt, so the signed boot chain and the installer are Ubuntu's own.
2. **Worldwide AI goes on the disc as its own package archive.** The application, the desktop window and the session are `.deb` packages in a separate archive on the disc, so installing them needs no internet.
3. **An installer file adds them.** It leaves the disk choice, the storage plan and the Linux account to the person installing, and installs the packages from the disc at the end.
4. **The image is reassembled with `xorriso`, replaying the original boot setup.** It is named `worldwide-ai-os-<version>-amd64.iso`, with its own `SHA256SUMS` and a manifest of what went into it.

No password, account, key, token, customer record or formula goes into the image. The workspace's own settings are entered on the installed machine at first boot.

## Building it

Run in WSL Ubuntu as an ordinary user, never as root. Neither script mounts anything.

```bash
SOURCE_REVISION=$(git rev-parse HEAD) linux/packages/build-debs.sh <packages directory> <version>
linux/iso/build-iso.sh <Ubuntu image> <packages directory> <output directory> <version>
```

`build-debs.sh` builds each package under `linux/packages/` with fixed permissions, owned by root inside the package, so a checkout made on Windows builds the same package. `build-iso.sh` checks the Ubuntu image against the pin, refuses a package for the wrong architecture or one that carries real settings, writes `worldwide-ai-os-<version>-amd64.iso` with xorriso replaying Ubuntu's boot setup, and writes `SHA256SUMS`, a manifest of every package with its checksum, and a build log. Pass `SOURCE_REVISION`: WSL's git can't always read a checkout made on Windows.

The installer file keeps the language, keyboard, network, disk and storage plan, Linux account and time zone as questions for the person installing, and only adds the last step: installing the packages from the disc. Whether Ubuntu's desktop installer reads it from the disc and runs that step as written is unproven until an image is installed.

## This computer, as found on 2026-11-07

- Windows 10 Pro on an Intel Core i7-11800H (8 cores, 16 threads), 16 GB of memory, 79 GB free on C:.
- VirtualBox 7.0.10. Its newest Ubuntu profile is 22.04, so the machine is created as the generic `Ubuntu_64` type. Whether its Guest Additions work with Ubuntu 26.04's kernel is unknown.
- WSL 2, with Ubuntu 24.04.4 and Ubuntu 20.04, and Docker Desktop. Windows reports hardware virtualization as unavailable to other software, which is what it reports while its own hypervisor is running for WSL 2. VirtualBox then runs on top of it, usually more slowly. Nothing here changes that setting.
- In WSL Ubuntu: `squashfs-tools`, `dpkg-deb`, `dpkg-scanpackages` and `apt-ftparchive` are installed. `xorriso` and Node.js are not.

## VirtualBox

`linux/virtualbox/New-WorldwideAiVm.ps1` creates one new machine for installing the image, with the starting profile: 4 processors, 8 GB of memory, a new 64 GB disk that grows as it is used, EFI, VMSVGA with 3D off, and NAT. The shared clipboard, drag and drop, remote display and nested virtualization are off. Before creating anything it checks the image's SHA-256, that it is an amd64 image on an x64 host, that the host can spare what is asked for, and that nothing it would create exists already. It never changes an existing machine or disk. It writes a record beside the new disk, and `Remove-WorldwideAiVm.ps1` removes only the machine and disk in that record, after detaching the image so it is never deleted.

```powershell
.\linux\virtualbox\New-WorldwideAiVm.ps1 -IsoPath <path to the built image> -Sha256 <its SHA-256>
```

To leave the machine's window, press the host key, Right Ctrl by default, which VirtualBox shows at the bottom right of the window.

Neither script has been run.
