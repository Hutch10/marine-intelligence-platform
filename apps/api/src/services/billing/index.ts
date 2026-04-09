import type { BillingProvider } from "./provider";
import { ManualBillingProvider } from "./manual-provider";

function resolveProviderName(): string {
  const configured = typeof process.env.MARINE_BILLING_PROVIDER === "string"
    ? process.env.MARINE_BILLING_PROVIDER.trim().toLowerCase()
    : "";

  return configured.length > 0 ? configured : "manual";
}

let cachedProvider: BillingProvider | null = null;

export function getBillingProvider(): BillingProvider {
  const providerName = resolveProviderName();

  if (cachedProvider && cachedProvider.name === providerName) {
    return cachedProvider;
  }

  switch (providerName) {
    case "manual":
    default:
      cachedProvider = new ManualBillingProvider();
      return cachedProvider;
  }
}
