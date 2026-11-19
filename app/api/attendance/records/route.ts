import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Row = Record<string, any>;
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

async function getTeacher() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: fail("Inicia sessão para continuar.", 401) } as const;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("users").select("id,role,status").eq("id", user.id).maybeSingle();
  if (!profile || profile.status !== "Ativo") return { error: fail("Conta inativa ou perfil inválido.", 403) } as const;
  if (profile.role !== "Professor") return { error: fail("Apenas professores podem registar presenças.", 403) } as const;
  return { user, admin } as const;
}

export async function GET() {
  const session = await getTeacher();
  if ("error" in session) return session.error;
  const { user, admin } = session;

  const { data: schedules, error } = await admin.from("horarios")
    .select("id,turma_id,professor_id,hora_inicio,hora_fim,dia_semana,disciplina_turma_id")
    .eq("professor_id", user.id);
  if (error) return fail("Não foi possível carregar as tuas aulas.", 500);
  const rows = (schedules ?? []) as Row[];
  const classIds = [...new Set(rows.map(r => String(r.turma_id)))];
  const disciplineLinkIds = [...new Set(rows.map(r => String(r.disciplina_turma_id)).filter(Boolean))];

  const [{ data: classes }, { data: links }] = await Promise.all([
    classIds.length ? admin.from("turmas").select("id,nome").in("id", classIds) : Promise.resolve({ data: [] as Row[] }),
    disciplineLinkIds.length ? admin.from("disciplinas_turmas").select("id,disciplina_id").in("id", disciplineLinkIds) : Promise.resolve({ data: [] as Row[] }),
  ]);
  const classById = new Map(((classes ?? []) as Row[]).map(r => [String(r.id), r]));
  const linkRows = (links ?? []) as Row[];
  const disciplineIds = [...new Set(linkRows.map(r => String(r.disciplina_id)).filter(Boolean))];
  const { data: disciplines } = disciplineIds.length
    ? await admin.from("disciplinas").select("id,nome").in("id", disciplineIds)
    : { data: [] as Row[] };
  const disciplineById = new Map(((disciplines ?? []) as Row[]).map(r => [String(r.id), String(r.nome)]));
  const disciplineByLink = new Map(linkRows.map(r => [String(r.id), disciplineById.get(String(r.disciplina_id)) ?? "Disciplina"]));

  const membershipsResult = classIds.length
    ? await admin.from("alunos_turmas").select("aluno_id,turma_id").in("turma_id", classIds).is("data_fim", null)
    : { data: [] as Row[], error: null };
  if (membershipsResult.error) return fail("Não foi possível carregar os alunos das tuas turmas.", 500);
  const memberships = (membershipsResult.data ?? []) as Row[];
  const studentIds = [...new Set(memberships.map(r => String(r.aluno_id)))];
  const { data: students } = studentIds.length
    ? await admin.from("users").select("id,name").in("id", studentIds)
    : { data: [] as Row[] };
  const studentById = new Map(((students ?? []) as Row[]).map(r => [String(r.id), String(r.name ?? "Aluno")]));
  const studentsByClass = new Map<string, Array<{ id: string; name: string }>>();
  for (const membership of memberships) {
    const classId = String(membership.turma_id);
    const studentId = String(membership.aluno_id);
    studentsByClass.set(classId, [...(studentsByClass.get(classId) ?? []), { id: studentId, name: studentById.get(studentId) ?? "Aluno" }]);
  }

  return NextResponse.json({ schedules: rows.map(r => ({
    id: String(r.id), turma_id: String(r.turma_id), turma_nome: String(classById.get(String(r.turma_id))?.nome ?? "Turma"),
    disciplina_nome: disciplineByLink.get(String(r.disciplina_turma_id)) ?? "Disciplina",
    hora_inicio: String(r.hora_inicio), hora_fim: String(r.hora_fim), dia_semana: Number(r.dia_semana),
    alunos: studentsByClass.get(String(r.turma_id)) ?? [],
  })) });
}

export async function POST(request: Request) {
  const session = await getTeacher();
  if ("error" in session) return session.error;
  const { user, admin } = session;
  const body = await request.json().catch(() => null) as {
    horario_id?: string; aluno_id?: string; data?: string; estado?: string; observacoes?: string;
  } | null;
  const horarioId = String(body?.horario_id ?? "");
  const alunoId = String(body?.aluno_id ?? "");
  const date = String(body?.data ?? "");
  const state = String(body?.estado ?? "");
  const notes = String(body?.observacoes ?? "").trim().slice(0, 1000);
  if (!horarioId || !alunoId || !/^\\d{4}-\\d{2}-\\d{2}$/.test(date) || !["Presente", "Falta", "Atraso"].includes(state)) {
    return fail("Seleciona a aula, o aluno, a data e um estado válido.");
  }

  const { data: schedule } = await admin.from("horarios")
    .select("id,turma_id,professor_id").eq("id", horarioId).eq("professor_id", user.id).maybeSingle();
  if (!schedule) return fail("Não podes registar presenças nesta aula.", 403);
  const { data: membership } = await admin.from("alunos_turmas")
    .select("aluno_id").eq("aluno_id", alunoId).eq("turma_id", schedule.turma_id).is("data_fim", null).maybeSingle();
  if (!membership) return fail("O aluno não pertence a esta turma ativa.", 403);

  const { data: existing } = await admin.from("presencas").select("id")
    .eq("aluno_id", alunoId).eq("horario_id", horarioId).eq("data", date).maybeSingle();
  if (existing) return fail("Já existe um registo para este aluno nesta aula e data.", 409);

  const { data, error } = await admin.from("presencas").insert({
    aluno_id: alunoId, horario_id: horarioId, data, estado: state, observacoes: notes || null,
  }).select("id").single();
  if (error) return fail("Não foi possível guardar a presença: " + error.message, 400);
  await admin.from("logs").insert({
    user_id: user.id, acao: "Registo de presença manual", entidade: "presencas",
    descricao: state + " registado para o aluno " + alunoId + " no horário " + horarioId + ".",
  });
  return NextResponse.json({ ok: true, id: data.id });
}
