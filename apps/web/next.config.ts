import path from "node:path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  transpilePackages: ["@relay/shared", "@relay/db", "@relay/formatters", "@relay/adapters"],
  images: {
    formats: ["image/avif", "image/webp"]
  }
}

export default nextConfig
