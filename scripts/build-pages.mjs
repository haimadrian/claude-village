#!/usr/bin/env node
// Builds a comprehensive GitHub Pages site for claude-village:
//   _pages/index.html            - project home with sidebar
//   _pages/docs/<slug>.html      - rendered docs with the same sidebar
//   _pages/reports/unit/         - Vitest HTML report (copied verbatim)
//   _pages/reports/coverage/     - v8 coverage HTML
//   _pages/reports/e2e/          - Playwright HTML report
//   _pages/assets/style.css      - shared stylesheet
//
// Each in-site page shares a collapsible-friendly sidebar. The report
// directories keep their own native layout (we just link into them).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "_pages");

function rimraf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
  return true;
}

rimraf(out);
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(out, "docs"), { recursive: true });
fs.mkdirSync(path.join(out, "reports"), { recursive: true });
fs.mkdirSync(path.join(out, "assets"), { recursive: true });

// Docs catalog - drives the sidebar and page generation.
const docs = [
  { slug: "install", title: "Install", source: "docs/install.md" },
  { slug: "usage", title: "Usage", source: "docs/usage.md" },
  { slug: "development", title: "Development", source: "docs/development.md" },
  { slug: "design", title: "Design spec", source: "docs/design/2026-04-20-claude-village-design.md" },
  { slug: "plan", title: "Implementation plan", source: "docs/plans/2026-04-20-claude-village-plan.md" },
  { slug: "progress", title: "Progress", source: "docs/progress.md" }
];

// --- Shared layout ----------------------------------------------------------

const css = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
  background: #0e1a0e;
  color: #e6ecd9;
  line-height: 1.55;
}
a { color: #8fd9a8; text-decoration: none; }
a:hover { text-decoration: underline; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
code { background: rgba(255, 255, 255, 0.08); padding: 1px 5px; border-radius: 3px; font-size: 0.92em; }
pre { background: #152215; padding: 14px 18px; border-radius: 6px; overflow: auto; border: 1px solid #253625; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; margin: 12px 0; }
th, td { border: 1px solid #2a3b2a; padding: 6px 10px; text-align: left; }
th { background: #18251a; }
blockquote { border-left: 3px solid #3b6b3b; margin: 0; padding: 2px 16px; color: #c9d1ba; background: #132013; }
h1, h2, h3, h4 { color: #f1f5e8; }
h1 { font-size: 28px; margin-top: 0; }
h2 { margin-top: 36px; border-bottom: 1px solid #253625; padding-bottom: 6px; }

.layout { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
aside.nav {
  background: #101c10;
  border-right: 1px solid #1f2d1f;
  padding: 20px 16px;
  position: sticky; top: 0; max-height: 100vh; overflow: auto;
}
aside.nav .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
aside.nav .brand .mark { font-size: 22px; }
aside.nav .brand strong { font-size: 16px; color: #f1f5e8; }
aside.nav h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #7fa380; margin: 18px 0 6px; }
aside.nav ul { list-style: none; padding: 0; margin: 0; }
aside.nav li { margin: 2px 0; }
aside.nav a { display: block; padding: 6px 10px; border-radius: 5px; color: #cfe0bf; }
aside.nav a:hover { background: #17241a; text-decoration: none; }
aside.nav a.active { background: #22372a; color: #eaf5dd; }
aside.nav .ext::after { content: " \u2197"; opacity: 0.6; }

main.content { padding: 40px 56px; max-width: 920px; }
main.content img { max-width: 100%; }

.hero {
  background: linear-gradient(135deg, #18301f 0%, #0e1a0e 100%);
  padding: 36px 40px;
  border-radius: 10px;
  border: 1px solid #223424;
  margin-bottom: 28px;
}
.hero .tagline { font-size: 16px; color: #cfe0bf; max-width: 640px; }

.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-top: 18px; }
.card {
  display: block;
  background: #132013;
  border: 1px solid #223424;
  border-radius: 8px;
  padding: 16px 18px;
  color: inherit;
}
.card:hover { background: #182a1a; text-decoration: none; border-color: #2f4a31; }
.card .title { font-weight: 600; color: #f1f5e8; margin-bottom: 4px; }
.card .desc { font-size: 13px; color: #a7bca1; }

@media (max-width: 760px) {
  .layout { grid-template-columns: 1fr; }
  aside.nav { position: static; max-height: none; }
  main.content { padding: 24px; }
}
`;

fs.writeFileSync(path.join(out, "assets", "style.css"), css.trim() + "\n");

// `root` is the relative prefix from the current page back to the site root
// (e.g. "" for index.html, "../" for docs/<slug>.html). We use relative URLs
// throughout because the site is deployed under a project subpath
// (`/claude-village/`), not at the domain root.
function sidebar(currentSlug, root) {
  const cls = (slug) => (slug === currentSlug ? "active" : "");
  const docsLinks = docs
    .map(
      (d) =>
        `        <li><a class="${cls(d.slug)}" href="${root}docs/${d.slug}.html">${d.title}</a></li>`
    )
    .join("\n");
  return `
  <aside class="nav">
    <div class="brand"><span class="mark">\u{1F9F1}</span><strong>claude-village</strong></div>
    <h4>Project</h4>
    <ul>
      <li><a class="${cls("home")}" href="${root}index.html">Home</a></li>
    </ul>
    <h4>Docs</h4>
    <ul>
${docsLinks}
    </ul>
    <h4>CI reports</h4>
    <ul>
      <li><a href="${root}reports/unit/index.html">Unit tests</a></li>
      <li><a href="${root}reports/coverage/index.html">Coverage</a></li>
      <li><a href="${root}reports/e2e/index.html">E2E (Playwright)</a></li>
    </ul>
    <h4>Source</h4>
    <ul>
      <li><a class="ext" href="https://github.com/haimadrian/claude-village" target="_blank" rel="noopener">GitHub</a></li>
      <li><a class="ext" href="https://github.com/haimadrian/claude-village/releases" target="_blank" rel="noopener">Releases</a></li>
    </ul>
  </aside>`;
}

function page({ title, slug, body, root }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title} \u00b7 claude-village</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="${root}assets/style.css" />
</head>
<body>
<div class="layout">
${sidebar(slug, root)}
  <main class="content">
${body}
  </main>
</div>
</body>
</html>
`;
}

// --- Home page --------------------------------------------------------------

const homeBody = `
  <section class="hero">
    <h1>claude-village</h1>
    <p class="tagline">A Mac desktop app that visualizes running Claude Code sessions as an animated Minecraft-style village. Each session is a tab. Each agent is a voxel character walking between themed zones based on the tool it is using right now - reading files in the library, writing code in the office, searching in the mine, running tests on the farm, committing in the nether portal, and so on.</p>
  </section>

  <h2>Get going</h2>
  <div class="cards">
    <a class="card" href="docs/install.html"><div class="title">\u2b07 Install</div><div class="desc">Download the .dmg, drag to Applications, run the Gatekeeper unlock.</div></a>
    <a class="card" href="docs/usage.html"><div class="title">\ud83c\udfae Usage</div><div class="desc">Tabs, zones, tooltips, timeline, settings - how to drive the app.</div></a>
    <a class="card" href="docs/development.html"><div class="title">\ud83d\udee0 Development</div><div class="desc">Clone, install, dev loop, test, build, package.</div></a>
  </div>

  <h2>Under the hood</h2>
  <div class="cards">
    <a class="card" href="docs/design.html"><div class="title">\ud83d\udcd0 Design spec</div><div class="desc">Architecture, data flow, zones, animations, tooltips.</div></a>
    <a class="card" href="docs/plan.html"><div class="title">\ud83d\udccb Implementation plan</div><div class="desc">The 17 tasks that built the app.</div></a>
    <a class="card" href="docs/progress.html"><div class="title">\u2705 Progress</div><div class="desc">Live status of tasks, tech debt, lessons learned.</div></a>
  </div>

  <h2>CI reports</h2>
  <div class="cards">
    <a class="card" href="reports/unit/index.html"><div class="title">\ud83e\uddea Unit tests</div><div class="desc">Vitest HTML report from the latest main build.</div></a>
    <a class="card" href="reports/coverage/index.html"><div class="title">\ud83d\udcca Coverage</div><div class="desc">V8 coverage - line, statement, branch, function.</div></a>
    <a class="card" href="reports/e2e/index.html"><div class="title">\ud83c\udfad E2E</div><div class="desc">Playwright HTML report (runs against the real packaged app).</div></a>
  </div>

  <h2>Credits</h2>
  <p>Created by Haim Adrian for Claude Code users.</p>
`;

fs.writeFileSync(
  path.join(out, "index.html"),
  page({ title: "Home", slug: "home", body: homeBody, root: "" })
);

// --- Rendered docs ----------------------------------------------------------

marked.use({ gfm: true, breaks: false });

function rewriteLinks(html) {
  // Turn internal markdown links (docs/install.md, plans/foo.md, design/bar.md,
  // ./progress.md, etc.) into same-directory Pages links. Leave external URLs alone.
  return html.replace(/href="([^"]+)"/g, (full, href) => {
    if (/^https?:/.test(href)) return `href="${href}" target="_blank" rel="noopener"`;
    if (href.startsWith("#")) return full;
    const match = docs.find((d) => href.endsWith(d.source) || href.endsWith(`${d.slug}.md`));
    if (match) return `href="${match.slug}.html"`;
    return full;
  });
}

for (const d of docs) {
  const src = path.join(root, d.source);
  if (!fs.existsSync(src)) {
    console.warn(`[build-pages] missing ${d.source}, skipping`);
    continue;
  }
  const md = fs.readFileSync(src, "utf8");
  const html = rewriteLinks(marked.parse(md));
  fs.writeFileSync(
    path.join(out, "docs", `${d.slug}.html`),
    page({ title: d.title, slug: d.slug, body: html, root: "../" })
  );
}

// --- Reports ----------------------------------------------------------------

const copied = {
  unit: copyDir(path.join(root, "reports/unit-html"), path.join(out, "reports/unit")),
  coverage: copyDir(path.join(root, "reports/coverage"), path.join(out, "reports/coverage")),
  e2e: copyDir(path.join(root, "playwright-report"), path.join(out, "reports/e2e"))
};

// Placeholder landing pages if a report wasn't produced this run.
const placeholder = (title) =>
  page({
    title,
    slug: "home",
    body: `<h1>${title}</h1><p>No ${title.toLowerCase()} was produced in this run.</p><p><a href="../../index.html">\u2190 Back to home</a></p>`,
    root: "../../"
  });
if (!copied.unit) {
  fs.mkdirSync(path.join(out, "reports/unit"), { recursive: true });
  fs.writeFileSync(path.join(out, "reports/unit/index.html"), placeholder("Unit tests report"));
}
if (!copied.coverage) {
  fs.mkdirSync(path.join(out, "reports/coverage"), { recursive: true });
  fs.writeFileSync(path.join(out, "reports/coverage/index.html"), placeholder("Coverage report"));
}
if (!copied.e2e) {
  fs.mkdirSync(path.join(out, "reports/e2e"), { recursive: true });
  fs.writeFileSync(path.join(out, "reports/e2e/index.html"), placeholder("E2E report"));
}

console.log(`[build-pages] wrote site to ${out}`);
console.log(`  docs rendered: ${docs.length}`);
console.log(`  reports present: ${Object.entries(copied).filter(([, v]) => v).map(([k]) => k).join(", ") || "(none)"}`);
