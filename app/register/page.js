import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ClipboardCheck, Utensils } from "lucide-react";
import { Brand } from "../../components/layout/brand.jsx";
import { Button } from "../../components/ui/button.jsx";
import { ACCOUNT_STATUS } from "../../lib/auth-contracts.js";
import { getCurrentSession } from "../../lib/auth-authorization.js";
import { homeForUser } from "../../lib/auth-redirects.js";
import { RegistrationForm } from "../../features/auth/registration-form.jsx";

export const metadata = {
  title: "Create an account | RushLess",
  description: "Request a Student or Mess Admin account for RushLess.",
};

export default async function RegistrationPage() {
  const session = await getCurrentSession();
  if (session?.user) {
    if (session.user.status === ACCOUNT_STATUS.PENDING) redirect("/pending");
    redirect(homeForUser(session.user));
  }

  return (
    <main className="min-h-screen bg-cream px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 sm:gap-12">
        <Brand />
        <div className="grid items-center gap-8 md:grid-cols-[0.9fr_1fr] md:gap-12">
          <section className="max-w-xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-teal-700">
              A better campus meal break
            </p>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight text-midnight sm:text-5xl">
              Join RushLess.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
              Create a Student account or submit a request to manage campus dining as a Mess Admin.
            </p>

            <div className="mt-8 grid gap-4">
              <div className="flex gap-3 rounded-control border border-line bg-white/70 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal/15 text-teal-700" aria-hidden="true">
                  <Utensils size={19} />
                </span>
                <p className="m-0 text-sm leading-relaxed text-muted">
                  <strong className="text-midnight">Student:</strong> Student approval is not available yet. Your account will remain pending until that workflow is introduced.
                </p>
              </div>
              <div className="flex gap-3 rounded-control border border-line bg-white/70 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lavender/30 text-midnight" aria-hidden="true">
                  <ClipboardCheck size={19} />
                </span>
                <p className="m-0 text-sm leading-relaxed text-muted">
                  <strong className="text-midnight">Mess Admin:</strong> A Super Admin reviews the request and assigns its Hostel. Do not choose a Hostel here.
                </p>
              </div>
            </div>

            <Link className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-midnight underline-offset-4 hover:underline" href="/">
              Return to the public homepage <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </section>

          <section className="rounded-panel border border-line bg-white p-6 shadow-lifted sm:p-9" aria-labelledby="registration-title">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">RushLess account</p>
            <h2 id="registration-title" className="mt-2 font-display text-2xl font-extrabold text-midnight">
              Create your account
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              New accounts stay pending until their approval process is available or complete.
            </p>
            <RegistrationForm />
            <p className="mt-6 text-center text-sm text-muted">
              Already registered?{" "}
              <Button href="/login" variant="quiet" className="inline-flex min-h-0 p-0 font-semibold text-midnight underline underline-offset-4">
                Sign in
              </Button>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
