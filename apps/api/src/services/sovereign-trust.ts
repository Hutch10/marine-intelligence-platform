import { IntegrityStatus } from "@marine/shared";

export interface SovereignVerificationResult {
  status: IntegrityStatus;
  confidence: number;
  claimId: string;
  contradictions: string[];
}

export class SovereignTrustService {
  private static FORGE_BRIDGE_URL = "http://localhost:5155/api/bridge/verify-claim";

  /**
   * Dispatches a risk claim to Forge for adversarial validation.
   */
  static async verifyRiskClaim(
    stationId: string,
    riskLevel: string,
    confidence: number,
    reasons: string[]
  ): Promise<SovereignVerificationResult> {
    const statement = `Station ${stationId} risk level is ${riskLevel}. Evidence: ${reasons.join(", ")}`;
    
    try {
      const response = await fetch(this.FORGE_BRIDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: `marine-${stationId}`,
          source: "marine-intelligence",
          statement,
          confidence,
          tags: ["marine_risk", riskLevel]
        })
      });

      if (!response.ok) {
        throw new Error(`Forge Bridge responded with ${response.status}`);
      }

      const data = await response.json();

      if (data.contradictedBy.length > 0) {
        return {
          status: IntegrityStatus.REJECTED,
          confidence: data.confidence,
          claimId: data.claimId,
          contradictions: data.contradictedBy
        };
      }

      return {
        status: IntegrityStatus.VERIFIED,
        confidence: data.confidence,
        claimId: data.claimId,
        contradictions: []
      };
    } catch (err) {
      console.error(`[SovereignTrust] Verification failed: ${err instanceof Error ? err.message : String(err)}`);
      // Fallback to UNVERIFIED if Forge is unreachable
      return {
        status: IntegrityStatus.UNVERIFIED,
        confidence,
        claimId: "fallback",
        contradictions: []
      };
    }
  }
}
