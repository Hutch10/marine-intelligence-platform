
import crypto from "node:crypto";

/**
 * Forensic-grade integrity service for truth records.
 * Implements deterministic canonicalization and hashing.
 */
export class IntegrityService {
  /**
   * Calculates a SHA-256 hash of a record with deterministic field ordering.
   * Excludes internal metadata fields like 'integrity_hash', 'id' (if auto-generated), and 'created_at'.
   */
  static calculateCanonicalHash(record: Record<string, any>): string {
    const canonical = this.canonicalize(record);
    return crypto.createHash("sha256").update(this.stableStringify(canonical)).digest("hex");
  }

  /**
   * Stable stringification that ensures consistent output for the same data.
   */
  private static stableStringify(obj: any): string {
    return JSON.stringify(obj, (_, value) => {
      if (value === undefined) return null;
      if (typeof value === "number") {
        // Normalize numeric precision to avoid drift (e.g. 0.1 + 0.2 !== 0.3)
        // We round to 8 decimal places for canonical stability.
        return Number.isFinite(value) ? Math.round(value * 1e8) / 1e8 : null;
      }
      if (typeof value === "string") {
        // Normalize Unicode to NFC form to prevent homoglyph/composition attacks.
        return value.normalize("NFC");
      }
      return value;
    });
  }

  /**
   * Deterministically orders fields and handles normalization.
   */
  private static canonicalize(obj: any): any {
    if (obj === null || typeof obj !== "object") {
      if (typeof obj === "string") return obj.normalize("NFC");
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.canonicalize(item));
    }

    if (obj instanceof Date) {
      return obj.toISOString();
    }

    // Sort keys and filter out transient/integrity fields
    const keys = Object.keys(obj)
      .filter(
        (k) => ![
          "integrity_hash",
          "integrity_chain_hash",
          "integrityHash",
          "integrityChainHash",
          "id",
          "created_at",
          "updated_at",
          "createdAt",
          "updatedAt",
        ].includes(k),
      )
      .sort();

    const result: Record<string, any> = {};
    for (const key of keys) {
      result[key] = this.canonicalize(obj[key]);
    }
    return result;
  }

  /**
   * Verifies a record against its stored hash.
   */
  static verifyIntegrity(record: Record<string, any>, storedHash: string): boolean {
    const calculated = this.calculateCanonicalHash(record);
    return calculated === storedHash;
  }
  
  /**
   * Merkle-style chaining: hash(prevHash + separator + currentCanonicalData)
   */
  static calculateChainHash(prevHash: string, currentRecord: Record<string, any>): string {
    const canonical = this.canonicalize(currentRecord);
    // Use a unique separator to prevent length extension attacks or prefix collisions.
    const data = `PREV:${prevHash}|CURR:${this.stableStringify(canonical)}`;
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * High-level audit function to verify an entire sequence of records.
   */
  static verifyChain(records: Array<Record<string, any>>, initialHash: string = "GENESIS"): boolean {
    return this.verifyChainDetailed(records, initialHash).valid;
  }

  /**
   * Verifies a hash chain and returns deterministic diagnostics for audit tooling.
   */
  static verifyChainDetailed(
    records: Array<Record<string, any>>,
    initialHash: string = "GENESIS",
  ): {
    valid: boolean;
    failedIndex?: number;
    reason?: "missing_hash" | "hash_mismatch";
    expectedHash?: string;
    actualHash?: string;
  } {
    let currentHash = initialHash;
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const recordHash = record.integrity_chain_hash ?? record.integrityChainHash;
      if (!recordHash) {
        return { valid: false, failedIndex: index, reason: "missing_hash" };
      }
      
      const expectedHash = this.calculateChainHash(currentHash, record);
      if (recordHash !== expectedHash) {
        return {
          valid: false,
          failedIndex: index,
          reason: "hash_mismatch",
          expectedHash,
          actualHash: recordHash,
        };
      }
      currentHash = recordHash;
    }
    return { valid: true };
  }
}
