# Tender summary updates on GitHub Pages

This project's authoritative location is Transit-Freak/kav-bochan, branch main,
directory tenders/. Its public URL is https://transit-freak.github.io/kav-bochan/tenders/.
Only edit tenders/; do not edit other applications, especially parks/.

1. Read the latest tenders/ files from GitHub before each run. This is no longer a Sites deployment.
2. Run scripts/refresh_feed.py (also invokes refresh_archive.py), then scripts/refresh_documents.py once even if archive discovery failed. Archive records are separate in archive-feed.json, backed by archive-seeds.json. A nonzero exit may mean partial source access, not loss of the portal feed. Keep all prior records on failure. Unknown archive links remain visible as needs_review; never infer a tender number or winner from a filename. Search-index seeds are discovery leads, not verified extracted fields. When direct archive access fails, use public search for indexed official archive documents and record provenance; never claim exhaustive coverage. Scripts resolve paths relative to this directory. Keep missing documents queued with bounded retries. Do not infer cancellation from missing search results or documents.
3. For new or changed tenders, read official documents and update structured-tenders.json. Every verified field must pass scripts/tender_fields.py validation with correct tender ID, field key, source URL and page/section. Keep bid/performance guarantees, eligibility/scoring, base/option periods, and monetary units distinct.
4. Unknown, missing or conflicting information must remain null with the appropriate field status. Do not guess routes, awards or amounts. Do not mark unread text as unrecognized wording. The metadata card remains visible even when its summary is incomplete.
5. Preserve previous successful document hashes. Follow only public official source links. Maps require verified tender, route/direction/variant, source attribution and reuse terms; never replace planned tender routes with current GTFS.
6. Validate JSON, field schemas and JavaScript syntax. Publish only changes inside tenders/ with GitHub tools. Base each commit on the latest main tree, preserve all other paths, and never force-push. On a concurrent main update, rebase the scoped tree changes onto the new head.
7. Confirm the Pages build/deployment for the pushed commit and the public site response. Do not deploy to Sites or change sharing. The update runner remains the owner's scheduled ChatGPT task, not a GitHub Actions schedule.
8. Report only persistent blockers requiring owner action. Do not send messages to third parties or add paid services. Search coverage is partial and must be described honestly.
