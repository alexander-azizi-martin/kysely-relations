import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { PGlite } from "@electric-sql/pglite";
import { ColumnType, Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { createRelationsBuilder } from "../src/relations-builder.js";

// Database schema type
interface Database {
  users: {
    id: ColumnType<number, number | undefined, number | undefined>;
    name: string;
  };
  profiles: {
    id: ColumnType<number, number | undefined, number | undefined>;
    user_id: number | null;
    bio: string | null;
  };
  posts: {
    id: ColumnType<number, number | undefined, number | undefined>;
    user_id: number | null;
    title: string;
  };
  tags: {
    id: ColumnType<number, number | undefined, number | undefined>;
    name: string;
  };
  post_tags: {
    id: ColumnType<number, number | undefined, number | undefined>;
    post_id: number | null;
    tag_id: number | null;
  };
}

let db: Kysely<Database>;
let pglite: PGlite;

before(async () => {
  pglite = new PGlite();
  await pglite.waitReady;

  // Create tables
  await pglite.exec(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      bio TEXT
    );

    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      title TEXT NOT NULL
    );

    CREATE TABLE tags (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE post_tags (
      id SERIAL PRIMARY KEY,
      post_id INTEGER,
      tag_id INTEGER
    );
  `);

  db = new Kysely<Database>({
    dialect: new PGliteDialect(pglite),
  });
});

after(async () => {
  if (pglite) {
    await pglite.close();
  }
});

describe("Relations Builder", () => {
  describe("hasOne", () => {
    test("should return null when no related record exists", async () => {
      // Insert a user without a profile
      await db.insertInto("users").values({ name: "Alice" }).execute();

      const relations = createRelationsBuilder<Database>();
      const userRelations = relations("users", ({ hasOne }) => ({
        profile: hasOne("profile", {
          target: "profiles",
          column: "users.id",
          reference: "profiles.user_id",
        })((qb) => qb.selectAll()),
      }));

      const result = await db
        .selectFrom("users")
        .select((eb) => ["id", "name", userRelations.profile(eb)])
        .execute();

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "Alice");
      assert.strictEqual(result[0].profile, null);
      assert.ok(Number.isInteger(result[0].id));
      assert.deepStrictEqual(result[0], {
        id: result[0].id,
        name: "Alice",
        profile: null,
      });
    });

    test("should return related record when it exists", async () => {
      // Insert user and profile
      const [{ id: userId }] = await db
        .insertInto("users")
        .values({ name: "Bob" })
        .returning("id")
        .execute();

      await db
        .insertInto("profiles")
        .values({ user_id: userId, bio: "Bob's bio" })
        .execute();

      const relations = createRelationsBuilder<Database>();
      const userRelations = relations("users", ({ hasOne }) => ({
        profile: hasOne("profile", {
          target: "profiles",
          column: "users.id",
          reference: "profiles.user_id",
        })((qb) => qb.selectAll()),
      }));

      const result = await db
        .selectFrom("users")
        .where("id", "=", userId)
        .select((eb) => ["id", "name", userRelations.profile(eb)])
        .execute();

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "Bob");
      assert.ok(result[0].profile);
      assert.strictEqual(result[0].profile?.user_id, userId);
      assert.strictEqual(result[0].profile?.bio, "Bob's bio");
      assert.ok(Number.isInteger(result[0].profile?.id ?? 0));
      assert.deepStrictEqual(result[0], {
        id: userId,
        name: "Bob",
        profile: {
          id: result[0].profile?.id,
          user_id: userId,
          bio: "Bob's bio",
        },
      });
    });

    test("should work with custom select", async () => {
      const [{ id: userId }] = await db
        .insertInto("users")
        .values({ name: "Charlie" })
        .returning("id")
        .execute();

      await db
        .insertInto("profiles")
        .values({ user_id: userId, bio: "Charlie's bio" })
        .execute();

      const relations = createRelationsBuilder<Database>();
      const userRelations = relations("users", ({ hasOne }) => ({
        profile: hasOne("profile", {
          target: "profiles",
          column: "users.id",
          reference: "profiles.user_id",
        })((qb) => qb.select("bio")),
      }));

      const result = await db
        .selectFrom("users")
        .where("id", "=", userId)
        .select((eb) => ["id", userRelations.profile(eb)])
        .execute();

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].profile);
      assert.strictEqual(result[0].profile.bio, "Charlie's bio");
      assert.deepStrictEqual(result[0].profile, { bio: "Charlie's bio" });
    });
  });

  describe("hasOneNotNull", () => {
    test("should return related record", async () => {
      const [{ id: userId }] = await db
        .insertInto("users")
        .values({ name: "David" })
        .returning("id")
        .execute();

      await db
        .insertInto("profiles")
        .values({ user_id: userId, bio: "David's bio" })
        .execute();

      const relations = createRelationsBuilder<Database>();
      const userRelations = relations("users", ({ hasOneNotNull }) => ({
        profile: hasOneNotNull("profile", {
          target: "profiles",
          column: "users.id",
          reference: "profiles.user_id",
        })((qb) => qb.selectAll()),
      }));

      const result = await db
        .selectFrom("users")
        .where("id", "=", userId)
        .select((eb) => ["id", "name", userRelations.profile(eb)])
        .execute();

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].profile);
      assert.strictEqual(result[0].profile.bio, "David's bio");
      assert.strictEqual(result[0].profile.user_id, userId);
      assert.ok(Number.isInteger(result[0].profile.id));
      assert.deepStrictEqual(result[0], {
        id: userId,
        name: "David",
        profile: {
          id: result[0].profile.id,
          user_id: userId,
          bio: "David's bio",
        },
      });
    });
  });

  describe("hasMany", () => {
    test("should return empty array when no related records exist", async () => {
      await db.insertInto("users").values({ name: "Eve" }).execute();

      const relations = createRelationsBuilder<Database>();
      const userRelations = relations("users", ({ hasMany }) => ({
        posts: hasMany("posts", {
          target: "posts",
          column: "users.id",
          reference: "posts.user_id",
        })((qb) => qb.selectAll()),
      }));

      const result = await db
        .selectFrom("users")
        .where("name", "=", "Eve")
        .select((eb) => ["id", "name", userRelations.posts(eb)])
        .execute();

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "Eve");
      assert.ok(Array.isArray(result[0].posts));
      assert.strictEqual(result[0].posts.length, 0);
      assert.deepStrictEqual(result[0], {
        id: result[0].id,
        name: "Eve",
        posts: [],
      });
    });

    test("should return array of related records", async () => {
      const [{ id: userId }] = await db
        .insertInto("users")
        .values({ name: "Frank" })
        .returning("id")
        .execute();

      await db
        .insertInto("posts")
        .values([
          { user_id: userId, title: "Post 1" },
          { user_id: userId, title: "Post 2" },
          { user_id: userId, title: "Post 3" },
        ])
        .execute();

      const relations = createRelationsBuilder<Database>();
      const userRelations = relations("users", ({ hasMany }) => ({
        posts: hasMany("posts", {
          target: "posts",
          column: "users.id",
          reference: "posts.user_id",
        })((qb) => qb.selectAll()),
      }));

      const result = await db
        .selectFrom("users")
        .where("id", "=", userId)
        .select((eb) => ["id", "name", userRelations.posts(eb)])
        .execute();

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "Frank");
      assert.ok(Array.isArray(result[0].posts));
      assert.strictEqual(result[0].posts.length, 3);
      const titles = result[0].posts.map((p) => p?.title);
      assert.deepStrictEqual(titles, ["Post 1", "Post 2", "Post 3"]);
      assert.ok(result[0].posts.every((p) => p?.user_id === userId));
    });

    test("should work with query customization", async () => {
      const [{ id: userId }] = await db
        .insertInto("users")
        .values({ name: "Grace" })
        .returning("id")
        .execute();

      await db
        .insertInto("posts")
        .values([
          { user_id: userId, title: "America First" },
          { user_id: userId, title: "America Second" },
          { user_id: userId, title: "Other Post" },
        ])
        .execute();

      const relations = createRelationsBuilder<Database>();
      const userRelations = relations("users", ({ hasMany }) => ({
        americanPosts: hasMany(
          "americanPosts",
          {
            target: "posts",
            column: "users.id",
            reference: "posts.user_id",
          },
          (qb) => qb.where("title", "like", "America%")
        )((qb) => qb.selectAll()),
      }));

      const result = await db
        .selectFrom("users")
        .where("id", "=", userId)
        .select((eb) => ["id", "name", userRelations.americanPosts(eb)])
        .execute();

      assert.strictEqual(result.length, 1);
      assert.ok(Array.isArray(result[0].americanPosts));
      assert.strictEqual(result[0].americanPosts.length, 2);
      assert.ok(
        result[0].americanPosts.every((post) =>
          post.title.startsWith("America")
        )
      );
      assert.deepStrictEqual(
        result[0].americanPosts.map((p) => p.title).sort(),
        ["America First", "America Second"]
      );
    });

    test("should work with custom select", async () => {
      const [{ id: userId }] = await db
        .insertInto("users")
        .values({ name: "Henry" })
        .returning("id")
        .execute();

      await db
        .insertInto("posts")
        .values([
          { user_id: userId, title: "Post 1" },
          { user_id: userId, title: "Post 2" },
        ])
        .execute();

      const relations = createRelationsBuilder<Database>();
      const userRelations = relations("users", ({ hasMany }) => ({
        posts: hasMany("posts", {
          target: "posts",
          column: "users.id",
          reference: "posts.user_id",
        })((qb) => qb.select("title")),
      }));

      const result = await db
        .selectFrom("users")
        .where("id", "=", userId)
        .select((eb) => ["id", userRelations.posts(eb)])
        .execute();

      assert.strictEqual(result.length, 1);
      assert.ok(Array.isArray(result[0].posts));
      assert.strictEqual(result[0].posts.length, 2);
      assert.deepStrictEqual(result[0].posts, [
        { title: "Post 1" },
        { title: "Post 2" },
      ]);
    });
  });

  describe("hasManyThrough", () => {
    test("should return empty array when no related records exist", async () => {
      const [{ id: postId }] = await db
        .insertInto("posts")
        .values({ user_id: null, title: "Test Post" })
        .returning("id")
        .execute();

      const relations = createRelationsBuilder<Database>();
      const postRelations = relations("posts", ({ hasManyThrough }) => ({
        tags: hasManyThrough("tags", {
          target: "tags",
          column: "posts.id",
          reference: "tags.id",
          through: "post_tags",
          throughColumn: "post_tags.post_id",
          throughReference: "post_tags.tag_id",
        })((qb) => qb.selectAll()),
      }));

      const result = await db
        .selectFrom("posts")
        .where("id", "=", postId)
        .select((eb) => ["id", "title", postRelations.tags(eb)])
        .execute();

      assert.strictEqual(result.length, 1);
      assert.ok(Array.isArray(result[0].tags));
      assert.strictEqual(result[0].tags.length, 0);
      assert.deepStrictEqual(result[0], {
        id: postId,
        title: "Test Post",
        tags: [],
      });
    });

    test("should return array of related records through junction table", async () => {
      // Create tags
      const [{ id: tag1Id }] = await db
        .insertInto("tags")
        .values({ name: "JavaScript" })
        .returning("id")
        .execute();
      const [{ id: tag2Id }] = await db
        .insertInto("tags")
        .values({ name: "TypeScript" })
        .returning("id")
        .execute();
      const [{ id: tag3Id }] = await db
        .insertInto("tags")
        .values({ name: "Python" })
        .returning("id")
        .execute();

      // Create post
      const [{ id: postId }] = await db
        .insertInto("posts")
        .values({ user_id: null, title: "My Post" })
        .returning("id")
        .execute();

      // Link tags to post through junction table
      await db
        .insertInto("post_tags")
        .values([
          { post_id: postId, tag_id: tag1Id },
          { post_id: postId, tag_id: tag2Id },
        ])
        .execute();

      const relations = createRelationsBuilder<Database>();
      const postRelations = relations("posts", ({ hasManyThrough }) => ({
        tags: hasManyThrough("tags", {
          target: "tags",
          column: "posts.id",
          reference: "tags.id",
          through: "post_tags",
          throughColumn: "post_tags.post_id",
          throughReference: "post_tags.tag_id",
        })((qb) => qb.selectAll()),
      }));

      const result = await db
        .selectFrom("posts")
        .where("id", "=", postId)
        .select((eb) => ["id", "title", postRelations.tags(eb)])
        .execute();

      assert.strictEqual(result.length, 1);
      assert.ok(Array.isArray(result[0].tags));
      assert.strictEqual(result[0].tags.length, 2);
      const tagNames = result[0].tags.map((tag) => tag.name).sort();
      assert.deepStrictEqual(tagNames, ["JavaScript", "TypeScript"]);
      const tagIds = result[0].tags.map((tag) => tag.id).sort();
      assert.deepStrictEqual(tagIds, [tag1Id, tag2Id].sort());
    });

    test("should work with query customization", async () => {
      const [{ id: tag1Id }] = await db
        .insertInto("tags")
        .values({ name: "JavaScript" })
        .returning("id")
        .execute();
      const [{ id: tag2Id }] = await db
        .insertInto("tags")
        .values({ name: "TypeScript" })
        .returning("id")
        .execute();

      const [{ id: postId }] = await db
        .insertInto("posts")
        .values({ user_id: null, title: "Another Post" })
        .returning("id")
        .execute();

      await db
        .insertInto("post_tags")
        .values([
          { post_id: postId, tag_id: tag1Id },
          { post_id: postId, tag_id: tag2Id },
        ])
        .execute();

      const relations = createRelationsBuilder<Database>();
      const postRelations = relations("posts", ({ hasManyThrough }) => ({
        jsTags: hasManyThrough(
          "jsTags",
          {
            target: "tags",
            column: "posts.id",
            reference: "tags.id",
            through: "post_tags",
            throughColumn: "post_tags.post_id",
            throughReference: "post_tags.tag_id",
          },
          (qb) => qb.where("name", "=", "JavaScript")
        )((qb) => qb.selectAll()),
      }));

      const result = await db
        .selectFrom("posts")
        .where("id", "=", postId)
        .select((eb) => ["id", "title", postRelations.jsTags(eb)])
        .execute();

      assert.strictEqual(result.length, 1);
      assert.ok(Array.isArray(result[0].jsTags));
      assert.strictEqual(result[0].jsTags.length, 1);
      assert.strictEqual(result[0].jsTags[0]?.name, "JavaScript");
      assert.deepStrictEqual(result[0].jsTags, [
        { id: tag1Id, name: "JavaScript" },
      ]);
    });
  });

  describe("Multiple relations", () => {
    test("should handle multiple relations on same query", async () => {
      const [{ id: userId }] = await db
        .insertInto("users")
        .values({ name: "Iris" })
        .returning("id")
        .execute();

      await db
        .insertInto("profiles")
        .values({ user_id: userId, bio: "Iris's bio" })
        .execute();

      await db
        .insertInto("posts")
        .values([
          { user_id: userId, title: "Post 1" },
          { user_id: userId, title: "Post 2" },
        ])
        .execute();

      const relations = createRelationsBuilder<Database>();
      const userRelations = relations("users", ({ hasOne, hasMany }) => ({
        profile: hasOne("profile", {
          target: "profiles",
          column: "users.id",
          reference: "profiles.user_id",
        })((qb) => qb.selectAll()),
        posts: hasMany("posts", {
          target: "posts",
          column: "users.id",
          reference: "posts.user_id",
        })((qb) => qb.selectAll()),
      }));

      const result = await db
        .selectFrom("users")
        .where("id", "=", userId)
        .select((eb) => [
          "id",
          "name",
          userRelations.profile(eb),
          userRelations.posts(eb),
        ])
        .execute();

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].profile);
      assert.strictEqual(result[0].profile?.bio, "Iris's bio");
      assert.ok(Array.isArray(result[0].posts));
      assert.strictEqual(result[0].posts.length, 2);
      assert.deepStrictEqual(
        result[0].posts.map((p) => ({ title: p.title, user_id: p.user_id })),
        [
          { title: "Post 1", user_id: userId },
          { title: "Post 2", user_id: userId },
        ]
      );
    });
  });

  describe("Nested relations", () => {
    test("should return posts with nested tags", async () => {
      const [{ id: userId }] = await db
        .insertInto("users")
        .values({ name: "NestedUser" })
        .returning("id")
        .execute();

      const [{ id: tag1Id }] = await db
        .insertInto("tags")
        .values({ name: "JS" })
        .returning("id")
        .execute();
      const [{ id: tag2Id }] = await db
        .insertInto("tags")
        .values({ name: "TS" })
        .returning("id")
        .execute();

      const [{ id: post1Id }] = await db
        .insertInto("posts")
        .values({ user_id: userId, title: "Nested Post 1" })
        .returning("id")
        .execute();
      const [{ id: post2Id }] = await db
        .insertInto("posts")
        .values({ user_id: userId, title: "Nested Post 2" })
        .returning("id")
        .execute();

      await db
        .insertInto("post_tags")
        .values([
          { post_id: post1Id, tag_id: tag1Id },
          { post_id: post1Id, tag_id: tag2Id },
          { post_id: post2Id, tag_id: tag1Id },
        ])
        .execute();

      const relations = createRelationsBuilder<Database>();
      const postRelations = relations("posts", ({ hasManyThrough }) => ({
        tags: hasManyThrough("tags", {
          target: "tags",
          column: "posts.id",
          reference: "tags.id",
          through: "post_tags",
          throughColumn: "post_tags.post_id",
          throughReference: "post_tags.tag_id",
        })((qb) => qb.selectAll()),
      }));

      const userRelations = relations("users", ({ hasMany }) => ({
        posts: hasMany("posts", {
          target: "posts",
          column: "users.id",
          reference: "posts.user_id",
        })((qb) => qb.select((eb) => ["id", "title", postRelations.tags(eb)])),
      }));

      const result = await db
        .selectFrom("users")
        .where("id", "=", userId)
        .select((eb) => ["id", "name", userRelations.posts(eb)])
        .execute();

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, userId);
      assert.strictEqual(result[0].name, "NestedUser");
      assert.ok(Array.isArray(result[0].posts));
      assert.strictEqual(result[0].posts.length, 2);

      const sortedPosts = [...result[0].posts].sort((a, b) =>
        (a?.title ?? "").localeCompare(b?.title ?? "")
      );

      const [firstPost, secondPost] = sortedPosts;
      assert.deepStrictEqual(firstPost?.tags.map((t) => t.name).sort(), [
        "JS",
        "TS",
      ]);
      assert.deepStrictEqual(secondPost?.tags.map((t) => t.name).sort(), [
        "JS",
      ]);

      assert.deepStrictEqual(
        sortedPosts.map((p) => ({
          title: p?.title,
          tags: p?.tags.map((t) => t.name).sort(),
        })),
        [
          { title: "Nested Post 1", tags: ["JS", "TS"] },
          { title: "Nested Post 2", tags: ["JS"] },
        ]
      );
    });
  });
});
