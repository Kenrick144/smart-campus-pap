import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Row = Record<string, any>;
const text = (value: unknown) => value == null ? "" : String(value);
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

async function context() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: fail("Inicia sessão para continuar.", 401) } as const;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("users").select("id,role,status").eq("id", user.id).maybeSingle();
  if (!profile || profile.status !== "Ativo") return { response: fail("Conta inativa ou perfil inválido.", 403) } as const;
  if (profile.role !== "Professor") return { response: fail("Só os professores podem registar presenças.", 403) } as const;
  return { user, admin } as const;
}

export async function GET() {
  const ctx = await context();
  if ("response" in ctx) return ctx.response;
  const { user, admin } = ctx;
  const [{ data: schedules, error: scheduleError }, { data: classes, error: classError }] = await Promise.all([
    admin.from("horarios").select("id,turma_id,professor_id,disciplina_turma_id,hora_inicio,hora_fim,dia_semana").or(`professor_id.eq.${user.id}`),
    admin.from("turmas").select("id,nome,professor_coordenador_id"),
  ]);
  if (scheduleError || classError) return fail("Não foi possível carregar os horários e turmas.", 500);
  const classMap = new Map(((classes ?? []) as Row[]).map(c => [text(c.id), c]));
  const visible = ((schedules ?? []) as Row[]).filter(s =>
    text(s.professor_id) === user.id || text(classMap.get(text(s.turma_id))?.professor_coordenador_id) === user.id
  );
  const turmaIds = [...new Set(visible.map(s => text(s.turma_id)))];
  const { data: memberships, error: membershipError } = await admin.from("alunos_turmas")
    .select("aluno_id,turma_id").in("turma_id", turmaIds.length ? turmaIds : ["00000000-0000-0000-0000-000000000000"]);
  if (membershipError) return fail("Não foi possível carregar os alunos das turmas.", 500);
  const studentIds = [...new Set(((memberships ?? []) as Row[]).map(m => text(m.aluno_id)))];
  const { data: users } = studentIds.length
    ? await admin.from("users").select("id,name,status").in("id", studentIds)
    : { data: [] as Row[] };
  const studentMap = new Map(((users ?? []) as Row[]).filter(u => u.status === "Ativo").map(u => [text(u.id), u]));
  const { data: links } = await admin.from("disciplinas_turmas").select("id,disciplina_id").in(
    "id", [...new Set(visible.map(s => text(s.disciplina_turma_id)))]
  );
  const disciplineIds = [...new Set(((links ?? []) as Row[]).map(l => text(l.disciplina_id)))];
  const { data: disciplines } = disciplineIds.length
    ? await admin.from("disciplinas").select("id,nome").in("id", disciplineIds)
    : { data: [] as Row[] };
  const disciplineMap = new Map(((disciplines ?? []) as Row[]).map(d => [text(d.id), text(d.nome)]));
  const linkMap = new Map(((links ?? []) as Row[]).map(l => [text(l.id), disciplineMap.get(text(l.disciplina_id)) ?? "Disciplina"]));
  const lessons = visible.map(s => ({
    id: text(s.id), turma_id: text(s.turma_id), turma_nome: text(classMap.get(text(s.turma_id))?.nome),
    disciplina_nome: linkMap.get(text(s.disciplina_turma_id)) ?? "Disciplina",
    hora_inicio: text(s.hora_inicio), hora_fim: text(s.hora_fim), dia_semana: s.dia_semana,
    alunos: ((memberships ?? []) as Row[]).filter(m => text(m.turma_id) === text(s.turma_id))
      .map(m => studentMap.get(text(m.aluno_id))).filter(Boolean)
      .map(a => ({ id: text(a.id), nome: text(a.name) })),
  }));
  return NextResponse.json({ lessons });
}

export async function POST(request: Request) {
  const ctx = await context();
  if ("response" in ctx) return ctx.response;
  const { user, admin } = ctx;
  const body = await request.json().catch(() => null) as {
    horario_id?: string; aluno_id?: string; data?: string; estado?: string; observacoes?: string;
  } | null;
  const horarioId = text(body?.horario_id), alunoId = text(body?.aluno_id);
  const date = text(body?.data), state = text(body?.estado);
  if (!horarioId || !alunoId || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !["Presente", "Falta", "Atraso"].includes(state)) return fail("Preenche a aula, o aluno, a data e um estado válido.");
  const { data: schedule } = await admin.from("horarios")
    .select("id,turma_id,professor_id").eq("id", horarioId).maybeSingle();
  if (!schedule) return fail("A aula selecionada já não existe.", 404);
  const { data: turma } = await admin.from("turmas")
    .select("id,professor_coordenador_id").eq("id", schedule.turma_id).maybeSingle();
  if (text(schedule.professor_id) !== user.id && text(turma?.professor_coordenador_id) !== user.id)
    return fail("Só podes registar presenças nas tuas aulas ou turmas coordenadas.", 403);
  const { data: membership } = await admin.from("alunos_turmas").select("aluno_id")
    .eq("aluno_id", alunoId).eq("turma_id", schedule.turma_id).maybeSingle();
  if (!membership) return fail("O aluno não pertence à turma desta aula.", 403);
  const { data: existing } = await admin.from("presencas").select("id")
    .eq("horario_id", horarioId).eq("aluno_id", alunoId).eq("data", date).maybeSingle();
  if (existing) return fail("Já existe um registo deste aluno para esta aula e data.", 409);
  const { error } = await admin.from("presencas").insert({
    horario_id: horarioId, aluno_id: alunoId, data, estado,
    observacoes: text(body?.observacoes).trim() || null,
  });
  if (error) return fail("Não foi possível guardar a presença: " + error.message, 400);
  return NextResponse.json({ ok: true });
}
