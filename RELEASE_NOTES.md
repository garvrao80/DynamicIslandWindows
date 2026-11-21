# Lyrics Island v0.1.1-beta.2

Play a song in Spotify desktop on this PC and the island picks it up through Windows media sessions. Fresh installations use this source automatically. After upgrading, select **Settings → Spotify on this PC → Save** to switch an existing profile. For playback on another device, choose **Spotify Web API** to see the Client ID and connection controls.

## What's new

- Skip buttons give immediate feedback. The title updates when the player confirms a track, its cover fades in, and lyrics load independently. Rapid skips discard late responses from earlier songs.
- The pill expands and collapses smoothly, including when you reopen it during collapse.
- Expanded lyrics follow faster passages with shorter slides. **Back to live** returns to the current line while browsing.
- Adjust a song’s timing in 250 ms steps in Settings. Each correction is saved for that song and also applies when seeking by lyric.

## Windows downloads

Choose the **Setup** executable for an installation with shortcuts or the **Portable** executable to run directly. Quit the previous version from the tray before launching the update.

Both downloads are unsigned Windows x64 builds. Local playback requires Windows 10 version 1809 or later or Windows 11. Artwork, timing and transport controls depend on the Spotify desktop session. Synced lyrics depend on LRCLIB coverage.
