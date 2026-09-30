# Development migration using GitHub Pages

User confirmed 2026-09-14: this is still development; retain GitHub Pages and do not require a new server.

- Map background: Protomaps regional OSM-derived static vector tiles, extracted from the newest available schema-4 archive in the official Protomaps build catalog (selected and recorded at build time), bbox 34.2,29.4,35.95,33.5, zoom 0–14. Higher display zoom uses overzoomed vector geometry. This is a dated snapshot, not live road updates.
- Build: GitHub Actions downloads only the regional subset, exports uncompressed XYZ files and hosts them with the site. Browsers never hotlink the planet archive or call CARTO, Esri or a public routing demo.
- Map renderer: MapLibre GL JS with the Leaflet binding; existing route, stops, recentering and driver overlays remain Leaflet objects. Light/dark styles use Hebrew labels. Satellite mode is removed.
- Prepared navigation data continue to load from the project's existing feed. Pages cannot run a live OSRM process. Manually uploaded GTFS has no automatic live routing fallback without an explicitly configured endpoint; this must remain visible as partial/unavailable instructions.
- The map export was locally measured at 23,937 tiles, 120,615,422 bytes, before code/font assets. The deployment checks total size below 900 MB. Pages has a 1 GB site limit and a 100 GB/month soft traffic limit; this is not an unlimited-scale commitment.
- No new server, paid plan, API account, or age-restricted hosted map service is required.

The workflow first builds a Pages artifact on the migration branch without replacing the live site. Merge only after the map and Hebrew labels are verified. A Pages deployment setting may need to select GitHub Actions if the existing site still enforces branch-only builds; do not report deployment success until the live URL is checked.

Licensing policy and intended-use checks remain mandatory. This migration resolves identified map-service dependencies, not all legal questions. GTFS feed-specific rights, speech voice provider terms and original application license remain unresolved. The site does not add driver tracking; infrastructure request logs are distinct and must not be described as nonexistent.

Sources: https://docs.protomaps.com/basemaps/downloads ; https://docs.protomaps.com/basemaps/maplibre ; https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

## Validation and limitation
All navigation regression tests and the static build passed on GitHub Actions. Regional tile extraction, font and style assets were generated successfully. The cloud browser has WebGL explicitly disabled, so full visual verification of the vector basemap could not be completed there. Unsupported WebGL now shows an unavailable-background message while preserving the route screen. Real-device map rendering remains to be checked; this is a development release.

## Archive availability fix (2026-09-23)

The previously pinned 20260913 archive returned HTTP 404 after upstream retention expired. The build now resolves an available schema-4 archive from the official catalog, keys the regional cache by that archive, records provenance in maps/source.json, and keeps extraction errors visible. Style 5.7.2 and all existing dependency versions remain pinned. Partial downloads are never promoted to the cache filename. No runtime hotlinking is added.
