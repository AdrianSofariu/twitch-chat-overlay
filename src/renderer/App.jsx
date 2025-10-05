import React, { useState, useEffect } from "react";
import LoginPage from "./components/LoginPage";
import ChatPage from "./components/ChatPage";

import "./styles/style.css"; // Contains resets, html/body, #root layout
import "./styles/theme.css"; // Contains variables, general themed elements

function App() {
  // State to determine which component to render
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authenticatedUsername, setAuthenticatedUsername] = useState(null);

  useEffect(() => {
    // Listen for OAuth status from the main process
    if (window.electronAPI) {
      window.electronAPI.onOAuthStatus((_event, statusData) => {
        console.log("[App.jsx] OAuth Status received for routing:", statusData);
        if (statusData.success) {
          setIsAuthenticated(true);
          setAuthenticatedUsername(statusData.username);
        } else {
          setIsAuthenticated(false);
          setAuthenticatedUsername(null);
        }
      });
    }
  }, []); // Run once on component mount

  /**
   * Function to handle the close button click.
   * It calls the Electron API to close the application.
   */
  const handleCloseApp = () => {
    if (window.electronAPI && window.electronAPI.closeApp) {
      window.electronAPI.closeApp();
    } else {
      console.error("electronAPI.closeApp is not available.");
    }
  };

  // Conditionally render LoginPage or ChatPage based on authentication status
  return (
    <>
      <div className="draggable-header">
        <button className="close-button" onClick={handleCloseApp}>
          X
        </button>{" "}
      </div>

      {isAuthenticated ? (
        <ChatPage authenticatedUsername={authenticatedUsername} />
      ) : (
        <LoginPage />
      )}
    </>
  );
}

export default App;
