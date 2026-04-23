import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "@asgardeo/auth-react";

const authConfig = {
  clientID: import.meta.env.VITE_ASGARDEO_CLIENT_ID || "",
  baseUrl: import.meta.env.VITE_ASGARDEO_BASE_URL || "",
  signInRedirectURL:
    import.meta.env.VITE_ASGARDEO_SIGN_IN_REDIRECT_URL || window.location.origin,
  signOutRedirectURL:
    import.meta.env.VITE_ASGARDEO_SIGN_OUT_REDIRECT_URL || window.location.origin,
  scope: (import.meta.env.VITE_ASGARDEO_SCOPE || "openid profile email").split(/\s+/).filter(Boolean),
};

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider config={authConfig}>
      <App />
    </AuthProvider>
  </StrictMode>,
);
