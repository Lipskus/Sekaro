# Installation

Use the [Sekaro installation and maintenance guide](INSTALLATION.md).
Production uses `scripts/sekaro-install.py` and `docker-compose.sekaro.yml`.
The old upstream Docker images and public-panel Compose recipes are no longer
shipped. Existing Sekaro production/demo volumes and configuration names remain
unchanged. Do not delete data volumes when changing the source checkout.

For provider configuration see [Gmail](GMAIL.md), [mail identities and Microsoft
365](MAIL.md), and [public endpoint operations](PUBLIC_ENDPOINT_OPERATIONS.md).
