import Link from "next/link";
import { Brand } from "../../components/layout/brand.jsx";
import { getCurrentSession } from "../../lib/auth-authorization.js";
import { LogoutButton } from "../../features/auth/logout-button.jsx";

export const metadata = {
  title: "Access unavailable | RushLess",
  description: "This RushLess area is not available to your account.",
};

export default async function AccessDeniedPage() {
  const session = await getCurrentSession();

  return (
    <main className="min-h-screen bg-cream px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto flex min-h-[75vh] w-full max-w-3xl flex-col items-center justify-center text-center">
        <div className="mb-12 self-start"><Brand /></div>
        <section className="w-full rounded-panel border border-line bg-white p-7 shadow-lifted sm:p-12">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-coral">Access unavailable</p>
          <h1 className="mt-3 font-display text-3xl font-extrabold text-midnight sm:text-4xl">This area isn’t available to your account</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted">
            Your account may be inactive, or this part of RushLess may belong to another campus role.
          </p>
          <Link className="mt-7 inline-flex font-semibold text-midnight underline underline-offset-4" href="/">
            Back to the public homepage
          </Link>
          {session?.user ? (
            <div className="mt-5 flex justify-center">
              <LogoutButton />
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
