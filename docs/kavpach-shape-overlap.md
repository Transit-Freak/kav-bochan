# Shared GTFS segments in KavPach

The existing stop-overlap selection and score/protection formulas are retained.
Each candidate row in `kavpach-overlap.json` keeps its first five fields and adds
one geometry estimate object at index 5. Candidate selection still uses shared
stops; this is not a nationwide search for all geometric overlaps regardless of
stops. The snapshot was rebuilt from current Ministry GTFS on 2026-09-14.

For each makat, use the exact representative route/trip chosen for the stop
metric. Compare geometry in the same travel direction: samples represent at
most 20 m, distance tolerance is 20 m, heading tolerance 30 degrees, and only
continuous matching runs of at least 100 m count. Target progress within a run
must be nondecreasing (2 m tolerance); reused target bins do not count twice.
Distance indexing uses a local planar approximation; physical segment lengths
use their midpoint latitude. This is an estimate, not surveyed road length.

Measure both source/target directions and retain the smaller shared length.
Divide that common length by each selected route's total length separately.
Report total shared km and the estimated longest uninterrupted shared run.
Missing/short geometry is `unavailable`, not a fabricated zero. Same-direction
nearby parallel roads can remain indistinguishable in inaccurate GTFS shapes;
no claim about passenger substitution or road legality follows from the score.
Times, service days, pickup/drop-off restrictions and all alternate variants
are not checked. The UI identifies the selected route names and lengths.

## 975 / 407 fixture in the current feed

- 975 representative: route 19773, Haifa -> Netanya, 71.29 km.
- 407 representative: route 6654, Jerusalem -> Netanya, 102.05 km.
- Shared stops: 8; existing stop index: 53%.
- Estimated shared directed geometry: 3.59 km.
- Share of selected 975 route: 5.0%; of selected 407 route: 3.5%.
- Longest continuous shared run: 3.01 km.

Six regression tests cover identical/reverse paths, crossings, separated
parallel roads, denominator asymmetry, disconnected common runs, repeated
laps and missing geometry. All 5,728 output comparisons were checked for valid
percentage and length bounds. No fare, cancellation or service score is
changed by the new geometry fields.

`kavpach-overlap.yml` refreshes after successful daily `line-history` runs,
reusing their GTFS artifact, with direct Ministry download as fallback. It
also supports manual runs and tests/rebuilds on algorithm changes. Only the
overlap JSON is committed by this workflow.
