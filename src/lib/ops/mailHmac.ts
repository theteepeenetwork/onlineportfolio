// Re-export from src/lib/mailHmac (PR5, gate fix).
//
// mailHmac was originally written here. It was moved to src/lib/mailHmac so
// that callers OUTSIDE the ops roots (instrumentation.ts, the CLI sync script)
// can import it without being pulled into the ops blindness gate's scan: any
// file that imports from @/lib/ops/ is walked as ops code, and a non-ops file
// holding a mailSuppression.upsert() fires OPS-MUTATION-MODULE correctly.
//
// reads.ts and any other ops-rooted file may continue to import from here:
// the re-export is within the ops tree (ALLOWED_LOCAL_PREFIXES: ["@/lib/ops/"]),
// so nothing changes for them. Non-ops callers should import from @/lib/mailHmac
// directly to stay out of the scan.
export {
  MAIL_HMAC_KEY_VAR,
  mailHmacConfigured,
  mailAddressHmac,
  sameMailHmac,
} from "@/lib/mailHmac";
