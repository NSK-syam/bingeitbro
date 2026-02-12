import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Keep default cache behavior (no required R2 binding).
// If you later want persistent ISR cache across deploys/regions,
// add R2 incremental cache and the matching wrangler r2_buckets binding.
export default defineCloudflareConfig();
