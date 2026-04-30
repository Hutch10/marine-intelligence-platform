import type { AlertStore } from "./alert-store";
import type { OperationalAlert } from "./operational-alerts";

export class InMemoryAlertStore implements AlertStore {
  private alertsById = new Map<string, OperationalAlert>();
  private alertKeyById = new Map<string, string>();
  private alertIdByKey = new Map<string, string>();

  async getAlertById(id: string): Promise<OperationalAlert | undefined> {
    return this.alertsById.get(id);
  }
  async getAlertIdByKey(key: string): Promise<string | undefined> {
    return this.alertIdByKey.get(key);
  }
  async getAlertKeyById(id: string): Promise<string | undefined> {
    return this.alertKeyById.get(id);
  }
  async setAlert(alert: OperationalAlert, key: string): Promise<void> {
    const existingId = this.alertIdByKey.get(key);
    if (existingId && existingId !== alert.id) {
      this.alertsById.delete(existingId);
      this.alertKeyById.delete(existingId);
    }
    this.alertsById.set(alert.id, alert);
    this.alertKeyById.set(alert.id, key);
    this.alertIdByKey.set(key, alert.id);
  }
  async deleteAlert(id: string, key: string): Promise<void> {
    this.alertsById.delete(id);
    this.alertKeyById.delete(id);
    this.alertIdByKey.delete(key);
  }
  async listAlerts(filter?: { source?: string; status?: string }): Promise<OperationalAlert[]> {
    let alerts = Array.from(this.alertsById.values());
    if (filter?.source) alerts = alerts.filter(a => a.source === filter.source);
    if (filter?.status) alerts = alerts.filter(a => a.status === filter.status);
    return alerts;
  }
  async clear(): Promise<void> {
    this.alertsById.clear();
    this.alertKeyById.clear();
    this.alertIdByKey.clear();
  }
}
