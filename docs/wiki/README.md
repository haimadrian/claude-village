# Wiki pages

Ready-to-paste Markdown for the GitHub Wiki at https://github.com/haimadrian/claude-village/wiki.

Each file maps to one Wiki page. Filenames use `-` in place of spaces; GitHub renders them back as titles.

## How to publish

```bash
# Clone the wiki repo (separate from the main repo).
git clone git@github.com:haimadrian/claude-village.wiki.git

# Copy the pages in.
cp /path/to/claude-village/docs/wiki/*.md claude-village.wiki/

# Commit + push.
cd claude-village.wiki
git add .
git commit -m "Populate wiki from docs/"
git push
```

`_Sidebar.md` drives the sidebar nav; GitHub treats it specially. `Home.md` becomes the Wiki landing page.

These pages deliberately duplicate bits of the source docs under `docs/`. Keep `docs/` the source of truth and regenerate the Wiki when content drifts; the Wiki is a presentation surface, not a second codebase.
