# Queue API

## Local development

Without `DATABASE_URL`, the app uses the in-memory repository so the API and tests can run locally.

```sh
npm install
npm test
npm start
```

Database-backed integration tests use a separate disposable PostgreSQL database:

```sh
DATABASE_URL="postgresql://.../queue_test" npm run prisma:deploy
DATABASE_URL="postgresql://.../queue_test" npm run test:db
```

The database test file refuses to run against a database whose name does not contain `test`, unless `ALLOW_DATABASE_TESTS=true` is set explicitly.

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

The application selects the Prisma repository whenever `DATABASE_URL` is set, except during `NODE_ENV=test`, when it uses the in-memory repository so tests remain isolated from a live database.

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

- `POST /api/internal/dashboard/start`
- `GET /api/internal/dashboard`
- `GET /api/internal/queue`
- `GET /api/internal/queue/:ticketNumber`
- `PATCH /api/internal/queue/:ticketNumber/status`
- `POST /api/internal/queue/:ticketNumber/recall`
- `PATCH /api/internal/branches/:branchCode/queue-status`

Counter management is available internally:

- `GET /api/internal/counters`
- `POST /api/internal/counters`
- `POST /api/internal/counters/:counterId/assignment`
- `DELETE /api/internal/counters/:counterId/assignment`

Sales-agent management is available internally:

- `GET /api/internal/sales-agents`
- `GET /api/internal/sales-agents/:agentId`
- `POST /api/internal/sales-agents`
- `PATCH /api/internal/sales-agents/:agentId`
- `DELETE /api/internal/sales-agents/:agentId` (deactivates the agent)

The public queue list is intentionally unavailable. The ticket status endpoint accepts `serving`, `completed`, `cancelled`, `skipped`, or `no_show`; the current lifecycle supports `pending -> serving -> completed`, cancellation from `pending` or `serving`, and skip/no-show from `pending` or `serving`. Recall is available for a serving ticket and records a new handling event. A phone number cannot create another queue on the same operating date across any branch until its earlier queue is completed. Staff authentication and counter authorization remain required before exposing these routes beyond a trusted internal network.

For the current development implementation, internal requests must provide `X-Staff-Agent-Id` and `X-Staff-Counter-Id` headers. These headers are only a temporary staff-context adapter, not authentication, and should be replaced by token claims before production exposure.

The branch queue status endpoint accepts `{ "operatingDate": "YYYYMMDD", "status": "open" | "closed" }`. The request value remains a string, while `DailySequence` and `BranchQueueDay` persist it as a UTC-midnight datetime. A closed branch queue rejects new public tickets for that branch and date with `409 Conflict`. If no status row exists, public ticket creation returns `503 Service Unavailable`; the day must be explicitly configured as `open` or `closed` first.

An open queue day must also be started by staff through `POST /api/internal/dashboard/start` before public tickets can be created. An open but unstarted day returns `409 Conflict` for ticket creation.

Ticket numbers remain simple, such as `HM-001`, but the sequence is scoped by branch, operating date, and service. The same display number can therefore exist at different branches or on different dates.

Serving is rejected when the selected counter is already handling another ticket. Dashboard `currentTicket` and `nextTicket` are arrays of `{ ticketNumber, date, status }` objects; they are empty when no matching ticket exists, and pending tickets are ordered by queue creation. Ticket status and queue-handling history are persisted together transactionally in the Prisma repository.

Service codes are now validated against the `Service` master table and queue rows retain the legacy `serviceType` API field while storing a required `serviceId` foreign key. The service migration backfills existing queue rows from their legacy codes and aborts if an unknown code is found.
