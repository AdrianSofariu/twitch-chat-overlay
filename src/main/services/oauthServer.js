const http = require("http");
const fetch = require("node-fetch");
const { URLSearchParams } = require("url");

let mainWindow = null;
let twitchClientId = null;
let twitchClientSecret = null;
let oauthRedirectPort = null;
let oauthRedirectUri = null;

// Use callback for communication
let onOAuthSuccessCallback = null;
let onOAuthFailureCallback = null;

// Declare the server instance outside the function so it can be controlled globally
let server = null;

// Current auth details
let currentAuthDetails = null; // { token, username, refreshToken }

/**
 * Initializes the OAuth server with necessary configurations and callbacks.
 * @param {BrowserWindow} window - The main Electron BrowserWindow instance.
 * @param {object} config - Configuration object { clientId, clientSecret, redirectPort, redirectUri }.
 * @param {function} onSuccess - Callback function to execute on successful OAuth.
 * @param {function} onFailure - Callback function to execute on OAuth failure.
 */
function initializeOAuthServer(window, config, onSuccess, onFailure) {
  mainWindow = window;
  twitchClientId = config.clientId;
  twitchClientSecret = config.clientSecret;
  oauthRedirectPort = config.redirectPort;
  oauthRedirectUri = config.redirectUri;
  onOAuthSuccessCallback = onSuccess;
  onOAuthFailureCallback = onFailure;
}

/**
 * Starts the local HTTP server to listen for the OAuth redirect.
 */
function startOAuthServer() {
  if (server && server.listening) {
    console.log("[OAuthServer] Server already listening.");
    return;
  }

  server = http.createServer(async (req, res) => {
    // Parse the incoming request URL to extract query parameters
    const url = new URL(req.url || "/", oauthRedirectUri);
    const code = url.searchParams.get("code"); // This is the authorization code from Twitch
    const error = url.searchParams.get("error"); // Twitch might send an error if authorization fails

    // Handle errors from Twitch (e.g., user denied access)
    if (error) {
      console.error(`[OAuthServer] OAuth Error: ${error}`);
      currentAuthDetails = null; // Reset current auth details
      if (onOAuthFailureCallback) {
        onOAuthFailureCallback(
          `Twitch Auth Error: ${error}. User denied access or invalid request.`
        );
      }
      // Respond to the browser with a blank page to clear the state
      res.writeHead(302, { Location: "about:blank" });
      res.end();
      return;
    }

    // If we received an authorization code
    if (code) {
      console.log(`[OAuthServer] Received OAuth code: ${code}`);

      try {
        // Exchange authorization code for access token
        let tokenResponse;
        try {
          tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: twitchClientId,
              client_secret: twitchClientSecret,
              code: code,
              grant_type: "authorization_code",
              redirect_uri: oauthRedirectUri,
            }).toString(),
          });
        } catch (networkError) {
          throw new Error(
            `Network error during token exchange: ${networkError.message}`
          );
        }

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse
            .json()
            .catch(() => ({ message: "Unknown error parsing response." }));
          throw new Error(
            `Twitch API Error (Token): ${tokenResponse.status} - ${
              errorData.message || JSON.stringify(errorData)
            }`
          );
        }

        const tokenData = await tokenResponse.json();
        const twitchOAuthToken = tokenData.access_token;
        const twitchRefreshToken = tokenData.refresh_token;

        console.log(
          `[OAuthServer] OAuth Token obtained! Access Token: ${twitchOAuthToken.substring(
            0,
            10
          )}...`
        );

        // Use access token to get user info (like username)
        let userResponse;
        try {
          userResponse = await fetch("https://api.twitch.tv/helix/users", {
            headers: {
              "Client-ID": twitchClientId,
              Authorization: `Bearer ${twitchOAuthToken}`,
            },
          });
        } catch (networkError) {
          throw new Error(
            `Network error during user info fetch: ${networkError.message}`
          );
        }

        if (!userResponse.ok) {
          const errorData = await userResponse
            .json()
            .catch(() => ({ message: "Unknown error parsing response." }));
          throw new Error(
            `Twitch API Error (User Info): ${userResponse.status} - ${
              errorData.message || JSON.stringify(errorData)
            }`
          );
        }

        const userData = await userResponse.json();
        let twitchAuthUsername = null;
        if (userData.data && userData.data.length > 0) {
          twitchAuthUsername = userData.data[0].login;
          console.log(
            `[OAuthServer] Authenticated as user: ${twitchAuthUsername}`
          );
        } else {
          console.warn(
            "[OAuthServer] Could not retrieve authenticated username."
          );
        }

        // Store the current auth details
        currentAuthDetails = {
          token: twitchOAuthToken,
          username: twitchAuthUsername,
          refreshToken: twitchRefreshToken,
        };

        // Notify main process of success
        if (onOAuthSuccessCallback) {
          onOAuthSuccessCallback(currentAuthDetails);
        }

        // Respond to the browser to indicate success and close the tab
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Authentication Successful</title></head>
          <body>
            <h1>Authentication Successful!</h1>
            <p>You can now close this window and return to the Twitch Chat Overlay app.</p>
            <script>window.close();</script>
          </body>
          </html>
        `);
      } catch (e) {
        console.error(`[OAuthServer] OAuth Process Error: ${e.message}`); // Generic error for internal issues
        currentAuthDetails = null; // Reset current auth details
        if (onOAuthFailureCallback) {
          onOAuthFailureCallback(`Authentication process failed: ${e.message}`); // Send more generic message to UI
        }
        // Respond to the browser with an error message
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Authentication Failed</title></head>
          <body>
            <h1>Authentication Failed!</h1>
            <p>Reason: ${e.message}</p>
            <p>Please close this window and try again in the Twitch Chat Overlay app.</p>
          </body>
          </html>
        `);
      } finally {
        // Close the HTTP server after handling the request.
        stopOAuthServer();
      }
    } else {
      // If the redirect didn't contain a 'code' or 'error' parameter
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("OAuth callback received, but no authorization code found.");
    }
  });

  server.listen(oauthRedirectPort, () => {
    console.log(
      `[OAuthServer] Redirect server listening on port ${oauthRedirectPort}`
    );
  });
}

// Interval ID for auto-refreshing the token
let refreshIntervalId = null;

/**
 * Function to automatically refresh the access token using the stored refresh token.
 * This function uses the refresh token to obtain a new access token from Twitch.
 * It updates the currentAuthDetails with the new token and refresh token.
 * @param {number} intervalMs - The interval in milliseconds for auto-refreshing the token (default is 3.5 hours).
 */
async function refreshAccessToken() {
  if (!currentAuthDetails || !currentAuthDetails.refreshToken) {
    console.warn(
      "[OAuthServer] No refresh token available to refresh access token."
    );
    throw new Error("No refresh token available.");
  }

  try {
    const params = new URLSearchParams();
    params.append("client_id", twitchClientId);
    params.append("client_secret", twitchClientSecret);
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", currentAuthDetails.refreshToken);

    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Unknown error parsing refresh response." }));
      throw new Error(
        `Twitch API Error (Refresh Token): ${response.status} - ${
          errorData.message || JSON.stringify(errorData)
        }`
      );
    }

    const tokenData = await response.json();
    // Update both the access token and the refresh token (Twitch can issue new refresh tokens)
    currentAuthDetails.token = tokenData.access_token;
    currentAuthDetails.refreshToken = tokenData.refresh_token; // <--- IMPORTANT: Update refresh token too
    console.log(
      `[OAuthServer] Access token refreshed. New token: ${currentAuthDetails.token.substring(
        0,
        10
      )}...`
    );
    return currentAuthDetails.token; // Return the new access token
  } catch (error) {
    console.error("[OAuthServer] Error refreshing access token:", error);
    // On critical refresh failure, clear all auth details and notify renderer
    currentAuthDetails = null;
    if (onOAuthFailureCallback) {
      onOAuthFailureCallback(`Authentication expired. Please re-authenticate.`);
    }
    throw error; // Re-throw to propagate the error
  }
}

function startTokenAutoRefresh(intervalMs = 3.5 * 60 * 60 * 1000) {
  if (refreshIntervalId) return; // Prevent multiple intervals

  // Initial refresh after a short delay, then recurring
  refreshIntervalId = setInterval(async () => {
    if (!currentAuthDetails || !currentAuthDetails.refreshToken) {
      console.warn(
        "[OAuthServer] No refresh token for auto-refresh. Stopping auto-refresh."
      );
      stopTokenAutoRefresh();
      return;
    }
    try {
      await refreshAccessToken();
    } catch (err) {
      console.warn("[OAuthServer] Failed to auto-refresh token:", err.message);
      stopTokenAutoRefresh();
    }
  }, intervalMs);

  console.log(
    `[OAuthServer] Started auto token refresh every ${
      intervalMs / 1000 / 60
    } minutes.`
  );
}

function stopTokenAutoRefresh() {
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
    console.log("[OAuthServer] Stopped auto token refresh.");
  }
}

/**
 * Stops the local HTTP server.
 */
function stopOAuthServer() {
  if (server && server.listening) {
    server.close(() => {
      console.log("[OAuthServer] Redirect server closed.");
    });
  }
}

/**
 * Function to retrieve stored authentication details
 */
function getAuthDetails() {
  return currentAuthDetails;
}

/**
 * Function to clear stored authentication details
 */
function clearAuthDetails() {
  currentAuthDetails = null;
}

module.exports = {
  initializeOAuthServer,
  startOAuthServer,
  stopOAuthServer,
  getAuthDetails,
  clearAuthDetails,
  startTokenAutoRefresh,
  stopTokenAutoRefresh,
};
