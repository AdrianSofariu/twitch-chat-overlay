const tmi = require("tmi.js");
const config = require("../../config"); // Import your config file

// This client will be shared across connect/disconnect calls
let twitchClient = null;
let currentChannel = null;
let mainWindow = null;

// Twitch API credentials
const TWITCH_CLIENT_ID = config.TWITCH_CLIENT_ID || null;

/**
 * Initialize the Twitch chat service with the main window reference.
 * @param {BrowserWindow} window - The main Electron BrowserWindow instance.
 */
function initialize(window) {
  mainWindow = window;
}

/**
 * Sends an IPC message to the renderer process.
 * @param {string} channel The IPC channel name.
 * @param {any} data The data to send.
 */
function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * Calculates the luminance of a hex color (0-255 range).
 * A lower value means darker.
 * @param {string} hex The hex color string (e.g., "#RRGGBB").
 * @returns {number} The luminance value.
 */
function getLuminance(hex) {
  if (!hex || hex.length !== 7) return 0; // Invalid hex, assume darkest
  const r = parseInt(hex.substring(1, 3), 16);
  const g = parseInt(hex.substring(3, 5), 16);
  const b = parseInt(hex.substring(5, 7), 16);
  // Using the sRGB luminance formula
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Ensures a color is readable on a dark background.
 * If the color is too dark, it returns a fallback color.
 * @param {string} originalColor The original hex color from Twitch or generated.
 * @returns {string} A readable hex color.
 */
const MIN_LUMINANCE = 40; // Experiment with this value (0-255). Lower values allow darker colors.
const FALLBACK_COLOR = "#AAAAAA"; // Light grey, readable on dark backgrounds

function ensureReadableColor(originalColor) {
  if (!originalColor) {
    return FALLBACK_COLOR;
  }

  // Convert potential 3-digit hex to 6-digit
  let hex = originalColor;
  if (hex.length === 4) {
    // e.g., #F00 -> #FF0000
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }

  const luminance = getLuminance(hex);

  if (luminance < MIN_LUMINANCE) {
    return FALLBACK_COLOR;
  }
  return originalColor;
}

/**
 * Generates a color based on the username.
 * This function uses a simple hash function to map usernames to a set of predefined colors.
 * @param {string} username The Twitch username to generate a color for.
 * @returns {string} A hex color code.
 */
function getColorFromUsername(username) {
  const colors = [
    "#FF4500",
    "#2E8B57",
    "#1E90FF",
    "#DA70D6",
    "#FF1493",
    "#00CED1",
    "#FFD700",
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Checks if a Twitch channel (user) exists using the Helix API.
 * Requires an authenticated access token and your Twitch Client ID.
 * @param {string} channelName The channel name (login) to check.
 * @param {string} accessToken An authenticated user's OAuth token.
 * @returns {Promise<boolean>} True if the channel exists, false otherwise.
 */
async function doesChannelExist(channelName, accessToken) {
  if (!channelName) {
    console.warn(
      "[TwitchChatService] doesChannelExist called with empty channelName."
    );
    return false;
  }
  if (!accessToken) {
    console.warn(
      "[TwitchChatService] doesChannelExist called without access token. Cannot query Helix API."
    );
    return false;
  }
  if (!TWITCH_CLIENT_ID) {
    console.error(
      "[TwitchChatService] TWITCH_CLIENT_ID is not defined in config.js. Cannot check channel existence."
    );
    return false;
  }

  const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(
    channelName
  )}`;
  console.log(
    `[TwitchChatService] Checking channel existence via Helix: ${url}`
  );

  try {
    const response = await fetch(url, {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[TwitchChatService] Helix API error checking channel ${channelName}: ${response.status} - ${errorText}`
      );
      // If it's a 401, the token might be invalid, but for a channel check, we still return false.
      return false;
    }

    const data = await response.json();
    // The 'data' array will be empty if the user is not found.
    return data.data && data.data.length > 0;
  } catch (error) {
    console.error(
      `[TwitchChatService] Network or parsing error when checking channel ${channelName}:`,
      error
    );
    return false; // Assume channel doesn't exist on network error
  }
}

/**
 * Connects to a Twitch channel.
 * @param {string} channelName The name of the Twitch channel to connect to.
 */
async function connectToChannel(channelName, authDetails) {
  if (!mainWindow) {
    console.error("TwitchChatService not initialized with mainWindow.");
    return;
  }

  if (!authDetails || !authDetails.token || !authDetails.username) {
    console.warn(
      "[TwitchChatService] Connection denied: Authentication required."
    );
    sendToRenderer("connection-status", {
      status: "error",
      channel: channelName,
      error: "Authentication required to connect to chat.",
    });
    sendToRenderer("chat-message", {
      username: "System",
      text: "Connection failed: Please authenticate with Twitch first.",
      color: "#FF0000", // Red for error
      isSystem: true,
    });
    return; // Exit the function if not authenticated
  }

  if (twitchClient && twitchClient.readyState() === "OPEN") {
    console.warn("Already connected to a Twitch channel. Disconnecting first.");
    await disconnectFromChannel();
  }

  // Check if channel exists before attempting TMI.js connection ---
  sendToRenderer("connection-status", {
    status: "connecting",
    channel: channelName,
    message: "Verifying channel existence...", // Inform UI about the check
  });

  const channelExists = await doesChannelExist(channelName, authDetails.token);

  if (!channelExists) {
    console.warn(
      `[TwitchChatService] Channel '${channelName}' does not exist on Twitch.`
    );
    sendToRenderer("connection-status", {
      status: "error",
      channel: channelName,
      error: `Channel '${channelName}' not found. Please check the spelling.`,
    });
    return; // Stop the connection attempt if channel doesn't exist
  }

  currentChannel = channelName.toLowerCase();

  // Create a new TMI client instance
  twitchClient = new tmi.Client({
    connection: {
      reconnect: true,
      secure: true,
    },
    channels: [currentChannel],
    identity: {
      username: authDetails.username,
      password: "oauth:" + authDetails.token, // TMI.js requires 'oauth:' prefix for tokens
    },
  });

  console.log(
    `[TwitchChatService] Attempting to connect as ${authDetails.username} with OAuth token...`
  );
  // Register event handlers

  // -- Connect to Twitch IRC
  twitchClient.on("connected", (address, port) => {
    console.log(
      `[TwitchChatService] Connected to ${address}:${port}, channel: ${currentChannel}`
    );
    sendToRenderer("connection-status", {
      status: "connected",
      channel: currentChannel,
    });
  });

  // -- Handle disconnection
  twitchClient.on("disconnected", (reason) => {
    console.log(`[TwitchChatService] Disconnected: ${reason}`);
    sendToRenderer("connection-status", {
      status: "disconnected",
      reason: reason,
    });
  });

  // -- Handle messages
  twitchClient.on("message", (channel, tags, message, self) => {
    // Ignore messages from ourselves
    if (self) return;

    // Determine the color, applying your fallback logic,
    // AND THEN ensuring readability
    const rawColor = tags["color"] || getColorFromUsername(tags.username);
    const finalColor = ensureReadableColor(rawColor); // <--- NEW STEP HERE

    // Extract relevant data from the message
    const messageData = {
      username: tags["display-name"] || tags.username,
      text: message,
      color: finalColor,
      // You can add more tags here if needed, like badges, emotes, etc.
      isMod: tags.mod,
      isSub: tags.subscriber,
      isVip: tags.vip,
      isBroadcaster: tags["user-id"] === tags["room-id"],
      messageId: tags.id,
      emotes: tags.emotes, // Raw emotes data
    };

    sendToRenderer("chat-message", messageData);
  });

  // -- Handle cheers
  twitchClient.on("cheer", (channel, tags, message) => {
    const rawColor = tags["color"] || "#FFD700"; // Default gold if no user color
    const finalColor = ensureReadableColor(rawColor); // <--- NEW STEP HERE

    const messageData = {
      username: tags["display-name"] || tags.username,
      text: message,
      color: finalColor, // Gold for cheers
      isCheer: true,
      bits: tags.bits,
      messageId: tags.id,
      emotes: tags.emotes, // Raw emotes data
    };

    sendToRenderer("chat-message", messageData);
  });

  // -- Handle timeouts
  twitchClient.on("timeout", (channel, username, reason, duration) => {
    const messageData = {
      username: "System",
      text: `${username} has been timed out for ${duration} seconds. Reason: ${
        reason || "N/A"
      }`,
      color: "#FF6347", // Tomato color for timeout messages
    };
    sendToRenderer("chat-message", messageData);
  });

  // -- Handle bans
  twitchClient.on("ban", (channel, username, reason) => {
    const messageData = {
      username: "System",
      text: `${username} has been banned. Reason: ${reason || "N/A"}`,
      color: "#DC143C", // Crimson color for ban messages
    };
    sendToRenderer("chat-message", messageData);
  });

  // -- Handle raids
  twitchClient.on("raided", (channel, username, viewers) => {
    const messageData = {
      username: "System",
      text: `${username} is raiding with ${viewers} viewers!`,
      color: "#9370DB", // MediumPurple for raid messages
    };
    sendToRenderer("chat-message", messageData);
  });

  // Connect
  try {
    await twitchClient.connect();
  } catch (error) {
    console.error(
      `[TwitchChatService] Failed to connect to ${currentChannel}:`,
      error
    );
    sendToRenderer("connection-status", {
      status: "error",
      channel: currentChannel,
      error: error.message,
    });
    twitchClient = null; // Clear client on error
  }
}

/**
 * Disconnects from the current Twitch channel.
 */
async function disconnectFromChannel() {
  if (twitchClient) {
    try {
      twitchClient.removeAllListeners(); // Clean up all listeners
      await twitchClient.disconnect();
      console.log(`[TwitchChatService] Disconnected from ${currentChannel}`);
      sendToRenderer("connection-status", {
        status: "disconnected",
        channel: currentChannel,
        reason: "User requested disconnect",
      });
      currentChannel = null;
      twitchClient = null;
    } catch (error) {
      console.error(`[TwitchChatService] Error during disconnect:`, error);
      // Even if disconnect fails, consider it disconnected from the app's perspective
      sendToRenderer("connection-status", {
        status: "disconnected",
        channel: currentChannel,
        error: error.message,
        reason: "Unexpected error while disconnecting",
      });
      currentChannel = null;
      twitchClient = null;
    }
  }
}

/**
 * Gets the current connection status.
 * @returns {object} An object indicating the connection status.
 */
function getStatus() {
  if (!twitchClient) {
    return { status: "disconnected", channel: null };
  }
  return {
    status: twitchClient.readyState() === "OPEN" ? "connected" : "connecting",
    channel: currentChannel,
  };
}

// Export the functions for use in other modules
module.exports = {
  initialize,
  connectToChannel,
  disconnectFromChannel,
  getStatus,
};
