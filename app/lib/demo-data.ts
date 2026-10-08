export type DemoRecord = Record<string, string>;

export function readDemoRecords(pathname: string, fallback: DemoRecord[]): DemoRecord[] {
  try {
    const stored = window.localStorage.getItem(`smartcampus_data_${pathname}`);
    if (!stored) return fallback;

    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every(isDemoRecord)) {
      throw new Error("O formato dos registos locais não é válido.");
    }
    return parsed;
  } catch (error) {
    console.error(`Não foi possível carregar os dados locais (${pathname}).`, error);
    return fallback;
  }
}

export function writeDemoRecords(pathname: string, records: DemoRecord[]) {
  window.localStorage.setItem(`smartcampus_data_${pathname}`, JSON.stringify(records));
}

export function readDemoValue<T>(key: string, fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch (error) {
    console.error(`Não foi possível carregar os dados locais (${key}).`, error);
    return fallback;
  }
}

export function writeDemoValue<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function appendDemoLog(activity: string, user: string, destination: string) {
  const logs = readDemoRecords("/logs", []);
  const now = new Date();
  logs.unshift({
    atividade: activity,
    utilizador: user,
    destino: destination,
    data: `${now.toLocaleDateString("pt-PT")} ${now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`,
  });
  writeDemoRecords("/logs", logs.slice(0, 200));
}

export function downloadCsv(filename: string, records: DemoRecord[]) {
  if (!records.length) return;

  const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const escapeCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const rows = [columns, ...records.map((record) => columns.map((column) => record[column] ?? ""))];
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(";")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function isDemoRecord(value: unknown): value is DemoRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}
