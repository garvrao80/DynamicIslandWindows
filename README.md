# Lyrics Island for Windows

A floating Dynamic-Island-style lyrics controller for Windows, inspired by the macOS LyricsNotch idea but rebuilt around Windows-friendly primitives.

## Current status

This is an Electron MVP:

- floating always-on-top pill window
- compact and expanded island states
- tray menu
- demo mode for UI testing
- Spotify OAuth PKCE scaffolding
- Spotify currently-playing polling
- LRCLIB synced lyric lookup
- local config storage
- unpacked Windows packaging via Electron Packager
- installer/portable packaging via electron-builder

## Run locally

```powershell
npm install
npm start
```

## Spotify setup

1. Create a Spotify app at <https://developer.spotify.com/dashboard>.
2. Add this redirect URI:

```text
http://127.0.0.1:43817/callback
```

3. Open Lyrics Island.
4. Expand the island.
5. Paste the Spotify Client ID into settings.
6. Click Connect Spotify.

Spotify playback control through the Web API requires Spotify Premium. Lyric lookup uses LRCLIB.

## Package for Windows

Create a local unpacked Windows build:

```powershell
npm run pack
```

The executable will be written under `release/Lyrics Island-win32-x64/`.

Create installer artifacts:

```powershell
npm run dist
```

Installer artifacts are written to `release/`. On Windows machines without symlink privileges, `electron-builder` may fail while unpacking its signing helper. Use `npm run pack` for local builds, or enable Developer Mode / run an elevated shell for installer builds.

## Why Electron first?

The original LyricsNotch is tightly coupled to macOS APIs such as `NSPanel`, `NSStatusItem`, and AppleScript. This project uses Electron so the Windows version can be built and tried immediately on a laptop without installing the full WinUI/.NET toolchain.

Long-term, a WinUI 3 implementation could reduce memory usage and integrate more deeply with Windows media sessions.
