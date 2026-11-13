import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueueInfoCard } from "./queue-info-card.jsx";

describe("QueueInfoCard component", () => {
  it("renders provided custom queueInfo prop directly", () => {
    const customInfo = {
      state: "live",
      statusLabel: "Moderate rush — 15 waiting",
      estimatedWaitMinutes: 4,
      source: "Counter 2 · Lunch",
      updatedAtLabel: "2 mins ago",
    };

    const html = renderToStaticMarkup(<QueueInfoCard queueInfo={customInfo} />);
    expect(html).toContain("QUEUE VISIBILITY");
    expect(html).toContain("Live feed");
    expect(html).toContain("Moderate rush — 15 waiting");
    expect(html).toContain("4");
    expect(html).toContain("estimated wait");
    expect(html).toContain("Counter 2 · Lunch");
    expect(html).toContain("Updated 2 mins ago");
  });

  it("renders demo queue snapshot with campus messes when queueInfo is omitted", () => {
    const html = renderToStaticMarkup(<QueueInfoCard />);
    expect(html).toContain("QUEUE VISIBILITY");
    expect(html).toContain("Campus estimate");
    expect(html).toContain("Main Mess");
    expect(html).toContain("North Mess");
    expect(html).toContain("South Mess");
    expect(html).toContain("estimated wait");
  });
});
