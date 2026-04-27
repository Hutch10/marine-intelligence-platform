import { getRepositoryData } from "../services/explorer-service";

function toCSV(results: any[]): string {
  if (!results.length) return "";
  const keys = Object.keys(results[0]);
  const escape = (v: any) => `"${String(v).replace(/"/g, '""')}`;
  return [
    keys.join(","),
    ...results.map((row) => keys.map((k) => escape(row[k])).join(",")),
  ].join("\n");
}

export default async function handler(req: any, res: any) {
  if (req.method === "POST") {
    try {
      const { filters, limit, format } = req.body || {};
      const { results, metadata } = await getRepositoryData(filters, limit);
      if (format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=explorer-export.csv");
        res.status(200).send(toCSV(results));
      } else {
        res.setHeader("Content-Type", "application/json");
        res.status(200).json({ results, metadata });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to export explorer data", detail: String(err) });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}

export const config = {
  api: {
    bodyParser: true,
  },
};
