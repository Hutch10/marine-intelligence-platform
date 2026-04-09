import type { AlertStore } from "./alert-store";
import type { OperationalAlert } from "./operational-alerts";

export class InMemoryAlertStore implements AlertStore {
  private alertsById = new Map<string, OperationalAlert>();
  private alertKeyById = new Map<string, string>();
  private alertIdByKey = new Map<string, string>();

  getAlertById(id: string): OperationalAlert | undefined {
    return this.alertsById.get(id);
  }
  getAlertIdByKey(key: string): string | undefined {
    return this.alertIdByKey.get(key);
  }
  getAlertKeyById(id: string): string | undefined {
    return this.alertKeyById.get(id);
  }
  setAlert(alert: OperationalAlert, key: string): void {
    this.alertsById.set(alert.id, alert);
    this.alertKeyById.set(alert.id, key);
    this.alertIdByKey.set(key, alert.id);
  }
  deleteAlert(id: string, key: string): void {
    this.alertsById.delete(id);
    this.alertKeyById.delete(id);
    this.alertIdByKey.delete(key);
  }
  listAlerts(filter?: { source?: string; status?: string }): OperationalAlert[] {
    let alerts = Array.from(this.alertsById.values());
    if (filter?.source) alerts = alerts.filter(a => a.source === filter.source);
    if (filter?.status) alerts = alerts.filter(a => a.status === filter.status);
    return alerts;
  }
  clear(): void {
    this.alertsById.clear();
    this.alertKeyById.clear();
    this.alertIdByKey.clear();
  }
}
