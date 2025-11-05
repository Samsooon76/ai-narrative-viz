import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const rawBasePath = env.VITE_BASE_PATH || "/";

  const normalizedBasePath = (() => {
    if (rawBasePath === "/") {
      return "/";
    }

    let value = rawBasePath.trim();

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    if (!value.endsWith("/")) {
      value = `${value}/`;
    }

    return value;
  })();

  return {
    base: normalizedBasePath,
    server: {
      host: "::",
      port: 8080,
      proxy: {
        "/imagine-api": {
          target: "http://localhost:8055",
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/imagine-api/, ""),
        },
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
