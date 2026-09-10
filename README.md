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
