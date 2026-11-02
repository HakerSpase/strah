import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";

// только для разработки: сохранение кадров трейлера (?trailer) на диск
const trailerFrames = {
  name: "trailer-frames",
  configureServer(server) {
    server.middlewares.use("/__frame", (req, res) => {
      const u = new URL(req.url, "http://x");
      const shot = (u.searchParams.get("shot") || "x").replace(/[^\w-]/g, "");
      const i = String(+u.searchParams.get("i") || 0).padStart(5, "0");
      const dir = path.resolve("trailer/frames", shot);
      fs.mkdirSync(dir, { recursive: true });
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => { fs.writeFileSync(path.join(dir, i + ".jpg"), Buffer.concat(chunks)); res.end("ok"); });
    });
  },
};

// host: true — игру можно открыть с телефона в той же Wi-Fi сети
export default defineConfig({
  plugins: [trailerFrames],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { chunkSizeWarningLimit: 6000 },
});
