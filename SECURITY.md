# Security Policy

## Supported versions

Only the current default branch is maintained for this portfolio project.

## Reporting a vulnerability

Please do not publish exploit details, credentials, or private user data in a public issue. Contact the repository maintainer privately before disclosing a suspected vulnerability. Remove secrets from logs and rotate them immediately if they were exposed.

## Deployment notes

This repository is not security-audited for production. Before exposing it to the public internet, review session storage, account recovery, CSRF defenses, upload processing/storage, privacy and retention practices, abuse prevention, dependency updates, database permissions, and monitoring. Never commit `.env` files or production credentials.
