# Recipient deployment check

Verified the PR #22 UI on the existing demo deployment. Search for kontakt01 returned one contact; the replies filter returned two. Selecting 10 rows per page and advancing returned the remaining two contacts from a 12-contact campaign. The add drawer opened below the demo banner and closed correctly. No contact was submitted, removed or sent a message.

Found a layout regression: custom cells compressed to 56–73 px, with the phone field's button only 30 px wide. Its wrapped text reached 199 px and stretched every row to 223 px. Set a 120 px minimum for cells, 140 px for the name and 210 px for sending controls; retain horizontal scrolling in the table container. This is a visual width fix with no data/API changes.

Production build and existing CI gates validate the patch. Re-measure row heights after deployment; full Dark/Light, mobile and sequence parity remain open.
