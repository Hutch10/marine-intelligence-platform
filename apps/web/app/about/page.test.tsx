import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import AboutPage from "@/app/about/page";

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

test("about page renders data sources section", () => {
  render(<AboutPage />);

  expect(screen.getByText("NOAA NDBC")).toBeInTheDocument();
  expect(screen.getByText("NOAA Coral Reef Watch")).toBeInTheDocument();
});

test("about page renders pilot disclaimer", () => {
  render(<AboutPage />);

  expect(screen.getByText(/Pilot disclaimer/i)).toBeInTheDocument();
  expect(screen.getByText(/early-stage signal tool built on live NOAA data/i)).toBeInTheDocument();
});

test("about page renders what the system does not do", () => {
  render(<AboutPage />);

  expect(screen.getByText("What the system does not do")).toBeInTheDocument();
  expect(screen.getByText(/does not replace expert marine or ecological judgment/i)).toBeInTheDocument();
  expect(screen.getByText(/Projected outlooks are trend extrapolations, not model forecasts/i)).toBeInTheDocument();
});

test("about page renders how to use steps", () => {
  render(<AboutPage />);

  expect(screen.getByText("How to use this system")).toBeInTheDocument();
  expect(screen.getByText("Start at the dashboard")).toBeInTheDocument();
  expect(screen.getByText("Check feed health")).toBeInTheDocument();
  expect(screen.getByText("Use projected outlook as a trend indicator only")).toBeInTheDocument();
});

test("about page renders glossary terms", () => {
  render(<AboutPage />);

  expect(screen.getByText("Glossary")).toBeInTheDocument();
  expect(screen.getByText("Baseline coverage")).toBeInTheDocument();
  expect(screen.getByText("Projected outlook")).toBeInTheDocument();
  expect(screen.getByText("Insufficient data")).toBeInTheDocument();
  expect(screen.getByText("Live / Stale / Failed / Unknown")).toBeInTheDocument();
});
