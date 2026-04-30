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
  ): Promise<MarineInvestigationCreateResult>;
  getInvestigation(id: string): Promise<MarineInvestigationGetResult>;
  listInvestigations(
    filters?: MarineInvestigationListFilters,
  ): Promise<MarineInvestigationListResult>;
  transitionInvestigation(
    id: string,
    transition: MarineInvestigationTransition,
    notes?: string,
  ): Promise<MarineInvestigationTransitionResult>;
}

interface MarineInvestigationWorkflowDependencies {
  createInvestigation?: (
    input: MarineInvestigationCreateInput,
  ) => Promise<MarineInvestigationsRepositoryCreateResult>;
  getInvestigation?: (id: string) => Promise<MarineInvestigationsRepositoryGetResult>;
  listInvestigations?: (
    filters?: MarineInvestigationListFilters,
  ) => Promise<MarineInvestigationsRepositoryListResult>;
  transitionInvestigation?: (
    id: string,
    transition: MarineInvestigationTransition,
    notes: string | null,
  ) => Promise<MarineInvestigationsRepositoryTransitionResult>;
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

  async function openInvestigation(
    input: MarineInvestigationCreateInput,
  ): Promise<MarineInvestigationCreateResult> {
    const result = await doCreate(input);
    if (result.source !== "db") return unavailableCreate();
    return result.result;
  }

  async function getInvestigation(id: string): Promise<MarineInvestigationGetResult> {
    const result = await doGet(id);
    if (result.source !== "db") return unavailableGet();
    return result.result;
  }

  async function listInvestigations(
    filters: MarineInvestigationListFilters = {},
  ): Promise<MarineInvestigationListResult> {
    const result = await doList(filters);
    if (result.source !== "db") return unavailableList();
    return result.result;
  }

  async function transitionInvestigation(
    id: string,
    transition: MarineInvestigationTransition,
    notes?: string,
  ): Promise<MarineInvestigationTransitionResult> {
    const result = await doTransition(id, transition, notes ?? null);
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
