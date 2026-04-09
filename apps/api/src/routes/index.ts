import { postAiAnalyzeRoute } from "./ai";
import { getAiLabRoute } from "./ai-lab";
import { getDashboardRoute } from "./dashboard";
import { getFeedHealthRoute } from "./feed-health";
import { getInternalStationsHealthRoute } from "./internal-stations-health";
import { getOperationalAlertsRoute } from "./operational-alerts";
import { getRegionRiskScoreRoute } from "./region-risk";
import { getRegionRiskTrendRoute } from "./region-risk-trend";
import { getLiveConditionsRoute } from "./live-conditions";
import { getReefAlertsRoute } from "./reef-alerts";
import { getDatasetByIdRoute, getDatasetRecordsRoute, getDatasetsRoute } from "./datasets";
import { getInvestigationsRoute } from "./investigations";
import { getInvestigationTimelineRoute, postInvestigationEventRoute } from "./investigation-events";
import { getSimilarInvestigationsRoute } from "./similar-investigations";
import {
  getSignalByIdRoute,
  getSignalsRoute,
  postSignalCreateRoute,
  postSignalDismissRoute,
  postSignalPromoteRoute,
} from "./signals";
import {
  getSpeciesByIdRoute,
  getSpeciesMovementSignalsRoute,
  getSpeciesRoute,
  getSpeciesSightingsRoute,
  postSpeciesSightingRoute,
} from "./species";
import { getRegionsRoute } from "./regions";
import { postStationAdminSessionRoute } from "./station-admin-auth";
import {
  getStationAdminAuthEventsExportRoute,
  getStationAdminAuthEventsRoute,
} from "./station-admin-auth-events";
import {
  getStationAdminSecurityAlertsRoute,
  getStationAdminSecuritySummaryRoute,
  getStationAdminSessionsRoute,
} from "./station-admin-security";
import {
  postStationAdminLoginRoute,
  postStationAdminLogoutRoute,
  postStationAdminMfaVerifyRoute,
  postStationAdminRefreshRoute,
  postStationAdminRevokeRoute,
} from "./station-admin-lifecycle";
import {
  postMfaEnrollStartRoute,
  postMfaEnrollVerifyRoute,
  postMfaRecoveryRegenerateRoute,
  postMfaDisableRoute,
} from "./station-admin-mfa";
import {
  getStationAdminRoute,
  getStationAnalyticsRoute,
  getStationByIdRoute,
  getStationsRoute,
  patchStationBrandingRoute,
  patchStationContentRoute,
  patchStationRoute,
  postStationAlertAcknowledgeRoute,
  postStationViewRoute,
} from "./stations";
import {
  getStationEventsRoute,
  getStationEventDetailRoute,
  getStationInvestigationsRoute,
  getStationInvestigationDetailRoute,
  postStationEventAcknowledgeRoute,
} from "./station-events";
import {
  getMarineWorkflowSummaryRoute,
  getMarineWorkflowAlertsRoute,
  getMarineWorkflowEventsRoute,
  getMarineWorkflowInvestigationsRoute,
  postMarineWorkflowDecisionRoute,
  postMarineWorkflowFeedbackRoute,
  postMarineWorkflowAcknowledgeAlertRoute,
  postMarineWorkflowCreateInvestigationRoute,
  postMarineWorkflowResolveAlertRoute,
  postMarineWorkflowTelemetryRoute,
} from "./marine-intelligence";
import {
  getAnomaliesRoute,
  getRiskScoreRoute,
  postRiskEvaluateRoute,
} from "./risk";
import {
  getValidationSummaryRoute,
  postValidationFeedbackRoute,
  postValidationOutcomeRoute,
} from "./validation";
import {
  getStationThresholdsRoute,
  putStationThresholdsRoute,
} from "./station-thresholds";
import { getV1RiskRoute } from "./v1-risk";
import { getV1RegionRiskRoute } from "./v1-region-risk";
import { getV1RegionRiskTrendRoute } from "./v1-region-risk-trend";
import { getV1SpeciesIntelligenceRoute } from "./v1-species";
import { getV1RegionImpactRoute } from "./v1-regions";

export const routeStubs = [
  getAiLabRoute,
  getDashboardRoute,
  getFeedHealthRoute,
  getInternalStationsHealthRoute,
  getRegionRiskScoreRoute,
  getRegionRiskTrendRoute,
  getOperationalAlertsRoute,
  getLiveConditionsRoute,
  getReefAlertsRoute,
  getRegionsRoute,
  postStationAdminSessionRoute,
  getStationAdminAuthEventsRoute,
  getStationAdminAuthEventsExportRoute,
  getStationAdminSessionsRoute,
  getStationAdminSecuritySummaryRoute,
  getStationAdminSecurityAlertsRoute,
  postStationAdminLoginRoute,
  postStationAdminLogoutRoute,
  postStationAdminMfaVerifyRoute,
  postStationAdminRefreshRoute,
  postStationAdminRevokeRoute,
  postMfaEnrollStartRoute,
  postMfaEnrollVerifyRoute,
  postMfaRecoveryRegenerateRoute,
  postMfaDisableRoute,
  getDatasetsRoute,
  getDatasetByIdRoute,
  getDatasetRecordsRoute,
  getInvestigationsRoute,
  getSimilarInvestigationsRoute,
  getInvestigationTimelineRoute,
  postInvestigationEventRoute,
  getSignalsRoute,
  getSignalByIdRoute,
  postSignalCreateRoute,
  postSignalPromoteRoute,
  postSignalDismissRoute,
  getSpeciesRoute,
  getSpeciesByIdRoute,
  getSpeciesSightingsRoute,
  getSpeciesMovementSignalsRoute,
  postSpeciesSightingRoute,
  getStationsRoute,
  getStationByIdRoute,
  getStationAdminRoute,
  patchStationRoute,
  patchStationBrandingRoute,
  patchStationContentRoute,
  getStationAnalyticsRoute,
  postStationViewRoute,
  postStationAlertAcknowledgeRoute,
  postAiAnalyzeRoute,
  getStationEventsRoute,
  getStationEventDetailRoute,
  getStationInvestigationsRoute,
  getStationInvestigationDetailRoute,
  postStationEventAcknowledgeRoute,
  getMarineWorkflowEventsRoute,
  getMarineWorkflowInvestigationsRoute,
  postMarineWorkflowCreateInvestigationRoute,
  getMarineWorkflowAlertsRoute,
  postMarineWorkflowDecisionRoute,
  postMarineWorkflowFeedbackRoute,
  postMarineWorkflowAcknowledgeAlertRoute,
  postMarineWorkflowResolveAlertRoute,
  postMarineWorkflowTelemetryRoute,
  getMarineWorkflowSummaryRoute,
  getRiskScoreRoute,
  postRiskEvaluateRoute,
  getAnomaliesRoute,
  getValidationSummaryRoute,
  postValidationOutcomeRoute,
  postValidationFeedbackRoute,
  getStationThresholdsRoute,
  putStationThresholdsRoute,
  getV1RiskRoute,
  getV1RegionRiskRoute,
  getV1RegionRiskTrendRoute,
  getV1SpeciesIntelligenceRoute,
  getV1RegionImpactRoute,
] as const;
