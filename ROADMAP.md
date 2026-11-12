# Roadmap

Lyrics Island is a Windows beta. Priorities below are proposed work, not promised release dates. Please open an issue to discuss an approach or volunteer.

## Make first use easier

- Guided Spotify setup with redirect-URI instructions, connection checks, and actionable errors.
- Clean-install testing of installer and portable builds on Windows 10 and 11.
- A short demo recording and screenshots for the README.
- Investigate code signing and a verified update path.

## Improve reliability

- Regression coverage for rapid track changes, pause/resume, seeks, and provider outages.
- Better cache upgrade behavior and diagnostics that exclude credentials and private data.
- Broader lyric matching tests using small synthetic fixtures; avoid committing copyrighted lyrics.

## Reduce dependence on Spotify setup

- Prototype Windows media-session access for metadata, playback position, and transport controls.
- Measure which Spotify desktop capabilities work without a developer app, including seeking and timing accuracy.
- Keep this experimental until tested; lyrics would still need a separate provider.

## Improve the interface

- Keyboard navigation, accessible names, and visible focus states.
- Test multi-monitor positioning and different DPI settings.
- Distinguish synced lyrics, plain lyrics, loading, and provider cooldowns consistently.

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and testing guidance.
