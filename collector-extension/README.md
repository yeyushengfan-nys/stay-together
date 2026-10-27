# 住一起 · 本机酒店采集助手 0.2.8

Load unpacked in Chrome; open the exact production site in that Chrome profile and reload.
Never load arbitrary credentials. The website bridge accepts only a bounded city/date/occupancy
query and commands. Full companion profiles stay on the website; the extension receives only aggregate budget, required-condition keys and exact excluded-hotel identities. No cookies/debugger/
webRequest or all_urls permissions. Content scripts do not run on passport hosts.

Selection tasks: discover a bounded candidate pool from the city list, prioritizing list prices within the group budget → primary room rows → optional scoped room amenities → guarded checkout preview → exact-name lookup on the other platform → matching room rows and preview. Repeat per hotel. No hotel IDs or amounts are hard-coded in the selection workflow.

Current default is reference-price reading, without an order preview, submission or payment. In `requirements_review`, finding three matching price/meal plans does not stop the search. `CONTINUE_SELECTION` resumes the same stored pool and cursor, skipping only exact names/platform IDs that the website has explicitly excluded. Each batch checks at most eight new hotels and the loaded pool contains at most twelve; the website may automatically continue the remaining pool. Login and verification still pause. `search.matched` is a package count, not proof that all personal requirements are met; exhausted scope is reported without claiming no hotel exists citywide. `smartWash` stays separate from generic smart toilets: only rendered, exact-room body-washing descriptions are recorded, never heating or automatic flushing alone. These additions have offline synthetic coverage; a new live continuation run is still required for deployment acceptance.
Pause on authentication, verification, access restriction, identity/date/occupancy mismatch,
DOM ambiguity. Bounded loading timeouts are recorded and the remaining candidates continue. No CAPTCHA solver, anti-block workaround or final order action.
Ctrip and Tongcheng previews use only the scoped room-list control 预订 after room-name and current-price checks. Tongcheng excludes duplicate recommendation nodes, keeps the original bounded hotel link, refreshes a loading page at most once, and resumes from a passport tab by reopening the hotel page after the user acts. No login fields, cookies or account details are read.

Ctrip DOM reading was checked against Shanghai public list and room pages on 2026-10-25.
Chrome installation and production worker/bridge flow passed on 2026-10-25: city/date input → Ctrip discovery → eight room plans → one checkout preview total CNY388 → automatic site return. Login pause was also observed. This is one successful itinerary, not a reliability rate.
On 2026-10-25, a new two-platform job started from the production website also completed automatically: Shanghai, 2026-10-25 to 2026-10-27, 1 room, 2 adults, 艺龙安悦酒店(上海浦东大道歇浦路地铁站店). It returned 12 room plans (8 Ctrip + 4 Tongcheng), with matched 悦眠大床房, 1张1.51米大床, no breakfast, online prepay, free cancellation within 30 minutes of confirmation, then non-refundable. Confirmed preview totals: Ctrip388, Tongcheng370 (original506-discounts136), difference18. No manual quote entry, order submission or payment. Tongcheng includes current-account platinum benefits; taxes were not separately verified. This is one successful hotel/date pair, not a general success-rate claim.
Ctrip's checkout did not repeat meal information: its explicit no-breakfast room-list evidence is retained with provenance, rather than inferred from omission. Tongcheng checkout explicitly lists the paid nights as no meals. The cheaper Tongcheng non-refundable plan (183/night) was excluded from this matched comparison.
Exact hotel/room names and beds, breakfast, full cancellation terms and payment timing are compared across platforms; differing plans remain independent offers. Tax coverage is unknown unless explicitly checked. Query dates are
checked against visible month/day and URL year when present; never take URL dates alone.
A page list price is not a verified stay total; cashback and guarantees are separate fields.

Job state uses chrome.storage.session (worker restarts survive, browser restarts do not).
Website saves sanitized offers in its existing browser-local trip state. Only user-created
job tabs are operated and closed. Start via the site, pause/resume/skip/cancel via site or popup.

0.2.1 waits for the actual amenities title rather than the first modal text line, and leaves facilities unknown if their optional detail panel does not load. Browser loading status does not block DOM validation after five seconds. A platform loading timeout after its bounded retry is recorded as a failure for that item and does not block the other candidates. Authentication, verification, access restrictions and identity/date mismatches still pause. Tongcheng login resumes with a fresh exact-name lookup. The live multi-hotel run must be recorded separately from the historical successful single-hotel run above.

Room matching also excludes known payment-mode conflicts. Live Wanxin R evidence showed a 293/night pay-at-hotel plan with a guarantee, and a separate 302/night plan whose payment mode was not listed; only the latter can proceed to preview against an online-prepaid Ctrip reference. Its payment mode must still be verified there. If login delays separate captured totals by more than ten minutes, the older platform is rechecked at most once instead of changing its timestamp or claiming a valid comparison.

The website receives the group budget and required condition IDs, never companion names or complete preference objects. Unverified facilities stay unknown, contradictory evidence blocks eligibility, and prices with different terms do not get a lowest-price label. Feizhu and Qunar remain explicitly unconnected to automated quotes.

Run tests: node tests/test-collector.mjs
Also run: node tests/test-selection.mjs and node tests/test-selection-client.mjs

0.2.3 also reads explicit Tongcheng pay-at-hotel room totals, separately from refundable guarantees. The labelled total must equal gross room charges minus discounts with all paid dates and room counts verified. Conflicting prepay/at-hotel labels or arithmetic failures pause. A 586 room charge with a separate 283 guarantee does not automatically match Ctrip: full cancellation liability is still compared. Meal plans are not upgraded to double breakfast unless the group requires breakfast. The 0.2.1 multi-hotel live run completed with one manually skipped guarantee-billing item; it is not a successful unattended multi-hotel run.

0.2.3 adds a bounded search-header settling period before a query mismatch pause; no prices are consumed while mismatched. URL-year mismatches still pause immediately. New website jobs explicitly use priceMode=reference: room rows and optional amenities only, never checkout tasks. Reference prices never become verified nightly totals or full stay totals. Historical checkout tasks retain their original priceMode for backwards compatibility.


0.2.6: reference-mode search reads at most 12 rendered list candidates and inspects at most 8 primary hotel pages, replenishing after nonmatching meals, beds, cancellation or budget. Package matches do not prove necessary facilities. Public Ctrip extra-plan controls are expanded only under hotel/date/occupancy guards, never booking controls. Coverage and stop reason are returned. Only anonymous aggregate weights accompany the trip; names and free-text personal notes stay on the website.

0.2.7: only the explicitly diagnosed Tongcheng empty-room response gets one ordinary page refresh; continued emptiness is recorded as missing data and the queue continues. Login, CAPTCHA, restrictions, identity and date mismatches still pause. Meal labels are separated from the cancellation field.
