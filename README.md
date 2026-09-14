# Queue API

## Local development

Without `DATABASE_URL`, the app uses the in-memory repository so the API and tests can run locally.

```sh
npm install
npm test
npm start
```

## Prisma/Postgres

Set the Postgres connection string supplied by Deno Deploy:

```sh
cp .env.example .env
# edit DATABASE_URL
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm start
```

For local schema development, use `npm run prisma:migrate -- --name init` instead of `prisma:deploy`.

The application selects the Prisma repository whenever `DATABASE_URL` is set. Otherwise it selects the in-memory repository, which keeps tests independent from a live database.

## Deno Deploy

Configure the project with:

- Entry point: `app.js`
- Environment variable: `DATABASE_URL`
- Build command: `npm install && npm run prisma:generate`

Run the database migration and seed from CI or your local machine against the Deno Postgres URL before deploying:

```sh
DATABASE_URL="your-database-url" npm run prisma:deploy
DATABASE_URL="your-database-url" npm run prisma:seed
```

The build command is required because `@prisma/client` imports the generated `.prisma/client` files. If Deno Deploy does not run dependency lifecycle scripts, omitting this step causes `Cannot find module '.prisma/client/default'`.

## Structure

- `src/routes`: Express route registration
- `src/controllers`: HTTP request/response translation
- `src/services`: validation and queue business rules
- `src/repositories`: memory and Prisma persistence adapters
- `prisma`: schema, migration, and branch seed
- `test`: API tests

## API surfaces

Customer-facing endpoints are under `/api/public`:

- `POST /api/public/branches/validate`
- `POST /api/public/queue`
- `GET /api/public/branches/:branchCode/queue/:ticketNumber`

Staff-facing queue monitoring is under `/api/internal`:

- `GET /api/internal/queue`
- `GET /api/internal/queue/:ticketNumber`
- `POST /api/internal/queue/:ticketNumber/start`
- `POST /api/internal/queue/:ticketNumber/complete`
- `POST /api/internal/queue/:ticketNumber/cancel`

The public queue list is intentionally unavailable. The current staff lifecycle supports `pending -> serving -> completed` and cancellation from `pending` or `serving`. Staff authentication and counter authorization remain required before exposing these routes beyond a trusted internal network.

For the current development implementation, internal requests must provide `X-Staff-Agent-Id` and `X-Staff-Counter-Id` headers. These headers are only a temporary staff-context adapter, not authentication, and should be replaced by token claims before production exposure.

Ticket numbers remain simple, such as `HM-001`, but the sequence is scoped by branch, operating date, and service. The same display number can therefore exist at different branches or on different dates.
