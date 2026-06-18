import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("@ant-design/icons-svg")) {
            return "vendor-antd-icons";
          }

          if (
            id.includes("@ant-design/icons") ||
            id.includes("node_modules/antd/") ||
            id.includes("node_modules\\antd\\") ||
            id.includes("node_modules/rc-") ||
            id.includes("node_modules\\rc-") ||
            id.includes("@rc-component")
          ) {
            return "vendor-antd";
          }

          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules\\react\\") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules\\react-dom\\") ||
            id.includes("node_modules/react-router-dom/") ||
            id.includes("node_modules\\react-router-dom\\")
          ) {
            return "vendor-react";
          }

          return undefined;
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  }
});
