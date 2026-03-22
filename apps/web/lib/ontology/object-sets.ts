/**
 * Object Set query and result types.
 *
 * An ObjectSet is a typed, filtered view over a collection of ontology objects.
 * The applyFilters and buildObjectSetResult helpers operate on in-memory
 * collections — they require no DB access and are safe to call anywhere.
 */

import type { OntologyObject, OntologyObjectTypeId } from "./types";

export type OntologyFilterOperator =
  | "eq"
  | "neq"
  | "in"
  | "notIn"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "contains"
  | "isNull"
  | "isNotNull";

export interface OntologyFilter {
  field: string;
  operator: OntologyFilterOperator;
  value: unknown;
}

export interface OntologyObjectSetQuery<T extends OntologyObjectTypeId> {
  objectType: T;
  filters: OntologyFilter[];
  orderBy?: { field: string; direction: "asc" | "desc" };
  limit?: number;
  offset?: number;
}

export interface OntologyObjectSetResult<T extends OntologyObjectTypeId, O extends OntologyObject<T>> {
  ok: boolean;
  objectType: T;
  objects: O[];
  totalCount: number;
  hasMore: boolean;
  queryId: string;
  executedAt: string;
  error?: string;
}

/**
 * Apply a set of OntologyFilters to an in-memory array.
 * Unknown operators pass through without filtering.
 */
export function applyFilters<T extends Record<string, unknown>>(
  items: T[],
  filters: OntologyFilter[],
): T[] {
  if (filters.length === 0) return items;

  return items.filter((item) =>
    filters.every((filter) => {
      const fieldValue = item[filter.field];

      switch (filter.operator) {
        case "eq":
          return fieldValue === filter.value;
        case "neq":
          return fieldValue !== filter.value;
        case "in":
          return Array.isArray(filter.value) && filter.value.includes(fieldValue);
        case "notIn":
          return Array.isArray(filter.value) && !filter.value.includes(fieldValue);
        case "isNull":
          return fieldValue === null || fieldValue === undefined;
        case "isNotNull":
          return fieldValue !== null && fieldValue !== undefined;
        case "contains":
          return (
            typeof fieldValue === "string" &&
            typeof filter.value === "string" &&
            fieldValue.includes(filter.value)
          );
        case "lt":
          return (
            typeof fieldValue === "number" &&
            typeof filter.value === "number" &&
            fieldValue < filter.value
          );
        case "lte":
          return (
            typeof fieldValue === "number" &&
            typeof filter.value === "number" &&
            fieldValue <= filter.value
          );
        case "gt":
          return (
            typeof fieldValue === "number" &&
            typeof filter.value === "number" &&
            fieldValue > filter.value
          );
        case "gte":
          return (
            typeof fieldValue === "number" &&
            typeof filter.value === "number" &&
            fieldValue >= filter.value
          );
        default:
          return true;
      }
    }),
  );
}

/**
 * Build an ObjectSetResult from a pre-filtered collection, applying
 * limit and offset pagination.
 */
export function buildObjectSetResult<T extends OntologyObjectTypeId, O extends OntologyObject<T>>(
  objectType: T,
  objects: O[],
  query: Pick<OntologyObjectSetQuery<T>, "limit" | "offset">,
  queryId: string,
): OntologyObjectSetResult<T, O> {
  const offset = query.offset ?? 0;
  const limit = query.limit ?? objects.length;
  const page = objects.slice(offset, offset + limit);

  return {
    ok: true,
    objectType,
    objects: page,
    totalCount: objects.length,
    hasMore: offset + limit < objects.length,
    queryId,
    executedAt: new Date().toISOString(),
  };
}
