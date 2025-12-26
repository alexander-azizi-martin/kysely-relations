import {
  type AliasedExpression,
  type AnyColumnWithTable,
  type ExpressionBuilder,
  type SelectQueryBuilder,
} from "kysely";

interface RelationConfig<
  DB,
  Table extends keyof DB & string,
  Target extends keyof DB & string,
  Column extends keyof DB[Table] & string,
> {
  target: Target;
  column: `${Table}.${Column}`;
  reference: AnyColumnWithTable<DB, Target>;
}

interface ThroughRelationConfig<
  DB,
  Table extends keyof DB & string,
  Through extends keyof DB & string,
  Target extends keyof DB & string,
  Column extends keyof DB[Table] & string,
> extends RelationConfig<DB, Table, Target, Column> {
  through: Through;
  throughColumn: AnyColumnWithTable<DB, Through>;
  throughReference: AnyColumnWithTable<DB, Through>;
}

type CustomizeQueryFunction<DB, Target extends keyof DB & string> = (
  eb: SelectQueryBuilder<DB, Target, {}>
) => SelectQueryBuilder<DB, Target, {}>;

type SelectFunction<DB, Target extends keyof DB & string, T> = (
  eb: SelectQueryBuilder<DB, Target, {}>
) => SelectQueryBuilder<DB, Target, T>;

type AliasedExpressionFactory<
  DB,
  Table extends keyof DB & string,
  T,
  RelationName extends string,
> = (eb: ExpressionBuilder<DB, Table>) => AliasedExpression<T, RelationName>;

type RelationFunctions<DB, Table extends keyof DB & string> = {
  hasOne: <
    RelationName extends string,
    Target extends keyof DB & string,
    Column extends keyof DB[Table] & string,
  >(
    relationName: RelationName,
    config: RelationConfig<DB, Table, Target, Column>,
    customizeQuery?: CustomizeQueryFunction<DB, Target>
  ) => <T>(
    selectFunc: SelectFunction<DB, Target, T>
  ) => AliasedExpressionFactory<DB, Table, T | null, RelationName>;
  hasOneNotNull: <
    RelationName extends string,
    Target extends keyof DB & string,
    Column extends keyof DB[Table] & string,
  >(
    relationName: RelationName,
    config: RelationConfig<DB, Table, Target, Column>,
    customizeQuery?: CustomizeQueryFunction<DB, Target>
  ) => <T>(
    selectFunc: SelectFunction<DB, Target, T>
  ) => AliasedExpressionFactory<DB, Table, T, RelationName>;
  hasMany: <
    RelationName extends string,
    Target extends keyof DB & string,
    Column extends keyof DB[Table] & string,
  >(
    relationName: RelationName,
    config: RelationConfig<DB, Table, Target, Column>,
    configureQuery?: CustomizeQueryFunction<DB, Target>
  ) => <T>(
    selectFunc: SelectFunction<DB, Target, T>
  ) => AliasedExpressionFactory<DB, Table, T[], RelationName>;
  hasManyThrough: <
    RelationName extends string,
    Target extends keyof DB & string,
    Through extends keyof DB & string,
    Column extends keyof DB[Table] & string,
  >(
    relationName: RelationName,
    config: ThroughRelationConfig<DB, Table, Through, Target, Column>,
    configureQuery?: CustomizeQueryFunction<DB, Target>
  ) => <T>(
    selectFunction: SelectFunction<DB, Target, T>
  ) => AliasedExpressionFactory<DB, Table, T[], RelationName>;
};

declare function createRelationsBuilder<DB>(): <
  Table extends keyof DB & string,
  T,
>(
  table: Table,
  relationBuilder: (relationFunctions: RelationFunctions<DB, Table>) => T
) => T;

export { createRelationsBuilder };
