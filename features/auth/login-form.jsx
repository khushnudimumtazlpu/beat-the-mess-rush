"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { authClient } from "../../lib/auth-client.js";
import { ACCOUNT_STATUS } from "../../lib/auth-contracts.js";
import { homeForUser } from "../../lib/auth-redirects.js";
import { Button } from "../../components/ui/button.jsx";
import { InputField } from "../../components/ui/form-controls.jsx";

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
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
      });

      if (result.error) {
        setError("We couldn't sign you in with those details.");
        return;
      }

      const user = result.data?.user;
      if (user?.status === ACCOUNT_STATUS.PENDING) {
        router.replace("/pending");
      } else if (user?.status === ACCOUNT_STATUS.ACTIVE) {
        router.replace(callbackUrl || homeForUser(user));
      } else {
        router.replace("/access-denied");
      }
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
