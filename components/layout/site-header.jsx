"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Menu, X } from "lucide-react";
import { Brand } from "./brand";
import { Button } from "../ui/button";

export function SiteHeader({
  navItems = [],
  action,
  currentPath,
  brandHref = "/",
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();
  const mobilePanelId = "rushless-mobile-navigation";
  const activePath = currentPath ?? pathname;

  const renderLinks = (mobile = false) =>
    navItems.map((item) => {
      const isCurrent = item.isHome
        ? activePath === "/"
        : activePath && activePath === item.href;
      const className = mobile ? "site-header__mobile-link" : "site-nav__link";

      return (
        <Link
          key={item.href}
          className={className}
          href={item.href}
          aria-current={isCurrent ? "page" : undefined}
          onClick={() => setMenuOpen(false)}
        >
          {item.label}
        </Link>
      );
    });

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Brand href={brandHref} />

        {navItems.length ? (
          <nav className="site-nav site-header__desktop-nav" aria-label="Main navigation">
            {renderLinks()}
          </nav>
        ) : null}

        <div className="site-header__actions">
          {action ? (
            <Button
              className="site-header__desktop-action"
              href={action.href}
              variant={action.variant ?? "dark"}
              size="small"
            >
              {action.label}
            </Button>
          ) : null}
          {navItems.length ? (
            <button
              className="site-header__menu-button"
              type="button"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={menuOpen}
              aria-controls={mobilePanelId}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          ) : null}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {menuOpen && navItems.length ? (
          <motion.nav
            id={mobilePanelId}
            className="site-header__mobile-panel"
            aria-label="Mobile navigation"
            initial={reduceMotion ? false : { opacity: 0, y: -7 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -7 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
          >
            {renderLinks(true)}
            {action ? (
              <Button href={action.href} variant={action.variant ?? "dark"} fullWidth>
                {action.label}
              </Button>
            ) : null}
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
