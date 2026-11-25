# Lyrics Island v0.1.1-beta.4

Play a song in Spotify desktop on this PC and the island picks it up through Windows media sessions. Fresh installations use this source automatically. After upgrading, select **Settings → Spotify on this PC → Save** to switch an existing profile. For playback on another device, choose **Spotify Web API** to see the Client ID and connection controls.

## What's new

- Flick the compact or expanded island to let it glide. With Snap to edges enabled, throw toward a screen edge or corner to dock with a brief white glow. Slow drags still allow precise placement; reduced motion disables the animation.
- When Spotify's local session omits artwork, the island can match the track in Apple's iTunes catalog. No Spotify token is sent.
- Updated to Electron 45.5.0 and refreshed the Windows packaging dependencies. No Node.js installation is required to use either download.

## Windows downloads

Choose the **Setup** executable for an installation with shortcuts or the **Portable** executable to run directly. Quit the previous version from the tray before launching the update.

Both downloads are unsigned Windows x64 builds. Local playback requires Windows 10 version 1809 or later or Windows 11. Artwork, timing and transport controls depend on the Spotify desktop session. Synced lyrics depend on LRCLIB coverage.
