import { getFeedHealth } from "@/lib/feed-health";
import { FeedHealthBanner } from "@/components/layout/feed-health-banner";

export async function FeedHealthBannerLoader() {
  const feedHealth = await getFeedHealth();
  return <FeedHealthBanner feedHealth={feedHealth} />;
}
