# Third-party license inventory

Reviewed 2026-09-14 against original publisher license files. This inventory covers
identified direct frontend dependencies; it is not a complete transitive audit.
Copies of the license notices are in licenses/.

| Component | Version / source | License | Notice |
|---|---|---|---|
| Leaflet | 1.9.4, github.com/Leaflet/Leaflet | BSD-2-Clause | licenses/Leaflet.txt |
| React and ReactDOM | 18.3.1, github.com/facebook/react | MIT | licenses/React.txt |
| Babel standalone | 7.29.0, github.com/babel/babel | MIT (project license; bundled dependencies need separate audit) | licenses/Babel.txt |
| Assistant font | Google Fonts, ofl/assistant, retrieved 2026-09-14; live CSS is not version-pinned | OFL-1.1 | licenses/Assistant.txt |
| JetBrains Mono font | github.com/JetBrains/JetBrainsMono, notice retrieved 2026-09-14; live CSS is not version-pinned | OFL-1.1 | licenses/JetBrainsMono.txt |
| OSRM backend | github.com/Project-OSRM/osrm-backend, master license reference; actual upstream build version requires inventory | BSD-2-Clause | licenses/OSRM.txt |

These licenses permit commercial use subject to their obligations, including
preserving notices. This does not confer rights to unrelated hosted APIs, imagery,
voices or datasets. Inventory every new dependency and exact version before use.

## Service migration status

The policy applies immediately. Removal of CARTO/Esri and public routing fallback
is staged separately until operator-owned endpoints exist. The current live service
is not declared commercially cleared. GTFS, hosting, voice-provider terms and
transitive dependencies remain outstanding; see docs/open-services-migration.md
in the migration branch. Do not assign a license to user-authored code by inference.

## Static development maps (2026-09-14)

Reviewed against the confirmed free, open-code Israel bus-navigation profile. No hosted map account is introduced.

| Component | Pinned version | License and retained notice |
|---|---|---|
| MapLibre GL JS | 5.6.1 | BSD-3-Clause; vendor build's bundled notices copied to licenses/MapLibre.txt |
| MapLibre Leaflet binding | 0.1.0 | ISC; licenses/MapLibre-Leaflet.txt |
| Protomaps styles | 5.7.2 | BSD-3-Clause; licenses/Protomaps-basemaps.txt |
| RTL text plugin | 0.2.3 | BSD-2-Clause; licenses/RTL-text.txt (includes third-party notices) |
| Noto map glyphs | basemaps-assets commit 028c18f713baecad011301ff7a69acc39bcc2ae7 | OFL-1.1; licenses/Map-fonts.txt |
| Regional map snapshot | Protomaps schema 4, exact archive recorded in maps/source.json | ODbL produced work; visible OSM attribution required |
| Python PMTiles reader | 3.5.0, build only | BSD-3-Clause |
| go-pmtiles | 1.31.2, build only | BSD-3-Clause |

Original sources: https://github.com/maplibre/maplibre-gl-js ; https://github.com/maplibre/maplibre-gl-leaflet ; https://github.com/protomaps/basemaps ; https://github.com/mapbox/mapbox-gl-rtl-text ; https://github.com/protomaps/PMTiles ; https://github.com/protomaps/go-pmtiles .
The build verifies each new npm package's declared license against the reviewed expected license and validates tarball integrity. This check is not a full legal audit of transitive dependencies. Map and style/font files are served from our Pages site, not provider runtime APIs. Keep notices when redistributing generated assets.

### Map archive refresh review (2026-09-23)

Same Protomaps/OSM produced-work source and ODbL attribution obligations; no new runtime service or dependency version. Checked against docs/intended-use.md. Official downloads permit copying regional extracts for self-hosting and retain daily builds only for a limited period. Official app/src/utils.ts maps schema 4 to style majors 4 and 5, including our pinned 5.7.2. Resolve only that compatible schema. Keep visible OSM attribution and existing notices. Record the selected archive key/version in maps/source.json. Sources: https://docs.protomaps.com/basemaps/downloads ; https://github.com/protomaps/basemaps/blob/main/app/src/Builds.tsx ; https://github.com/protomaps/basemaps/blob/main/app/src/utils.ts . Existing unresolved GTFS, hosting and voice questions remain unchanged.
