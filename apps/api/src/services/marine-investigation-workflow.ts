import type {
  MarineInvestigationCreateInput,
  MarineInvestigationCreateResult,
  MarineInvestigationGetResult,
  MarineInvestigationListFilters,
  MarineInvestigationListResult,
  MarineInvestigationTransition,
  MarineInvestigationTransitionResult,
} from "../marine-intelligence-types";
import {
  createMarineInvestigation,
  getMarineInvestigation,
  listMarineInvestigations,
  transitionMarineInvestigation,
  type MarineInvestigationsRepositoryCreateResult,
  type MarineInvestigationsRepositoryGetResult,
  type MarineInvestigationsRepositoryListResult,
  type MarineInvestigationsRepositoryTransitionResult,
} from "../repositories/marine-investigations";

export interface MarineInvestigationWorkflowService {
  openInvestigation(
    input: MarineInvestigationCreateInput,
  ): MarineInvestigationCreateResult;
  getInvestigation(id: string): MarineInvestigationGetResult;
  listInvestigations(
    filters?: MarineInvestigationListFilters,
  ): MarineInvestigationListResult;
  transitionInvestigation(
    id: string,
    transition: MarineInvestigationTransition,
    notes?: string,
  ): MarineInvestigationTransitionResult;
}

interface MarineInvestigationWorkflowDependencies {
  createInvestigation?: (
    input: MarineInvestigationCreateInput,
  ) => MarineInvestigationsRepositoryCreateResult;
  getInvestigation?: (id: string) => MarineInvestigationsRepositoryGetResult;
  listInvestigations?: (
    filters?: MarineInvestigationListFilters,
  ) => MarineInvestigationsRepositoryListResult;
  transitionInvestigation?: (
    id: string,
    transition: MarineInvestigationTransition,
    notes: string | null,
  ) => MarineInvestigationsRepositoryTransitionResult;
}

function unavailableCreate(): MarineInvestigationCreateResult {
  return {
    ok: false,
    reason: "validation",
    error: "Investigation storage unavailable",
    investigation: null,
  };
}

function unavailableGet(): MarineInvestigationGetResult {
  return { ok: false, investigation: null };
}

function unavailableList(): MarineInvestigationListResult {
  return { ok: false, investigations: [] };
}

function unavailableTransition(reason: string): MarineInvestigationTransitionResult {
  return {
    ok: false,
    reason: "validation",
    error: reason,
    investigation: null,
  };
}

export function createMarineInvestigationWorkflowService(
  dependencies: MarineInvestigationWorkflowDependencies = {},
): MarineInvestigationWorkflowService {
  const doCreate =
    dependencies.createInvestigation ??
    ((input) => createMarineInvestigation(input));
  const doGet =
    dependencies.getInvestigation ??
    ((id) => getMarineInvestigation(id));
  const doList =
    dependencies.listInvestigations ??
    ((filters) => listMarineInvestigations(filters));
  const doTransition =
    dependencies.transitionInvestigation ??
    ((id, transition, notes) =>
      transitionMarineInvestigation(id, transition, notes));

  function openInvestigation(
    input: MarineInvestigationCreateInput,
  ): MarineInvestigationCreateResult {
    const result = doCreate(input);
    if (result.source !== "db") return unavailableCreate();
    return result.result;
  }

  function getInvestigation(id: string): MarineInvestigationGetResult {
    const result = doGet(id);
    if (result.source !== "db") return unavailableGet();
    return result.result;
  }

  function listInvestigations(
    filters: MarineInvestigationListFilters = {},
  ): MarineInvestigationListResult {
    const result = doList(filters);
    if (result.source !== "db") return unavailableList();
    return result.result;
  }

  function transitionInvestigation(
    id: string,
    transition: MarineInvestigationTransition,
    notes?: string,
  ): MarineInvestigationTransitionResult {
    const result = doTransition(id, transition, notes ?? null);
    if (result.source !== "db") {
      return unavailableTransition(
        `Investigation storage unavailable: ${result.fallbackReason}`,
      );
    }
    return result.result;
  }

  return {
    openInvestigation,
    getInvestigation,
    listInvestigations,
    transitionInvestigation,
  };
}
