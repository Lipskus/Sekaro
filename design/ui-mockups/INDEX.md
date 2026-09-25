# Sekaro UI Mockup Index

Canonical hybrid reference plan: **48 boards per theme = 96 PNG**, plus optional final **System Health Dark + Light = 98 PNG**.

| # | Module | Reference board | Dark | Light |
|---:|---|---|:---:|:---:|
| 01 | Settings | General | ✓ | ✓ |
| 02 | Settings | Default schedule | ✓ | ✓ |
| 03 | Settings | Appearance | ✓ | ✓ |
| 04 | Settings | Account & security | ✓ | ✓ |
| 05 | Settings | Known IP addresses | ✓ | ✓ |
| 06 | Settings | Backup | ✓ | ✓ |
| 07 | Settings | Restore | ✓ | ✓ |
| 08 | Settings | Features / AI | ✓ | ✓ |
| 09 | Settings | Notifications | ✓ | ✓ |
| 10 | Settings | Email verification | ✓ | ✓ |
| 11 | Settings | Integrations / API keys | ✓ | ✓ |
| 12 | Settings | Webhooks + MCP | ✓ | ✓ |
| 13 | Settings | Test / development mode | ✓ | ✓ |
| 14 | Campaigns | Campaign list / advanced filters | ✓ | ✓ |
| 15 | Campaigns | List states + action modal | ✓ | ✓ |
| 16 | Campaigns | Bulk actions + modal | ✓ | ✓ |
| 17 | New Campaign | Campaign builder | ✓ | ✓ |
| 18 | New Campaign | Summary / validation / pre-flight | ✓ | ✓ |
| 19 | Campaign Workspace | Sequence editor | ✓ | ✓ |
| 20 | Campaign Workspace | Recipients / add & review contacts | ✓ | ✓ |
| 21 | Campaign Workspace | Campaign settings | ✓ | ✓ |
| 22 | Campaign Workspace | Campaign analytics | ✓ | ✓ |
| 23 | Campaign Workspace | Queue | ✓ | ✓ |
| 24 | Campaign Workspace | Activity | ✓ | ✓ |
| 25 | Campaign Workspace | Workspace states + modal | ✓ | ✓ |
| 26 | Inboxes | Mailbox list and states | ✓ | ✓ |
| 27 | Inboxes | Add / edit SMTP + IMAP | ✓ | ✓ |
| 28 | Inboxes | Tracking: App URL / Beacon / DNS-CNAME | ✓ | ✓ |
| 29 | Inboxes | Mailbox connection diagnostics | ✓ | ✓ |
| 30 | Inboxes | Mailbox health / limits / reputation | ✓ | ✓ |
| 31 | Inboxes | Connection tests + logs | ✓ | ✓ |
| 32 | Inboxes | IMAP synchronization / activity | ✓ | ✓ |
| 33 | Inboxes | Empty / loading / error / paused / modal states | ✓ | ✓ |
| 34 | Templates | List + editor + version history | ✓ | ✓ |
| 35 | Templates | Contact preview / variables / test send | ✓ | ✓ |
| 36 | Templates | States + modal | ✓ | ✓ |
| 37 | Analytics | Main analytics | ✓ | ✓ |
| 38 | Analytics | Empty / loading / error / success states | ✓ | ✓ |
| 39 | Schedule | Queue / calendar + filters | ✓ | ✓ |
| 40 | Schedule | Message preview | ✓ | ✓ |
| 41 | Notifications | Notification center | ✓ | ✓ |
| 42 | Notifications | E-mail preferences / event types | ✓ | ✓ |
| 43 | Notifications | Empty / loading / error / success + modal states | ✓ | ✓ |
| 44 | Contact Detail | Profile / overview | ✓ | ✓ |
| 45 | Contact Detail | Activity / history | ✓ | ✓ |
| 46 | Contact Tools | Bounced / invalid address recovery | ✓ | ✓ |
| 47 | Contact Tools | States + recovery modal | ✓ | ✓ |
| 48 | Deliverability | Deliverability Tips | ✓ | ✓ |

## Optional final references

| # | Module | Reference | Dark | Light |
|---:|---|---|:---:|:---:|
| 49 | System Health | Final System Health reference | ✓ | ✓ |

## Implementation order

1. Design tokens and common components
2. Settings
3. Campaigns list
4. New Campaign
5. Campaign Workspace
6. Inboxes
7. Templates
8. Analytics + Schedule
9. Notifications
10. Contact Detail + Contact Tools
11. Deliverability Tips
12. System Health
13. Cross-screen QA: Dark/Light parity, keyboard focus, contrast, loading/error/empty/disabled/destructive states and responsive behavior
