# Unified line hub

`lines/` adds a separate Hebrew RTL view. The existing home, hash routes for Kav Pach / Golden and `bus/` remain available. No redirects or data ingestion changes.

Build: `node tools/build_line_hub.mjs`. Test: `node --test tests/line-hub.test.mjs`.

The builder runs the existing xlsx-worker parser and kavpach-core scores, and evaluates the exact Golden `useMemo` calculation from the repository's KavPach.jsx with its default settings. A changed source contract fails the build instead of silently inventing a score. Generated files are deterministic, split into 100 buckets, with a hash per bucket in the catalog. Each page loads the catalog and its selected bucket, not the national schedule.

Identity: one page per Ministry makat. Reliability variants join routes.json[routeId][0] to that makat, preserving direction and alternative. Legacy scores group several makats in some cases; display explicitly labels that scope. Passenger rows cannot be assigned to a particular GTFS alternative.

Reliability loads the selected day from bus/data and computes percentages from observation counts. Zero observations are distinct from missing measurements; unobserved trips are not asserted to be cancellations. Late responses cannot overwrite a newer line or tab. Stop arrival profiles and vehicle distributions are loaded/displayed on demand.

Map: exact makat-direction-alternative archive filename; no fallback to a different route. Decode shape and stop pools from the latest version with stops, displaying that version's date. No shape means stop markers only. Fetch errors retain an explicitly unordered, non-directional list of stops from the passenger snapshot.

Source limitations: passenger and cost snapshot is June 2026; the source currently has no per-stop boarding/alighting counts. Historical departure times are not presented as current travel information. Generated scoring date is distinct from observation period. Personal settings on the old sites do not affect the default scores here.

Automation: `.github/workflows/line-hub.yml` rebuilds on relevant source changes, successful upstream workflows and daily at 08:15 UTC, with manual dispatch available. Existing sites continue using their original files. Builder/test failures leave previous generated data intact, and publishing failures cause a failed run rather than false success.
