import "../../app/kitchen-ak.css";
import { KitchenShell } from "../../features/kitchen/components/kitchen-shell-ak";
import { KitchenStoreProvider } from "../../features/kitchen/services/kitchen-store-ak";

export const metadata = {
  title: "Kitchen Portal | RushLess",
  description: "Kitchen planning, production logging, and food-waste analytics for campus mess staff.",
};

// ─── Kitchen Layout (ak) ──────────────────────────────────────────────────────
// Wraps ALL /kitchen routes with the shared shell and in-memory store provider.
export default function KitchenLayout({ children }) {
  return (
    <KitchenStoreProvider>
      <KitchenShell>{children}</KitchenShell>
    </KitchenStoreProvider>
  );
}
