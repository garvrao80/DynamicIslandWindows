const crypto = require("node:crypto");
const http = require("node:http");
const { shell } = require("electron");

const redirectUri = "http://127.0.0.1:43817/callback";
const scopes = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state"
];

function base64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function createPkcePair() {
  const verifier = base64Url(crypto.randomBytes(64));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

async function startSpotifyLogin(clientId) {
  if (!clientId) {
    throw new Error("Set your Spotify Client ID first.");
  }

  const { verifier, challenge } = createPkcePair();
  const state = base64Url(crypto.randomBytes(16));

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("code_challenge", challenge);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, redirectUri);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>Lyrics Island is connected.</h1><p>You can close this tab.</p>");
      server.close();

      if (error) {
        reject(new Error(error));
        return;
      }

      if (!code || returnedState !== state) {
        reject(new Error("Spotify login state mismatch."));
        return;
      }

      try {
        resolve(await exchangeCode(clientId, code, verifier));
      } catch (tokenError) {
        reject(tokenError);
      }
    });

    server.listen(43817, "127.0.0.1", () => {
      shell.openExternal(authUrl.toString());
    });

    server.on("error", reject);
  });
}

async function exchangeCode(clientId, code, verifier) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Spotify token exchange failed: ${response.status}`);
  }

  const token = await response.json();
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenExpiresAt: Date.now() + token.expires_in * 1000
  };
}

async function refreshAccessToken(config) {
  if (!config.refreshToken || !config.spotifyClientId) return config;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: config.refreshToken,
    client_id: config.spotifyClientId
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Spotify refresh failed: ${response.status}`);
  }

  const token = await response.json();
  return {
    ...config,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || config.refreshToken,
    tokenExpiresAt: Date.now() + token.expires_in * 1000
  };
}

async function spotifyRequest(config, path, options = {}) {
  if (!config.accessToken) return null;

  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      ...(options.headers || {})
    }
  });

  if (response.status === 204) return null;
  if (response.status === 401) throw new Error("spotify-token-expired");
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After")) || 1;
    let reason = "";
    try {
      const payload = await response.json();
      reason = payload?.error?.reason || "";
    } catch {
      // Some Spotify edge responses have no JSON body.
    }
    const error = new Error(
      reason === "QUOTA_EXCEEDED"
        ? `Spotify API quota exceeded (retry in ${retryAfter}s)`
        : `Spotify rate limited (retry in ${retryAfter}s)`
    );
    error.code = reason === "QUOTA_EXCEEDED" ? "SPOTIFY_QUOTA_EXCEEDED" : "SPOTIFY_RATE_LIMITED";
    error.retryAfterMs = retryAfter * 1000;
    throw error;
  }
  if (!response.ok) throw new Error(`Spotify request failed: ${response.status}`);

  return response.json();
}

async function getCurrentPlayback(config) {
  // The currently-playing endpoint returns 204 when nothing is active and the
  // full track body when something is playing. The /me/player endpoint is the
  // same data but additionally tells us whether a device is active, which is
  // important because a Premium Spotify account with no active device returns
  // 404 from this endpoint even though the user is technically logged in.
  let firstError;
  let data;
  try {
    data = await spotifyRequest(config, "/me/player/currently-playing");
  } catch (error) {
    if (error.code === "SPOTIFY_RATE_LIMITED" || error.code === "SPOTIFY_QUOTA_EXCEEDED") {
      throw error;
    }
    firstError = error;
    data = await spotifyRequest(config, "/me/player");
  }
  if (!data?.item) {
    if (firstError) throw firstError;
    return { isPlaying: false, empty: true };
  }

  const item = data.item;
  const artists = item.artists?.map((artist) => artist.name).join(", ") || "Unknown artist";

  return {
    empty: false,
    isPlaying: Boolean(data.is_playing),
    progressMs: data.progress_ms || 0,
    durationMs: item.duration_ms || 0,
    track: item.name,
    artist: artists,
    album: item.album?.name || "",
    artworkUrl: item.album?.images?.[0]?.url || "",
    uri: item.uri
  };
}

async function controlPlayback(config, action) {
  const map = {
    play: ["PUT", "/me/player/play"],
    pause: ["PUT", "/me/player/pause"],
    next: ["POST", "/me/player/next"],
    previous: ["POST", "/me/player/previous"]
  };

  const [method, endpoint] = map[action] || [];
  if (!method) return;

  await spotifyRequest(config, endpoint, { method });
}

async function seekPlayback(config, positionMs) {
  const safePosition = Math.max(0, Math.round(Number(positionMs) || 0));
  await spotifyRequest(config, `/me/player/seek?position_ms=${safePosition}`, { method: "PUT" });
}

module.exports = {
  redirectUri,
  startSpotifyLogin,
  refreshAccessToken,
  getCurrentPlayback,
  controlPlayback,
  seekPlayback
};
