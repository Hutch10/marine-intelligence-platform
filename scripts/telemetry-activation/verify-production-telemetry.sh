#!/usr/bin/env bash

# Verify production telemetry freshness (read-only HTTP checks).

# Usage: ./scripts/telemetry-activation/verify-production-telemetry.sh [API_BASE]

#

# Thresholds:

#   NDBC (live-conditions): hard FAIL when observation age > 6 hours

#   CRW (reef-alerts): WARN when product age > 48 hours; hard FAIL when > 72 hours

#   CRW timestamp is the NOAA product date (midnight UTC), not ingest time.



set -euo pipefail



API_BASE="${1:-https://api.vitalicast.com}"

NOW_EPOCH="$(date -u +%s)"

FAIL=0

WARN=0



note_fail() {

  echo "FAIL: $1"

  FAIL=1

}



note_warn() {

  echo "WARN: $1"

  WARN=1

}



echo "Marine telemetry verification — ${API_BASE}"

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

MAX_OBS_EPOCH=0

while IFS= read -r line; do

  echo "  ${line}"

done < <(echo "${LIVE}" | jq -r '.conditions[]? | "station \(.stationId) timestamp \(.timestamp)"' 2>/dev/null || true)

if echo "${LIVE}" | jq -e '.conditions | length > 0' >/dev/null 2>&1; then

  MAX_OBS_ISO="$(echo "${LIVE}" | jq -r '[.conditions[].timestamp] | max')"

  MAX_OBS_EPOCH="$(date -u -d "${MAX_OBS_ISO}" +%s 2>/dev/null || echo 0)"

  AGE_H=$(( (NOW_EPOCH - MAX_OBS_EPOCH) / 3600 ))

  echo "Latest observation age: ${AGE_H} hours (NDBC hard fail > 6h)"

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

  echo "Latest reef alert age: ${AGE_H} hours (CRW warn > 48h, fail > 72h)"

  if (( AGE_H > 72 )); then

    note_fail "Latest reef alert older than 72 hours (CRW hard fail)"

  elif (( AGE_H > 48 )); then

    note_warn "Latest reef alert older than 48 hours (CRW warn — daily NOAA product cadence)"

  fi

fi

echo



FEED="$(curl -fsS "${API_BASE}/feed-health")" || { note_fail "GET /feed-health"; FEED="{}"; }

HISTORY_COUNT="$(echo "${FEED}" | jq -r '.summary.recent_history_count // 0' 2>/dev/null || echo 0)"

LAST_COMPLETED="$(echo "${FEED}" | jq -r '.summary.last_completed_at // empty' 2>/dev/null || true)"

echo "feed-health recent_history_count: ${HISTORY_COUNT}"

echo "feed-health last_completed_at: ${LAST_COMPLETED:-null}"



if [[ "${HISTORY_COUNT}" == "0" ]]; then

  note_fail "No persisted ingestion reports in feed-health"

fi



if [[ -z "${LAST_COMPLETED}" ]]; then

  note_fail "No latest scheduler execution timestamp in feed-health"

else

  LAST_EPOCH="$(date -u -d "${LAST_COMPLETED}" +%s 2>/dev/null || echo 0)"

  SCHED_AGE_H=$(( (NOW_EPOCH - LAST_EPOCH) / 3600 ))

  echo "Latest scheduler execution age: ${SCHED_AGE_H} hours (hard fail > 3h)"

  if (( SCHED_AGE_H > 3 )); then

    note_fail "Latest scheduler execution older than 3 hours"

  fi

fi



MOCK_SOURCE="$(echo "${LIVE}" | jq -r '[.conditions[]?.source // empty] | map(select(test("^synthetic") or . == "mock")) | length' 2>/dev/null || echo 0)"

if [[ "${MOCK_SOURCE}" != "0" ]]; then

  note_fail "Mock/synthetic contamination detected in live-conditions"

fi



MISSING_PROV="$(echo "${REEF}" | jq -r '[.alerts[]? | select((.verificationStatus // "") == "" or (.productDate // "") == "")] | length' 2>/dev/null || echo 0)"

if [[ "${MISSING_PROV}" != "0" ]]; then

  note_warn "Reef alerts missing harness provenance fields (deploy harness API update)"

fi



echo



# H+72 replay validation gate (requires OPERATOR_ACCESS_TOKEN)

if [[ -n "${OPERATOR_ACCESS_TOKEN:-}" ]]; then

  REPLAY_URL="${API_BASE}/internal/operator/replay-validation?token=${OPERATOR_ACCESS_TOKEN}"

  REPLAY="$(curl -fsS "${REPLAY_URL}" 2>/dev/null || echo '{}')"

  REPLAY_SAMPLES="$(echo "${REPLAY}" | jq -r '.sampleCount // 0' 2>/dev/null || echo 0)"

  REPLAY_OVERALL="$(echo "${REPLAY}" | jq -r '.overallPass // false' 2>/dev/null || echo false)"

  echo "replay-validation sampleCount: ${REPLAY_SAMPLES}"

  echo "replay-validation overallPass: ${REPLAY_OVERALL}"



  if [[ "${REPLAY_SAMPLES}" == "0" ]]; then

    note_fail "No replay validation samples available (deploy harness + Turso migration 0003+)"

  elif [[ "${REPLAY_OVERALL}" != "true" ]]; then

    note_fail "Replay validation burn-in failed — incomplete or unreplayable production evidence"

  fi

else

  note_fail "OPERATOR_ACCESS_TOKEN not set — cannot verify replay validation gate"

fi



# Public lineage enforcement on live-conditions and reef-alerts

LIVE="$(curl -fsS "${API_BASE}/live-conditions" 2>/dev/null || echo '{}')"

REEF="$(curl -fsS "${API_BASE}/reef-alerts" 2>/dev/null || echo '{}')"

TRUSTED_WITHOUT_LINEAGE="$(echo "${LIVE}" "${REEF}" | jq -s '[.[0].conditions[]?, .[1].alerts[]? | select((.trustedForPromotion == true or .trustStatus == "trusted") and ((.rootEventId // "") == ""))] | length' 2>/dev/null || echo 0)"

echo "public trusted signals missing rootEventId: ${TRUSTED_WITHOUT_LINEAGE}"

if [[ "${TRUSTED_WITHOUT_LINEAGE}" != "0" ]]; then

  note_fail "Public API returned trusted environmental signals without rootEventId lineage"

fi



echo



if (( FAIL == 0 )); then

  if (( WARN == 1 )); then

    echo "PASS — production telemetry within thresholds (CRW warning only)."

    exit 0

  fi

  echo "PASS — production telemetry within thresholds."

  exit 0

fi



exit 1

