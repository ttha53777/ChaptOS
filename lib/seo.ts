// Absolute site origin for metadata, canonical links, the sitemap and JSON-LD.
//
// ROOT_DOMAIN defaults to "localhost" so dev never assumes a domain it doesn't
// own (see lib/domains.ts). Search engines need an absolute URL either way, so
// anything that would resolve to localhost falls back to the real product
// domain instead of publishing "http://localhost" into a sitemap.
import { ROOT_DOMAIN } from "@/lib/domains";

export const SITE_URL =
  ROOT_DOMAIN === "localhost" || ROOT_DOMAIN.endsWith(".localhost")
    ? "https://chaptos.com"
    : `https://${ROOT_DOMAIN}`;
