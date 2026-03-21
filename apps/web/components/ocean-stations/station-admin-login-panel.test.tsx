import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { StationAdminLoginPanel } from "@/components/ocean-stations/station-admin-login-panel";

const { routerMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

function mockJsonResponse(status: number, payload: unknown) {
  return {
    status,
    json: async () => payload,
  } as Response;
}

beforeEach(() => {
  routerMock.push.mockReset();
  routerMock.refresh.mockReset();
  vi.restoreAllMocks();
});

test("login form renders MFA challenge UI when login returns pending_mfa", async () => {
  const user = userEvent.setup();
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    mockJsonResponse(202, {
      result: "pending_mfa",
      actorId: "ops.lead@marine.local",
      role: "admin",
      challenge: {
        challengeId: "mfa-challenge-login-001",
        purpose: "login",
        expiresAt: "2026-03-16T18:00:00.000Z",
        recoveryCodeAllowed: true,
      },
      mfa: {
        enabled: true,
        enrolledAt: "2026-03-10T09:00:00.000Z",
        lastVerifiedAt: "2026-03-16T17:45:00.000Z",
        recoveryCodesRemaining: 2,
      },
    }),
  );

  render(
    <StationAdminLoginPanel
      stationId="STA-NPC-01"
      stationName="North Pacific Coral Observatory"
      destinationPath="/ocean-stations/STA-NPC-01/admin"
    />,
  );

  await user.type(screen.getByLabelText("Actor ID"), "ops.lead@marine.local");
  await user.type(screen.getByLabelText("Password"), "marine-admin-2026");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  expect(await screen.findByText("MFA Challenge")).toBeInTheDocument();
  expect(screen.getByText("Actor: ops.lead@marine.local")).toBeInTheDocument();
  expect(screen.getByLabelText("Authenticator code")).toBeInTheDocument();
});

test("successful MFA verification redirects to destination", async () => {
  const user = userEvent.setup();
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      mockJsonResponse(202, {
        result: "pending_mfa",
        actorId: "ops.lead@marine.local",
        role: "admin",
        challenge: {
          challengeId: "mfa-challenge-login-002",
          purpose: "login",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
        mfa: {
          enabled: true,
          enrolledAt: "2026-03-10T09:00:00.000Z",
          lastVerifiedAt: "2026-03-16T17:45:00.000Z",
          recoveryCodesRemaining: 2,
        },
      }),
    )
    .mockResolvedValueOnce(
      mockJsonResponse(200, {
        result: "issued",
        actorId: "ops.lead@marine.local",
        role: "admin",
        permissions: ["station.view_admin"],
        csrfToken: "csrf-verified-001",
        expiresAt: "2026-03-17T01:00:00.000Z",
        mfa: {
          enabled: true,
          enrolledAt: "2026-03-10T09:00:00.000Z",
          lastVerifiedAt: "2026-03-16T18:00:00.000Z",
          recoveryCodesRemaining: 2,
        },
      }),
    );

  render(
    <StationAdminLoginPanel
      stationId="STA-NPC-01"
      stationName="North Pacific Coral Observatory"
      destinationPath="/ocean-stations/STA-NPC-01/admin"
    />,
  );

  await user.type(screen.getByLabelText("Actor ID"), "ops.lead@marine.local");
  await user.type(screen.getByLabelText("Password"), "marine-admin-2026");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  await user.type(await screen.findByLabelText("Authenticator code"), "246810");
  await user.click(screen.getByRole("button", { name: "Verify challenge" }));

  expect(routerMock.push).toHaveBeenCalledWith("/ocean-stations/STA-NPC-01/admin");
  expect(routerMock.refresh).toHaveBeenCalledTimes(1);
});

test("failed MFA verification shows inline error", async () => {
  const user = userEvent.setup();
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      mockJsonResponse(202, {
        result: "pending_mfa",
        actorId: "ops.lead@marine.local",
        role: "admin",
        challenge: {
          challengeId: "mfa-challenge-login-003",
          purpose: "login",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
        mfa: {
          enabled: true,
          enrolledAt: "2026-03-10T09:00:00.000Z",
          lastVerifiedAt: "2026-03-16T17:45:00.000Z",
          recoveryCodesRemaining: 2,
        },
      }),
    )
    .mockResolvedValueOnce(
      mockJsonResponse(401, {
        message: "MFA code invalid",
      }),
    );

  render(
    <StationAdminLoginPanel
      stationId="STA-NPC-01"
      stationName="North Pacific Coral Observatory"
      destinationPath="/ocean-stations/STA-NPC-01/admin"
    />,
  );

  await user.type(screen.getByLabelText("Actor ID"), "ops.lead@marine.local");
  await user.type(screen.getByLabelText("Password"), "marine-admin-2026");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  await user.type(await screen.findByLabelText("Authenticator code"), "000000");
  await user.click(screen.getByRole("button", { name: "Verify challenge" }));

  expect(await screen.findByText("MFA code invalid")).toBeInTheDocument();
  expect(screen.getByText("MFA attempts in this session: 1")).toBeInTheDocument();
  expect(routerMock.push).not.toHaveBeenCalled();
});

test("rate-limited MFA verification shows cooldown and disables submit", async () => {
  const user = userEvent.setup();
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      mockJsonResponse(202, {
        result: "pending_mfa",
        actorId: "ops.lead@marine.local",
        role: "admin",
        challenge: {
          challengeId: "mfa-challenge-login-004",
          purpose: "login",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
        mfa: {
          enabled: true,
          enrolledAt: "2026-03-10T09:00:00.000Z",
          lastVerifiedAt: "2026-03-16T17:45:00.000Z",
          recoveryCodesRemaining: 2,
        },
      }),
    )
    .mockResolvedValueOnce(
      mockJsonResponse(429, {
        result: "rate_limited",
        message: "MFA verification rate limited. Please wait before retrying.",
        retryAfterSeconds: 30,
      }),
    );

  render(
    <StationAdminLoginPanel
      stationId="STA-NPC-01"
      stationName="North Pacific Coral Observatory"
      destinationPath="/ocean-stations/STA-NPC-01/admin"
    />,
  );

  await user.type(screen.getByLabelText("Actor ID"), "ops.lead@marine.local");
  await user.type(screen.getByLabelText("Password"), "marine-admin-2026");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  await user.type(await screen.findByLabelText("Authenticator code"), "111111");
  await user.click(screen.getByRole("button", { name: "Verify challenge" }));

  expect(await screen.findByText(/MFA verification rate-limited\. Try again in \d+s\./)).toBeInTheDocument();
  expect(screen.getByText(/Cooldown active: retry allowed in \d+s\./)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Wait \d+s/ })).toBeDisabled();
});

test("login panel MFA verification displays locked_out when challenge exhausted", async () => {
  const user = userEvent.setup();
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      mockJsonResponse(202, {
        result: "pending_mfa",
        actorId: "ops.lead@marine.local",
        role: "admin",
        challenge: {
          challengeId: "mfa-challenge-locked-001",
          purpose: "login",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
        mfa: {
          enabled: true,
          enrolledAt: "2026-03-10T09:00:00.000Z",
          lastVerifiedAt: "2026-03-16T17:45:00.000Z",
          recoveryCodesRemaining: 2,
        },
      }),
    )
    .mockResolvedValueOnce(
      mockJsonResponse(401, {
        result: "locked_out",
        message: "MFA challenge locked due to too many failed attempts.",
        attemptsRemaining: 0,
      }),
    );

  render(
    <StationAdminLoginPanel
      stationId="STA-NPC-01"
      stationName="North Pacific Coral Observatory"
      destinationPath="/ocean-stations/STA-NPC-01/admin"
    />,
  );

  await user.type(screen.getByLabelText("Actor ID"), "ops.lead@marine.local");
  await user.type(screen.getByLabelText("Password"), "marine-admin-2026");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  await user.type(await screen.findByLabelText("Authenticator code"), "000000");
  await user.click(screen.getByRole("button", { name: "Verify challenge" }));

  expect(
    await screen.findByText("MFA challenge locked due to too many failed attempts. Please request a new verification code."),
  ).toBeInTheDocument();
});

test("login panel MFA verification displays expired state", async () => {
  const user = userEvent.setup();
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      mockJsonResponse(202, {
        result: "pending_mfa",
        actorId: "ops.lead@marine.local",
        role: "admin",
        challenge: {
          challengeId: "mfa-challenge-exp-001",
          purpose: "login",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
        mfa: {
          enabled: true,
          enrolledAt: "2026-03-10T09:00:00.000Z",
          lastVerifiedAt: "2026-03-16T17:45:00.000Z",
          recoveryCodesRemaining: 2,
        },
      }),
    )
    .mockResolvedValueOnce(
      mockJsonResponse(410, {
        result: "expired",
        message: "MFA challenge expired after 10 minutes.",
      }),
    );

  render(
    <StationAdminLoginPanel
      stationId="STA-NPC-01"
      stationName="North Pacific Coral Observatory"
      destinationPath="/ocean-stations/STA-NPC-01/admin"
    />,
  );

  await user.type(screen.getByLabelText("Actor ID"), "ops.lead@marine.local");
  await user.type(screen.getByLabelText("Password"), "marine-admin-2026");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  await user.type(await screen.findByLabelText("Authenticator code"), "123456");
  await user.click(screen.getByRole("button", { name: "Verify challenge" }));

  expect(
    await screen.findByText("MFA verification code expired. Please restart the login process."),
  ).toBeInTheDocument();
});

test("login panel MFA verification shows attempts remaining on invalid code", async () => {
  const user = userEvent.setup();
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      mockJsonResponse(202, {
        result: "pending_mfa",
        actorId: "ops.lead@marine.local",
        role: "admin",
        challenge: {
          challengeId: "mfa-challenge-fail-001",
          purpose: "login",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
        mfa: {
          enabled: true,
          enrolledAt: "2026-03-10T09:00:00.000Z",
          lastVerifiedAt: "2026-03-16T17:45:00.000Z",
          recoveryCodesRemaining: 2,
        },
      }),
    )
    .mockResolvedValueOnce(
      mockJsonResponse(401, {
        result: "mfa_failed",
        message: "Invalid TOTP code.",
        attemptsRemaining: 3,
      }),
    );

  render(
    <StationAdminLoginPanel
      stationId="STA-NPC-01"
      stationName="North Pacific Coral Observatory"
      destinationPath="/ocean-stations/STA-NPC-01/admin"
    />,
  );

  await user.type(screen.getByLabelText("Actor ID"), "ops.lead@marine.local");
  await user.type(screen.getByLabelText("Password"), "marine-admin-2026");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  await user.type(await screen.findByLabelText("Authenticator code"), "999999");
  await user.click(screen.getByRole("button", { name: "Verify challenge" }));

  expect(
    await screen.findByText("Invalid TOTP code. (3 attempts remaining)"),
  ).toBeInTheDocument();
});
