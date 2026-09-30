# Dependency and service licensing policy

User requirement: use only open-source libraries permitting commercial use.
Applies to every future change in this repository, including code, fonts, icons,
bundled assets and build dependencies. Preserve all required license notices.

Before adding or upgrading a dependency:
- Verify the exact version and original license from the publisher.
- Record version, source, SPDX identifier and notice path in THIRD_PARTY.md.
- Do not accept noncommercial, personal-only, source-available-only or unknown licenses.
- Check copyleft obligations for the actual distribution model; do not strip them.
- Check hosted-service terms independently, including vehicle navigation rights.
- Public accessibility, free pricing and an API that works are not permission.
- Do not configure CARTO, Esri imagery or a public routing demo as implicit fallbacks.
- Never label the whole project legally cleared while data or hosting rights remain unresolved.

Development hosting stays on GitHub Pages per user instruction. No new server is required for static maps and prepared navigation data. Verify the generated map artifact before replacing the live site.
Complete the deployment checks in docs/open-services-migration.md first.
Do not change or relicense user-owned code or unrelated websites.

## Required intended-use reference
Read docs/intended-use.md before every dependency/service addition or upgrade.
Evaluate licenses and service terms against its real-time professional bus navigation,
free public access, open-code distribution, Israel-only scope, unknown scale and
no-driver-tracking requirements. Keep the reference updated only from confirmed user
answers; record unresolved questions explicitly. Log each review in THIRD_PARTY.md.
