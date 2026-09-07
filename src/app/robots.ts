import type { MetadataRoute } from "next";
import { isPublicSite } from "@/lib/indexability";

// Read APP_URL when the request arrives rather than when the image was built:
// a metadata route is cached by default (node_modules/next/dist/docs,
// 01-metadata/robots.md), and the whole point of this file is to answer
// differently in two deployments built from the same commit.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  // Staging, or anything else that is not the public site: keep the lot out.
  //
  // NOTHING IS NAMED HERE, and that is load-bearing. next.config.ts keeps the
  // operator area out of the index with an X-Robots-Tag header specifically
  // because writing "/ops" into a robots.txt would publish the path to anyone
  // who fetched it. A blanket disallow protects staging while naming nothing,
  // so that reasoning survives this file.
  if (!isPublicSite()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return { rules: { userAgent: "*", allow: "/" } };
}
