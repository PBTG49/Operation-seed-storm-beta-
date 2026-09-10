# Rootline — V1

A static, GitHub-Pages-ready prototype for a community ecological planting guide.

## What's included

- Home / landing page
- Explore page with a replaceable map placeholder
- Guides page powered by `data/data.json`
- Impact dashboard with placeholder stats
- Projects directory powered by `data/data.json`
- Planting report form (local-browser demo only)
- About / principles page
- Responsive mobile-first styling
- Modular CSS and JS so the visual system can be changed without rewriting content

## How to edit the visual design

Most visual changes live in:

- `css/style.css` — colors, typography, spacing, cards, layout, responsive rules
- HTML files — page structure/text
- `js/main.js` — interactions and data rendering
- `data/data.json` — region/species/project content

## Later upgrades

1. Replace the map placeholder with Leaflet + GeoJSON.
2. Replace the placeholder region/species records with the expert-reviewed dataset.
3. Connect the report form to a backend such as Supabase.
4. Add moderation/verification and public impact aggregation.

## GitHub Pages

Push this folder to a GitHub repository and enable Pages from the `main` branch, root folder. This is a static site and requires no server process.
