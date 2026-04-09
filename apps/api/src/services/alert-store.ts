// AlertStore interface for pluggable alert state
import type { OperationalAlert, OperationalAlertRuleType } from "./operational-alerts";

export interface AlertStore {
  getAlertById(id: string): OperationalAlert | undefined;
  getAlertIdByKey(key: string): string | undefined;
  getAlertKeyById(id: string): string | undefined;
  setAlert(alert: OperationalAlert, key: string): void;
  deleteAlert(id: string, key: string): void;
  listAlerts(filter?: { source?: string; status?: string }): OperationalAlert[];
  clear(): void;
}
