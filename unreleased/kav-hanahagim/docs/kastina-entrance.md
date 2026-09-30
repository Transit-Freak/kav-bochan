# Kastina entrance correction, 2026-09-14

Routes 16558 (1), 16579 (2), and 16687 (3) toward BIG have no supplied
maneuver at the Highway 3 entrance preceding stop 11168. Their next right
maneuver is approximately 29 m after the stop.

Verified road source: OpenStreetMap way 114696253 (one-way, psv=yes,
access=no), starting at node 5404184308, shared with Highway 3 ways
253084082 and 956519215. https://www.openstreetmap.org/way/114696253

Navigation preparation adds a right-turn instruction only when the route
serves stop 11168 and follows four ordered checkpoints within 12 m of the
verified approach/entrance/interior path. Distance bounds reject looping or
unrelated matches. An existing maneuver within 20 m prevents duplication.
The correction is applied at display preparation, so daily feed replacement
does not remove it. Source maneuver arrays and route shapes remain intact.

The common visual/speech maneuver list contains the correction, with the
requested concise instruction `פנו ימינה`. Existing adaptive speech timing applies.
This is a location-specific verified correction, not a general solution for
missing road maneuvers. Changed geometry can deliberately reject it.

Regression fixtures: current route geometry, stops and maneuvers for all
three reported variants. Tests assert an entrance before the terminal,
visual and speech selection before entry, idempotence, no source mutation,
and rejection of reverse/offset geometry and missing terminal stops.
No real-device GPS or in-vehicle speech test was performed.
