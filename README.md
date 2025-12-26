# Overview

This library provides an API similar to drizzle's relations so that kysely can be used as an ORM.

## Download

```
npm install kysely-relations
```

## Import

**Important:** Import the correct implementation for your database:

```typescript
// For PostgreSQL
import { createRelationsBuilder } from "kysely-relations/postgres";

// For MySQL
import { createRelationsBuilder } from "kysely-relations/mysql";

// For SQLite
import { createRelationsBuilder } from "kysely-relations/sqlite";
```

## Usage

```typescript
import { createRelationsBuilder } from "kysely-relations/postgres";

interface Database {
  users: { id: number; name: string };
  posts: { id: number; user_id: number; title: string };
  profiles: { id: number; user_id: number; bio: string };
}

// Create a relation builder for your database schema
const relations = createRelationsBuilder<Database>();

// Define reusable relations for the users table
const userRelations = relations("users", ({ hasOne, hasMany }) => ({
  // hasOne: nullable one-to-one relation
  profile: hasOne("profile", {
    target: "profiles", // target table
    column: "users.id", // source column
    reference: "profiles.user_id", // foreign key
  }),

  // hasMany: one-to-many with optional query customization
  americanPosts: hasMany(
    "americanPosts",
    {
      target: "posts",
      column: "users.id",
      reference: "posts.user_id",
    },
    (qb) => qb.where("title", "like", "America%")
  ),
}));

// Use relations in queries - fully type-safe
// Returns: Promise<{ id: number; profile: { id: number } | null }[]>
db.selectFrom("users")
  .select((eb) => ["id", userRelations.profile((qb) => qb.select("id"))])
  .execute();

// Type error: userRelations only works with 'users' table
db.selectFrom("profiles")
  .select((eb) => userRelations.profile((qb) => qb.select("id")))
  .execute();
```
