import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Role = "Aluno" | "Professor" | "Funcionário" | "Administrador Adjunto" | "Administrador";
type Row = Record<string, unknown>;
type RecordItem = Record<string, string>;

const allRoles: Role[] = ["Aluno", "Professor", "Funcionário", "Administrador Adjunto", "Administrador"];
const adminRoles: Role[] = ["Administrador", "Administrador Adjunto"];

const readableRoles: Record<string, Role[]> = {
  "/anos-letivos": ["Administrador", "Administrador Adjunto"],
  "/alunos": ["Administrador", "Administrador Adjunto", "Professor", "Aluno"],
  "/professor": ["Administrador", "Administrador Adjunto", "Professor"],
  "/turmas": ["Administrador", "Administrador Adjunto", "Professor", "Aluno"],
  "/disciplinas": ["Administrador", "Administrador Adjunto", "Professor", "Aluno"],
  "/presencas": ["Administrador", "Administrador Adjunto", "Professor", "Aluno"],
  "/horarios": ["Administrador", "Administrador Adjunto", "Professor", "Aluno", "Funcionário"],
  "/salas": ["Administrador", "Administrador Adjunto", "Professor", "Aluno", "Funcionário"],
  "/computadores": ["Administrador", "Administrador Adjunto", "Professor", "Aluno", "Funcionário"],
  "/qr-code": ["Administrador", "Administrador Adjunto", "Professor", "Aluno"],
  "/logs": ["Administrador", "Administrador Adjunto"],
};

function text(row: Row | undefined, key: string, fallback = ""): string {
  const value = row?.[key];
  return value === null || value === undefined ? fallback : String(value);
}

function asRows(data: unknown): Row[] {
  return Array.isArray(data) ? (data as Row[]) : [];
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function isAdmin(role: Role) {
  return adminRoles.includes(role);
}

async function readTable(admin: ReturnType<typeof createAdminClient>, table: string): Promise<Row[]> {
  const { data, error } = await admin.from(table).select("*");
  if (error) throw new Error("Não foi possível ler a tabela " + table + ".");
  return asRows(data);
}

async function classIdsForUser(
  admin: ReturnType<typeof createAdminClient>,
  role: Role,
  userId: string
): Promise<string[]> {
  if (role === "Professor") {
    const { data, error } = await admin
      .from("professores_turmas")
      .select("turma_id")
      .eq("professor_id", userId)
      .is("data_fim", null);
    if (error) throw new Error("Não foi possível consultar as turmas atribuídas.");
    return unique(asRows(data).map((row) => text(row, "turma_id")));
  }

  if (role === "Aluno") {
    const { data, error } = await admin
      .from("alunos_turmas")
      .select("turma_id")
      .eq("aluno_id", userId)
      .is("data_fim", null);
    if (error) throw new Error("Não foi possível consultar as turmas do aluno.");
    return unique(asRows(data).map((row) => text(row, "turma_id")));
  }

  return [];
}

async function timetableIdsForTeacher(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<string[]> {
  const { data, error } = await admin.from("horarios").select("id").eq("professor_id", userId);
  if (error) throw new Error("Não foi possível consultar os horários do professor.");
  return unique(asRows(data).map((row) => text(row, "id")));
}

async function subjectIdsForUser(
  admin: ReturnType<typeof createAdminClient>,
  role: Role,
  userId: string,
  classIds: string[]
): Promise<string[]> {
  let relationRows: Row[] = [];

  if (role === "Professor") {
    const { data, error } = await admin
      .from("professores_disciplinas_turmas")
      .select("disciplina_turma_id")
      .eq("professor_id", userId);
    if (error) throw new Error("Não foi possível consultar as disciplinas do professor.");
    relationRows = asRows(data);
  } else if (role === "Aluno" && classIds.length) {
    const { data, error } = await admin
      .from("disciplinas_turmas")
      .select("id")
      .in("turma_id", classIds);
    if (error) throw new Error("Não foi possível consultar as disciplinas da turma.");
    relationRows = asRows(data).map((row) => ({ disciplina_turma_id: row.id }));
  }

  const disciplineClassIds = unique(relationRows.map((row) => text(row, "disciplina_turma_id")));
  if (!disciplineClassIds.length) return [];

  const { data, error } = await admin
    .from("disciplinas_turmas")
    .select("disciplina_id")
    .in("id", disciplineClassIds);
  if (error) throw new Error("Não foi possível consultar as disciplinas associadas.");
  return unique(asRows(data).map((row) => text(row, "disciplina_id")));
}

async function enrich(
  resource: string,
  rows: Row[],
  admin: ReturnType<typeof createAdminClient>,
  role: Role
): Promise<RecordItem[]> {
  if (!rows.length) return [];

  const users = await readTable(admin, "users");
  const userById = new Map(users.map((row) => [text(row, "id"), row]));

  if (resource === "/alunos") {
    return rows.map((row) => {
      const user = userById.get(text(row, "id"));
      return {
        id: text(row, "id"),
        nome: text(user, "name", "Aluno"),
        email: text(user, "email"),
        estado: text(user, "status", "Ativo"),
        número: text(row, "student_number"),
        "ano escolar": text(row, "school_year"),
        curso: text(row, "course"),
        "data de inscrição": text(row, "enrollment_date"),
        ...(isAdmin(role)
          ? {
              "encarregado de educação": text(row, "guardian_name"),
              "relação com encarregado": text(row, "guardian_relationship"),
              "contacto do encarregado": text(row, "guardian_phone"),
            }
          : {}),
      };
    });
  }

  if (resource === "/professor") {
    return rows.map((row) => {
      const user = userById.get(text(row, "id"));
      return {
        id: text(row, "id"),
        nome: text(user, "name", "Professor"),
        email: text(user, "email"),
        número: text(row, "professional_number"),
        departamento: text(row, "department"),
        "data de contratação": text(row, "hiring_date"),
        "tipo de contrato": text(row, "contract_type"),
        estado: text(row, "professional_status", "Ativo"),
      };
    });
  }

  if (resource === "/turmas") {
    const [years, teachers] = await Promise.all([
      readTable(admin, "anos_letivos"),
      readTable(admin, "professores"),
    ]);
    const yearById = new Map(years.map((row) => [text(row, "id"), row]));
    const teacherById = new Map(teachers.map((row) => [text(row, "id"), row]));
    return rows.map((row) => {
      const coordinator = teacherById.get(text(row, "professor_coordenador_id"));
      const coordinatorUser = userById.get(text(coordinator, "id"));
      return {
        id: text(row, "id"),
        turma: text(row, "nome"),
        "ano letivo": text(yearById.get(text(row, "ano_letivo_id")), "nome"),
        "ano escolar": text(row, "ano_escolar"),
        curso: text(row, "curso"),
        capacidade: text(row, "capacidade"),
        "professor coordenador": text(coordinatorUser, "name"),
        estado: text(row, "estado", "Ativa"),
        ano_letivo_id: text(row, "ano_letivo_id"),
        professor_coordenador_id: text(row, "professor_coordenador_id"),
      };
    });
  }

  if (resource === "/disciplinas") {
    return rows.map((row) => ({
      id: text(row, "id"),
      disciplina: text(row, "nome"),
      código: text(row, "codigo"),
      departamento: text(row, "departamento"),
      descrição: text(row, "descricao"),
      estado: text(row, "estado", "Ativa"),
    }));
  }

  if (resource === "/salas") {
    return rows.map((row) => ({
      id: text(row, "id"),
      sala: text(row, "nome"),
      edifício: text(row, "edificio"),
      piso: text(row, "piso"),
      capacidade: text(row, "capacidade"),
      tipo: text(row, "tipo"),
      estado: text(row, "estado", "Ativa"),
      observações: text(row, "observacoes"),
    }));
  }

  if (resource === "/computadores") {
    const rooms = await readTable(admin, "salas");
    const roomById = new Map(rooms.map((row) => [text(row, "id"), row]));
    return rows.map((row) => {
      const state = text(row, "estado", "Operacional");
      return {
        id: text(row, "id"),
        computador: text(row, "nome"),
        sala: text(roomById.get(text(row, "sala_id")), "nome"),
        tipo: text(row, "tipo"),
        "número de inventário": text(row, "numero_inventario"),
        marca: text(row, "marca"),
        modelo: text(row, "modelo"),
        estado: state === "Operacional" ? "Livre" : state === "Avariado" ? "Manutenção" : state === "Em manutenção" ? "Manutenção" : state,
        __estado_db: state,
        sala_id: text(row, "sala_id"),
        numero_serie: text(row, "numero_serie"),
        observacoes: text(row, "observacoes"),
      };
    });
  }

  if (resource === "/horarios") {
    const [classes, subjects, teachers, rooms] = await Promise.all([
      readTable(admin, "turmas"),
      readTable(admin, "disciplinas_turmas"),
      readTable(admin, "professores"),
      readTable(admin, "salas"),
    ]);
    const disciplines = await readTable(admin, "disciplinas");
    const classMap = new Map(classes.map((row) => [text(row, "id"), row]));
    const relationMap = new Map(subjects.map((row) => [text(row, "id"), row]));
    const disciplineMap = new Map(disciplines.map((row) => [text(row, "id"), row]));
    const teacherMap = new Map(teachers.map((row) => [text(row, "id"), row]));
    const roomMap = new Map(rooms.map((row) => [text(row, "id"), row]));
    const dayNames = ["", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];

    return rows.map((row) => {
      const relation = relationMap.get(text(row, "disciplina_turma_id"));
      const teacher = teacherMap.get(text(row, "professor_id"));
      const teacherUser = userById.get(text(teacher, "id"));
      return {
        id: text(row, "id"),
        dia: dayNames[Number(text(row, "dia_semana"))] || text(row, "dia_semana"),
        hora: text(row, "hora_inicio") + " – " + text(row, "hora_fim"),
        turma: text(classMap.get(text(row, "turma_id")), "nome"),
        disciplina: text(disciplineMap.get(text(relation, "disciplina_id")), "nome"),
        professor: text(teacherUser, "name"),
        sala: text(roomMap.get(text(row, "sala_id")), "nome"),
        turma_id: text(row, "turma_id"),
        disciplina_turma_id: text(row, "disciplina_turma_id"),
        professor_id: text(row, "professor_id"),
        sala_id: text(row, "sala_id"),
        dia_semana: text(row, "dia_semana"),
        hora_inicio: text(row, "hora_inicio"),
        hora_fim: text(row, "hora_fim"),
        observações: text(row, "observacoes"),
      };
    });
  }

  if (resource === "/presencas") {
    const [students, schedules, classes, rooms, disciplineRelations, disciplines] = await Promise.all([
      readTable(admin, "alunos"),
      readTable(admin, "horarios"),
      readTable(admin, "turmas"),
      readTable(admin, "salas"),
      readTable(admin, "disciplinas_turmas"),
      readTable(admin, "disciplinas"),
    ]);
    const studentMap = new Map(students.map((row) => [text(row, "id"), row]));
    const scheduleMap = new Map(schedules.map((row) => [text(row, "id"), row]));
    const classMap = new Map(classes.map((row) => [text(row, "id"), row]));
    const roomMap = new Map(rooms.map((row) => [text(row, "id"), row]));
    const relationMap = new Map(disciplineRelations.map((row) => [text(row, "id"), row]));
    const disciplineMap = new Map(disciplines.map((row) => [text(row, "id"), row]));
    return rows.map((row) => {
      const student = studentMap.get(text(row, "aluno_id"));
      const user = userById.get(text(student, "id"));
      const schedule = scheduleMap.get(text(row, "horario_id"));
      const relation = relationMap.get(text(schedule, "disciplina_turma_id"));
      const state = text(row, "estado", "Presente");
      return {
        id: text(row, "id"),
        aluno: text(user, "name", "Aluno"),
        turma: text(classMap.get(text(schedule, "turma_id")), "nome"),
        disciplina: text(disciplineMap.get(text(relation, "disciplina_id")), "nome"),
        sala: text(roomMap.get(text(schedule, "sala_id")), "nome"),
        data: text(row, "data"),
        hora: text(schedule, "hora_inicio"),
        estado: state === "Falta" ? "Ausente" : state === "Atraso" ? "Atrasado" : state,
        aluno_id: text(row, "aluno_id"),
        horario_id: text(row, "horario_id"),
        observações: text(row, "observacoes"),
      };
    });
  }

  if (resource === "/logs") {
    return rows.map((row) => ({
      id: text(row, "id"),
      atividade: text(row, "acao"),
      utilizador: text(userById.get(text(row, "user_id")), "name"),
      destino: [text(row, "entidade"), text(row, "descricao")].filter(Boolean).join(" · "),
      data: text(row, "created_at"),
    }));
  }

  return rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value === null || value === undefined ? "" : String(value)])
  ) as RecordItem);
}

async function lookupRecords(resource: string, admin: ReturnType<typeof createAdminClient>): Promise<RecordItem[]> {
  if (resource === "lookup:anos_letivos") {
    const rows = await readTable(admin, "anos_letivos");
    return rows.map((row) => ({ id: text(row, "id"), label: text(row, "nome") + (row.ativo === true ? " (ativo)" : "") }));
  }
  if (resource === "lookup:salas") {
    const rows = await readTable(admin, "salas");
    return rows.filter((row) => text(row, "estado") === "Ativa").map((row) => ({ id: text(row, "id"), label: text(row, "nome") }));
  }
  if (resource === "lookup:professores") {
    const [rows, users] = await Promise.all([readTable(admin, "professores"), readTable(admin, "users")]);
    const usersById = new Map(users.map((row) => [text(row, "id"), row]));
    return rows.map((row) => ({ id: text(row, "id"), label: text(usersById.get(text(row, "id")), "name", text(row, "professional_number")) }));
  }
  if (resource === "lookup:turmas") {
    const rows = await readTable(admin, "turmas");
    return rows.filter((row) => text(row, "estado") === "Ativa").map((row) => ({ id: text(row, "id"), label: text(row, "nome") + " · " + text(row, "curso") }));
  }
  if (resource === "lookup:disciplinas_turmas") {
    const [relations, classes, disciplines] = await Promise.all([
      readTable(admin, "disciplinas_turmas"),
      readTable(admin, "turmas"),
      readTable(admin, "disciplinas"),
    ]);
    const classMap = new Map(classes.map((row) => [text(row, "id"), row]));
    const disciplineMap = new Map(disciplines.map((row) => [text(row, "id"), row]));
    return relations.map((row) => ({
      id: text(row, "id"),
      label: text(disciplineMap.get(text(row, "disciplina_id")), "nome") + " · " + text(classMap.get(text(row, "turma_id")), "nome"),
    }));
  }
  if (resource === "lookup:alunos") {
    const [students, users] = await Promise.all([readTable(admin, "alunos"), readTable(admin, "users")]);
    const usersById = new Map(users.map((row) => [text(row, "id"), row]));
    return students.map((row) => ({
      id: text(row, "id"),
      label: text(usersById.get(text(row, "id")), "name") + " · " + text(row, "student_number"),
    }));
  }
  if (resource === "lookup:horarios") {
    const [schedules, classes] = await Promise.all([readTable(admin, "horarios"), readTable(admin, "turmas")]);
    const classMap = new Map(classes.map((row) => [text(row, "id"), row]));
    return schedules.map((row) => ({
      id: text(row, "id"),
      label: text(classMap.get(text(row, "turma_id")), "nome") + " · " + text(row, "hora_inicio") + "–" + text(row, "hora_fim"),
    }));
  }
  return [];
}

function payloadToRow(resource: string, input: Row): Row | null {
  if (resource === "/anos-letivos") {
    return {
      nome: text(input, "nome").trim(),
      data_inicio: text(input, "data_inicio").trim(),
      data_fim: text(input, "data_fim").trim(),
      ativo: text(input, "ativo").toLowerCase() === "true",
    };
  }
  if (resource === "/disciplinas") {
    return {
      nome: text(input, "nome", text(input, "disciplina")).trim(),
      codigo: text(input, "codigo", text(input, "código")).trim() || null,
      departamento: text(input, "departamento").trim() || null,
      descricao: text(input, "descricao", text(input, "descrição")).trim() || null,
      estado: text(input, "estado", "Ativa"),
    };
  }
  if (resource === "/salas") {
    return {
      nome: text(input, "nome", text(input, "sala")).trim(),
      edificio: text(input, "edificio", text(input, "edifício")).trim() || null,
      piso: text(input, "piso").trim() || null,
      capacidade: Number(text(input, "capacidade", "30")),
      tipo: text(input, "tipo", "Sala de aula"),
      estado: text(input, "estado", "Ativa"),
      observacoes: text(input, "observacoes", text(input, "observações")).trim() || null,
    };
  }
  if (resource === "/turmas") {
    return {
      nome: text(input, "nome", text(input, "turma")).trim(),
      ano_letivo_id: text(input, "ano_letivo_id").trim(),
      ano_escolar: text(input, "ano_escolar", text(input, "ano escolar")).trim(),
      curso: text(input, "curso").trim(),
      capacidade: Number(text(input, "capacidade", "30")),
      estado: text(input, "estado", "Ativa"),
      professor_coordenador_id: text(input, "professor_coordenador_id").trim() || null,
    };
  }
  if (resource === "/horarios") {
    return {
      turma_id: text(input, "turma_id").trim(),
      disciplina_turma_id: text(input, "disciplina_turma_id").trim(),
      professor_id: text(input, "professor_id").trim(),
      sala_id: text(input, "sala_id").trim(),
      dia_semana: Number(text(input, "dia_semana")),
      hora_inicio: text(input, "hora_inicio").trim(),
      hora_fim: text(input, "hora_fim").trim(),
      observacoes: text(input, "observacoes", text(input, "observações")).trim() || null,
    };
  }
  if (resource === "/presencas") {
    const status = text(input, "estado", "Presente");
    return {
      aluno_id: text(input, "aluno_id").trim(),
      horario_id: text(input, "horario_id").trim(),
      data: text(input, "data").trim(),
      estado: status === "Atrasado" ? "Atraso" : status === "Ausente" ? "Falta" : status,
      observacoes: text(input, "observacoes", text(input, "observações")).trim() || null,
    };
  }
  if (resource === "/computadores") {
    const state = text(input, "estado", "Livre");
    return {
      sala_id: text(input, "sala_id").trim(),
      tipo: text(input, "tipo", "Computador"),
      nome: text(input, "nome", text(input, "computador")).trim(),
      numero_inventario: text(input, "numero_inventario", text(input, "número de inventário")).trim() || null,
      marca: text(input, "marca").trim() || null,
      modelo: text(input, "modelo").trim() || null,
      numero_serie: text(input, "numero_serie", text(input, "número de série")).trim() || null,
      estado: state === "Livre" ? "Operacional" : state === "Manutenção" ? "Em manutenção" : state,
      observacoes: text(input, "observacoes", text(input, "observações")).trim() || null,
    };
  }
  return null;
}

async function authorizeWrite(
  admin: ReturnType<typeof createAdminClient>,
  resource: string,
  method: string,
  userId: string,
  role: Role,
  recordId?: string
) {
  if (resource === "/anos-letivos" || resource === "/disciplinas" || resource === "/salas" || resource === "/turmas" ||
      resource === "/horarios" || resource === "/computadores") {
    return isAdmin(role);
  }

  if (resource === "/presencas") {
    if (isAdmin(role)) return true;
    if (role !== "Professor") return false;

    if (method === "POST") {
      return true; // O handler valida abaixo que o horário pertence ao professor e o aluno à turma.
    }

    if (!recordId) return false;
    const { data: attendance, error } = await admin.from("presencas").select("aluno_id, horario_id").eq("id", recordId).maybeSingle();
    if (error || !attendance) return false;
    const { data: schedule, error: scheduleError } = await admin.from("horarios").select("professor_id, turma_id").eq("id", attendance.horario_id).maybeSingle();
    if (scheduleError || !schedule || text(schedule as Row, "professor_id") !== userId) return false;
    const { data: membership, error: membershipError } = await admin.from("alunos_turmas").select("id").eq("aluno_id", attendance.aluno_id).eq("turma_id", schedule.turma_id).is("data_fim", null).maybeSingle();
    return !membershipError && Boolean(membership);
  }
  return false;
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { data: profile, error: profileError } = await supabase.from("users").select("role, status").eq("id", user.id).maybeSingle();
    if (profileError || !profile || profile.status !== "Ativo" || !allRoles.includes(profile.role as Role)) {
      return NextResponse.json({ error: "Conta inativa ou perfil inválido." }, { status: 403 });
    }

    const resource = new URL(request.url).searchParams.get("resource") ?? "";
    const role = profile.role as Role;
    const admin = createAdminClient();

    if (resource.startsWith("lookup:")) {
      if (isAdmin(role)) {
        return NextResponse.json({ records: await lookupRecords(resource, admin) });
      }

      if (role === "Professor" && resource === "lookup:alunos") {
        const classIds = await classIdsForUser(admin, role, user.id);
        if (!classIds.length) return NextResponse.json({ records: [] });

        const { data: memberships, error: membershipError } = await admin
          .from("alunos_turmas")
          .select("aluno_id")
          .in("turma_id", classIds)
          .is("data_fim", null);
        if (membershipError) {
          return NextResponse.json({ error: "Não foi possível carregar os alunos das tuas turmas." }, { status: 500 });
        }

        const ids = unique(asRows(memberships).map((row) => text(row, "aluno_id")));
        if (!ids.length) return NextResponse.json({ records: [] });

        const [students, users] = await Promise.all([
          admin.from("alunos").select("id, student_number").in("id", ids),
          admin.from("users").select("id, name"),
        ]);
        if (students.error || users.error) {
          return NextResponse.json({ error: "Não foi possível carregar os alunos das tuas turmas." }, { status: 500 });
        }

        const usersById = new Map(asRows(users.data).map((row) => [text(row, "id"), row]));
        const records = asRows(students.data).map((row) => ({
          id: text(row, "id"),
          label: text(usersById.get(text(row, "id")), "name") + " · " + text(row, "student_number"),
        }));
        return NextResponse.json({ records });
      }

      if (role === "Professor" && resource === "lookup:horarios") {
        const { data: schedules, error } = await admin
          .from("horarios")
          .select("id, turma_id, hora_inicio, hora_fim")
          .eq("professor_id", user.id);
        if (error) {
          return NextResponse.json({ error: "Não foi possível carregar os teus horários." }, { status: 500 });
        }
        const classes = await readTable(admin, "turmas");
        const classMap = new Map(classes.map((row) => [text(row, "id"), row]));
        const records = asRows(schedules).map((row) => ({
          id: text(row, "id"),
          label: text(classMap.get(text(row, "turma_id")), "nome") + " · " + text(row, "hora_inicio") + "–" + text(row, "hora_fim"),
        }));
        return NextResponse.json({ records });
      }

      return NextResponse.json({ error: "Sem permissões para carregar estas opções." }, { status: 403 });
    }

    const permitted = readableRoles[resource];
    if (!permitted || !permitted.includes(role)) {
      return NextResponse.json({ error: "Não tens permissão para consultar esta área." }, { status: 403 });
    }

    if (resource === "/qr-code") {
      const [rooms, equipment] = await Promise.all([readTable(admin, "salas"), readTable(admin, "equipamentos")]);
      const records: RecordItem[] = [
        ...rooms.filter((row) => text(row, "estado") === "Ativa").map((row) => ({
          id: text(row, "id"),
          código: "SALA-" + text(row, "id"),
          tipo: "Sala",
          destino: text(row, "nome"),
          criado: text(row, "created_at"),
          estado: "Ativo",
        })),
        ...equipment.filter((row) => text(row, "estado") !== "Inativo").map((row) => ({
          id: text(row, "id"),
          código: "EQUIPAMENTO-" + text(row, "id"),
          tipo: text(row, "tipo"),
          destino: text(row, "nome"),
          criado: text(row, "created_at"),
          estado: "Ativo",
        })),
      ];
      return NextResponse.json({ records });
    }

    const tableMap: Record<string, string> = {
      "/anos-letivos": "anos_letivos",
      "/alunos": "alunos",
      "/professor": "professores",
      "/turmas": "turmas",
      "/disciplinas": "disciplinas",
      "/presencas": "presencas",
      "/horarios": "horarios",
      "/salas": "salas",
      "/computadores": "equipamentos",
      "/logs": "logs",
    };
    const table = tableMap[resource];
    let rows = await readTable(admin, table);

    // The dashboard and activity page should show the newest events first.
    if (resource === "/logs") {
      rows = [...rows].sort((a, b) => {
        const aTime = Date.parse(text(a, "created_at"));
        const bTime = Date.parse(text(b, "created_at"));
        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
      });
    }

    if (resource === "/alunos") {
      if (role === "Aluno") rows = rows.filter((row) => text(row, "id") === user.id);
      if (role === "Professor") {
        const classIds = await classIdsForUser(admin, role, user.id);
        const { data: memberships, error } = classIds.length
          ? await admin.from("alunos_turmas").select("aluno_id").in("turma_id", classIds).is("data_fim", null)
          : { data: [], error: null };
        if (error) throw new Error("Não foi possível consultar os alunos das turmas.");
        const studentIds = new Set(unique(asRows(memberships).map((row) => text(row, "aluno_id"))));
        rows = rows.filter((row) => studentIds.has(text(row, "id")));
      }
    }

    if (resource === "/professor" && role === "Professor") {
      rows = rows.filter((row) => text(row, "id") === user.id);
    }

    if (resource === "/turmas" && !isAdmin(role)) {
      const classIds = await classIdsForUser(admin, role, user.id);
      const allowedIds = new Set(classIds);
      rows = rows.filter((row) => allowedIds.has(text(row, "id")));
    }

    if (resource === "/disciplinas" && !isAdmin(role)) {
      const classIds = role === "Aluno" || role === "Professor" ? await classIdsForUser(admin, role, user.id) : [];
      const disciplineIds = await subjectIdsForUser(admin, role, user.id, classIds);
      const allowedIds = new Set(disciplineIds);
      rows = rows.filter((row) => allowedIds.has(text(row, "id")));
    }

    if (resource === "/presencas") {
      if (role === "Aluno") rows = rows.filter((row) => text(row, "aluno_id") === user.id);
      if (role === "Professor") {
        const scheduleIds = new Set(await timetableIdsForTeacher(admin, user.id));
        rows = rows.filter((row) => scheduleIds.has(text(row, "horario_id")));
      }
    }

    if (resource === "/horarios") {
      if (role === "Professor") rows = rows.filter((row) => text(row, "professor_id") === user.id);
      if (role === "Aluno") {
        const classIds = new Set(await classIdsForUser(admin, role, user.id));
        rows = rows.filter((row) => classIds.has(text(row, "turma_id")));
      }
    }

    if (resource === "/salas" && !isAdmin(role)) rows = rows.filter((row) => text(row, "estado") === "Ativa");
    if (resource === "/computadores" && !isAdmin(role)) rows = rows.filter((row) => text(row, "estado") !== "Inativo");

    const records = await enrich(resource, rows, admin, role);
    return NextResponse.json({ records });
  } catch (error) {
    console.error("Erro ao consultar dados do campus:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível consultar os dados." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return mutateRecord(request, "POST");
}

export async function PATCH(request: Request) {
  return mutateRecord(request, "PATCH");
}

export async function DELETE(request: Request) {
  return mutateRecord(request, "DELETE");
}

async function mutateRecord(request: Request, method: "POST" | "PATCH" | "DELETE") {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { data: profile, error: profileError } = await supabase.from("users").select("role, status").eq("id", user.id).maybeSingle();
    if (profileError || !profile || profile.status !== "Ativo" || !allRoles.includes(profile.role as Role)) {
      return NextResponse.json({ error: "Conta inativa ou perfil inválido." }, { status: 403 });
    }

    const body = await request.json() as Row;
    const resource = text(body, "resource");
    const recordId = text(body, "id");
    const role = profile.role as Role;
    const admin = createAdminClient();

    const row = payloadToRow(resource, (body.record && typeof body.record === "object" ? body.record : body) as Row);
    if (!row && method !== "DELETE") {
      return NextResponse.json({ error: "Esta área não permite alterações através deste formulário." }, { status: 400 });
    }

    const allowed = await authorizeWrite(admin, resource, method, user.id, role, recordId);
    if (!allowed) return NextResponse.json({ error: "Não tens permissão para executar esta operação." }, { status: 403 });

    const tableMap: Record<string, string> = {
      "/anos-letivos": "anos_letivos",
      "/turmas": "turmas",
      "/disciplinas": "disciplinas",
      "/salas": "salas",
      "/horarios": "horarios",
      "/presencas": "presencas",
      "/computadores": "equipamentos",
    };
    const table = tableMap[resource];
    if (!table) return NextResponse.json({ error: "Área não suportada para escrita." }, { status: 400 });

    if (resource === "/presencas" && role === "Professor" && method !== "DELETE" && row) {
      const scheduleId = text(row, "horario_id");
      const { data: schedule, error } = await admin.from("horarios").select("professor_id, turma_id").eq("id", scheduleId).maybeSingle();
      if (error || !schedule || text(schedule as Row, "professor_id") !== user.id) {
        return NextResponse.json({ error: "Só podes registar presenças nos teus próprios horários." }, { status: 403 });
      }
      const { data: membership, error: membershipError } = await admin.from("alunos_turmas").select("id").eq("aluno_id", text(row, "aluno_id")).eq("turma_id", text(schedule as Row, "turma_id")).is("data_fim", null).maybeSingle();
      if (membershipError || !membership) {
        return NextResponse.json({ error: "O aluno não pertence a esta turma." }, { status: 403 });
      }
    }

    if (method === "POST") {
      if (!row) {
        return NextResponse.json(
          { error: "Os dados enviados não são válidos para esta área." },
          { status: 400 }
        );
      }
      const { data, error } = await admin.from(table).insert(row).select("*").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, record: data });
    }

    if (!recordId) return NextResponse.json({ error: "Falta o identificador do registo." }, { status: 400 });

    if (method === "PATCH") {
      if (!row) {
        return NextResponse.json(
          { error: "Os dados enviados não são válidos para esta área." },
          { status: 400 }
        );
      }
      const { data, error } = await admin.from(table).update(row).eq("id", recordId).select("*").maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (!data) return NextResponse.json({ error: "Registo não encontrado." }, { status: 404 });
      return NextResponse.json({ ok: true, record: data });
    }

    if (resource === "/presencas" && role === "Professor") {
      return NextResponse.json({ error: "O professor não pode eliminar presenças." }, { status: 403 });
    }

    const { error } = await admin.from(table).delete().eq("id", recordId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao guardar dados do campus:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível guardar o registo." }, { status: 500 });
  }
}
