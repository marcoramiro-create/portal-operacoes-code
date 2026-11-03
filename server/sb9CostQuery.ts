export type Sb9CostQueryFilters = {
  batchId: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  branch?: string | null;
  productCodes?: string[] | null;
};

export type Sb9CostSource = "raw" | "monthly";

export function buildSb9CostSourceQuery(
  source: Sb9CostSource,
  filters: Sb9CostQueryFilters,
) {
  const values: unknown[] = [filters.batchId];
  const alias = "r";
  const table = source === "monthly"
    ? "public.cost_evolution_sb9_monthly"
    : "public.operational_source_rows";
  const sourceIdColumn = source === "monthly" ? "version_id" : "batch_id";
  const periodSelect = source === "monthly"
    ? `${alias}.period`
    : `to_char(${alias}.event_date, 'YYYYMM')`;
  const predicates = [
    `${alias}.${sourceIdColumn} = $1::uuid`,
    `${alias}.branch_code is not null`,
    `${alias}.branch_code <> ''`,
    `${alias}.product_code is not null`,
    `${alias}.product_code <> ''`,
    `${alias}.unit_value is not null`,
  ];

  if (source === "raw") predicates.push(`${alias}.event_date is not null`);
  if (filters.periodStart) {
    values.push(filters.periodStart);
    predicates.push(source === "monthly"
      ? `${alias}.period >= $${values.length}`
      : `${alias}.event_date >= to_date($${values.length}, 'YYYYMM')`);
  }
  if (filters.periodEnd) {
    values.push(filters.periodEnd);
    predicates.push(source === "monthly"
      ? `${alias}.period <= $${values.length}`
      : `${alias}.event_date < to_date($${values.length}, 'YYYYMM') + interval '1 month'`);
  }
  if (filters.branch) {
    values.push(filters.branch);
    predicates.push(`${alias}.branch_code = $${values.length}`);
  }
  const products = filters.productCodes?.length ? filters.productCodes : null;
  if (products) {
    values.push(products);
    predicates.push(`${alias}.product_code = any($${values.length}::text[])`);
  }

  return {
    text: `select ${alias}.branch_code as branch,
                  ${alias}.product_code as product,
                  ${periodSelect} as period,
                  ${alias}.unit_value::text as cost
             from ${table} ${alias}
            where ${predicates.join("\n              and ")}`,
    values,
  };
}
