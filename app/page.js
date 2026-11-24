import LandingPage from "../features/landing/landing-page";
import { getCurrentSession } from "../lib/auth-authorization.js";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let user = null;
  try {
    const session = await getCurrentSession();
    user = session?.user ?? null;
  } catch {
    user = null;
  }

  return <LandingPage user={user} />;
}

