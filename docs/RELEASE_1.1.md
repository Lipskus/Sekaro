# Sekaro 1.1

## Mailbox setup and diagnostics

SMTP mailboxes support a connection test before saving. It checks SMTP and IMAP independently without saving credentials or sending a message. Saving still performs the existing saved-account test. Saved mailboxes can be retested; the latest protocol results and test time remain visible. Editing connection credentials clears old results. A disabled mailbox, an untested connection and a failed connection are separate states.

Tracking controls reflect the configured public endpoint mode and selected mailbox assignments. This capability indicator is not a live endpoint health check. Delivery still applies the existing endpoint safety checks. Updating Sekaro does not install or start a public tracking service; follow [public endpoint setup](PUBLIC_ENDPOINT_OPERATIONS.md) when enabling it.

## Contact and campaign languages

Contacts have a standard preferred-language field, independent of interface language. Set it during creation, detail editing, inline editing, bulk assignment or import. The contact list can filter by language. CSV exports include the field; export is disabled while the client-side language filter is active.

To migrate an existing custom field, select contacts, open the language action, select the source field and check values. Map unrecognized values, or explicitly mark them unknown, before applying. Original custom data is preserved. Existing contacts remain unknown until explicitly assigned; the upgrade never guesses from country or email address.

Campaign settings provide a default language, multilingual mode and missing-translation policy. With multilingual mode off, every contact receives the default content. With it on, a known contact language selects the corresponding translation; an unknown language uses the campaign default. Existing campaigns remain single-language and retain their message bodies. Their initial language label is English: change it to match the actual content before adding translations.

The normal step editor holds the default-language content. The translations panel holds additional subject, body, format and preview text variants, including A/B messages. Save changes before previewing the selected language. Translation is manual; Sekaro does not automatically translate copy. Per-contact personalized overrides remain explicitly authored content and must be written in the intended recipient language.

Missing translations block delivery by default. The optional default-language fallback applies to the whole step, including enabled A/B variants. Preflight reports missing translations and fallback use. Both queue paths and preview/test endpoints share language selection. A missing translation discovered after scheduling is skipped rather than sent in an unintended language.

Mailbox identities can define plain-text and HTML signatures per language. If no matching signature exists, the original default signature is used. The saved preview includes the first assigned mailbox's signature; check other sender identities when multiple mailboxes are assigned.

New deliveries store their selected language and rendered message content so later replies quote the sent text even after translation edits. Older delivery history continues to use the existing reconstruction behavior.

## Upgrade and validation

Use the [installation update procedure](INSTALLATION.md#updates). Keep the database and Docker volumes. The updater backs up the database before replacing the application; migrations are idempotent and preserve existing settings and custom fields.

Regression coverage includes language selection, A/B fallback, preview/test consistency, both queue paths, import validation, custom-field migration and SMTP/IMAP diagnostics. PostgreSQL checks simulate a 1.0 schema, run startup migrations twice and verify backup restoration. Responsive fixture checks cover mailbox forms, campaign settings and contact details; these are not a live production SMTP or endpoint test.

New language-specific controls provide Polish and English labels, with English fallback for other interface languages.
