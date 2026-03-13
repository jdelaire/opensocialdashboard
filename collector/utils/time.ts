const bangkokFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function bangkokDate(input: Date = new Date()): string {
  const parts = bangkokFormatter.formatToParts(input);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Unable to format Bangkok date");
  }

  return `${year}-${month}-${day}`;
}

export function bangkokDateMinusDays(date: string, days: number): string {
  const tokens = date.split("-");
  if (tokens.length !== 3) {
    throw new Error(`Invalid date: ${date}`);
  }

  const year = Number(tokens[0]);
  const month = Number(tokens[1]);
  const day = Number(tokens[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error(`Invalid date: ${date}`);
  }

  const utc = Date.UTC(year, month - 1, day);
  const shifted = new Date(utc - days * 24 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}
