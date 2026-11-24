import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LandingPage, { getLandingAction, getLandingNavigation } from "./landing-page.jsx";
import { USER_ROLE } from "../../lib/auth-contracts.js";

describe("LandingPage navigation and role filtering", () => {
  it("shows all demo links and auth options for unauthenticated visitors", () => {
    const nav = getLandingNavigation(null);
    const labels = nav.map((item) => item.label);

    expect(labels).toContain("Home");
    expect(labels).toContain("Kitchen Portal");
    expect(labels).toContain("Queue Management");
    expect(labels).toContain("Login");
    expect(labels).toContain("Create Account");

    const action = getLandingAction(null);
    expect(action.href).toBe("/student");
  });

  it("strictly hides Kitchen Portal and Queue Management from students", () => {
    const studentUser = { id: "student-1", role: USER_ROLE.STUDENT };
    const nav = getLandingNavigation(studentUser);
    const labels = nav.map((item) => item.label);

    expect(labels).toContain("Home");
    expect(labels).toContain("Features");
    expect(labels).toContain("How it works");
    expect(labels).toContain("Impact");

    expect(labels).not.toContain("Kitchen Portal");
    expect(labels).not.toContain("Queue Management");
    expect(labels).not.toContain("Login");
    expect(labels).not.toContain("Create Account");

    const action = getLandingAction(studentUser);
    expect(action.href).toBe("/student");
    expect(action.label).toBe("Student dashboard");
  });

  it("shows kitchen and queue links for mess admins and super admins without auth buttons", () => {
    const messAdmin = { id: "admin-1", role: USER_ROLE.MESS_ADMIN };
    const nav = getLandingNavigation(messAdmin);
    const labels = nav.map((item) => item.label);

    expect(labels).toContain("Kitchen Portal");
    expect(labels).toContain("Queue Management");
    expect(labels).not.toContain("Login");
    expect(labels).not.toContain("Create Account");

    const messAdminAction = getLandingAction(messAdmin);
    expect(messAdminAction.href).toBe("/kitchen");
    expect(messAdminAction.label).toBe("Kitchen portal");

    const superAdmin = { id: "super-1", role: USER_ROLE.SUPER_ADMIN };
    const superAdminAction = getLandingAction(superAdmin);
    expect(superAdminAction.href).toBe("/admin");
    expect(superAdminAction.label).toBe("Admin dashboard");
  });

  it("renders LandingPage without any kitchen or queue links when logged in as a student", () => {
    const studentUser = { id: "student-1", role: USER_ROLE.STUDENT, name: "Test Student" };
    const html = renderToStaticMarkup(<LandingPage user={studentUser} />);

    expect(html).not.toContain('href="/kitchen"');
    expect(html).not.toContain('href="/queue"');
    expect(html).not.toContain("Kitchen Portal");
    expect(html).toContain("Open Student Dashboard");
    expect(html).toContain("Plan a meal");
  });

  it("renders LandingPage without student actions when logged in as a kitchen admin", () => {
    const kitchenAdmin = { id: "admin-1", role: USER_ROLE.MESS_ADMIN, name: "Chef Ramesh" };
    const html = renderToStaticMarkup(<LandingPage user={kitchenAdmin} />);

    expect(html).not.toContain("Open Student Dashboard");
    expect(html).not.toContain('href="/student"');
    expect(html).not.toContain('href="/student/meals"');
    expect(html).toContain("Open Kitchen Portal");
    expect(html).toContain("Queue Management");
    expect(html).toContain('href="/kitchen"');
    expect(html).toContain('href="/queue"');
  });

  it("renders LandingPage with kitchen portal options for guest users", () => {
    const html = renderToStaticMarkup(<LandingPage user={null} />);

    expect(html).toContain('href="/kitchen"');
    expect(html).toContain('href="/queue"');
    expect(html).toContain("Kitchen Portal");
  });
});
