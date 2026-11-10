"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button.jsx";
import { InputField, SelectField } from "../../components/ui/form-controls.jsx";

const ACCOUNT_TYPES = Object.freeze({
  STUDENT: "STUDENT",
  MESS_ADMIN: "MESS_ADMIN",
});

const GENERIC_FAILURE = "Registration is unavailable right now. Please try again.";
const HOSTELS_FAILURE = "Active Hostels are unavailable right now. Please try again.";

function safeApiMessage(payload, fallback) {
  const message = payload?.error?.message;
  return typeof message === "string" && message.length <= 200 ? message : fallback;
}

export async function loadActiveHostels(fetchRequest = fetch, signal) {
  let response;
  try {
    response = await fetchRequest("/api/registration/hostels", {
      method: "GET",
      cache: "no-store",
      signal,
    });
  } catch {
    return { ok: false, message: HOSTELS_FAILURE };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, message: HOSTELS_FAILURE };
  }

  if (!response.ok || payload?.success !== true || !Array.isArray(payload.data)) {
    return { ok: false, message: safeApiMessage(payload, HOSTELS_FAILURE) };
  }

  const hostels = payload.data.filter((hostel) => (
    hostel && typeof hostel.id === "string" && hostel.id.length > 0
      && typeof hostel.name === "string" && hostel.name.trim().length > 0
  ));
  return { ok: true, hostels };
}

export async function submitRegistrationRequest(values, fetchRequest = fetch) {
  if (!Object.values(ACCOUNT_TYPES).includes(values.accountType)) {
    return { ok: false, message: "Choose Student or Mess Admin as your account type." };
  }
  if (values.accountType === ACCOUNT_TYPES.STUDENT && typeof values.hostelId !== "string") {
    return { ok: false, message: "Select an active Hostel before creating a Student account." };
  }
  if (values.accountType === ACCOUNT_TYPES.STUDENT && values.hostelId.trim().length === 0) {
    return { ok: false, message: "Select an active Hostel before creating a Student account." };
  }

  const body = {
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
    password: values.password,
    accountType: values.accountType,
  };
  if (values.accountType === ACCOUNT_TYPES.STUDENT) body.hostelId = values.hostelId;

  let response;
  try {
    response = await fetchRequest("/api/registration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: GENERIC_FAILURE };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, message: GENERIC_FAILURE };
  }

  if (!response.ok || payload?.success !== true) {
    const apiMessage = payload?.error?.message;
    return {
      ok: false,
      message: typeof apiMessage === "string" && apiMessage.length <= 200
        ? apiMessage
        : GENERIC_FAILURE,
    };
  }

  return { ok: true, accountType: values.accountType };
}

function successDetails(accountType) {
  if (accountType === ACCOUNT_TYPES.STUDENT) {
    return "If this email is available, the request was received. New Student accounts remain pending; Student approval is not available yet.";
  }
  return "If this email is available, the request was received. New Mess Admin accounts remain pending until a Super Admin approves and assigns a Hostel.";
}

export function RegistrationForm() {
  const [accountType, setAccountType] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hostelId, setHostelId] = useState("");
  const [hostels, setHostels] = useState([]);
  const [hostelsState, setHostelsState] = useState("idle");
  const [hostelsError, setHostelsError] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedType, setSubmittedType] = useState(null);
  const submissionInProgress = useRef(false);

  useEffect(() => {
    if (accountType !== ACCOUNT_TYPES.STUDENT) return undefined;

    const controller = new AbortController();
    let isCurrentRequest = true;

    loadActiveHostels(fetch, controller.signal).then((result) => {
      if (!isCurrentRequest) return;
      if (!result.ok) {
        setHostelsState("error");
        setHostelsError(result.message);
        return;
      }
      setHostels(result.hostels);
      setHostelsState("ready");
    });

    return () => {
      isCurrentRequest = false;
      controller.abort();
    };
  }, [accountType]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submissionInProgress.current) return;
    if (accountType === ACCOUNT_TYPES.STUDENT && !hostelId) {
      setError("Select an active Hostel before creating a Student account.");
      return;
    }

    setError("");
    submissionInProgress.current = true;
    setIsSubmitting(true);
    let result;
    try {
      result = await submitRegistrationRequest({ name, email, password, accountType, hostelId });
    } finally {
      submissionInProgress.current = false;
      setIsSubmitting(false);
    }

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setSubmittedType(result.accountType);
  }

  if (submittedType) {
    return (
      <div className="mt-7 rounded-control border border-teal/30 bg-teal/10 p-5" role="status" aria-live="polite">
        <span className="flex items-center gap-2 font-semibold text-midnight">
          <CheckCircle2 size={19} aria-hidden="true" /> Registration request received
        </span>
        <p className="mt-3 text-sm leading-relaxed text-muted">{successDetails(submittedType)}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          You may sign in while your request is pending to view the approval screen.
        </p>
        <Button href="/login" className="mt-5" fullWidth>
          Continue to sign in <ArrowRight size={17} aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <form className="mt-7 grid gap-5" onSubmit={handleSubmit}>
      <SelectField
        label="Account type"
        name="accountType"
        value={accountType}
        onChange={(event) => {
          const nextAccountType = event.target.value;
          setAccountType(nextAccountType);
          setHostelId("");
          setHostels([]);
          setHostelsState(nextAccountType === ACCOUNT_TYPES.STUDENT ? "loading" : "idle");
          setHostelsError("");
          setError("");
        }}
        required
      >
        <option value="" disabled>Choose an account type</option>
        <option value={ACCOUNT_TYPES.STUDENT}>Student</option>
        <option value={ACCOUNT_TYPES.MESS_ADMIN}>Mess Admin</option>
      </SelectField>
      {accountType === ACCOUNT_TYPES.STUDENT ? (
        <div>
          <SelectField
            label="Hostel"
            name="hostelId"
            value={hostelId}
            onChange={(event) => {
              setHostelId(event.target.value);
              setError("");
            }}
            required
            disabled={hostelsState !== "ready" || hostels.length === 0 || isSubmitting}
            hint="Choose your active Hostel. It will be used for your pending approval request."
          >
            <option value="" disabled>
              {hostelsState === "loading" ? "Loading active Hostels..." : "Choose a Hostel"}
            </option>
            {hostels.map((hostel) => (
              <option key={hostel.id} value={hostel.id}>{hostel.name}</option>
            ))}
          </SelectField>
          {hostelsState === "loading" ? (
            <p className="ui-field__hint" role="status" aria-live="polite">Loading active Hostels...</p>
          ) : null}
          {hostelsState === "error" ? (
            <p className="ui-field__error" role="alert">{hostelsError}</p>
          ) : null}
          {hostelsState === "ready" && hostels.length === 0 ? (
            <p className="ui-field__hint" role="status">There are no active Hostels available for registration right now.</p>
          ) : null}
        </div>
      ) : null}
      <InputField
        label="Full name"
        name="name"
        type="text"
        autoComplete="name"
        minLength={2}
        maxLength={80}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <InputField
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        maxLength={254}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <InputField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        maxLength={128}
        hint="Use 10 to 128 characters."
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {error ? <p className="ui-field__error" role="alert">{error}</p> : null}
      <Button type="submit" fullWidth disabled={isSubmitting || (accountType === ACCOUNT_TYPES.STUDENT && hostelsState === "loading")}>
        {isSubmitting ? "Sending request..." : "Create account"}
        {!isSubmitting ? <ArrowRight size={17} aria-hidden="true" /> : null}
      </Button>
    </form>
  );
}
