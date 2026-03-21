import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { MfaManagementPanel } from "@/components/ocean-stations/mfa-management-panel";

const SESSION_ID = "sess-admin-001";
const CSRF_TOKEN = "csrf-mfa-test";

function renderPanel(initialMfaState?: { enabled: boolean; enrolledAt: string | null; lastVerifiedAt: string | null; recoveryCodesRemaining: number }) {
  return render(
    <MfaManagementPanel
      sessionId={SESSION_ID}
      csrfToken={CSRF_TOKEN}
      initialMfaState={initialMfaState}
    />,
  );
}

// ---------------------------------------------------------------------------
// Idle state display
// ---------------------------------------------------------------------------

test("MFA panel shows not-enrolled state when no mfa state is provided", () => {
  renderPanel(undefined);

  expect(screen.getByRole("heading", { name: "Authenticator (MFA)" })).toBeInTheDocument();
  expect(screen.getByText(/No authenticator enrolled/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Set up authenticator" })).toBeEnabled();
});

test("MFA panel shows enrolled state with recovery codes count", () => {
  renderPanel({
    enabled: true,
    enrolledAt: "2026-03-16T10:00:00.000Z",
    lastVerifiedAt: null,
    recoveryCodesRemaining: 6,
  });

  expect(screen.getByText("Authenticator active")).toBeInTheDocument();
  expect(screen.getByText(/Recovery codes remaining: 6/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Regenerate recovery codes" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Disable MFA" })).toBeEnabled();
});

// ---------------------------------------------------------------------------
// Enrollment flow
// ---------------------------------------------------------------------------

test("MFA panel enrollment start shows QR code and manual secret", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    status: 200,
    json: async () => ({
      qrCodeUri: "data:image/png;base64,abc123",
      secret: "JBSWY3DPEHPK3PXP",
    }),
  } as Response);

  renderPanel(undefined);

  await user.click(screen.getByRole("button", { name: "Set up authenticator" }));

  expect(await screen.findByAltText("MFA QR code")).toBeInTheDocument();
  expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm setup" })).toBeInTheDocument();
});

test("MFA panel enrollment verify success shows recovery codes", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        qrCodeUri: "data:image/png;base64,abc123",
        secret: "JBSWY3DPEHPK3PXP",
      }),
    } as Response)
    .mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        result: "enrolled",
        mfa: {
          enabled: true,
          enrolledAt: "2026-03-16T12:00:00.000Z",
          lastVerifiedAt: null,
          recoveryCodesRemaining: 8,
        },
        recoveryCodes: ["AAAA-BBBB", "CCCC-DDDD", "EEEE-FFFF"],
      }),
    } as Response);

  renderPanel(undefined);

  await user.click(screen.getByRole("button", { name: "Set up authenticator" }));
  await screen.findByAltText("MFA QR code");

  await user.type(screen.getByPlaceholderText("123456"), "123456");
  await user.click(screen.getByRole("button", { name: "Confirm setup" }));

  expect(await screen.findByText("Authenticator enrolled successfully.")).toBeInTheDocument();
  expect(screen.getByText("AAAA-BBBB")).toBeInTheDocument();
  expect(screen.getByText("CCCC-DDDD")).toBeInTheDocument();
});

test("MFA panel enrollment verify failure shows error message", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        qrCodeUri: "data:image/png;base64,abc123",
        secret: "JBSWY3DPEHPK3PXP",
      }),
    } as Response)
    .mockResolvedValueOnce({
      status: 401,
      json: async () => ({ message: "TOTP code invalid. Ensure your authenticator app is synced." }),
    } as Response);

  renderPanel(undefined);

  await user.click(screen.getByRole("button", { name: "Set up authenticator" }));
  await screen.findByAltText("MFA QR code");

  await user.type(screen.getByPlaceholderText("123456"), "000000");
  await user.click(screen.getByRole("button", { name: "Confirm setup" }));

  expect(await screen.findByText("TOTP code invalid. Ensure your authenticator app is synced.")).toBeInTheDocument();
});

// ---------------------------------------------------------------------------
// Disable MFA flow
// ---------------------------------------------------------------------------

test("MFA panel disable shows TOTP input on Disable MFA click", async () => {
  const user = userEvent.setup();

  renderPanel({
    enabled: true,
    enrolledAt: "2026-03-16T10:00:00.000Z",
    lastVerifiedAt: null,
    recoveryCodesRemaining: 8,
  });

  await user.click(screen.getByRole("button", { name: "Disable MFA" }));

  expect(screen.getByText("Enter your current authenticator code to confirm disabling MFA.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Disable MFA" })).toBeInTheDocument();
});

test("MFA panel disable success resets to not-enrolled state", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    status: 200,
    json: async () => ({ ok: true }),
  } as Response);

  renderPanel({
    enabled: true,
    enrolledAt: "2026-03-16T10:00:00.000Z",
    lastVerifiedAt: null,
    recoveryCodesRemaining: 8,
  });

  await user.click(screen.getByRole("button", { name: "Disable MFA" }));
  await user.type(screen.getByPlaceholderText("123456"), "123456");
  await user.click(screen.getByRole("button", { name: "Disable MFA" }));

  expect(await screen.findByText(/No authenticator enrolled/)).toBeInTheDocument();
});

test("MFA panel disable with step-up required shows step-up challenge UI", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    status: 401,
    json: async () => ({
      mfaRequired: true,
      challenge: {
        challengeId: "chal-disable-001",
        purpose: "permission_mutation",
        expiresAt: "2026-03-16T18:00:00.000Z",
        recoveryCodeAllowed: true,
      },
    }),
  } as Response);

  renderPanel({
    enabled: true,
    enrolledAt: "2026-03-16T10:00:00.000Z",
    lastVerifiedAt: null,
    recoveryCodesRemaining: 8,
  });

  await user.click(screen.getByRole("button", { name: "Disable MFA" }));
  await user.type(screen.getByPlaceholderText("123456"), "123456");
  await user.click(screen.getByRole("button", { name: "Disable MFA" }));

  expect(await screen.findByText("Step-up verification required")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Verify and continue" })).toBeInTheDocument();
});

// ---------------------------------------------------------------------------
// Recovery code regeneration
// ---------------------------------------------------------------------------

test("MFA panel regenerate recovery codes success shows new codes", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    status: 200,
    json: async () => ({
      result: "regenerated",
      mfa: {
        enabled: true,
        enrolledAt: "2026-03-16T10:00:00.000Z",
        lastVerifiedAt: null,
        recoveryCodesRemaining: 8,
      },
      recoveryCodes: ["NEW1-CODE", "NEW2-CODE"],
    }),
  } as Response);

  renderPanel({
    enabled: true,
    enrolledAt: "2026-03-16T10:00:00.000Z",
    lastVerifiedAt: null,
    recoveryCodesRemaining: 2,
  });

  await user.click(screen.getByRole("button", { name: "Regenerate recovery codes" }));

  expect(await screen.findByText("Recovery codes regenerated.")).toBeInTheDocument();
  expect(screen.getByText("NEW1-CODE")).toBeInTheDocument();
  expect(screen.getByText("NEW2-CODE")).toBeInTheDocument();
});

test("MFA panel regenerate flow completes after step-up verification", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      status: 401,
      json: async () => ({
        mfaRequired: true,
        challenge: {
          challengeId: "chal-regen-001",
          purpose: "permission_mutation",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
      }),
    } as Response)
    .mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        result: "verified",
        challengePurpose: "permission_mutation",
        actorId: "ops.lead@marine.local",
      }),
    } as Response)
    .mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        result: "regenerated",
        mfa: {
          enabled: true,
          enrolledAt: "2026-03-16T10:00:00.000Z",
          lastVerifiedAt: "2026-03-16T12:15:00.000Z",
          recoveryCodesRemaining: 8,
        },
        recoveryCodes: ["STEP-UP-NEW1", "STEP-UP-NEW2"],
      }),
    } as Response);

  renderPanel({
    enabled: true,
    enrolledAt: "2026-03-16T10:00:00.000Z",
    lastVerifiedAt: null,
    recoveryCodesRemaining: 2,
  });

  await user.click(screen.getByRole("button", { name: "Regenerate recovery codes" }));
  expect(await screen.findByText("Step-up verification required")).toBeInTheDocument();

  await user.type(screen.getByPlaceholderText("123456"), "246810");
  await user.click(screen.getByRole("button", { name: "Verify and continue" }));

  expect(await screen.findByText("Recovery codes regenerated.")).toBeInTheDocument();
  expect(screen.getByText("STEP-UP-NEW1")).toBeInTheDocument();
  expect(screen.getByText("STEP-UP-NEW2")).toBeInTheDocument();
});

test("MFA panel disable flow completes after step-up verification", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      status: 401,
      json: async () => ({
        mfaRequired: true,
        challenge: {
          challengeId: "chal-disable-verify-001",
          purpose: "permission_mutation",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
      }),
    } as Response)
    .mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        result: "verified",
        challengePurpose: "permission_mutation",
        actorId: "ops.lead@marine.local",
      }),
    } as Response)
    .mockResolvedValueOnce({
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);

  renderPanel({
    enabled: true,
    enrolledAt: "2026-03-16T10:00:00.000Z",
    lastVerifiedAt: null,
    recoveryCodesRemaining: 8,
  });

  await user.click(screen.getByRole("button", { name: "Disable MFA" }));
  await user.type(screen.getByPlaceholderText("123456"), "123456");
  await user.click(screen.getByRole("button", { name: "Disable MFA" }));

  expect(await screen.findByText("Step-up verification required")).toBeInTheDocument();
  await user.type(screen.getByLabelText("Authenticator code"), "246810");
  await user.click(screen.getByRole("button", { name: "Verify and continue" }));

  expect(await screen.findByText(/No authenticator enrolled/)).toBeInTheDocument();
});

test("MFA panel step-up verification shows rate_limited cooldown", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      status: 401,
      json: async () => ({
        mfaRequired: true,
        challenge: {
          challengeId: "chal-stepup-rl-001",
          purpose: "permission_mutation",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
      }),
    } as Response)
    .mockResolvedValueOnce({
      status: 429,
      json: async () => ({
        result: "rate_limited",
        message: "Too many attempts.",
        retryAfterSeconds: 30,
      }),
    } as Response);

  renderPanel({
    enabled: true,
    enrolledAt: "2026-03-16T10:00:00.000Z",
    lastVerifiedAt: null,
    recoveryCodesRemaining: 8,
  });

  await user.click(screen.getByRole("button", { name: "Disable MFA" }));
  await user.type(screen.getByPlaceholderText("123456"), "123456");
  await user.click(screen.getByRole("button", { name: "Disable MFA" }));
  expect(await screen.findByText("Step-up verification required")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Authenticator code"), "111111");
  await user.click(screen.getByRole("button", { name: "Verify and continue" }));

  expect(await screen.findByText("MFA verification rate-limited. Retry in 30s.")).toBeInTheDocument();
  expect(screen.getByText("Cooldown active: retry in 30s.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Wait 30s" })).toBeDisabled();
});

test("MFA panel step-up verification shows locked_out state", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      status: 401,
      json: async () => ({
        mfaRequired: true,
        challenge: {
          challengeId: "chal-stepup-locked-001",
          purpose: "permission_mutation",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
      }),
    } as Response)
    .mockResolvedValueOnce({
      status: 401,
      json: async () => ({
        result: "locked_out",
        message: "Challenge exhausted.",
        attemptsRemaining: 0,
      }),
    } as Response);

  renderPanel({
    enabled: true,
    enrolledAt: "2026-03-16T10:00:00.000Z",
    lastVerifiedAt: null,
    recoveryCodesRemaining: 8,
  });

  await user.click(screen.getByRole("button", { name: "Disable MFA" }));
  await user.type(screen.getByPlaceholderText("123456"), "123456");
  await user.click(screen.getByRole("button", { name: "Disable MFA" }));
  expect(await screen.findByText("Step-up verification required")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Authenticator code"), "000000");
  await user.click(screen.getByRole("button", { name: "Verify and continue" }));

  expect(
    await screen.findByText("MFA challenge locked. Maximum attempts exceeded. Please request a new challenge."),
  ).toBeInTheDocument();
});

test("MFA panel step-up verification shows expired state", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      status: 401,
      json: async () => ({
        mfaRequired: true,
        challenge: {
          challengeId: "chal-stepup-expired-001",
          purpose: "permission_mutation",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
      }),
    } as Response)
    .mockResolvedValueOnce({
      status: 410,
      json: async () => ({
        result: "expired",
        message: "Challenge expired.",
      }),
    } as Response);

  renderPanel({
    enabled: true,
    enrolledAt: "2026-03-16T10:00:00.000Z",
    lastVerifiedAt: null,
    recoveryCodesRemaining: 8,
  });

  await user.click(screen.getByRole("button", { name: "Disable MFA" }));
  await user.type(screen.getByPlaceholderText("123456"), "123456");
  await user.click(screen.getByRole("button", { name: "Disable MFA" }));
  expect(await screen.findByText("Step-up verification required")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Authenticator code"), "123456");
  await user.click(screen.getByRole("button", { name: "Verify and continue" }));

  expect(await screen.findByText("MFA challenge expired. Please start this action again.")).toBeInTheDocument();
});

test("MFA panel step-up verification shows mfa_failed attempts remaining", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      status: 401,
      json: async () => ({
        mfaRequired: true,
        challenge: {
          challengeId: "chal-stepup-failed-001",
          purpose: "permission_mutation",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
      }),
    } as Response)
    .mockResolvedValueOnce({
      status: 401,
      json: async () => ({
        result: "mfa_failed",
        message: "Invalid TOTP code.",
        attemptsRemaining: 2,
      }),
    } as Response);

  renderPanel({
    enabled: true,
    enrolledAt: "2026-03-16T10:00:00.000Z",
    lastVerifiedAt: null,
    recoveryCodesRemaining: 8,
  });

  await user.click(screen.getByRole("button", { name: "Disable MFA" }));
  await user.type(screen.getByPlaceholderText("123456"), "123456");
  await user.click(screen.getByRole("button", { name: "Disable MFA" }));
  expect(await screen.findByText("Step-up verification required")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Authenticator code"), "999999");
  await user.click(screen.getByRole("button", { name: "Verify and continue" }));

  expect(await screen.findByText("Invalid TOTP code. (2 attempts remaining)")).toBeInTheDocument();
});
