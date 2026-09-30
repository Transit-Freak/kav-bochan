# Terminal approach screening, 2026-09-14

Run `node tools/audit-terminals.cjs <nahagim-data checkout> terminal-audit.json`.
The existing daily navigation audit also runs this check and retains the full
report as its `navigation-audit` artifact. This is a read-only screening tool.

## Completed scope

Current feed: 6,646 bus route variants scanned; 331 stop codes named with
`מסוף` or `מרכזית`; 5,784 visits, including 1,812 origin visits excluded from
arrival screening and 3,972 arrival visits. No route files failed to load.
Stops lacking these words in their names are outside this screening scope.

Screening found:

- 20 arrival visits with a roundabout instruction lacking an exit number
  in the preceding 600 m. These are visits, not 20 distinct junctions.
- 503 arrivals with no supplied instruction in that window. Straight access,
  an earlier entrance, or a displaced stop fraction may explain these;
  these are **not confirmed missing turns**.
- 554 arrivals with their stored route position over 50 m from the stop
  coordinates. This also needs source/projection review.
- Conflicting instructions on similar local traversals serving 27 stop codes.
  The 2,178 pairwise comparisons involve 358 distinct route variants; they
  must not be reported as 2,178 separate faults. Right vs keep-right can
  reflect wording differences. Other mismatches may indicate matching errors.

Flags overlap: 1,023 arrival visits had at least one of the first three flags.
The comparison requires maneuver locations within 15 m and route positions
40 m before and 40, 80, 120 m after within 15 m. Similarity is a review signal,
not authority to copy instructions between routes.

## Beersheba central station

Stop 15657, `ת.מרכזית באר שבע/הורדה`:

- Route 15292, line 170: the final roundabout instruction has `exit: null`.
- Route 1875, line 364: exit 1.
- Route 7008, line 470: exit 3.
- Route 8170, line 370: exit 4.

The latter three use the southern entry and northwestern exit of the same
mapped terminal roundabout. Their differing exit counts need correction
against mapped bus-accessible exits, including the closely spaced eastern
branches, rather than blindly copying a majority value.

OSM map checked: southern entry node 3672421105; northwestern exit node
9010187209 onto way 1348741710, which leads into terminal way 1365779012.
Sources: https://www.openstreetmap.org/way/965944609 and
https://www.openstreetmap.org/way/1348741710 (retrieved 2026-09-14).
An extra generic right turn here would not address the roundabout problem.
No Beersheba maneuver was changed in this screening update.

## Already published correction

Kastina lines 1/2/3: verified Highway 3 entrance now supplies `פנו ימינה`
in the common visual and spoken instruction list. See `kastina-entrance.md`.

Neither the screening nor the existing full-feed replay proves complete
road-junction coverage or actual-device speech/GPS timing. The report is
intended to expose missing data and inconsistent matching for targeted review.
