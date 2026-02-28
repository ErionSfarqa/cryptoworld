import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ignoreDirs = new Set(["node_modules", "dist", ".git", ".vercel"]);

function collectHtmlEntries(dir, entries) {
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    if (ignoreDirs.has(item.name)) continue;

    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      collectHtmlEntries(fullPath, entries);
      continue;
    }

    if (item.isFile() && item.name.endsWith(".html")) {
      entries.push(fullPath);
    }
  }
}

const htmlEntries = [];
collectHtmlEntries(__dirname, htmlEntries);
htmlEntries.sort();

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: htmlEntries,
    },
  },
});
