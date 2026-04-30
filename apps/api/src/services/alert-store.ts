// AlertStore interface for pluggable alert state
import type { OperationalAlert } from "./operational-alerts";

export interface AlertStore {
  getAlertById(id: string): Promise<OperationalAlert | undefined>;
  getAlertIdByKey(key: string): Promise<string | undefined>;
  getAlertKeyById(id: string): Promise<string | undefined>;
  setAlert(alert: OperationalAlert, key: string): Promise<void>;
  deleteAlert(id: string, key: string): Promise<void>;
  listAlerts(filter?: { source?: string; status?: string }): Promise<OperationalAlert[]>;
  clear(): Promise<void>;
}
