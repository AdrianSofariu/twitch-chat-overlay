// This file acts as a central point to define configuration variables.
// It prioritizes environment variables for sensitive data.
const OAUTH_REDIRECT_PORT = 3000;

module.exports = {
  // Twitch Client ID: Recommended to be loaded from environment variables.
  // Ensure you have a .env file in your project root with TWITCH_CLIENT_ID=your_id
  TWITCH_CLIENT_ID: process.env.TWITCH_CLIENT_ID,

  // Twitch Client Secret: Also loaded from environment variables for security.
  // Ensure you have a .env file in your project root with TWITCH_CLIENT_SECRET=your_secret
  TWITCH_CLIENT_SECRET: process.env.TWITCH_CLIENT_SECRET,

  // OAuth Redirect Port: Can be hardcoded or also from .env if it needs to vary.
  OAUTH_REDIRECT_PORT: 3000,

  // OAuth Redirect URI: Constructed using the port, ensures consistency.
  // This MUST match the redirect URI you registered in your Twitch Developer Console.
  OAUTH_REDIRECT_URI: `http://localhost:${OAUTH_REDIRECT_PORT}`,
};
