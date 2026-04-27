import { getRepositoryData } from "../services/explorer-service";

// POST /v1/explorer/query
export default async function handler(req: any, res: any) {
  console.log("[v1-explorer] req.method:", req.method);
  console.log("[v1-explorer] req.body:", req.body);
  if (req.method === "POST") {
    try {
      const { filters, limit } = req.body || {};
      console.log("[v1-explorer] filters:", filters, "limit:", limit);
      console.log("[v1-explorer] calling getRepositoryData with filters:", filters, "limit:", limit);
      const results = await getRepositoryData(filters, limit);
      console.log("[v1-explorer] getRepositoryData returned:", results);
      res.status(200).json(results);
    } catch (err) {
      console.error("[v1-explorer] error:", err);
      res.status(500).json({ error: "Failed to fetch explorer data", detail: String(err) });
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
