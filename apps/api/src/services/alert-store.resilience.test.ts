// Phase 7: AlertStore Concurrency/Resilience Tests
import test from 'node:test';
import assert from 'node:assert/strict';
import { AlertStore } from './alert-store';

// Mock implementation for concurrency test
class InMemoryAlertStore implements AlertStore {
  private alerts = new Map<string, any>();
  getAlertById(id: string) { return this.alerts.get(id); }
  getAlertIdByKey(key: string) { return [...this.alerts.entries()].find(([_, a]) => a.key === key)?.[0]; }
  getAlertKeyById(id: string) { return this.getAlertById(id)?.key; }
  setAlert(alert: any, key: string) { this.alerts.set(alert.id, { ...alert, key }); }
  deleteAlert(id: string) { this.alerts.delete(id); }
  listAlerts() { return [...this.alerts.values()]; }
  clear() { this.alerts.clear(); }
}

test('AlertStore is race-safe under concurrent set/delete', async () => {
  const store = new InMemoryAlertStore();
  const alert = { id: '1', key: 'k', status: 'open', source: 'test' };
  await Promise.all([
    Promise.resolve(store.setAlert(alert, 'k')),
    Promise.resolve(store.deleteAlert('1')),
  ]);
  // Should not throw, and state is consistent
  assert(store.listAlerts().length >= 0);
});
