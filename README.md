# World Cup Office Pool

Internal FIFA World Cup 2026 prediction game for six office members.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Vercel
- Neon Postgres
- `@neondatabase/serverless`
- Server Actions
- SQL migrations and PostgreSQL functions

## Local setup

1. Create a Vercel project and connect it to this repo.
2. Add Neon Postgres storage to the project.
3. Pull env vars into your local machine:

```bash
vercel env pull .env.development.local
```

4. Install dependencies:

```bash
npm install
```

5. Run the SQL migrations in Neon:

```bash
npm run db:migrate
```

6. Seed the database:

```bash
npm run db:seed
```

7. Start the app locally:

```bash
npm run dev
```

8. Deploy to Vercel.

## Environment

Required env vars:

- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED` if needed for migrations
- `POSTGRES_URL` if needed
- `SESSION_SECRET`

Copy `.env.example` to your local environment and never commit real env files.

## Notes

- Admin seed user: `fifa.admin@office.local`
- The app uses a signed, HTTP-only session cookie.
- Unknown emails are rejected.
- Prediction locks 30 minutes before kickoff.
- If total match points are zero, the prize pool stays unresolved.
- Group standings are calculated from completed group-stage matches only.
- New teams should always be assigned to a group before they are used in fixtures.
- Before lock, members see only their own prediction details and admin sees only submission status.
- After lock, predictions become visible to everyone and are read-only.
- Admin can only edit unlocked fixtures; locked/live/completed fixtures are read-only except for cancellation.
- Knockout fixtures can be created later once teams are known.
- The login flow uses seeded email/password credentials, not public signup.

## Database

The base schema and scoring functions live in `db/migrations/001_initial.sql`.
The groups, group standings, visibility rules, and admin fixture rules live in `db/migrations/002_groups_standings_and_admin_rules.sql`.
The password auth flow, member lockout fields, and prediction audit log live in `db/migrations/003_auth_passwords_and_prediction_audit.sql`.
Sample members, groups, teams, and fixtures live in `db/seed.sql`.

## Authentication

- Seed members manually or through `db/seed.sql`.
- The seeded temporary password is only for first login.
- The current development seed password is `Office@2026`.
- Users must change their password on first login before they can join the dashboard.
- Admin can reset a member password from the dashboard; the app sets `must_change_password = true` so the member must choose a new password on next login.
- Do not commit real user emails or real temporary passwords to a public repo.
- Change the seeded temporary password before real use or generate hashed passwords manually.
