import type { MetadataRoute } from "next";
import { isBetaEnvironment } from "@/lib/beta-safety";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (isBetaEnvironment()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/catalog/", "/legal/"],
      disallow: ["/api/", "/admin/", "/dashboard/", "/login", "/register", "/beta-access"],
    },
  };
}
