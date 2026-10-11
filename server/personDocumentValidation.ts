export type PersonType = "PF" | "PJ";

function onlyAsciiUpper(value: string) {
  return value.normalize("NFKC").trim().toUpperCase();
}

export function normalizeDocument(value: string) {
  return onlyAsciiUpper(value).replace(/[.\-/\s]/g, "");
}

function hasRepeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value);
}

export function isValidCpf(value: string) {
  const digits = normalizeDocument(value);
  if (!/^\d{11}$/.test(digits) || hasRepeatedDigits(digits)) return false;
  const calculate = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(digits[index]) * (length + 1 - index);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculate(9) === Number(digits[9]) && calculate(10) === Number(digits[10]);
}

function cnpjCharacterValue(character: string) {
  if (/\d/.test(character)) return Number(character);
  return character.charCodeAt(0) - 48;
}

function calculateCnpjDigit(base: string, weights: number[]) {
  const sum = [...base].reduce((total, character, index) => total + cnpjCharacterValue(character) * weights[index], 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(value: string) {
  const document = normalizeDocument(value);
  if (!/^[A-Z0-9]{14}$/.test(document) || !/[A-Z]/.test(document) && hasRepeatedDigits(document)) return false;
  const firstDigit = calculateCnpjDigit(document.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = calculateCnpjDigit(`${document.slice(0, 12)}${firstDigit}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return firstDigit === Number(document[12]) && secondDigit === Number(document[13]);
}

export function validatePersonDocument(personType: PersonType, value: string) {
  const normalized = normalizeDocument(value);
  const valid = personType === "PF" ? isValidCpf(normalized) : isValidCnpj(normalized);
  return {
    valid,
    normalized,
    message: valid ? undefined : personType === "PF" ? "Informe um CPF válido." : "Informe um CNPJ válido, numérico ou alfanumérico, com 14 posições e dígitos verificadores corretos.",
  };
}

export function validateCardNumber(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized === "" || /^[A-Za-z0-9][A-Za-z0-9 .\/-]{0,31}$/.test(normalized);
}
