# Contributing

Thanks for helping improve NepaliStory.

## Development setup

1. Install Node.js 20+ and PostgreSQL.
2. Create a local database and configure `server/.env` using `.env.example` as a reference.
3. Run `npm ci`, `npm run db:generate`, and `npm run db:deploy`.
4. Start development servers with `npm run dev`.

## Before opening a pull request

- Run `npm run build`.
- Test the affected workflow with reader, creator, and administrator roles as appropriate.
- Keep migrations additive and do not commit generated output, uploaded content, credentials, or dependency folders.
- Describe behavior changes and any known limitations in the pull request.
