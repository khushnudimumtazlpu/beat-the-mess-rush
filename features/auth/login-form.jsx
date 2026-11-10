"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { authClient } from "../../lib/auth-client.js";
import { Button } from "../../components/ui/button.jsx";
import { InputField } from "../../components/ui/form-controls.jsx";
import { readLoginCredentials, resolveLoginOutcome } from "./login-workflow.js";

export function LoginForm({ callbackUrl }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      // Read the live controls at submit time. Password managers and browser
      // autofill may update the DOM without firing React's onChange handler.
      const credentials = readLoginCredentials(new FormData(event.currentTarget));
      const result = await authClient.signIn.email(credentials);

      const outcome = resolveLoginOutcome(result, callbackUrl);
      if (outcome.type === "error") {
        setError(outcome.message);
        return;
      }

      router.replace(outcome.destination);
    } catch {
      setError("Sign in is unavailable right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
      <InputField
        label="Email address"
        name="email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <InputField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {error ? <p className="ui-field__error" role="alert">{error}</p> : null}
      <Button type="submit" fullWidth disabled={isSubmitting}>
        {isSubmitting ? "Signing in..." : "Sign in"}
        {!isSubmitting ? <ArrowRight size={17} aria-hidden="true" /> : null}
      </Button>
      <p className="flex items-center justify-center gap-2 text-sm text-muted">
        <LockKeyhole size={15} aria-hidden="true" /> Your credentials are sent securely to RushLess.
      </p>
    </form>
  );
}
