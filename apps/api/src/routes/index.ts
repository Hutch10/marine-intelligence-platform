import { postAiAnalyzeRoute } from "./ai";
import { getAiLabRoute } from "./ai-lab";
import { getDashboardRoute } from "./dashboard";
import { getFeedHealthRoute } from "./feed-health";
import { getOperationalAlertsRoute } from "./operational-alerts";
import { getLiveConditionsRoute } from "./live-conditions";
import { getReefAlertsRoute } from "./reef-alerts";
import { getDatasetByIdRoute, getDatasetRecordsRoute, getDatasetsRoute } from "./datasets";
import { getInvestigationsRoute } from "./investigations";
import { getInvestigationTimelineRoute, postInvestigationEventRoute } from "./investigation-events";
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
  getMarineWorkflowAlertsRoute,
  getMarineWorkflowEventsRoute,
  getMarineWorkflowInvestigationsRoute,
  postMarineWorkflowAcknowledgeAlertRoute,
  postMarineWorkflowCreateInvestigationRoute,
  postMarineWorkflowResolveAlertRoute,
} from "./marine-intelligence";

export const routeStubs = [
  getAiLabRoute,
  getDashboardRoute,
  getFeedHealthRoute,
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
  postMarineWorkflowAcknowledgeAlertRoute,
  postMarineWorkflowResolveAlertRoute,
] as const;
