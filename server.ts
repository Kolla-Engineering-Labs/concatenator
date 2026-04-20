import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { rateLimit } from "express-rate-limit";
import { logger } from "./src/lib/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const ignoreListLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const staticFileLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // API Routes
  const DEFAULT_IGNORE_FILE_PATH = path.join(process.cwd(), ".concatenate-ignore");
  // Safe base directory for worker-specific ignore files (CodeQL: js/path-injection prevention)
  const IGNORE_FILES_DIR = path.resolve(process.cwd(), "temp_ignore_files");

  // Ensure the temp_ignore_files directory exists
  try {
    mkdirSync(IGNORE_FILES_DIR, { recursive: true });
  } catch (err) {
    logger.error("Failed to create ignore files directory:", err);
  }

  /**
   * Sanitize workerId to prevent path injection attacks.
   * Only numeric digits are allowed (since it's a workerIndex from Playwright).
   * CodeQL: https://codeql.github.com/codeql-query-help/javascript/js-path-injection/
   */
  const sanitizeWorkerId = (workerId: string | undefined): string | null => {
    if (!workerId) return null;
    // Validate only numeric digits allowed
    if (!/^\d+$/.test(workerId)) {
      return null;
    }
    return workerId;
  };

  /**
   * Get safe ignore file path with strict validation.
   * Throws error if path traversal detected. Falls back to default if workerId invalid.
   * CodeQL: js/path-injection prevention
   */
  const getIgnoreFilePath = (workerId: string | undefined): string => {
    const sanitizedId = sanitizeWorkerId(workerId);
    if (sanitizedId) {
      const fileName = `.concatenate-ignore-worker-${sanitizedId}`;
      const resolvedPath = path.join(IGNORE_FILES_DIR, fileName);
      // Final guard: throw if path traversal occurred
      if (!resolvedPath.startsWith(IGNORE_FILES_DIR + path.sep)) {
        throw new Error(`Path traversal detected: ${resolvedPath}`);
      }
      return resolvedPath;
    }
    // Fallback to default ignore file if workerId is missing or invalid
    return process.env.CONCATENATE_IGNORE_FILE_PATH
      ? path.resolve(process.env.CONCATENATE_IGNORE_FILE_PATH)
      : DEFAULT_IGNORE_FILE_PATH;
  };

  // Only apply rate limiting in production (skip for E2E tests)
  if (process.env.NODE_ENV === "production") {
    app.use("/api/ignore-list", ignoreListLimiter);
  }

  app.get("/api/ignore-list", async (req, res) => {
    const workerId = req.headers["x-worker-id"] as string | undefined;
    let ignoreFilePath: string;
    try {
      ignoreFilePath = getIgnoreFilePath(workerId);
    } catch (err) {
      return res.status(400).json({ error: "Invalid worker ID" });
    }
    try {
      const content = await fs.readFile(ignoreFilePath, "utf-8");
      const list = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
      res.json(list);
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
      ) {
        // If file doesn't exist, return default list
        return res.json(["node_modules", ".git", ".DS_Store", "dist", ".next"]);
      }
      logger.error("Error reading ignore file:", error);
      res.status(500).json({ error: "Failed to read ignore list" });
    }
  });

  app.post("/api/ignore-list", async (req, res) => {
    const workerId = req.headers["x-worker-id"] as string | undefined;
    let ignoreFilePath: string;
    try {
      ignoreFilePath = getIgnoreFilePath(workerId);
    } catch (err) {
      return res.status(400).json({ error: "Invalid worker ID" });
    }
    try {
      const list = req.body;
      if (!Array.isArray(list)) {
        return res.status(400).json({ error: "Invalid ignore list format" });
      }
      const content = list.join("\n");
      await fs.writeFile(ignoreFilePath, content, "utf-8");
      res.json({ success: true });
    } catch (error) {
      logger.error("Error writing ignore file:", error);
      res.status(500).json({ error: "Failed to update ignore list" });
    }
  });

  // Test-only endpoint to reset ignore list to defaults
  if (process.env.NODE_ENV !== "production") {
    app.delete("/api/ignore-list", async (req, res) => {
      const workerId = req.headers["x-worker-id"] as string | undefined;
      let ignoreFilePath: string;
      try {
        ignoreFilePath = getIgnoreFilePath(workerId);
      } catch (err) {
        return res.status(400).json({ error: "Invalid worker ID" });
      }
      // Only allow deletion of worker-specific files (not the default)
      if (ignoreFilePath === DEFAULT_IGNORE_FILE_PATH) {
        return res.status(400).json({ error: "Cannot delete default ignore file" });
      }
      try {
        await fs.unlink(ignoreFilePath).catch(() => {});
        res.json({ success: true });
      } catch (error) {
        logger.error("Error resetting ignore file:", error);
        res.status(500).json({ error: "Failed to reset ignore list" });
      }
    });
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: true,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", staticFileLimiter, (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
