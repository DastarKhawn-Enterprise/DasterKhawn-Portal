/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@sat-sys/pos-ui",
    "@sat-sys/supabase-client",
    "@sat-sys/gateway-sdk",
    "@sat-sys/ui",
  ],
};
module.exports = nextConfig;
