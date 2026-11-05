import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "../../components/layout/brand.jsx";
import { ACCOUNT_STATUS } from "../../lib/auth-contracts.js";
import { getCurrentSession } from "../../lib/auth-authorization.js";
import { homeForUser, safeInternalPath } from "../../lib/auth-redirects.js";
import { LoginForm } from "../../features/auth/login-form.jsx";

export const metadata = {
  title: "Sign in | RushLess",
  description: "Sign in to your RushLess campus dining account.",
};

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const callbackUrl = params?.callbackUrl
    ? safeInternalPath(params.callbackUrl, null)
    : null;
  const session = await getCurrentSession();

  if (session?.user) {
    if (session.user.status === ACCOUNT_STATUS.PENDING) redirect("/pending");
    redirect(homeForUser(session.user));
  }

  return (
    <main className="min-h-screen bg-cream px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-12">
        <Brand />
        <div className="grid items-center gap-10 md:grid-cols-[1fr_0.9fr]">
          <section className="max-w-xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-teal-700">Your campus, in rhythm</p>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight text-midnight sm:text-5xl">
              Welcome back to a calmer meal break.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
              Sign in to continue to the RushLess experience assigned to your account.
            </p>
          </section>
          <section className="rounded-panel border border-line bg-white p-6 shadow-lifted sm:p-9" aria-labelledby="login-title">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">RushLess account</p>
            <h2 id="login-title" className="mt-2 font-display text-2xl font-extrabold text-midnight">Sign in</h2>
            <LoginForm callbackUrl={callbackUrl} />
            <p className="mt-6 text-center text-sm text-muted">
              Need an account? Registration will be available through your campus onboarding flow.
            </p>
          </section>
        </div>
        <Link className="w-fit text-sm font-semibold text-midnight underline-offset-4 hover:underline" href="/">
          Return to the public homepage
        </Link>
      </div>
    </main>
  );
}
