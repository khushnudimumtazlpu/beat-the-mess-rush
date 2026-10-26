import { Soup } from "lucide-react";
import Link from "next/link";

export function Brand({ href = "/" }) {
  return (
    <Link className="brand-lockup" href={href} aria-label="RushLess home">
      <span className="brand-lockup__mark" aria-hidden="true">
        <Soup size={22} strokeWidth={2.2} />
      </span>
      <span className="brand-lockup__wordmark">
        <span className="brand-lockup__name">RushLess</span>
        <span className="brand-lockup__descriptor">Smart campus dining</span>
      </span>
    </Link>
  );
}
