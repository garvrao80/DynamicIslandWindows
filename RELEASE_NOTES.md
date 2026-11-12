# Lyrics Island v0.1.1-beta.1

An open-source floating Spotify controller and lyrics pill for Windows. Contributors and beta testers are welcome: see CONTRIBUTING.md and ROADMAP.md in the repository.

## Download and run

- **LyricsIsland-Setup-0.1.1-beta.1-x64.exe**: installer for Windows x64; creates app shortcuts.
- **LyricsIsland-Portable-0.1.1-beta.1-x64.exe**: run directly without installing Node.js or using a terminal.

Quit any older Lyrics Island instance from its tray menu before launching this version. Double-click the pill to expand it. Open Settings to connect Spotify, or try Demo mode without credentials. Follow the README for Spotify setup.

## Improvements

- Cached synced lyrics survive app restarts (up to 50 tracks for 90 days).
- Normalized title/artist searches find more alternate metadata records.
- Timed lyric matches take priority over plain text, with duration checks.
- Plain-text results can be retried instead of being cached indefinitely.
- Provider rate limits pause follow-up requests and are shown in the status row.
- Slow lyric lookups cannot overwrite a different track after a song change.
- Separate installer and portable filenames, Windows CI builds, and contributor templates.

## Beta limitations and validation

These Windows x64 binaries are unsigned; Windows may show an unknown-publisher or reputation warning. Live playback requires a Spotify Developer application and applicable Spotify Premium access. Development-mode user limits still apply. Lyrics come from LRCLIB, not Spotify; some songs have only plain text or no lyrics, and provider outages can delay new lookups.

Nine automated tests pass, and installer/portable packaging succeeds locally. A portable build has previously been launched locally. Clean-machine installation, all display scales, and every playback transition have not been verified. Please report reproducible problems using the issue template.
