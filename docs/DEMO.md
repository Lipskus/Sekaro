# Sekaro demo instance for QA

The demo replaces an empty production installation with one application and one
database on the VPS. It uses two containers: the application and PostgreSQL.
The application publishes `127.0.0.1:5050` directly and uses the existing
`sekaro:local` image and a PostgreSQL database.

Starting the demo does not require rebuilding an existing image: the additional
`app/demo` module is mounted only into the demo container. The interface version
comes from the image; pulling source code alone does not update the UI inside it.

## Starting on a VPS

From the repository directory, such as `/opt/sekaro`:

```bash
bash scripts/sekaro-demo.sh replace-production
```

**This command deletes the containers and production database volume of the
`sekaro` project.** It is intended for an explicitly approved empty installation.
It first checks images and Compose configuration, then removes production and
starts the demo. Host backup directories and existing demo data are preserved.

Requirements: Docker Compose v2 supporting `--wait`, Python 3, and local
`sekaro:local` and `postgres:15-alpine` images from the existing installation.
The script generates random passwords in `.sekaro-demo/env` (0600, excluded
from Git). After successful startup it displays the `demo` login and password.
Production user credentials are not required.

Demo listens only on `127.0.0.1:5050`; the existing address and Zero Trust
configuration remain unchanged. If the demo previously used `5051`, the script
moves that same instance to `5050`. If the tunnel origin was changed to `5051`,
restore `5050` while preserving the Access policy.

For access from a local browser, use an SSH tunnel:

```bash
ssh -L 5050:127.0.0.1:5050 ubuntu@VPS_ADDRESS
```

Then open `http://localhost:5050`. The top banner identifies DEMO mode.
Allow an additional 30 px for this banner when comparing screenshots.

## Data and behavior

- 60 fictional contacts, 3 lists and custom fields.
- 6 campaigns: active campaigns, a paused campaign, completed enrollments,
  a draft without contacts and a campaign with missing personalized content.
- 3 mailboxes with sample states: available, paused/error and warming up.
- 48 stored queue entries (the view shows future entries), 120 historical
  send records over 30 days, opens, clicks and replies.
- 12 conversations / 36 messages, 4 templates with 3 versions each and 12 notifications.

All addresses are fictional and use `.invalid`; statistics do not represent
actual sending. Initial dates are relative to startup. Restarting preserves
edits and does not duplicate data. Reset refreshes dates and restores the initial
dataset. Light/dark themes work as in production.

Demo does not start the scheduler, automatic IMAP, MCP or backup jobs.
SMTP/IMAP are blocked in the process. The API blocks test sending, replies,
synchronization, integration connections and backup restoration. Editing contacts,
campaigns, local mailbox settings and templates remains available. Queue
recalculation after edits can change the sample layout.

Containers use a regular Docker bridge network and separate secrets. The network
allows outbound connections; demo sending is blocked at the application layer
(disabled jobs, API guards and SMTP/IMAP guards), not at the network layer.
The demo database has no host port. The seeder refuses other database/user/host
identities and databases containing existing data without a demo marker.
Normal `app.main:app` startup does not import the demo module.

## Operating the instance

```bash
bash scripts/sekaro-demo.sh status  # Containers and health
bash scripts/sekaro-demo.sh logs    # Recent application logs
bash scripts/sekaro-demo.sh login   # Initial login and password
bash scripts/sekaro-demo.sh stop    # Stop while preserving data
bash scripts/sekaro-demo.sh up      # Start again
bash scripts/sekaro-demo.sh reset   # Delete ONLY the demo database and reseed it
bash scripts/sekaro-demo.sh remove  # Remove ONLY demo containers and database
```

`reset` and `remove` operate exclusively on the `sekaro-demo` Compose project.
`up` and `reset` refuse to start a second instance while the `sekaro` project is
active. Use `replace-production` only to replace an empty production installation.
After replacement, operate the demo through this script rather than production
Compose. For application updates use `python3 scripts/sekaro-install.py update`;
`up` alone restarts the existing image without building it. Do not use `reset`
or repeat `replace-production` for an ordinary update.

The script detects the previous internal network and recreates it as a regular
bridge while preserving the database volume and passwords. It also removes the
previous gateway container if present. This one-time change briefly restarts the
containers. The password file remains after demo removal. Reset restores its
initial password even if that password was subsequently changed in the interface.
