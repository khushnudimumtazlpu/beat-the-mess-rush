"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  GraduationCap,
  LayoutDashboard,
  Menu,
  UsersRound,
  X,
} from "lucide-react";
import { Brand } from "../../components/layout/brand.jsx";
import { Button } from "../../components/ui/button.jsx";
import { LogoutButton } from "../auth/logout-button.jsx";

const adminNav = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Hostels & Messes", href: "/admin/hostels", icon: Building2 },
  { label: "Mess Admins", href: "/admin/mess-admins", icon: UsersRound },
  { label: "Students", href: "/admin/students", icon: GraduationCap },
];

function AdminNavigation({ pathname, onNavigate, firstLinkRef }) {
  return (
    <nav id="super-admin-navigation" className="admin-nav" aria-label="Super Admin navigation">
      {adminNav.map(({ label, href, icon: Icon }, index) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            ref={index === 0 ? firstLinkRef : undefined}
            href={href}
            className="admin-nav__link"
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
          >
            <Icon className="admin-nav__icon" size={18} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ children }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const firstLinkRef = useRef(null);
  const sidebarRef = useRef(null);

  useEffect(() => {
    if (menuOpen) firstLinkRef.current?.focus();
  }, [menuOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = (event) => {
      if (event.matches) setMenuOpen(false);
    };

    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  function closeMenu(restoreFocus = true) {
    setMenuOpen(false);
    if (restoreFocus) menuButtonRef.current?.focus();
  }

  return (
    <div className="admin-app">
      <aside
        ref={sidebarRef}
        role={menuOpen ? "dialog" : undefined}
        aria-modal={menuOpen ? "true" : undefined}
        className={`admin-sidebar${menuOpen ? " is-open" : ""}`}
        aria-label="Super Admin sidebar"
        onKeyDown={(event) => {
          if (!menuOpen) return;
          if (event.key === "Escape") {
            closeMenu();
            return;
          }
          if (event.key !== "Tab") return;

          const focusable = Array.from(
            sidebarRef.current?.querySelectorAll('a[href], button:not([disabled])') ?? [],
          );
          if (focusable.length === 0) {
            event.preventDefault();
            return;
          }

          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="admin-sidebar__brand" onClick={closeMenu}>
          <Brand href="/admin" />
        </div>
        <p className="admin-sidebar__label">Workspace</p>
        <AdminNavigation pathname={pathname} onNavigate={closeMenu} firstLinkRef={firstLinkRef} />
        <div className="admin-sidebar__footer">
          <span className="admin-sidebar__role">SUPER ADMIN</span>
          <p className="admin-sidebar__note">Global campus administration</p>
          <Button href="/" variant="hero-outline" size="small">Public homepage</Button>
          <LogoutButton fullWidth variant="hero-outline" />
        </div>
      </aside>

      <button
        type="button"
        className={`admin-mobile-scrim${menuOpen ? " is-visible" : ""}`}
        aria-hidden="true"
        tabIndex={-1}
        onClick={closeMenu}
      />

      <div className="admin-main">
        <header className="admin-mobile-header">
          <div className="admin-mobile-header__start">
            <button
              type="button"
              className="admin-menu-button"
              ref={menuButtonRef}
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={menuOpen}
              aria-controls="super-admin-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
            </button>
            <span>Super Admin</span>
          </div>
          <div className="admin-mobile-header__actions">
            <LogoutButton className="admin-mobile-logout" variant="secondary" />
            <Link className="admin-mobile-home" href="/" aria-label="Open public homepage">RushLess</Link>
          </div>
        </header>
        <main className="admin-content" inert={menuOpen}>{children}</main>
      </div>
    </div>
  );
}
