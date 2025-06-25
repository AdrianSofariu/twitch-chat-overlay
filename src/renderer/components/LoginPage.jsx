import React, { useState, useEffect } from "react";
import "./LoginPage.css"; // Import styles for the login page

function LoginPage() {
  const [oauthStatusMessage, setOauthStatusMessage] = useState(
    "Click the button to log in with Twitch."
  );
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false); // To show success message

  /**
   * Effect to handle OAuth status updates from the main process.
   * This listens for the 'oauth-status' event and updates the UI accordingly.
   * It sets the authentication state and displays messages based on success or failure.
   * This effect runs once when the component mounts.
   */
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onOAuthStatus((_event, statusData) => {
        console.log("[LoginPage] OAuth Status Received:", statusData);
        setIsAuthenticating(false); // Authentication flow finished

        if (statusData.success) {
          setOauthStatusMessage(
            `Authentication successful! Welcome, ${statusData.username}. Loading chat...`
          );
          setIsAuthenticated(true);
          // Main process will now load chat.html, effectively changing the view.
        } else {
          setOauthStatusMessage(
            `Authentication failed: ${statusData.error || "Unknown error."}`
          );
          setIsAuthenticated(false);
        }
      });
    }
  }, []);

  /**
   * Function to handle the login button click.
   * It initiates the OAuth flow by calling the Electron API.
   * This function sets the authentication state to true
   * and updates the status message to indicate that the login process has started.
   * This function is called when the user clicks the "Login with Twitch" button.
   */
  const handleLoginClick = () => {
    if (window.electronAPI && window.electronAPI.startOAuthFlow) {
      setIsAuthenticating(true);
      setOauthStatusMessage("Opening Twitch login in your browser...");
      window.electronAPI.startOAuthFlow();
    } else {
      console.error("electronAPI.startOAuthFlow is not available.");
      setOauthStatusMessage("Error: Electron API not available for OAuth.");
    }
  };

  return (
    <>
      <div className="login-container">
        <h1>Twitch Chat Overlay</h1>
        {!isAuthenticated && (
          <button onClick={handleLoginClick} disabled={isAuthenticating}>
            {isAuthenticating ? "Opening Browser..." : "Login with Twitch"}
          </button>
        )}
        <p
          className={`status-message ${isAuthenticated ? "success" : "error"}`}
        >
          {oauthStatusMessage}
        </p>
      </div>
    </>
  );
}

export default LoginPage;
