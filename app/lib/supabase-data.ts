import { isSupabaseConfigured, supabase } from "./supabase";

type RecordItem = Record<string, string>;

const tableMap: Record<string, string> = {
  "/alunos": "students",
  "/professor": "teachers",
  "/turmas": "classes",
  "/disciplinas": "disciplines",
  "/presencas": "attendance",
  "/horarios": "schedule",
  "/salas": "rooms",
  "/computadores": "computers",
  "/qr-code": "qr_codes",
  "/logs": "activity_logs",
  "/utilizadores": "profiles",
};

export async function readSupabaseRecords(pathname: string, fallback: RecordItem[]): Promise<RecordItem[]> {
  if (!isSupabaseConfigured || !supabase) return fallback;

  const table = tableMap[pathname];
  if (!table) return fallback;

  const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false });
  if (error) {
    console.error(`Não foi possível carregar ${table} do Supabase.`, error);
    return fallback;
  }

  if (!data) return fallback;

  return data.map((row) => normalizeRowForClient(pathname, row));
}

export async function writeSupabaseRecords(pathname: string, records: RecordItem[]) {
  if (!isSupabaseConfigured || !supabase) return false;

  const table = tableMap[pathname];
  if (!table) return false;

  const { error: clearError } = await supabase.from(table).delete().neq("id", "");
  if (clearError) {
    console.error(`Não foi possível limpar ${table} antes de guardar.`, clearError);
    return false;
  }

  if (!records.length) return true;

  const rows = records.map((record) => normalizeRowForTable(pathname, record));
  const { error } = await supabase.from(table).insert(rows);

  if (error) {
    console.error(`Não foi possível guardar ${table} no Supabase.`, error);
    return false;
  }

  return true;
}

function normalizeRowForClient(pathname: string, row: Record<string, unknown>): RecordItem {
  const source = { ...row } as Record<string, string>;

  switch (pathname) {
    case "/alunos":
      return {
        nome: String(source.nome ?? ""),
        número: String(source.numero ?? ""),
        turma: String(source.turma ?? ""),
        email: String(source.email ?? ""),
        estado: String(source.estado ?? "Ativo"),
      };
    case "/professor":
      return {
        nome: String(source.nome ?? ""),
        disciplina: String(source.disciplina ?? ""),
        turmas: String(source.turmas ?? ""),
        email: String(source.email ?? ""),
        estado: String(source.estado ?? "Ativo"),
      };
    case "/turmas":
      return {
        turma: String(source.turma ?? ""),
        curso: String(source.curso ?? ""),
        diretor: String(source.diretor ?? ""),
        sala: String(source.sala ?? ""),
        "ano letivo": String(source.ano_letivo ?? ""),
        alunos: String(source.alunos ?? ""),
      };
    case "/disciplinas":
      return {
        disciplina: String(source.disciplina ?? ""),
        código: String(source.codigo ?? ""),
        professor: String(source.professor ?? ""),
        turmas: String(source.turmas ?? ""),
        "carga horária": String(source.carga_horaria ?? ""),
        estado: String(source.estado ?? "Ativa"),
      };
    case "/presencas":
      return {
        aluno: String(source.aluno ?? ""),
        turma: String(source.turma ?? ""),
        disciplina: String(source.disciplina ?? ""),
        sala: String(source.sala ?? ""),
        data: String(source.data ?? ""),
        hora: String(source.hora ?? ""),
        estado: String(source.estado ?? "Presente"),
      };
    case "/horarios":
      return {
        dia: String(source.dia ?? ""),
        hora: String(source.hora ?? ""),
        turma: String(source.turma ?? ""),
        disciplina: String(source.disciplina ?? ""),
        professor: String(source.professor ?? ""),
        sala: String(source.sala ?? ""),
      };
    case "/salas":
      return {
        sala: String(source.sala ?? ""),
        edifício: String(source.edificio ?? ""),
        capacidade: String(source.capacidade ?? ""),
        equipamentos: String(source.equipamentos ?? ""),
        estado: String(source.estado ?? "Disponível"),
      };
    case "/computadores":
      return {
        computador: String(source.computador ?? ""),
        sala: String(source.sala ?? ""),
        utilizador: String(source.utilizador ?? "—"),
        utilização: String(source.utilizacao ?? "—"),
        estado: String(source.estado ?? "Livre"),
      };
    case "/qr-code":
      return {
        código: String(source.codigo ?? ""),
        tipo: String(source.tipo ?? ""),
        destino: String(source.destino ?? ""),
        criado: String(source.criado ?? ""),
        estado: String(source.estado ?? "Ativo"),
      };
    case "/logs":
      return {
        atividade: String(source.atividade ?? ""),
        utilizador: String(source.utilizador ?? ""),
        destino: String(source.destino ?? ""),
        data: String(source.data ?? ""),
      };
    case "/utilizadores":
      return {
        nome: String(source.full_name ?? ""),
        email: String(source.email ?? ""),
        perfil: String(source.role ?? "Aluno"),
        estado: String(source.estado ?? "Ativo"),
      };
    default:
      return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, String(value ?? "")])) as RecordItem;
  }
}

function normalizeRowForTable(pathname: string, record: RecordItem): Record<string, string> {
  switch (pathname) {
    case "/alunos":
      return {
        nome: record.nome ?? "",
        numero: record["número"] ?? "",
        turma: record.turma ?? "",
        email: record.email ?? "",
        estado: record.estado ?? "Ativo",
      };
    case "/professor":
      return {
        nome: record.nome ?? "",
        disciplina: record.disciplina ?? "",
        turmas: record.turmas ?? "",
        email: record.email ?? "",
        estado: record.estado ?? "Ativo",
      };
    case "/turmas":
      return {
        turma: record.turma ?? "",
        curso: record.curso ?? "",
        diretor: record.diretor ?? "",
        sala: record.sala ?? "",
        ano_letivo: record["ano letivo"] ?? "",
        alunos: record.alunos ?? "",
      };
    case "/disciplinas":
      return {
        disciplina: record.disciplina ?? "",
        codigo: record["código"] ?? "",
        professor: record.professor ?? "",
        turmas: record.turmas ?? "",
        carga_horaria: record["carga horária"] ?? "",
        estado: record.estado ?? "Ativa",
      };
    case "/presencas":
      return {
        aluno: record.aluno ?? "",
        turma: record.turma ?? "",
        disciplina: record.disciplina ?? "",
        sala: record.sala ?? "",
        data: record.data ?? "",
        hora: record.hora ?? "",
        estado: record.estado ?? "Presente",
      };
    case "/horarios":
      return {
        dia: record.dia ?? "",
        hora: record.hora ?? "",
        turma: record.turma ?? "",
        disciplina: record.disciplina ?? "",
        professor: record.professor ?? "",
        sala: record.sala ?? "",
      };
    case "/salas":
      return {
        sala: record.sala ?? "",
        edificio: record["edifício"] ?? "",
        capacidade: record.capacidade ?? "",
        equipamentos: record.equipamentos ?? "",
        estado: record.estado ?? "Disponível",
      };
    case "/computadores":
      return {
        computador: record.computador ?? "",
        sala: record.sala ?? "",
        utilizador: record.utilizador ?? "—",
        utilizacao: record["utilização"] ?? "—",
        estado: record.estado ?? "Livre",
      };
    case "/qr-code":
      return {
        codigo: record["código"] ?? "",
        tipo: record.tipo ?? "",
        destino: record.destino ?? "",
        criado: record.criado ?? "",
        estado: record.estado ?? "Ativo",
      };
    case "/logs":
      return {
        atividade: record.atividade ?? "",
        utilizador: record.utilizador ?? "",
        destino: record.destino ?? "",
        data: record.data ?? "",
      };
    case "/utilizadores":
      return {
        full_name: record.nome ?? "",
        email: record.email ?? "",
        role: record.perfil ?? "Aluno",
        estado: record.estado ?? "Ativo",
      };
    default:
      return record;
  }
}
