/** @type {import('next').NextConfig} */
const nextConfig = {
  // Users and Groups used to be two pages; keep old links and bookmarks working.
  async redirects() {
    return [
      { source: "/dashboard/sophos-users", destination: "/dashboard/sophos", permanent: true },
      { source: "/dashboard/sophos-groups", destination: "/dashboard/sophos?tab=groups", permanent: true },
    ];
  },
};

export default nextConfig;
