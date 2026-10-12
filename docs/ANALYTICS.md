# Outreach analytics

Feature documentation for Sekaro 1.0.

## Recipient report

`GET /api/analytics/report?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&group_by=campaign|inbox|field`

Optional repeated `campaign_id` parameters filter campaigns; `field` grouping requires `field_key`. Country and region are ordinary contact fields selected from existing definitions or data. The application does not assume field names or add industry-specific fields.

- The period includes complete UTC days, from the start of the first day through the end of the last. The maximum is 366 days; invalid or reversed ranges return HTTP 400.
- The cohort consists of messages whose `EmailLog.sent_at` falls within the period. `sent` counts messages; `recipients` counts unique **contact–campaign pairs** in the group. Sending again to the same contact in that campaign does not increase this denominator.
- `replied` counts pairs with at least one reply attributed to a cohort message by the end of the selected period. `reply_rate = replied / recipients × 100` (0–100%). Replies preceding a send or attributed to an older send do not increase the cohort's result.
- `LeadReply` has no mailbox or message ID. Attribution uses an explicit heuristic: the latest preceding send in the same contact–campaign pair, with the highest ID breaking timestamp ties. This is not verified thread attribution. In mailbox breakdowns, only the selected mailbox receives the reply.
- Duplicate reply markers do not increase the number of respondents. `auto_reply` and `out_of_office` categories are excluded according to the enrollment's **current** classification. A NULL classification or deleted enrollment does not exclude a stored reply. For historical duplicate enrollments, the highest ID applies.
- `bounced` and `unsubscribed` describe the **current enrollment state** among cohort recipients. They are not events within the selected period: the database has no timestamps for these state changes. Percentages use the same denominator but are NULL if any recipient's state is unknown. `status_known` reports coverage. Global suppression is not automatically treated as an unsubscribe.
- Contact-field segments also use current values. Missing values have a separate key, independent of literal user-entered labels. A contact can appear in several groups; adding groups does not produce a global person count.
- No sends produces an empty list and message rather than a misleading positive percentage. Fetch errors clear previous results and disable export.
- CSV exports the same breakdown and period. NULL appears as “—”, text is quoted, and potential spreadsheet formulas are neutralized.

## Existing reports

The daily report remains an activity timeline, not a cohort. Replies count one contact per campaign per day; a day can include replies to earlier sends. The period's reply-to-send ratio is explicitly labelled as such and can exceed 100%. Opens and clicks are tracking events. Unique IP addresses are counted separately per day and campaign; they are neither person counts nor proof of delivery.

In sequence-step analytics, a reply increases only the latest preceding message's result, once per message. Later replies are not attributed to every step. “Opportunities” still means sends to contacts who are currently interested; the interface explicitly states that these are not historical conversions.

## Diagnostics

`GET /api/diagnostics/mailboxes` returns an explicit allowlist of fields, excluding passwords and raw transport errors. It shows stored SMTP test results (and IMAP when configured), test/synchronization timestamps, limits, pause state and EML retention. No test timestamp means no measurement, even if an old record has `last_test_ok=true`. Changing connection parameters invalidates the result; saving without changes preserves it. This is neither a configuration revision history nor a live test.

`POST /api/diagnostics/domains/{domain}` accepts optional JSON fields `selector` and `sending_ipv4`. It requires authentication and operates only on domains belonging to configured mailboxes:

- SPF: checks for a single `v=spf1` TXT record, without fully evaluating mechanisms, includes or sender authorization.
- DKIM: requires an explicit selector. Checks for a key record and recognizes empty/revoked keys; does not verify a message signature. No selector means no measurement.
- DMARC: checks exactly `_dmarc.<domain>`, without inherited-policy discovery or alignment checks. No record there does not establish the absence of a parent policy.
- MX: reports DNS records and identifies Null MX separately. No MX record does not establish the absence of implicit MX/A/AAAA fallback.
- Blocklist: checks only Spamhaus ZEN for the supplied public IPv4 address of the actual sending server. It does not infer an address from a mailbox, MX record or SMTP hostname. A control query for a known listing precedes the check. Resolver blocking, invalid response codes and timeouts are errors, never “not listed”. No IP means no measurement. Operators must comply with the provider's public-mirror terms; the application does not bypass service restrictions.
- Results show sources/records and timestamps. Changing the selector/IP clears the previous result. Results are not stored as history or used to change campaigns automatically.
- Preflight links to domain diagnostics and explicitly states that campaign readiness does not include DNS measurement. Missing measurements do not become green results.
- Demo blocks external diagnostics in both middleware and the endpoint. Demo mailbox states are explicitly fictional.

Source documentation: [Spamhaus return codes](https://www.spamhaus.org/resource-hub/dnsbl/spamhaus-dnsbl-return-codes-technical-update/) and [Spamhaus DNSBL usage](https://www.spamhaus.org/faqs/dnsbl-usage/). Record presence does not certify protocol compliance.

Full reputation assessment, historical conversions without source timestamps and meeting effectiveness are outside this feature set. The application does not manufacture those measurements from proxy indicators.
