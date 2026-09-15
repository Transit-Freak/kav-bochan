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
9. Read document-reviews.json before extracting. Its summaries are partial reviews of identified document versions, not award confirmations. Preserve page numbers, SHA-256, field notes, and unresolved gaps. Never collapse phased periods or vehicle-specific limits into a single number. A 200 response must also contain a valid PDF before treating a download as successful. For each run, try to read and verify at least one available document's content, not only its download, and record actual reviewed fields. Do not label queued extraction as running. Existing reviewed values must not be overwritten from a filename, snippet, or an unrelated clarification.
10. Use verified_conditional for an independently verified multi-case field: keep the parent value null and provide conditions with label, value, unit, comparison (eq/lt/lte), and field-specific official sources for EACH condition. Never turn a multi-case value into unverified merely because it has no single number. Do not upgrade genuine missing/conflicting information. Validate with tender_fields.validate; conditions preserve both scope and strict/inclusive boundaries. Keep pending fields and long source explanations collapsed in the UI.
11. Write public-facing summaries in plain Hebrew: describe what a condition means to the reader rather than the extraction workflow. Prefer פרטים שנבדקו, עדיין לא בדקנו, and מסמך המקור over technical extraction terms. Keep original official titles and provenance. Preserve strict versus inclusive limits, units, stage-specific applicability, and uncertainty when simplifying wording.
    Do not expose raw enum values such as total, percent or not_applicable in the UI. Keep the public catalog unified without a separate example section.
13. refresh_documents.py also runs audit_routes.py for EVERY operating tender in both feeds. Review route-audit.json gaps, not only the most recently edited tender. A complete summary table does not prove that all directions, variants, stops or maps were parsed. For Northern Negev, negev-routes.tsv transcribes all 128 rows on PDF pages 65–73, keyed by area and route number; repeated route numbers in different towns are distinct. Preserve page-spanning rows and the source hash. A new document hash invalidates completeness claims. Never draw a current GTFS route as a historical tender route. Continue locating and reading official route/map annexes in future runs; this audit alone does not extract them.
12. The existing account task now runs once daily at 08:30 Asia/Jerusalem. refresh_documents.py invokes extract_documents.py for up to 40 due tenders with three concurrent downloads. New tenders and changed metadata take priority; even unchanged document URLs are downloaded again on daily checks. Failed downloads retain prior fields and use bounded backoff. The parser supports verified document identity, separate bid/performance guarantees and explicitly recognized price-scoring tables. Other fields, ambiguous versions, unreadable PDFs and amendments still require review; never claim full extraction. extraction-state.json records each remaining gap. Run scripts/test_extraction.py and schema validation before publishing. Preserve these requirements and the daily cadence in future runs.

## Package pipeline (2026-09-15)

The current user requires automatic analysis of ALL tender documents and annexes,
all 40 catalog fields, a concise Hebrew summary, every route/direction/variant and
source map screenshots. Northern Negev is a field/layout example, never a source
of values for other tenders. The daily ChatGPT task is the semantic reading engine;
there is no paid model API and no new GitHub Actions schedule.

The package instructions below supersede the old document-runner commands above.
Install Python dependencies from `tenders/scripts/requirements.txt` when missing;
PDF extraction needs Poppler (`pdftotext`), and scanned pages need Tesseract.
The runner downloads a checksum-verified Hebrew OCR model, with a 200-page OCR
budget per run. OCR text remains unverified until checked against the page.

Use `python tenders/scripts/run_daily.py` instead of the old one-tender document
check. It discovers all known tender packages, downloads up to 600 due documents
in a fair queue, extracts every PDF page, Word paragraph/table and Excel sheet,
and analyzes supported facts and route tables. Preserve nonzero source failures;
continue to process the successfully downloaded documents. Unsupported file types,
scanned pages and failed sources stay explicitly queued. Do not call downloaded
or text-extracted pages semantically reviewed.

Then, in THIS scheduled run, read the full units from the local
`/tmp/tender-packages/review-queue.json`. Use `scripts/read_batch.py TENDER DOC
--start N --count 8`; never truncate batch output or just search keywords and claim
all lines were read. Inspect scanned pages and every route map visually. Follow all
annex references, and distinguish blank bidder forms, background/current service,
planned service, cancelled lines and amendments. Read every pending available batch,
checkpointing completed batches, and continue fairly across tenders. If execution
limits prevent finishing, persist the remaining work and report actual coverage.
A persistent source/access blocker needs owner attention; it is not "no information".

Write a semantic review JSON according to `scripts/apply_review.py`, with an outcome
for EVERY read unit, sourced Hebrew paraphrases, typed fields with complete units,
route identities (catalog number, area, direction and variant), and maps with exact
PDF page, explicit route caption, reuse basis and short description. Run
`apply_review.py /path/to/review.json`. It rejects stale hashes and evidence from
unread units and renders approved map pages into `tenders/maps/*.webp`. Review those
images visually. Do not invent geography or copy today's GTFS. Read all amendments
before claiming current final conditions. A new source hash invalidates old review
coverage. Keep version-specific values separate when they conflict.

Run both `test_extraction.py` and `test_packages.py`, validate all typed fields and
JSON, and `node --check tenders/app.js`. Publish only tenders/ using GitHub, confirm
Pages deployment, and check the public data and interface. Update
`firstScheduledRunVerified` only from a successful ACTUAL scheduled run plus verified
publication, never from a manual test. Existing schedule: daily 08:30 Asia/Jerusalem.
14. The version reader now checks up to eight document candidates per tender, oldest attempt first, retaining separate hashes and field evidence. Conflicting values remain null; never treat document order as amendment precedence. The --all option checks every collected operating tender regardless of backoff. Completed tender results are checkpointed immediately.
15. refresh_documents.py runs scan_annexes.py over every collected publication, then extract_route_tables.py. Inspect up to 12 route/annex links per publication per run and advance the remaining queue on later runs. XLSX route tables require explicit route, catalogue, direction, variant and endpoint headers; join stops only within the same source workbook and complete route key. Keep source workbooks separate in route-data and route-index.json. Examples and ridership spreadsheets are not planned routes. Coordinates show station positions only; never draw straight lines as road geometry or claim completeness from extracted row counts.
16. Eligibility alternative 4.1.1.3 uses verified_conditional values and gte comparisons. Preserve the year range, ownership conditions and alternative scope. Run test_extraction.py and test_route_tables.py before publishing.
