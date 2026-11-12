# Lyrics Island for Windows

Lyrics Island is a lightweight, floating music controller for Windows. It puts the currently playing Spotify track, synced lyrics, and playback controls in a compact Dynamic-Island-style pill.

This is an open-source Electron app inspired by the macOS LyricsNotch concept and rebuilt with Windows-friendly primitives.

**Windows beta — contributors welcome.** [Download v0.1.1-beta.1](https://github.com/garvrao80/DynamicIslandWindows/releases/tag/v0.1.1-beta.1) · [Contribute](CONTRIBUTING.md) · [Roadmap](ROADMAP.md) · [Report a bug](https://github.com/garvrao80/DynamicIslandWindows/issues/new/choose)

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
- Node.js 20 or newer and Git only if running from source
- A Spotify account; Spotify Premium is required for Web API playback control
- A Spotify Developer application for live playback data

## Installation

### Download a Windows build

1. Open the [beta release](https://github.com/garvrao80/DynamicIslandWindows/releases/tag/v0.1.1-beta.1).
2. Download **LyricsIsland-Setup-0.1.1-beta.1-x64.exe** to install, or **LyricsIsland-Portable-0.1.1-beta.1-x64.exe** to run without installation. Neither needs Node.js or a terminal.
3. Quit any older Lyrics Island instance from its tray menu, then launch the downloaded app. The installer creates Windows shortcuts.
4. Double-click the pill to expand it, open Settings, and follow **Connect Spotify** below. Demo mode works without Spotify credentials.

The beta builds are unsigned and Windows may show a reputation warning. Live playback still requires Spotify setup. Synced lyrics come from LRCLIB and are not available for every song. Report problems through the issue template, including the version and launch method.

### Run from source

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

Each user currently needs their own Spotify Developer application. Spotify requires the owner of a development-mode app to have Premium; development-mode apps are intended for personal use or small tests, and additional users need to be allowlisted. Playback control also requires Premium. See [Spotify's current quota-mode requirements](https://developer.spotify.com/documentation/web-api/concepts/quota-modes).

The Client ID and OAuth tokens are stored locally in Electron's user-data directory. They are not sent to this repository or to a project-owned server. Lyrics are requested from LRCLIB using the track metadata. If an exact/structured match misses (for example, Spotify puts a featured artist in the title), Lyrics Island also tries a combined title-and-artist search and selects the closest candidate using artist, album, and duration metadata, preferring timed lyrics.

The bundled renderer is protected by a Content Security Policy, cannot navigate to other pages or open popups, and can only request allowlisted settings and playback actions from the main process.

Spotify Web API playback control requires an active Spotify Premium account. If Spotify reports that playback is unavailable, confirm that the same Premium account is playing music on an active device.

## Using the island

- Double-click the compact pill to expand it.
- Drag the pill from the artwork or track information area.
- In expanded mode, drag the bottom-right resize button to change the island size. The last expanded size is reused when you collapse and expand it again during the session.
- In expanded mode, scroll over the lyrics to browse manually. When playback is active, the lyrics return to the current line after about two seconds without scrolling.
- Click any synced lyric line in expanded mode to seek Spotify directly to that part of the song.
- Use the compact or expanded playback buttons to control Spotify.
- Click the expanded progress bar to seek.
- Open Settings to change the Client ID, demo mode, lyric offset, or opacity.
- Enable **Start with Windows** in Settings to launch Lyrics Island automatically when you sign in.
- Use the tray icon to show, hide, toggle demo mode, or quit.

The expanded layout resizes its artwork, controls, title, progress bar, and lyrics panel together. Long song titles wrap inside the metadata panel, and the active lyric remains centered while the island is being resized. The island’s position and expanded size are saved locally and restored the next time the app starts.

## Troubleshooting

### Spotify API quota or rate limit

Spotify may temporarily return a quota or rate-limit response. Lyrics Island pauses requests and retries after the server-provided cooldown. Wait for Spotify to reset the limit; development-mode apps on the same developer account share a quota.

### No track appears

Make sure Spotify is playing on an active device, the account is connected, and the app is not in Demo mode. Playback control through Spotify's Web API requires Premium.

### No lyrics appear

Lyrics are supplied by LRCLIB and depend on the track's metadata. Lyrics Island tries exact, structured, and normalized title/artist matching (including featured-artist and alternate artist-separator variants). Successfully fetched lyrics are cached locally for up to 90 days (50 recent tracks) so they load across restarts even if LRCLIB is temporarily unavailable. If LRCLIB rate-limits a new track, Lyrics Island pauses follow-up searches and retries after the provider's cooldown instead of sending repeated requests. Otherwise, missing lyrics are retried periodically while the same track plays. Some tracks still have no LRCLIB entry with timestamps; plain-text lyrics can appear without line-by-line sync. Try checking the title and artist in Spotify, or adjust the lyric offset in Settings.

### Lyrics appear stuck after changing songs

When timed and plain-text records both exist, Lyrics Island prefers a timed record with matching metadata and a similar duration. Plain-text results are retried and do not prevent a later synced match from being fetched. The status row identifies plain lyrics when timing is unavailable.

Lyrics Island refreshes the lyric list when Spotify reports a new track. If an already-running copy was started before an update, close that copy completely from the tray and run `npm start` again. If only one song has no moving lines, LRCLIB may not have synced lyrics for that track; the expanded status line will show the lyric source and the app will continue monitoring the next track.

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

The Windows build workflow runs tests and produces installer and portable build artifacts on GitHub Actions. These artifacts are unsigned test builds; they are not automatically published as a GitHub Release.

## Project structure

```text
src/main/       Electron main process, Spotify, lyrics, and local config
src/renderer/   Island markup, styles, animations, and interaction logic
assets/         Application assets
```

The app intentionally uses Electron for fast Windows distribution. A future WinUI 3 port could reduce memory usage and integrate more deeply with Windows media sessions.

## Contributing

Contributors and beta testers are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, tests, and pull request guidance, and [ROADMAP.md](ROADMAP.md) for proposed projects. Starter areas include setup documentation, accessibility, clean-install testing, and Windows media-session research.

For changes:

1. Fork the repository.
2. Create a focused branch.
3. Run `npm install`, `npm start`, and any relevant packaging checks.
4. Explain the user-visible behavior and testing performed in the pull request.

Please do not commit Spotify Client IDs, OAuth tokens, personal configuration files, or generated `release/` output.

## License

Lyrics Island is released under the [MIT License](LICENSE).
