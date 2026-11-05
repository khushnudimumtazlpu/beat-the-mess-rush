import "../../app/kitchen-ak.css";
import { KitchenShell } from "../../features/kitchen/components/kitchen-shell-ak";
import { KitchenStoreProvider } from "../../features/kitchen/services/kitchen-store-ak";
import { authorizeRouteRoles } from "../../lib/auth-authorization.js";
import { USER_ROLE } from "../../lib/auth-contracts.js";

export const metadata = {
  title: "Kitchen Portal | RushLess",
  description: "Kitchen planning, production logging, and food-waste analytics for campus mess staff.",
};

// ─── Kitchen Layout (ak) ──────────────────────────────────────────────────────
// Wraps ALL /kitchen routes with the shared shell and in-memory store provider.
export default async function KitchenLayout({ children }) {
  await authorizeRouteRoles([USER_ROLE.MESS_ADMIN, USER_ROLE.SUPER_ADMIN], "/kitchen");

  return (
    <KitchenStoreProvider>
      <KitchenShell>{children}</KitchenShell>
    </KitchenStoreProvider>
  );
}
