import { SiteHeader } from "./site-header";

export function AppShell({ children, navItems, action, currentPath, showLogout = false }) {
  return (
    <>
      <SiteHeader navItems={navItems} action={action} currentPath={currentPath} showLogout={showLogout} />
      <main>{children}</main>
    </>
  );
}
