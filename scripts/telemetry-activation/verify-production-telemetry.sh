#!/usr/bin/env bash
# Verify production telemetry freshness (read-only HTTP checks).
# Usage: ./scripts/telemetry-activation/verify-production-telemetry.sh [API_BASE]

set -euo pipefail

API_BASE="${1:-https://api.vitalicast.com}"
NOW_EPOCH="$(date -u +%s)"
FAIL=0

note_fail() {
  echo "FAIL: $1"
  FAIL=1
}

echo "Marine telemetry verification - ${API_BASE}"
echo "UTC now: $(date -u -Iseconds)"
echo

HEALTH="$(curl -fsS "${API_BASE}/health")" || { note_fail "GET /health"; HEALTH="{}"; }
echo "${HEALTH}" | jq -r '"dbReachable: \(.dbReachable)"' 2>/dev/null || true
DB_OK="$(echo "${HEALTH}" | jq -r '.dbReachable // false' 2>/dev/null || echo false)"
if [[ "${DB_OK}" != "true" ]]; then
  note_fail "health.dbReachable is false"
fi
echo "${HEALTH}" | jq -r '"feed-health last_completed_at: \(.feedHealth.summary.last_completed_at // "null")"' 2>/dev/null || true
echo

LIVE="$(curl -fsS "${API_BASE}/live-conditions")" || { note_fail "GET /live-conditions"; LIVE="{}"; }
while IFS= read -r line; do
  echo "  ${line}"
done < <(echo "${LIVE}" | jq -r '.conditions[]? | "station \(.stationId) timestamp \(.timestamp)"' 2>/dev/null || true)
if echo "${LIVE}" | jq -e '.conditions | length > 0' >/dev/null 2>&1; then
  MAX_OBS_ISO="$(echo "${LIVE}" | jq -r '[.conditions[].timestamp] | max')"
  MAX_OBS_EPOCH="$(date -u -d "${MAX_OBS_ISO}" +%s 2>/dev/null || echo 0)"
  AGE_H=$(( (NOW_EPOCH - MAX_OBS_EPOCH) / 3600 ))
  echo "Latest observation age: ${AGE_H} hours"
  if (( AGE_H > 6 )); then
    note_fail "Latest observation older than 6 hours"
  fi
else
  note_fail "No live conditions returned"
fi
echo

REEF="$(curl -fsS "${API_BASE}/reef-alerts")" || { note_fail "GET /reef-alerts"; REEF="{}"; }
while IFS= read -r line; do
  echo "  ${line}"
done < <(echo "${REEF}" | jq -r '.alerts[]? | "region \(.region) timestamp \(.timestamp)"' 2>/dev/null || true)
if echo "${REEF}" | jq -e '.alerts | length > 0' >/dev/null 2>&1; then
  MAX_REEF_ISO="$(echo "${REEF}" | jq -r '[.alerts[].timestamp] | max')"
  MAX_REEF_EPOCH="$(date -u -d "${MAX_REEF_ISO}" +%s 2>/dev/null || echo 0)"
  AGE_H=$(( (NOW_EPOCH - MAX_REEF_EPOCH) / 3600 ))
  echo "Latest reef alert age: ${AGE_H} hours"
  if (( AGE_H > 48 )); then
    note_fail "Latest reef alert older than 48 hours"
  fi
fi
echo

if (( FAIL == 0 )); then
  echo "PASS - production telemetry within thresholds."
  exit 0
fi

exit 1
