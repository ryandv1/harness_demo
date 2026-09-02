/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module — keep it external so Next/Turbopack doesn't
  // try to bundle it. (Renamed from experimental.serverComponentsExternalPackages
  // to the top-level serverExternalPackages in Next 15.)
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
