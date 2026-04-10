import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  const IGNORE_FILE_PATH = path.join(process.cwd(), ".concatenate-ignore");

  app.get("/api/ignore-list", async (req, res) => {
    try {
      try {
        await fs.access(IGNORE_FILE_PATH);
      } catch {
        // If file doesn't exist, return default list
        return res.json(['node_modules', '.git', '.DS_Store', 'dist', '.next']);
      }
      const content = await fs.readFile(IGNORE_FILE_PATH, "utf-8");
      const list = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
      res.json(list);
    } catch (error) {
      console.error("Error reading ignore file:", error);
      res.status(500).json({ error: "Failed to read ignore list" });
    }
  });

  app.post("/api/ignore-list", async (req, res) => {
    try {
      const list = req.body;
      if (!Array.isArray(list)) {
        return res.status(400).json({ error: "Invalid ignore list format" });
      }
      const content = list.join("\n");
      await fs.writeFile(IGNORE_FILE_PATH, content, "utf-8");
      console.log(`Successfully updated .concatenate-ignore with ${list.length} items`);
      res.json({ success: true });
    } catch (error) {
      console.error("Error writing ignore file:", error);
      res.status(500).json({ error: "Failed to update ignore list" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
