import { databaseSchema, type DatabaseColumnSchema, type DatabaseTableSchema } from "./schema";

function toSqlType(type: DatabaseColumnSchema["type"]): string {
  switch (type) {
    case "integer":
      return "INTEGER";
    case "real":
      return "REAL";
    case "boolean":
      return "BOOLEAN";
    case "json":
      return "JSON";
    case "timestamp":
      return "TIMESTAMP";
    case "text":
    default:
      return "TEXT";
  }
}

function formatColumn(column: DatabaseColumnSchema): string {
  const parts = [`${column.name} ${toSqlType(column.type)}`];

  if (column.primaryKey) {
    parts.push("PRIMARY KEY");
  }

  if (!column.nullable && !column.primaryKey) {
    parts.push("NOT NULL");
  }

  if (column.unique) {
    parts.push("UNIQUE");
  }

  if (column.defaultValue) {
    parts.push(`DEFAULT ${column.defaultValue}`);
  }

  if (column.references) {
    parts.push(`REFERENCES ${column.references.table}(${column.references.column})`);
  }

  return parts.join(" ");
}

export function createTableStatement(table: DatabaseTableSchema): string {
  const columns = table.columns.map((column) => `  ${formatColumn(column)}`).join(",\n");

  return `CREATE TABLE IF NOT EXISTS ${table.name} (\n${columns}\n);`;
}

export function createBootstrapSql(): string {
  return databaseSchema.map(createTableStatement).join("\n\n");
}

export const databaseBootstrap = {
  version: "0001_foundation",
  tables: databaseSchema,
  statements: databaseSchema.map(createTableStatement),
} as const;
