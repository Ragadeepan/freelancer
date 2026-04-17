import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function getPackageName(id) {
  const normalizedId = id.replace(/\\/g, "/");
  const nodeModulesPath = normalizedId.split("node_modules/")[1];
  if (!nodeModulesPath) return null;

  const segments = nodeModulesPath.split("/");
  if (segments[0].startsWith("@")) {
    return `${segments[0]}/${segments[1]}`;
  }
  return segments[0];
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          const pkg = getPackageName(id);
          if (!pkg) return;

          if (pkg === "react" || pkg === "react-dom") return "react";
          if (pkg === "react-router" || pkg === "react-router-dom") return "router";
          if (pkg === "firebase" || pkg.startsWith("@firebase/")) return "firebase";

          return `vendor-${pkg.replace("@", "").replace("/", "-")}`;
        }
      }
    }
  }
});
