export type IndustryClosingInput = {
  branch: string;
  product: string;
  aggregate: string;
  period: string;
  value: number;
};

export type IndustryEntryInput = {
  branch: string;
  product: string;
  period: string;
  value: number;
};

export type IndustryConsumptionResult = {
  consumo: Map<string, number>;
  estoqueAgregado: Map<string, number>;
};

type Closing = IndustryClosingInput & { key: string };

function assertPeriod(period: string, name = "period"): void {
  if (typeof period !== "string" || !/^\d{6}$/.test(period)) {
    throw new Error(`${name} must be a valid YYYYMM period`);
  }

  const month = Number(period.slice(4, 6));
  if (month < 1 || month > 12) {
    throw new Error(`${name} must be a valid YYYYMM period`);
  }
}

function assertFiniteValue(value: number): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("value must be finite");
  }
}

function previousPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));
  if (month === 1) return `${year - 1}12`;
  return `${year}${String(month - 1).padStart(2, "0")}`;
}

function keyFor(branch: string, product: string, period: string): string {
  return `${branch}\u0000${product}\u0000${period}`;
}

function aggregateKey(branch: string, aggregate: string): string {
  return `${branch}|${aggregate}`;
}

export class IndustryConsumptionAccumulator {
  private readonly beginYYYYMM: string;
  private readonly endYYYYMM: string;
  private readonly closings = new Map<string, Closing>();
  private readonly entries = new Map<string, number>();

  constructor(beginYYYYMM: string, endYYYYMM: string) {
    assertPeriod(beginYYYYMM, "beginYYYYMM");
    assertPeriod(endYYYYMM, "endYYYYMM");
    if (beginYYYYMM > endYYYYMM) {
      throw new Error("beginYYYYMM must not be after endYYYYMM");
    }

    this.beginYYYYMM = beginYYYYMM;
    this.endYYYYMM = endYYYYMM;
  }

  addClosing(input: IndustryClosingInput): void {
    assertPeriod(input.period);
    assertFiniteValue(input.value);

    const key = keyFor(input.branch, input.product, input.period);
    const previous = this.closings.get(key);
    if (previous) {
      previous.value += input.value;
      previous.aggregate = input.aggregate;
      return;
    }

    this.closings.set(key, { ...input, key });
  }

  addEntry(input: IndustryEntryInput): void {
    assertPeriod(input.period);
    assertFiniteValue(input.value);

    const key = keyFor(input.branch, input.product, input.period);
    this.entries.set(key, (this.entries.get(key) ?? 0) + input.value);
  }

  finish(): IndustryConsumptionResult {
    const consumo = new Map<string, number>();
    const estoqueAgregado = new Map<string, number>();
    const products = new Set<string>();

    for (const closing of this.closings.values()) {
      products.add(`${closing.branch}\u0000${closing.product}`);
    }

    for (const productKey of products) {
      const separator = productKey.indexOf("\u0000");
      const branch = productKey.slice(0, separator);
      const product = productKey.slice(separator + 1);
      const currentClosingKey = keyFor(branch, product, this.beginYYYYMM);
      let closing = this.closings.get(currentClosingKey);
      let lastAvailable: Closing | undefined;

      for (const candidate of this.closings.values()) {
        if (candidate.branch !== branch || candidate.product !== product) continue;
        if (candidate.period < this.beginYYYYMM || candidate.period > this.endYYYYMM) continue;
        if (!lastAvailable || candidate.period > lastAvailable.period) lastAvailable = candidate;
      }

      if (lastAvailable) {
        const stockKey = aggregateKey(branch, lastAvailable.aggregate);
        estoqueAgregado.set(stockKey, (estoqueAgregado.get(stockKey) ?? 0) + lastAvailable.value);
      }

      for (let period = this.beginYYYYMM; period <= this.endYYYYMM; period = nextPeriod(period)) {
        closing = this.closings.get(keyFor(branch, product, period));
        if (!closing) continue;

        const previous = this.closings.get(keyFor(branch, product, previousPeriod(period)));
        if (!previous) continue;

        const entries = this.entries.get(keyFor(branch, product, period)) ?? 0;
        const consumption = Math.max(0, previous.value + entries - closing.value);
        const consumptionKey = `${branch}|${closing.aggregate}|${period}`;
        consumo.set(consumptionKey, (consumo.get(consumptionKey) ?? 0) + consumption);
      }
    }

    return { consumo, estoqueAgregado };
  }
}

function nextPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));
  if (month === 12) return `${year + 1}01`;
  return `${year}${String(month + 1).padStart(2, "0")}`;
}
