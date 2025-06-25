import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App"; // Import our main App component

// Get the root DOM element from index.html where React will mount
const rootElement = document.getElementById("root");

// Create a React root and render your App component
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
