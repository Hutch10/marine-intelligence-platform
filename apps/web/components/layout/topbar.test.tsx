import { render, screen } from "@testing-library/react";
import { TopBar } from "@/components/layout/topbar";

test("topbar avoids fake live status and notification chrome", () => {
  render(<TopBar title="Marine Intelligence" subtitle="Live-backed marine risk surfaces only" />);

  expect(screen.getByText("Truth mode")).toBeInTheDocument();
  expect(screen.getByText(/Only live-backed surfaces are promoted in navigation/i)).toBeInTheDocument();
  expect(screen.queryByText("LIVE")).not.toBeInTheDocument();
  expect(screen.queryByText("Data Feed")).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/search not yet available/i)).not.toBeInTheDocument();
  expect(screen.queryByText("Operator")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Notifications")).not.toBeInTheDocument();
});
