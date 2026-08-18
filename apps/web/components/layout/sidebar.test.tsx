import { fireEvent, render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/layout/sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

test("sidebar only promotes live-backed navigation", () => {
  render(<Sidebar />);

  expect(screen.getByText("Dashboard")).toBeInTheDocument();
  expect(screen.getByText("Investigations")).toBeInTheDocument();
  expect(screen.getByText("Operational Alerts")).toBeInTheDocument();
  expect(screen.queryByText("Data Explorer")).not.toBeInTheDocument();
  expect(screen.queryByText("Species Database")).not.toBeInTheDocument();
  expect(screen.queryByText("About this system")).not.toBeInTheDocument();

  // Operator access shouldn't be publicly visible
  expect(screen.queryByText("Operator")).not.toBeInTheDocument();
  const links = screen.queryAllByRole("link");
  links.forEach(link => {
    expect(link).not.toHaveAttribute("href", "/operator");
  });
});

test("sidebar collapse control still works", () => {
  render(<Sidebar />);

  fireEvent.click(screen.getByRole("button", { name: /collapse sidebar/i }));

  expect(screen.getByRole("button", { name: /expand sidebar/i })).toBeInTheDocument();
});
