import type {
  MarineEventCreateInput,
  MarineEventCreateResult,
  MarineEventListFilters,
  MarineEventListResult,
} from "../marine-intelligence-types";
import {
  createMarineEvent,
  listMarineEvents,
} from "../repositories/marine-events";
import { getMarineOntologyTermById } from "../repositories/marine-intelligence-ontology";
import { getAsyncAdapter, type AsyncDbAdapter } from "../db/async-client";

export interface MarineEventFoundationService {
  recordEvent(input: MarineEventCreateInput): Promise<MarineEventCreateResult>;
  listEvents(filters?: MarineEventListFilters): Promise<MarineEventListResult>;
}

interface MarineEventFoundationServiceDependencies {
  createEvent?: (adapter: AsyncDbAdapter, input: MarineEventCreateInput) => Promise<MarineEventCreateResult>;
  listEvents?: (adapter: AsyncDbAdapter, filters?: MarineEventListFilters) => Promise<MarineEventListResult>;
  getOntologyTerm?: typeof getMarineOntologyTermById;
  getAdapter?: typeof getAsyncAdapter;
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
  const createEvent = dependencies.createEvent ?? createMarineEvent;
  const listEventsFromRepository = dependencies.listEvents ?? listMarineEvents;
  const getOntologyTerm = dependencies.getOntologyTerm ?? getMarineOntologyTermById;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;

  async function recordEvent(input: MarineEventCreateInput): Promise<MarineEventCreateResult> {
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

    const adapter = getAdapter(false);
    try {
      return await createEvent(adapter, input);
    } finally {
      adapter.close();
    }
  }

  async function listEvents(filters: MarineEventListFilters = {}): Promise<MarineEventListResult> {
    const adapter = getAdapter(true);
    try {
      return await listEventsFromRepository(adapter, filters);
    } finally {
      adapter.close();
    }
  }

  return {
    recordEvent,
    listEvents,
  };
}
