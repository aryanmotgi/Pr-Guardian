// validateWithOpsera — a DevSecOps compliance gate that runs RIGHT BEFORE merge.
//
//   closeLoop: fix received → validateWithOpsera({ pr, result })
//                              ├─ { passed: true }  → proceed to merge
//                              └─ { passed: false } → skip merge, escalate
//
// HONESTY NOTE (CLAUDE.md): Opsera is an MCP server, not a documented REST API.
// What the docs CONFIRM:
//   - server: name "opsera", type streamable-http, https://mcp.opsera.io/mcp
//     (docs example also shows https://agent.opsera.ai/mcp; tenant URLs vary)
//   - auth:   Authorization: Bearer <token>  (token = Profile → Access Tokens)
//   - agents: Security, Compliance, Architecture, SQL
// What the docs DO NOT confirm (so we do NOT fabricate it):
//   - an MCP tool literally named "compliance-audit", its input params, or its
//     response JSON shape. "/mcp.opsera.compliance-audit" is an IDE slash-command
//     example, not a documented programmatic tool.
//
// Therefore the REAL call is a single clearly-marked stub behind a transport
// seam (_setOpseraTransport) — the same pattern as github._setOctokit and
// slack._setFetch. By default the gate runs a SIMULATED scan so it works with
// zero creds. Drop the verified MCP tool-call into opseraMcpScan() once the
// server is connected and `tools/list` confirms the real tool name + schema.

import { config } from "./config.js";

// Test/integration seam: inject a transport that takes ({ pr, result, apiKey,
// url }) and returns { passed, findings }. Pass null to restore the default.
let _transport = null;
export function _setOpseraTransport(fn) {
  _transport = fn || null;
}

// Run the compliance gate on a produced fix.
//   input:  { pr, result }   (the same contract closeLoop receives)
//   output: { passed: boolean, findings: Array, skipped?: boolean, source }
//
// Never throws on a "fail" — a failed scan is a normal outcome (→ escalate).
// It DOES throw in live mode if OPSERA_API_KEY is missing (fail loudly).
export async function validateWithOpsera({ pr, result } = {}) {
  // Gate is opt-in. When off, it's a transparent pass so the core loop and the
  // existing tests are completely unaffected.
  if (!config.opsera.enabled) {
    return { passed: true, skipped: true, findings: [], source: "disabled" };
  }

  const transport = _transport || defaultTransport;
  const apiKey = config.opsera.apiKey;
  const url = config.opsera.url;

  // Live mode requires a real token — fail loudly rather than silently passing.
  if (!config.dryRun && !_transport) {
    if (!apiKey) {
      throw new Error(
        "OPSERA_API_KEY is not set — cannot run the Opsera compliance gate in live " +
          "mode. Set it in your env (do not commit it), or run in dry-run (which " +
          "uses a simulated scan)."
      );
    }
  }

  const out = await transport({ pr, result, apiKey, url });
  // Normalise so callers can always trust the shape.
  return {
    passed: Boolean(out?.passed),
    findings: Array.isArray(out?.findings) ? out.findings : [],
    source: out?.source || "opsera",
  };
}

// Default transport: in dry-run (no creds) → a SIMULATED scan so demos run.
// In live mode → the real (stubbed) MCP call. Tests inject their own transport.
async function defaultTransport(args) {
  if (config.dryRun) return simulateScan(args);
  return opseraMcpScan(args);
}

// A realistic fake so the whole gate — and BOTH branches — are demoable with no
// creds. Passes by default; OPSERA_SIM_FAIL=true makes it flag a finding.
function simulateScan({ pr }) {
  if (config.opsera.simulateFail) {
    const file = pr?.violation?.file || "the changed file";
    return {
      passed: false,
      source: "opsera (simulated)",
      findings: [
        {
          id: "OPSERA-SIM-001",
          severity: "high",
          framework: "SOC2",
          rule: "Sensitive data must not reach logs",
          file,
          message: `Opsera Compliance Agent flagged a residual issue in ${file} — the fix needs human review before merge.`,
        },
      ],
    };
  }
  return { passed: true, source: "opsera (simulated)", findings: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE REAL CALL — not yet wired. Do NOT guess the tool name/params/shape.
//
// To implement (once the Opsera MCP server is connected + token is in hand):
//   1. Open a streamable-http MCP session to config.opsera.url with header
//      `Authorization: Bearer ${apiKey}` (VERIFIED auth method).
//   2. `tools/list` to discover the real Compliance-Agent tool name + input
//      schema (the docs do NOT pin "compliance-audit" down — confirm at runtime).
//   3. `tools/call` with the fix's diff/files, map the response to
//      { passed, findings }.
// Until then this throws so nothing fabricated ever runs in live mode.
// ─────────────────────────────────────────────────────────────────────────────
async function opseraMcpScan() {
  // ASSUMPTION-FREE on purpose: refuse rather than invent an endpoint/shape.
  throw new Error(
    "Opsera live MCP scan is not wired yet. Connect the Opsera MCP server, " +
      "confirm the Compliance tool name via tools/list, then implement " +
      "opseraMcpScan() in src/opsera.js — or inject a transport with " +
      "_setOpseraTransport(fn). (Auth is verified: Authorization: Bearer <OPSERA_API_KEY>.)"
  );
}
