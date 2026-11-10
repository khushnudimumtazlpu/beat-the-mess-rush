"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { authClient } from "../../lib/auth-client.js";
import { Button } from "../../components/ui/button.jsx";
import { logoutWorkflow } from "./logout-workflow.js";

export function LogoutButton({ className = "", fullWidth = false, variant = "secondary" }) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function handleLogout() {
    if (isSigningOut) return;

    setError("");
    setStatus("");
    setIsSigningOut(true);

    const result = await logoutWorkflow(
      () => authClient.signOut(),
      () => {
        setStatus("Signed out. Returning to RushLess...");
        window.location.replace("/");
      },
    );

    if (!result.ok) {
      setIsSigningOut(false);
      setError(result.message);
    }
  }

  return (
    <div className="auth-logout">
      <Button
        className={className}
        variant={variant}
        fullWidth={fullWidth}
        disabled={isSigningOut}
        aria-busy={isSigningOut}
        onClick={handleLogout}
      >
        <LogOut size={16} aria-hidden="true" />
        {isSigningOut ? "Signing out..." : "Logout"}
      </Button>
      {error ? <p className="auth-logout__message" role="alert">{error}</p> : null}
      {status ? <p className="auth-logout__message" role="status">{status}</p> : null}
    </div>
  );
}
