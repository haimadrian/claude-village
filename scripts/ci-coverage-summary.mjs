#!/usr/bin/env node
// Emit a readable coverage summary as GitHub-flavoured markdown. Prints to
// stdout; CI appends the output to `$GITHUB_STEP_SUMMARY` so it shows on the
// workflow run page.

import fs from "node:fs";

const summaryPath = "reports/coverage/coverage-summary.json";
if (!fs.existsSync(summaryPath)) {
  // No coverage file - probably running without CI=true. Exit quietly.
  process.exit(0);
}

const { total } = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

// Friendly labels and a consistent order. `branchesTrue` is a synthetic
// v8 metric that often hits 100% and adds noise, so skip it.
const rows = [
  ["Lines", total.lines],
  ["Statements", total.statements],
  ["Functions", total.functions],
  ["Branches", total.branches]
];

const badge = (pct) => {
  if (pct >= 80) return "🟢";
  if (pct >= 60) return "🟡";
  if (pct >= 30) return "🟠";
  return "🔴";
};

const bar = (pct) => {
  const filled = Math.round(pct / 5); // 20-cell bar
  return "█".repeat(filled) + "░".repeat(20 - filled);
};

const fmt = (n) => `${n.toFixed(1)}%`;
const ratio = (m) => (m.total === 0 ? "" : ` (${m.covered} / ${m.total})`);

const lines = [];
lines.push("## Unit test coverage");
lines.push("");
lines.push("| Metric | Coverage | Progress | |");
lines.push("| ------ | -------- | -------- | - |");
for (const [label, m] of rows) {
  lines.push(`| **${label}** | ${fmt(m.pct)}${ratio(m)} | \`${bar(m.pct)}\` | ${badge(m.pct)} |`);
}
lines.push("");
lines.push(
  "_Thresholds_: 🟢 >= 80%  |  🟡 >= 60%  |  🟠 >= 30%  |  🔴 < 30%"
);
lines.push("");
lines.push(
  "Download the `coverage-report` artifact from this run to browse the per-file HTML report."
);

process.stdout.write(lines.join("\n") + "\n");
