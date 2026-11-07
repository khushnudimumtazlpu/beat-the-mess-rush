
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  serverExternalPackages: ["mongodb"],

  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
