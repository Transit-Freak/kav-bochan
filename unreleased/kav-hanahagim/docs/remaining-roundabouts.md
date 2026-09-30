# Remaining roundabout exits: follow-up

Snapshot: 14 September 2026; 7,836 route variants.

- 532 missing exits across 492 variants.
- 77 entries within 100m of a route endpoint: the existing centered recovery deliberately skips these.
- 109 entries have a nearby reference trace in another variant; 99 have a single exit value across all matching references, while 10 have conflicting values.
- 69 of the 99 have at least two references; 30 have at least two references within 1m at every sampled point.

These are candidates, not verified fixes. The scan compares 10m samples from 100m before the entry to 250m after it, with a maximum 5m separation. Rounded GTFS geometry and incorrect source exits can create false agreement. No production instruction was changed.

Run: `python3 tools/diagnose-remaining-roundabouts.py /path/to/nahagim-data --out remaining-diagnosis.json`

Next engine diagnostic: rerun only missing cases with the existing bus-profile OSRM, retain request coordinates and raw replies, and report each rejection gate (endpoint context, split match, confidence, length ratio, trace gaps, snap distance, entry offset, missing exit, or disagreement). Compare the 99 cross-route candidates against those raw replies before any completion. Do not relax thresholds globally. For endpoint cases, obtain route context beyond the representative trip only if supported by actual route data; never extrapolate an exit from a curve.
