import { SiteHeader } from "./site-header";

export function AppShell({ children, navItems, action, currentPath }) {
  return (
    <>
      <SiteHeader navItems={navItems} action={action} currentPath={currentPath} />
      <main>{children}</main>
    </>
  );
}
