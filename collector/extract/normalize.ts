const SUFFIX_MULTIPLIERS: Record<string, number> = {
  K: 1_000,
  M: 1_000_000,
  B: 1_000_000_000,
  千: 1_000,
  万: 10_000,
  萬: 10_000,
  亿: 100_000_000,
  億: 100_000_000
};

function normalizeSpacedValue(input: string): string {
  return input.replace(/[\u00A0\u202F]/g, " ").trim();
}

function normalizeEscapedCompactUnits(input: string): string {
  return input
    .replace(/\\u5343/gi, "千")
    .replace(/\\u4e07/gi, "万")
    .replace(/\\u842c/gi, "萬")
    .replace(/\\u4ebf/gi, "亿")
    .replace(/\\u5104/gi, "億");
}

function parseCompactNumber(value: string): number | null {
  const compact = value.replace(/\s+/g, "");
  const commaCount = (compact.match(/,/g) || []).length;
  const dotCount = (compact.match(/\./g) || []).length;

  let normalized = compact;

  if (commaCount > 0 && dotCount > 0) {
    const lastComma = compact.lastIndexOf(",");
    const lastDot = compact.lastIndexOf(".");
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandsSep = decimalSep === "." ? "," : ".";
    normalized = compact.split(thousandsSep).join("").replace(decimalSep, ".");
  } else if (commaCount > 0) {
    if (/^\d{1,3}(,\d{3})+$/.test(compact)) {
      normalized = compact.replace(/,/g, "");
    } else if (/^\d+,\d{1,2}$/.test(compact)) {
      normalized = compact.replace(",", ".");
    } else {
      return null;
    }
  } else if (dotCount > 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(compact)) {
      normalized = compact.replace(/\./g, "");
    } else if (/^\d+\.\d{1,2}$/.test(compact)) {
      normalized = compact;
    } else {
      return null;
    }
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntegerNumber(value: string): number | null {
  const compact = value.replace(/\s+/g, "");

  if (/^\d+$/.test(compact)) {
    return Number.parseInt(compact, 10);
  }

  if (/^\d{1,3}([,.]\d{3})+$/.test(compact)) {
    return Number.parseInt(compact.replace(/[,.]/g, ""), 10);
  }

  return null;
}

export function parseFollowerCount(rawInput: string): number | null {
  const input = normalizeEscapedCompactUnits(normalizeSpacedValue(rawInput));
  const match = input.match(/([0-9][0-9\s,._]*)(?:\s*([kKmMbB千萬万亿億]))?/);

  if (!match) {
    return null;
  }
  if (match.index === undefined) {
    return null;
  }

  const valuePartRaw = match[1];
  if (!valuePartRaw) {
    return null;
  }
  const valuePart = valuePartRaw.replace(/_/g, "").trim();
  const rawSuffix = match[2];
  const suffix = rawSuffix
    ? /[a-z]/i.test(rawSuffix)
      ? rawSuffix.toUpperCase()
      : rawSuffix
    : undefined;
  const matchedText = match[0];
  const tail = input.slice(match.index + matchedText.length).trimStart();

  // Avoid treating lower-bound/range-style values (for example "10+") as exact counts.
  if (/^[+~≈＞>]/.test(tail)) {
    return null;
  }
  // Avoid treating localized compact units (for example "1千+" or "2万") as plain integers.
  if (!suffix && /^[千萬万亿億]/.test(tail)) {
    return null;
  }

  if (suffix) {
    const base = parseCompactNumber(valuePart);
    const multiplier = SUFFIX_MULTIPLIERS[suffix];
    if (base === null) {
      return null;
    }
    if (!multiplier) {
      return null;
    }
    return Math.round(base * multiplier);
  }

  return parseIntegerNumber(valuePart);
}
