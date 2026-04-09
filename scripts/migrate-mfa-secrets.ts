import { openWritableDatabase, resolveDatabasePath } from "../apps/api/src/db/client";
import { migratePlaintextMfaSecrets } from "../apps/api/src/security/mfa-secret";

async function main() {
  const dbPath = resolveDatabasePath();
  console.log(`Using database at: ${dbPath}`);

  const db = openWritableDatabase(dbPath);
  
  try {
    console.log("Starting MFA secret migration...");
    const result = migratePlaintextMfaSecrets(db as any);
    console.log(`Migration complete: ${result.migrated} migrated, ${result.skipped} skipped.`);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch(console.error);
