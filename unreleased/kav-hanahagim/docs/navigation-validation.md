# Navigation validation

The driving screen now uses `navigation.js`, the same pure selector exercised by
`tools/audit-navigation.cjs`. A known upcoming maneuver remains visible regardless
of its distance. It is not hidden until it enters a 350-metre window. The next stop
is displayed separately so its distance cannot be mistaken for the turn distance.
Unknown roundabout exits are labelled as unavailable rather than rendered as null.

The selector sorts instructions, rejects invalid positions/kinds and removes exact
duplicates without changing the source. Nearby opposite turns are preserved;
curves in the GTFS polyline are not fabricated into road directions.

## Baseline: 13 September 2026

All 7,836 indexed route variants were opened, decompressed and checked against the
GTFS dataset dated 12 September 2026. The test replays progress every 100 metres
and around maneuver boundaries: 4,297,688 selector checks passed.

- Missing/unreadable files: 0
- Invalid geometry, maneuver positions or stop positions: 0
- Routes with supplied instructions: 6,727
- Source status `ok`: 976
- Source status `weak`: 5,751
- Source status `none`: 1,109
- Roundabout instructions without an exit number: 2,903

These statuses describe the upstream matching process, not a verified percentage
of correct turns. `weak` can also reflect matching confidence or distance ratio;
it does not prove every instruction is wrong. Structural and selector checks do
not verify junction coverage, bus access permissions or real-world directions.
Missing road instructions require upstream map matching/data repair and cannot
be filled accurately by guessing from the displayed shape.

## Automatic checks

`Navigation audit` runs daily and on relevant code changes. It checks out the
latest `nahagim-data` branch, runs regression tests and scans **every** index entry.
Structural errors or selector failures fail the job. Partial source coverage and
unknown exits appear separately in the JSON artifact and Actions summary.

Local usage (Node.js 22+, no npm dependencies):

```sh
node --test tests/navigation.test.cjs
node tools/audit-navigation.cjs /path/to/nahagim-data navigation-audit.json
```

React component tests performed for this change also cover keyboard entry,
on-screen digits/backspace, a 7,836-route search with at most 40 rendered results,
route A → back → route B, preserved search, delayed responses and failed loads.
