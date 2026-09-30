# Uncertain navigation intervals

Verified on 2026-09-14 directly against
https://gtfs.mot.gov.il/gtfsfiles/israel-public-transportation.zip:
trip `12251948_200926`, route `11727` (line 68 toward Beersheba), shape `88500`.
All 810 sorted shape points, rounded to the feed's five decimals, exactly
match the site's geometry. The terminal shortcut exists in the original GTFS;
it was not introduced by frontend simplification. This establishes provenance
for this case, not that every mismatch is caused by Ministry data.

## Display and speech

`nav.uncertainSegments` contains fractional `{from,to,reason}` intervals.
`coverage.js` merges intervals, suppresses every maneuver within them, and
prevents looking through a future gap to announce a later turn. It warns from
100 m before entry (or 10 seconds at current speed, whichever is greater).
Inside the interval it shows `הוראות חלקיות במקטע הזה`; before it,
`הוראות חלקיות במקטע הבא`. Speech warns once per interval and playback pass,
using the existing serial speech channel. Entering the warning zone cancels
previous speech and waits for the channel to become idle before warning.
No turn, straight-ahead, or stop-distance instruction is issued in that zone.
The next stop's name remains available. Seeking/restarting allows a new warning.

The reviewed line-68 shortcut is immediately suppressed by matching three
actual GTFS source points plus the terminal stop code, not by line number.
The interval runs from 30 m before the shortcut through the truncated endpoint.
A changed source shape must match the reviewed signature to retain this local
rule. This does not fix or reposition the displayed geometry.

## Server detection

`kav-bochan/tools/nahagim_coverage.py` compares every 10 m of source segments
against full OSRM matched road geometry. Samples over 20 m away are marked
with 30 m padding. Failed matches, multiple matches, missing tracepoints,
missing geometry, and confidence below .8 retain uncertainty for the owned
chunk interval. The confidence threshold is not a probability of correctness.

Data processing must finish and publish before newly detected intervals are
available for all routes. Older feeds retain their existing behavior outside
the explicit reviewed rule. Uploaded GTFS has the reviewed rule, but does not
receive the server's general detector unless rebuilt by that pipeline.

These checks can detect geometric disagreement; a nearby parallel road may
still be wrong. Unflagged intervals are not proof of complete road legality or
coverage. No real-device GPS or in-vehicle speech validation was performed.
