/**
 * Tests for FeedHealthBanner rendering across all status combinations.
 */
import { render, screen } from "@testing-library/react";
import { FeedHealthBanner } from "@/components/layout/feed-health-banner";
import type { FeedHealthStatus } from "@/lib/feed-health";

function makeStatus(overrides: Partial<FeedHealthStatus> = {}): FeedHealthStatus {
  return {
    ndbc: { source: "ndbc", label: "NDBC", status: "live", lastIngestedAt: "2026-03-27T11:00:00.000Z", ageLabel: "1h ago" },
    crw: { source: "crw", label: "CRW", status: "live", lastIngestedAt: "2026-03-27T09:00:00.000Z", ageLabel: "3h ago" },
    ioos: { source: "ioos", label: "IOOS", status: "live", lastIngestedAt: "2026-03-27T10:00:00.000Z", ageLabel: "2h ago" },
    erddap: { source: "erddap", label: "ERDDAP", status: "live", lastIngestedAt: "2026-03-27T08:00:00.000Z", ageLabel: "4h ago" },
    overallStatus: "live",
    dbAvailable: true,
    ...overrides,
  };
}

test("renders combined healthy message when both sources are live", () => {
  render(<FeedHealthBanner feedHealth={makeStatus()} />);

  expect(screen.getByText(/Data sources healthy/i)).toBeInTheDocument();
  expect(screen.getByText(/NDBC updated 1h ago/i)).toBeInTheDocument();
  expect(screen.getByText(/CRW updated 3h ago/i)).toBeInTheDocument();
  expect(screen.getByText(/IOOS updated 2h ago/i)).toBeInTheDocument();
  expect(screen.getByText(/ERDDAP updated 4h ago/i)).toBeInTheDocument();
});

test("renders unknown banner when DB is not available", () => {
  render(
    <FeedHealthBanner
      feedHealth={makeStatus({
        ndbc: { source: "ndbc", label: "NDBC", status: "unknown", lastIngestedAt: null, ageLabel: null },
        crw: { source: "crw", label: "CRW", status: "unknown", lastIngestedAt: null, ageLabel: null },
        ioos: { source: "ioos", label: "IOOS", status: "unknown", lastIngestedAt: null, ageLabel: null },
        erddap: { source: "erddap", label: "ERDDAP", status: "unknown", lastIngestedAt: null, ageLabel: null },
        overallStatus: "unknown",
        dbAvailable: false,
      })}
    />,
  );

  expect(screen.getByText(/Data status unknown — ingestion metadata not available/i)).toBeInTheDocument();
});

test("renders per-source stale message for NDBC when stale", () => {
  render(
    <FeedHealthBanner
      feedHealth={makeStatus({
        ndbc: { source: "ndbc", label: "NDBC", status: "stale", lastIngestedAt: "2026-03-27T02:00:00.000Z", ageLabel: "10h ago" },
        overallStatus: "stale",
      })}
    />,
  );

  expect(screen.getByText(/NDBC data is 10h ago old — conditions may be outdated/i)).toBeInTheDocument();
  expect(screen.getByText(/CRW updated 3h ago/i)).toBeInTheDocument();
  expect(screen.getByText(/Aux feeds: IOOS 2h ago • ERDDAP 4h ago/i)).toBeInTheDocument();
});

test("renders per-source failed message for NDBC when failed", () => {
  render(
    <FeedHealthBanner
      feedHealth={makeStatus({
        ndbc: { source: "ndbc", label: "NDBC", status: "failed", lastIngestedAt: null, ageLabel: null },
        overallStatus: "failed",
      })}
    />,
  );

  expect(screen.getByText(/No recent NDBC ingestion — data may be unreliable/i)).toBeInTheDocument();
  expect(screen.getByText(/CRW updated 3h ago/i)).toBeInTheDocument();
  expect(screen.getByText(/Aux feeds: IOOS 2h ago • ERDDAP 4h ago/i)).toBeInTheDocument();
});

test("renders honest never-ran message for CRW when unknown", () => {
  render(
    <FeedHealthBanner
      feedHealth={makeStatus({
        crw: { source: "crw", label: "CRW", status: "unknown", lastIngestedAt: null, ageLabel: null },
        overallStatus: "unknown",
      })}
    />,
  );

  expect(screen.getByText(/CRW never ran — no data yet/i)).toBeInTheDocument();
  expect(screen.getByText(/NDBC updated 1h ago/i)).toBeInTheDocument();
  expect(screen.getByText(/Aux feeds: IOOS 2h ago • ERDDAP 4h ago/i)).toBeInTheDocument();
});

test("renders compact auxiliary feed states for stale, failed, and never-ran sources", () => {
  render(
    <FeedHealthBanner
      feedHealth={makeStatus({
        ioos: { source: "ioos", label: "IOOS", status: "stale", lastIngestedAt: "2026-03-27T02:00:00.000Z", ageLabel: "10h ago" },
        erddap: { source: "erddap", label: "ERDDAP", status: "unknown", lastIngestedAt: null, ageLabel: null },
        ndbc: { source: "ndbc", label: "NDBC", status: "failed", lastIngestedAt: "2026-03-26T00:00:00.000Z", ageLabel: "1d ago" },
        overallStatus: "failed",
      })}
    />,
  );

  expect(screen.getByText(/No recent NDBC ingestion — data may be unreliable/i)).toBeInTheDocument();
  expect(screen.getByText(/Aux feeds: IOOS stale · 10h ago • ERDDAP never ran/i)).toBeInTheDocument();
});

test("banner has accessible role=status", () => {
  render(<FeedHealthBanner feedHealth={makeStatus()} />);
  expect(screen.getByRole("status")).toBeInTheDocument();
});

test("banner has accessible role=status when DB is unavailable", () => {
  render(
    <FeedHealthBanner
      feedHealth={makeStatus({ dbAvailable: false, overallStatus: "unknown" })}
    />,
  );
  expect(screen.getByRole("status")).toBeInTheDocument();
});
