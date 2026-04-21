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

// Copy the static screenshots into the Pages bundle so the home page can
// reference them under `assets/screenshots/`.
const screenshotsSrc = path.join(root, "docs/assets/screenshots");
if (fs.existsSync(screenshotsSrc)) {
  copyDir(screenshotsSrc, path.join(out, "assets", "screenshots"));
}

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
/* --- Palette (blue, deliberately restful) ------------------------------- */
:root {
  --bg:          #0b1220;
  --bg-elev:    #0f1a2e;
  --panel:      #101c35;
  --panel-2:    #132240;
  --border:     #1f2e4a;
  --border-str: #2a3f66;
  --text:       #e6eef9;
  --text-mute:  #9fb3cf;
  --text-soft:  #7b8da9;
  --accent:     #7cc4ff;
  --accent-h:   #a5d7ff;
  --active-bg:  #1b3561;
  --hover-bg:   #15223e;
  --hero-from:  #1a3a78;
  --hero-to:    #0b1220;
  --shadow:     0 10px 40px rgba(0, 0, 0, 0.6);
}

*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; overflow-x: hidden; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  word-wrap: break-word;
}
a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent-h); text-decoration: underline; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
code { background: rgba(124, 196, 255, 0.12); color: #dfeeff; padding: 1px 5px; border-radius: 3px; font-size: 0.92em; word-break: break-word; }
pre { background: var(--panel-2); color: #dfeeff; padding: 14px 18px; border-radius: 8px; overflow: auto; border: 1px solid var(--border); -webkit-overflow-scrolling: touch; }
pre code { background: none; padding: 0; word-break: normal; color: inherit; }
table { border-collapse: collapse; margin: 12px 0; width: 100%; display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
th, td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; }
th { background: var(--panel); }
blockquote { border-left: 3px solid var(--accent); margin: 0; padding: 2px 16px; color: var(--text-mute); background: var(--panel); border-radius: 0 6px 6px 0; }
h1, h2, h3, h4 { color: #f2f7ff; }
h1 { font-size: 30px; margin-top: 0; line-height: 1.2; letter-spacing: -0.01em; }
h2 { margin-top: 36px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
img { max-width: 100%; height: auto; }

/* Screenshot gallery on the home page */
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 18px;
  margin: 18px 0 28px;
}
.gallery .shot {
  margin: 0;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.gallery .shot img {
  display: block;
  width: 100%;
  height: auto;
  border-bottom: 1px solid var(--border);
}
.gallery .shot figcaption {
  padding: 10px 14px;
  color: var(--text-mute);
  font-size: 13.5px;
  line-height: 1.4;
}

/* --- Structural layout --------------------------------------------------- */

/* Hidden checkbox drives the mobile drawer via CSS-only sibling selectors.
   Lives at the top of <body>; the sidebar (also a top-level sibling)
   is matched by .nav-toggle:checked ~ aside.nav below. */
.nav-toggle { position: absolute; left: -9999px; opacity: 0; }

.topbar {
  display: none;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 20;
}
.topbar .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; color: #f2f7ff; }
.topbar .brand .mark { font-size: 20px; }
.nav-toggle-label {
  display: none;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  color: var(--text-mute);
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  -webkit-user-select: none;
  user-select: none;
}
.nav-toggle-label:hover { background: var(--hover-bg); color: var(--text); }

aside.nav {
  position: fixed;
  top: 0; left: 0;
  width: 260px; height: 100vh;
  background: var(--panel);
  border-right: 1px solid var(--border);
  padding: 22px 18px;
  overflow: auto;
  z-index: 40;
}
aside.nav .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 22px; }
aside.nav .brand .mark { font-size: 22px; }
aside.nav .brand strong { font-size: 16px; color: #f2f7ff; }
aside.nav h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-soft); margin: 20px 0 6px; }
aside.nav ul { list-style: none; padding: 0; margin: 0; }
aside.nav li { margin: 2px 0; }
aside.nav a { display: block; padding: 8px 10px; border-radius: 6px; color: var(--text-mute); font-size: 14px; }
aside.nav a:hover { background: var(--hover-bg); color: var(--text); text-decoration: none; }
aside.nav a.active { background: var(--active-bg); color: #f2f7ff; }
aside.nav .ext::after { content: " \u2197"; opacity: 0.6; }

.nav-backdrop { display: none; }

main.content {
  margin-left: 260px;
  padding: 48px 56px;
  max-width: 980px;
  min-width: 0;
}

.hero {
  background: linear-gradient(135deg, var(--hero-from) 0%, var(--hero-to) 100%);
  padding: 40px 44px;
  border-radius: 12px;
  border: 1px solid var(--border-str);
  margin-bottom: 32px;
  box-shadow: var(--shadow);
}
.hero .tagline { font-size: 16px; color: #cfdcf0; max-width: 680px; line-height: 1.6; }

.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; margin-top: 18px; }
.card {
  display: block;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 18px 20px;
  color: inherit;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}
.card:hover {
  background: var(--bg-elev);
  text-decoration: none;
  border-color: var(--border-str);
  transform: translateY(-1px);
}
.card .title { font-weight: 600; color: #f2f7ff; margin-bottom: 6px; font-size: 15px; }
.card .desc { font-size: 13px; color: var(--text-mute); line-height: 1.5; }

/* --- Tablet + mobile ----------------------------------------------------- */

@media (max-width: 1024px) {
  main.content { padding: 36px 36px; }
  .hero { padding: 32px 28px; }
}

@media (max-width: 760px) {
  .topbar { display: flex; }
  .nav-toggle-label { display: inline-flex; align-items: center; }

  aside.nav {
    width: 82vw;
    max-width: 320px;
    transform: translateX(-102%);
    transition: transform 200ms ease;
    box-shadow: var(--shadow);
  }
  .nav-toggle:checked ~ aside.nav { transform: translateX(0); }
  .nav-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(3, 8, 20, 0.6);
    backdrop-filter: blur(2px);
    z-index: 30;
  }
  .nav-toggle:checked ~ .nav-backdrop { display: block; }

  main.content {
    margin-left: 0;
    padding: 20px 16px;
    max-width: 100%;
  }
  .hero { padding: 24px 20px; border-radius: 10px; }
  .hero h1 { font-size: 24px; }
  .hero .tagline { font-size: 15px; }
  h2 { margin-top: 28px; }
  pre { padding: 12px 14px; font-size: 13px; }
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
  // Sidebar, backdrop, topbar, and main are all direct children of <body> so
  // the checkbox-hack mobile drawer's sibling selector (`.nav-toggle ~ aside`)
  // works without any JS.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title} \u00b7 claude-village</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="color-scheme" content="dark" />
<link rel="stylesheet" href="${root}assets/style.css" />
</head>
<body>
<input type="checkbox" id="nav-toggle" class="nav-toggle" aria-hidden="true" />
<header class="topbar">
  <div class="brand"><span class="mark">\u{1F9F1}</span> claude-village</div>
  <label for="nav-toggle" class="nav-toggle-label" aria-label="Open navigation">\u2630</label>
</header>
${sidebar(slug, root)}
<label for="nav-toggle" class="nav-backdrop" aria-hidden="true"></label>
<main class="content">
${body}
</main>
</body>
</html>
`;
}

// --- Home page --------------------------------------------------------------

const screenshots = [
  {
    src: "assets/screenshots/01-village-overview.png",
    alt: "Village overview",
    caption:
      "The village seen from orbit: nine tool-mapped zones on a round island, agents clustered by the zone they are using, boats cruising the sea, minor islands on the horizon."
  },
  {
    src: "assets/screenshots/02-island-detail.png",
    alt: "Grass and flowers on the island",
    caption:
      "Close look at the grass cap: scattered grass tufts and flowers, signposts in front of each zone, a cluster of agents standing beside the Spawner."
  },
  {
    src: "assets/screenshots/03-agents-at-office.png",
    alt: "Agents at the Office zone",
    caption:
      "Agents at the Office. Each character has a name label; the latest action shows as a speech bubble, and hovering opens a tooltip."
  },
  {
    src: "assets/screenshots/04-scene-panorama.png",
    alt: "Panorama view",
    caption:
      "Wide-angle view across the water - clouds overhead, boats sailing past, villagers on the shoreline."
  },
  {
    src: "assets/screenshots/05-underwater-view.png",
    alt: "Underwater atmosphere",
    caption:
      "Dive the camera below the waterline and the scene swaps to an underwater atmosphere: blue-teal fog, hidden sky, sandy seabed with rocks and seagrass, fish drifting past."
  },
  {
    src: "assets/screenshots/06-settings-hook-install.png",
    alt: "Settings dialog with hook installer",
    caption:
      "Install / Uninstall the Claude Code hook non-destructively from the Settings dialog, with a diff preview. Session filter and ghost-retirement timer live here too."
  },
  {
    src: "assets/screenshots/07-help-dialog.png",
    alt: "In-app help dialog",
    caption:
      "Built-in Help covers camera / mouse / keyboard controls and a live zones table pulled from the source."
  }
];

const screenshotsHtml = screenshots
  .map(
    (s) =>
      `<figure class="shot"><img src="${s.src}" alt="${s.alt}" loading="lazy" /><figcaption>${s.caption}</figcaption></figure>`
  )
  .join("\n    ");

const homeBody = `
  <section class="hero">
    <h1>claude-village</h1>
    <p class="tagline">A Mac desktop app that visualizes running Claude Code sessions as an animated Minecraft-style village. Each session is a tab. Each agent is a voxel character walking between themed zones based on the tool it is using right now - reading files in the library, writing code in the office, searching in the mine, running tests on the farm, committing in the nether portal, and so on.</p>
  </section>

  <h2>Screenshots</h2>
  <div class="gallery">
    ${screenshotsHtml}
  </div>

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
