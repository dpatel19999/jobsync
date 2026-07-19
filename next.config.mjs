/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  devIndicators: false,
  // dictionary-de (German ATS-scoring wordlist, src/lib/ats/adapters/
  // de-dictionary.ts) reads its data files via
  // fs.readFile(new URL('index.dic', import.meta.url)) — Turbopack/webpack's
  // static analysis of that pattern rewrites import.meta.url in a way that
  // produces a URL instance Node's fs functions then reject ("path argument
  // must be of type string or an instance of Buffer or URL. Received an
  // instance of URL"), only surfacing the first time the action bundle
  // containing it is compiled. Excluding it from bundling lets Node's native
  // ESM loader resolve the real file:// URL unmodified.
  serverExternalPackages: ["dictionary-de"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
