type RecordItem = Record<string, string>;

export async function readSupabaseRecords(
  pathname: string,
  _fallback: RecordItem[] = []
): Promise<RecordItem[]> {
  try {
    const response = await fetch("/api/campus-data?resource=" + encodeURIComponent(pathname), {
      cache: "no-store",
    });
    const result = await response.json();

    if (!response.ok) {
      console.error("Não foi possível carregar " + pathname + ":", result.error);
      return [];
    }

    return Array.isArray(result.records) ? (result.records as RecordItem[]) : [];
  } catch (error) {
    console.error("Falha ao consultar " + pathname + ".", error);
    return [];
  }
}

export async function readLookupRecords(resource: string): Promise<RecordItem[]> {
  try {
    const response = await fetch("/api/campus-data?resource=" + encodeURIComponent("lookup:" + resource), {
      cache: "no-store",
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível carregar as opções.");
    }

    return Array.isArray(result.records) ? (result.records as RecordItem[]) : [];
  } catch (error) {
    console.error("Falha ao carregar opções de " + resource + ".", error);
    return [];
  }
}

export async function saveSupabaseRecord(
  resource: string,
  record: RecordItem,
  id?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("/api/campus-data", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource, id, record }),
    });
    const result = await response.json();

    if (!response.ok) {
      return { ok: false, error: result.error || "Não foi possível guardar o registo." };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível comunicar com o servidor." };
  }
}

export async function deleteSupabaseRecord(
  resource: string,
  id: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("/api/campus-data", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource, id }),
    });
    const result = await response.json();

    if (!response.ok) {
      return { ok: false, error: result.error || "Não foi possível eliminar o registo." };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível comunicar com o servidor." };
  }
}

export async function updateSupabaseRecord(
  resource: string,
  id: string,
  record: RecordItem
): Promise<{ ok: boolean; error?: string }> {
  return saveSupabaseRecord(resource, record, id);
}
