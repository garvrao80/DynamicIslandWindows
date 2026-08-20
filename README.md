# Lyrics Island for Windows

Lyrics Island is a lightweight, floating music controller for Windows. It puts the currently playing Spotify track, synced lyrics, and playback controls in a compact Dynamic-Island-style pill.

This is an open-source Electron app inspired by the macOS LyricsNotch concept and rebuilt with Windows-friendly primitives.

## Features

- Always-on-top floating pill with compact and expanded views
- Spotify playback controls: play, pause, previous, next, and seek
- Synced lyrics from [LRCLIB](https://lrclib.net/)
- Spotify OAuth 2.0 Authorization Code with PKCE
- Demo mode for trying the interface without Spotify
- Draggable compact and expanded layouts
- Tray menu, single-instance protection, and optional launch at login
- Adjustable lyric timing offset and island opacity
- Windows portable and installer builds

## Requirements

- Windows 10 or Windows 11
- Node.js 20 or newer
- A Spotify account; Spotify Premium is required for Web API playback control
- A Spotify Developer application for live playback data

## Installation

### Run from source (easiest for contributors)

1. Install [Node.js 20 or newer](https://nodejs.org/).
2. Open **PowerShell** and run:

   ```powershell
   git clone https://github.com/garvrao80/DynamicIslandWindows.git
   cd DynamicIslandWindows
   npm install
   npm start
   ```

3. Lyrics Island will appear in the Windows system tray. Use the tray menu to show or hide it.

To start it again later, open PowerShell in the project folder and run:

```powershell
npm start
```

### Create a portable Windows app

From the project folder, run:

```powershell
npm install
npm run pack
```

Then launch:

```text
release/Lyrics Island-win32-x64/Lyrics Island.exe
```

This creates an unpacked portable app and does not require running `npm start` afterward. The optional installer and portable artifacts can be created with `npm run dist`.

## Quick start

If the repository is already downloaded, run:

```powershell
npm install
npm start
```

To try the interface without connecting Spotify, leave **Demo** enabled in the settings panel.

## Connect Spotify (optional)

Demo mode works without Spotify. To show live playback and lyrics:

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), sign in, and create an application.
2. In the application settings, open **Redirect URIs** and add this exact URI:

   ```text
   http://127.0.0.1:43817/callback
   ```

3. Start Lyrics Island and double-click the compact pill to expand it.
4. Open Settings, paste the application's **Client ID**, and click **Connect**.
5. Complete Spotify sign-in in the browser.
6. Start playback on an active Spotify device.

The Client ID and OAuth tokens are stored locally in Electron's user-data directory. They are not sent to this repository or to a project-owned server. Lyrics are requested from LRCLIB using the track metadata.

Spotify Web API playback control requires an active Spotify Premium account. If Spotify reports that playback is unavailable, confirm that the same Premium account is playing music on an active device.

## Using the island

- Double-click the compact pill to expand it.
- Drag the pill from the artwork or track information area.
- Use the compact or expanded playback buttons to control Spotify.
- Click the expanded progress bar to seek.
- Open Settings to change the Client ID, demo mode, lyric offset, or opacity.
- Use the tray icon to show, hide, toggle demo mode, or quit.

## Troubleshooting

### Spotify API quota or rate limit

Spotify may temporarily return a quota or rate-limit response. Lyrics Island pauses requests and retries after the server-provided cooldown. If the quota belongs to your Spotify Developer application, wait for Spotify to reset it or try another Client ID.

### No track appears

Make sure Spotify is playing on an active device, the account is connected, and the app is not in Demo mode. Playback control through Spotify's Web API requires Premium.

### No lyrics appear

Lyrics are supplied by LRCLIB and depend on the track's metadata. Some tracks do not have synced lyrics available. Try checking the title, artist, and album in Spotify, or adjust the lyric offset in Settings.

### The app does not start

Close any existing Lyrics Island process, reinstall dependencies, and run:

```powershell
npm install
npm start
```

## Build for Windows

Create an unpacked portable application directory:

```powershell
npm run pack
```

The executable is written to:

```text
release/Lyrics Island-win32-x64/Lyrics Island.exe
```

Create NSIS installer and portable artifacts:

```powershell
npm run dist
```

Build output is written to `release/`. If electron-builder cannot unpack its signing helper on your machine, enable Windows Developer Mode or use an elevated terminal. `npm run pack` is sufficient for local testing.

## Project structure

```text
src/main/       Electron main process, Spotify, lyrics, and local config
src/renderer/   Island markup, styles, animations, and interaction logic
assets/         Application assets
```

The app intentionally uses Electron for fast Windows distribution. A future WinUI 3 port could reduce memory usage and integrate more deeply with Windows media sessions.

## Contributing

Issues and pull requests are welcome. For changes:

1. Fork the repository.
2. Create a focused branch.
3. Run `npm install`, `npm start`, and any relevant packaging checks.
4. Explain the user-visible behavior and testing performed in the pull request.

Please do not commit Spotify Client IDs, OAuth tokens, personal configuration files, or generated `release/` output.

## License

Lyrics Island is released under the [MIT License](LICENSE).
