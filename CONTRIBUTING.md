# Contributing to Lyrics Island

Thanks for helping make floating lyrics on Windows easier to use. Code, documentation, accessibility improvements, bug reports, and clean-install testing are all welcome.

## Start here

- Read the [roadmap](ROADMAP.md) and browse [help wanted issues](https://github.com/garvrao80/DynamicIslandWindows/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).
- For a larger change, open an issue describing the problem and proposed approach before implementing it.
- Keep pull requests focused. Explain the behavior before and after your change.

## Local setup

Use Windows 10/11 and Node.js 20 or newer. Fork and clone the repository, then run:

```powershell
npm ci
npm test
npm start
```

Demo mode lets you work on the interface without Spotify credentials. Live playback requires your own Spotify Developer application; follow the README's connection instructions. Never add a Client Secret: the app uses PKCE.

## Code and checks

The main process in `src/main` owns Spotify access, lyric lookup, cache, window management, and settings. `src/renderer` owns the interface. Preserve the renderer's isolation and validate new IPC inputs in the main process.

Run `npm test` and `git diff --check` before submitting. Add regression tests for changed lookup, cache, and playback logic when practical. For UI changes, include screenshots or a short recording and describe the Windows version and display scaling you tested.

For playback changes, check pause/resume, rapid song changes, seeks, missing timestamps, provider failures, and reopening the app. For layout changes, check both views, the minimum expanded size, long titles, and 100%/125%/150% scaling where available.

Create local Windows builds with `npm run dist`. The Windows Actions workflow also runs the tests and builds installer and portable artifacts on pull requests. Unsigned artifacts may display Windows reputation warnings.

## Reporting bugs

Use the bug-report template. Include the app version, how you launched it, Windows version, exact track and artist when relevant, and reproduction steps. Redact tokens, Client IDs, account information, and personal paths. Do not attach your config file.

Do not commit `node_modules`, build outputs, local configuration, credentials, or personal listening data. Report security concerns using [SECURITY.md](SECURITY.md).

## Pull requests

Describe the problem, your solution, and the checks you actually ran. Link the relevant issue with `Closes #123` when appropriate. Be respectful and constructive when discussing changes. Contributions are provided under the project's MIT License.
