function mapHeaders(header: CsvRow) {
  // REGRA (09/11/2026): o export do Protheus pode ter colunas DUPLICADAS
  // (o SB1 traz 'Familia' duas vezes — a primeira com o código real, a
  // segunda vazia). O Map guardava a ÚLTIMA ocorrência e o parser lia a
  // coluna vazia. Mantém a PRIMEIRA ocorrência de cada nome.
  const map = new Map<string, number>();
  header.forEach((value, index) => {
    const key = normalizeHeader(value);
    if (!map.has(key)) map.set(key, index);
  });
  return map;
}