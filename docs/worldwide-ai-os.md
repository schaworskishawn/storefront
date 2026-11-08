# Worldwide AI OS

The Linux desktop and installer image for the Worldwide AI workspace: an Ubuntu installation that opens the workspace in its own window, built as a real bootable installer ISO and installed in VirtualBox first.

**Test image 0.0.2 installs in VirtualBox and the installed system starts from its own disk.** It is Ubuntu plus one small package and the installer file. It has not been installed yet, and it has none of the workspace in it: no application, no desktop window, no session.

## Where it stands

| Part                                            | State                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base image pinned and verified                  | Done. Downloaded on 2026-11-07 and checked by `linux/iso/fetch-base.sh`: signature, signed checksum, size, SHA-256.                                                                                                                                                                                  |
| Base image inspected                            | Done, read only. Findings below.                                                                                                                                                                                                                                                                     |
| VirtualBox scripts                              | `New-WorldwideAiVm.ps1` run once, on 2026-11-07: it created one machine, "Worldwide AI OS", with a 50 GB disk (see below) and started it. `Remove-WorldwideAiVm.ps1` not run.                                                                                                                        |
| Application package (standalone server, `.deb`) | Not started. Needs a Linux Node.js 24 runtime and the Linux builds of the app's native packages.                                                                                                                                                                                                     |
| Desktop window (Electron)                       | `worldwide-ai-shell`, Electron 45.2.3: a sandboxed window showing the workspace and nothing else, opening maximized at sign-in. In 0.0.4. Shows the hosted workspace, which isn't switched on yet; the local app server isn't built.                                                                 |
| Desktop session, services, first-boot setup     | The look is in 0.0.4 (`worldwide-ai-desktop`): start-up screen, wallpaper after the owner's design concept, dark style, login logo, the window first in the dock. A dedicated session, the Command Center desktop, services and first-boot setup: not built.                                         |
| Installer image build                           | 0.0.1 built on 2026-11-07 by `linux/iso/build-iso.sh`: `worldwide-ai-os-0.0.1-amd64.iso`, 6,481,969,152 bytes, SHA-256 `0c783bb274a64d89ed52856f746e6852d3145957b3c37244de4f5fc647f417ec`. xorriso replayed Ubuntu's 22 boot settings; the BIOS and UEFI boot images are the same sizes as Ubuntu's. |
| Boot, install, reboot in VirtualBox             | 0.0.2: boot, install, starting from the installed disk without the disc, and logging in all passed. Secure Boot was off. The time zone suggested by the installer file is unverified: the installed clock read one hour ahead of the host.                                                           |
| Secure Boot, a mini PC, any other architecture  | Not tested. Only amd64 is in scope.                                                                                                                                                                                                                                                                  |

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

## The desktop

`/worldwide-ai/desktop` is the Worldwide AI OS desktop after the owner's design concept, and it is what the window opens. It is a page of the workspace, drawn by the same server and behind the same sign-in, with a frame of its own instead of the workspace's: a top bar ("Worldwide AI OS", "Private workspace", whether the computer is online, lock, a session menu and the time); a rail of Today, Agents, Lab, Inventory, Files and Settings; the Command Center window; the Nexus window; and a dock.

Everything on it is read from the workspace when it is drawn, not sample data: the person's name and a greeting for the time of day in Winnipeg; all 49 agents, each with whether its main function can run now, filtered by area; how many things wait for review; how many services are connected; and the first three next actions from the briefing. Every button opens a page of the workspace. The ask bar finds applications and agents as you type; anything else, and anything sent to Nexus, opens Nexus with that goal filled in to be planned. Nothing on the desktop starts work by itself. The windows minimize, maximize and close, and Home and the chat button on the dock bring them back. Without a GPU it has no blur or heavy effects, and the orb is still for anyone who asks for less motion.

The existing workspace pages moved into a `(shell)` route group so the desktop could have its own frame; their addresses did not change. They now link to the desktop from the top bar.

The window shows the desktop of the hosted workspace, so on a computer it works once the workspace is switched on there (its database and settings in Vercel). Until then the window shows its own page saying so, or the storefront's sign-in. Checked in the local preview with demonstration data at 1280 by 800: every part renders, the ask bar suggests agents and applications, a message to Nexus arrives filled in on the Nexus page, and the windows hide and come back.

The window draws in software unless `/etc/worldwide-ai/shell-gpu` exists. That was first blamed for the window never appearing on 0.0.5; 0.0.6 showed the real cause: Electron loads a program named on its command line only through its demonstration app, which the package removes, so the window exited with status 1 at every start ("Unable to find a valid app"; the "VMware: No 3D enabled" lines are only noise). The program now sits in Electron's `resources/app` and the package build refuses a tree Electron wouldn't start. Not yet in an image (0.0.7 is unbuilt).

## What 0.0.4 and 0.0.5 add

0.0.4 (built 2026-11-08) couldn't install: `worldwide-ai-desktop` depended on `initramfs-tools`, which Ubuntu 26.04 doesn't have, because it builds the start-up image with dracut. 0.0.5 drops that dependency and is otherwise the same: `worldwide-ai-os-0.0.5-amd64.iso`, SHA-256 `b19a587f394e8a841cc278357a2ef823027b2e542b288307fbe0998f5b9c1e8a`. Every build now runs `linux/iso/check-installable.sh` first: apt simulates an offline install of the packages against the package database in the image's minimal layer, and the build stops if anything is missing. Run against the 0.0.4 packages, it reports the same unmet dependency the installer hit; against 0.0.5's, it passes.

- `worldwide-ai-shell`: the window, as above.
- `worldwide-ai-desktop`: a start-up and shut-down screen of its own (the brand mark and a cyan-to-pink spinner drawn at build time); a wallpaper drawn for it after the owner's design concept (purple haze, pink-rimmed mountains, the sun behind a city skyline, a cyan grid floor), on the desktop, the lock screen and the login screen; dark style with a teal accent; a "Worldwide AI OS" logo on the login screen; the window first in the dock. They are defaults over Ubuntu's, tested with `glib-compile-schemas --strict` against 26.04's own schemas.

Still Ubuntu's: the top bar, the dock's look, Settings, and the name the system gives itself. The design concept's own top bar, left rail, Command Center, Nexus panel and dock are the next build: screens of the workspace shown full-screen in the window.

## Test results

| When       | Image | What                                                                                                                  | Result                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ----- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-07 | 0.0.1 | Boot in VirtualBox 7.0.10, EFI, Secure Boot off (VirtualBox's default)                                                | Passed: firmware, GRUB, kernel and the live desktop, to the installer's language screen. Seen in screenshots taken with `VBoxManage controlvm … screenshotpng`.                                                                                                                                                                                                                                                |
| 2026-11-07 | 0.0.1 | Install to the virtual disk                                                                                           | Failed at the last step, as designed to: the installer read `/autoinstall.yaml` from the disc and copied the package from `/cdrom`, then `apt-get install --no-download` refused the local package file and the installer stopped with "A command in the autoinstall file failed". Fixed in 0.0.2 by installing with `dpkg -i`, plus a check that stops the installer unless the packages are fully installed. |
| 2026-11-07 | 0.0.2 | Boot in the same machine (disc swapped, firmware boot entries reset with `VBoxManage modifynvram … inituefivarstore`) | Passed, to the installer's language screen.                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-11-07 | 0.0.2 | Install to the virtual disk, choosing the disk and creating the account in the installer                              | Passed. The installer completed, so its last step, which stops the installer unless the Worldwide AI package is fully installed, passed too. The installer ejected the disc at the end.                                                                                                                                                                                                                        |
| 2026-11-07 | 0.0.2 | Start from the installed disk with no disc attached                                                                   | Passed: firmware, the installed kernel, and Ubuntu's login screen showing the account created during the install, in under two minutes.                                                                                                                                                                                                                                                                        |
| 2026-11-07 | 0.0.2 | Log in, and read `/var/log/worldwide-ai-install.log` and `/usr/lib/worldwide-ai/os-release`                           | Passed, as reported by the owner: the package showed as installed. Not seen in a screenshot, which was taken after the screen had blanked.                                                                                                                                                                                                                                                                     |
| 2026-11-08 | 0.0.4 | Install                                                                                                               | Failed at installing the packages: `worldwide-ai-desktop` depended on `initramfs-tools`, which 26.04 doesn't have. Fixed in 0.0.5, and now caught at build time.                                                                                                                                                                                                                                               |
| 2026-11-08 | 0.0.5 | Install, start-up screen, login screen, desktop, window                                                               | Installed with the look. The window never appeared (cause found on 0.0.6, below).                                                                                                                                                                                                                                                                                                                              |
| 2026-11-08 | 0.0.6 | Fresh machine (32 GB disk): install, sign in, window                                                                  | Install and look passed. The window failed: started at sign-in and from the dock, exited with status 1 after under 2 seconds, also with `--disable-gpu`. Cause: the window's program wasn't where Electron looks. Fixed on the branch, not yet in an image.                                                                                                                                                    |

The machine for that test: 4 processors, 8 GB of memory, EFI, VMSVGA with 128 MB and 3D off, NAT, clipboard, drag and drop, remote display and nested virtualization off. Its disk is 50 GB, not the 64 GB in the starting profile: C: had 65 GB free after the image was built, and the creation script refuses a growing disk that could fill the drive to within 10 GB. VirtualBox ran it on Windows' own hypervisor ("VT-x is not available", falling back to the Windows Hypervisor Platform), which is slower than running directly.

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
