import type {
  MarineEventCreateInput,
  MarineEventCreateResult,
  MarineEventListFilters,
  MarineEventListResult,
} from "../marine-intelligence-types";
import {
  createMarineEvent,
  listMarineEvents,
  type MarineEventsRepositoryCreateResult,
  type MarineEventsRepositoryReadResult,
} from "../repositories/marine-events";
import { getMarineOntologyTermById } from "../repositories/marine-intelligence-ontology";

export interface MarineEventFoundationService {
  recordEvent(input: MarineEventCreateInput): MarineEventCreateResult;
  listEvents(filters?: MarineEventListFilters): MarineEventListResult;
}

interface MarineEventFoundationServiceDependencies {
  createEvent?: (input: MarineEventCreateInput) => MarineEventsRepositoryCreateResult;
  listEvents?: (filters?: MarineEventListFilters) => MarineEventsRepositoryReadResult;
  getOntologyTerm?: typeof getMarineOntologyTermById;
}

function toValidationError(error: string): MarineEventCreateResult {
  return {
    ok: false,
    reason: "validation",
    error,
    event: null,
  };
}

function eventClassMatchesModeledTerm(eventClass: string, termId: string): boolean {
  if (termId === "mdl.threshold_alert") {
    return eventClass === "threshold_alert";
  }

  if (termId === "mdl.trend_signal") {
    return eventClass === "trend_signal";
  }

  if (termId === "mdl.contextual_signal") {
    return eventClass === "contextual_signal";
  }

  return true;
}

export function createMarineEventFoundationService(
  dependencies: MarineEventFoundationServiceDependencies = {},
): MarineEventFoundationService {
  const createEvent = dependencies.createEvent ?? ((input) => createMarineEvent(input));
  const listEventsFromRepository = dependencies.listEvents ?? ((filters) => listMarineEvents(filters));
  const getOntologyTerm = dependencies.getOntologyTerm ?? getMarineOntologyTermById;

  function recordEvent(input: MarineEventCreateInput): MarineEventCreateResult {
    const ontologyTermId = input.ontologyTermId.trim();
    const term = getOntologyTerm(ontologyTermId);

    if (!term) {
      return {
        ok: false,
        reason: "ontology_term_not_found",
        error: `Unknown ontology term: ${ontologyTermId}`,
        event: null,
      };
    }

    if (!eventClassMatchesModeledTerm(input.eventClass, ontologyTermId)) {
      return toValidationError("eventClass does not match modeled ontology term");
    }

    const createResult = createEvent(input);

    if (createResult.source !== "db") {
      return {
        ok: false,
        reason: "validation",
        error: `Event storage unavailable: ${createResult.fallbackReason}`,
        event: null,
      };
    }

    return createResult.result;
  }

  function listEvents(filters: MarineEventListFilters = {}): MarineEventListResult {
    const listResult = listEventsFromRepository(filters);

    if (listResult.source !== "db") {
      return {
        ok: false,
        events: [],
      };
    }

    return listResult.result;
  }

  return {
    recordEvent,
    listEvents,
  };
}
