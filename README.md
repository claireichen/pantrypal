# PantryPal

PantryPal is a responsive household food inventory for refrigerator, freezer, and pantry ingredients. It helps users see what they have and prioritize food that will expire soon.

## MVP features

- Add, edit, and delete ingredients
- Track refrigerator, freezer, and pantry storage
- Record quantity, unit, expiration date, and notes
- Highlight expired items and food that should be used within seven days
- Configure expiration reminders with in-app alerts and optional daily browser notifications
- Filter by storage location and search by ingredient
- Recommend recipes using food across all storage locations
- Prioritize recipes that use ingredients nearing expiration
- Add missing ingredients to a persistent cloud-saved shopping list
- Save personal recipes and reminder preferences in the database
- Pull live recipes, images, and instructions from TheMealDB
- Open complete recipe details and deduct used quantities after cooking
- Move purchased shopping-list ingredients directly into inventory
- Persist data in SQLite locally or Supabase PostgreSQL in production
- Run automated validation and database tests in GitHub Actions

## Run locally

PantryPal requires Node.js 24 or later and has no third-party package dependencies.

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000). Local data is stored in `data/pantrypal.sqlite`.

Run the test suite with:

```bash
npm test
```

## Deploy to Vercel with Supabase

SQLite is ideal for local development, but Vercel functions do not provide persistent local storage. The deployed app therefore uses Supabase PostgreSQL through its server-only REST API.

1. Create a Supabase project.
2. Open the Supabase SQL editor and run [`db/supabase-schema.sql`](db/supabase-schema.sql).
3. Import this repository into Vercel.
4. Add these environment variables in the Vercel project settings:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

PantryPal uses TheMealDB's development key by default for this educational project. Set `THEMEALDB_API_KEY` to a supporter key for longer-term production use. Live recipe cards link to their original source and identify TheMealDB as the provider.
5. Deploy the project.

Keep the service role key private. The browser never receives it; only the server API reads it.

## API

The frontend communicates with server-side API endpoints:

- `GET /api/items` lists items.
- `POST /api/items` creates an item.
- `PUT /api/items` updates an item using the `id` in the JSON body.
- `DELETE /api/items?id=1` deletes an item.

`GET /api/health` provides a simple deployment health check.

`/api/user-data` stores custom recipes, shopping-list items, and notification preferences in the database. `/api/recipes` retrieves external meal suggestions, and `/api/consume` updates inventory after cooking.

## Project structure

```text
api/                 Backend endpoints
db/                  Production database schema
public/              Frontend HTML, CSS, and JavaScript
src/                 Validation and database adapters
test/                Automated tests
.github/workflows/   Continuous integration
server.js            Local web server
```
