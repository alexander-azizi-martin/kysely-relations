import { expressionBuilder, sql } from "kysely";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";

export function createRelationsBuilder() {
  return function relations(table, relationBuilder) {
    return relationBuilder({ hasOne, hasOneNotNull, hasMany, hasManyThrough });
  };
}

function hasOne(relationName, config, customizeQuery) {
  const query = relationQueryFactory(config, customizeQuery);
  const queryWithColumn = query(sql.ref(config.column));
  const include = (selectFunc) => {
    return () => jsonObjectFrom(selectFunc(queryWithColumn)).as(relationName);
  };

  return include;
}

function hasOneNotNull(relationName, config, customizeQuery) {
  const query = relationQueryFactory(config, customizeQuery);
  const queryWithColumn = query(sql.ref(config.column));
  const include = (selectFunc) => {
    return () => jsonObjectFrom(selectFunc(queryWithColumn)).as(relationName);
  };

  return include;
}

function hasMany(relationName, config, configureQuery) {
  const query = relationQueryFactory(config, configureQuery);
  const queryWithColumn = query(sql.ref(config.column));
  const include = (selectFunc) => {
    return () => jsonArrayFrom(selectFunc(queryWithColumn)).as(relationName);
  };

  return include;
}

function hasManyThrough(relationName, config, configureQuery) {
  const query = throughRelationQueryFactory(config, configureQuery);
  const queryWithColumn = query(sql.ref(config.column));
  const include = (selectFunc) => {
    return () => jsonArrayFrom(selectFunc(queryWithColumn)).as(relationName);
  };

  return include;
}

function relationQueryFactory(config, customizeQuery) {
  customizeQuery = customizeQuery ?? ((v) => v);
  const baseQuery = customizeQuery(
    expressionBuilder().selectFrom(config.target)
  );

  return (expression) => baseQuery.where(config.reference, "=", expression);
}

function throughRelationQueryFactory(config, customizeQuery) {
  customizeQuery = customizeQuery ?? ((v) => v);
  const baseQuery = customizeQuery(
    expressionBuilder().selectFrom(config.target)
  );
  const baseSubQuery = expressionBuilder()
    .selectFrom(config.through)
    .select(config.throughReference);

  return (expression) =>
    baseQuery.where(config.reference, "in", () =>
      baseSubQuery.where(config.throughColumn, "=", expression)
    );
}

