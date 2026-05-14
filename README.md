# Maalem Tech Backend

Express + Prisma backend for the Maalem Tech platform.

## Requirements

- Node.js 20+ recommended
- PostgreSQL database
- If you use Neon, keep the direct database URL in `DATABASE_URL`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
cp .env.example .env
```

3. Update `.env` with real values:

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: secret used to sign JWT tokens
- `JWT_EXPIRES_IN`: token lifetime, defaults to `7d`
- `PORT`: server port, defaults to `5000`

For your Neon database, the connection string format is:

```bash
postgresql://neondb_owner:[YOUR-PASSWORD]@ep-red-salad-alwly140.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

## Prisma

Generate the Prisma client after installing dependencies or whenever the schema changes:

```bash
npx prisma generate
```

If you add migrations, run them with:

```bash
npx prisma migrate dev
```

The current schema change adds `TechnicianProfile.isWorkerMode`; existing technician rows should be backfilled by the migration before the frontend relies on worker/client mode toggling.

Seed the default service categories with:

```bash
npm run db:seed
```

This seeds the following categories if they do not already exist:

- Réparation
- Électricité
- Climatisation
- Plomberie
- Nettoyage
- Menuiserie
- Peinture
- Jardinage

## Run

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

The server starts from `src/server.js` and exposes a health endpoint at:

```bash
GET /
```

Expected response:

```json
{ "message": "Maalem Tech API is running" }
```

## API Routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/requests`
- `GET /api/requests/my`
- `GET /api/requests/:id`
- `PUT /api/requests/:id/cancel`
- `POST /api/offers`
- `GET /api/offers/request/:id`
- `PUT /api/offers/:id/accept`
- `PUT /api/requests/:id/done`
- `POST /api/reviews`
- `GET /api/reviews/technician/:id`

## Notes

- Prisma is configured for PostgreSQL in `prisma/schema.prisma`.
- Authentication expects `Authorization: Bearer <token>` headers on protected routes.
- The repository currently includes only `npm start` and `npm run dev` scripts.
