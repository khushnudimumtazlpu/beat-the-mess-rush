import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "../../components/layout/brand.jsx";
import { getCurrentSession } from "../../lib/auth-authorization.js";
import { ACCOUNT_STATUS } from "../../lib/auth-contracts.js";
import { homeForUser } from "../../lib/auth-redirects.js";

export const metadata = {
  title: "Approval pending | RushLess",
  description: "Your RushLess account is waiting for approval.",
};

export default async function PendingPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=%2Fstudent");
  if (session.user.status !== ACCOUNT_STATUS.PENDING) redirect(homeForUser(session.user));

  return (
    <main className="min-h-screen bg-cream px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto flex min-h-[75vh] w-full max-w-3xl flex-col items-center justify-center text-center">
        <div className="mb-12 self-start"><Brand /></div>
        <div className="w-full rounded-panel border border-line bg-white p-7 shadow-lifted sm:p-12">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-lavender/30 text-midnight" aria-hidden="true">
            <span className="size-3 rounded-full bg-midnight" />
          </span>
          <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.18em] text-muted">Account review</p>
          <h1 className="mt-3 font-display text-3xl font-extrabold text-midnight sm:text-4xl">Your approval is pending</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted">
            Your account is signed in, but campus features stay unavailable until the assigned administrator approves it.
          </p>
          <p className="mt-7 text-sm text-muted">You can return here after approval to continue.</p>
          <Link className="mt-7 inline-flex font-semibold text-midnight underline underline-offset-4" href="/">
            Back to the public homepage
          </Link>
        </div>
      </div>
    </main>
  );
}
