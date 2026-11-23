import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Row = Record<string, any>;
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const str = (value: unknown) => value == null ? "" : String(value);

async function sessionProfile() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: fail("Inicia sessão para continuar.", 401) } as const;
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("users").select("id,name,role,status").eq("id", user.id).maybeSingle();
  if (profileError || !profile || profile.status !== "Ativo") {
    return { error: fail("A conta não está ativa ou não tem perfil válido.", 403) } as const;
  }
  return { user, profile, admin } as const;
}

export async function GET() {
  const session = await sessionProfile();
  if ("error" in session) return session.error;
  const { user, profile, admin } = session;
  const role = str(profile.role);

  const { data: schedules, error: scheduleError } = await admin
    .from("horarios")
    .select("id,turma_id,professor_id,sala_id,hora_inicio,hora_fim,dia_semana,disciplina_turma_id");
  if (scheduleError) return fail("Não foi possível carregar os horários.", 500);
  const allSchedules = (schedules ?? []) as Row[];
  const classIds = [...new Set(allSchedules.map(row => str(row.turma_id)).filter(Boolean))];
  const { data: classes, error: classesError } = await admin
    .from("turmas").select("id,nome,professor_coordenador_id").in("id", classIds.length ? classIds : ["00000000-0000-0000-0000-000000000000"]);
  if (classesError) return fail("Não foi possível carregar as turmas.", 500);
  const classById = new Map(((classes ?? []) as Row[]).map(row => [str(row.id), row]));

  let visibleSchedules = allSchedules;
  if (role === "Professor") {
    visibleSchedules = allSchedules.filter(row =>
      str(row.professor_id) === user.id ||
      str(classById.get(str(row.turma_id))?.professor_coordenador_id) === user.id
    );
  }

  let attendanceQuery = admin.from("presencas")
    .select("id,aluno_id,horario_id,data,estado,observacoes")
    .order("data", { ascending: false }).limit(500);

  if (role === "Aluno") {
    attendanceQuery = attendanceQuery.eq("aluno_id", user.id);
  } else if (role === "Professor") {
    const ids = visibleSchedules.map(row => str(row.id));
    if (!ids.length) return NextResponse.json({ records: [] });
    attendanceQuery = attendanceQuery.in("horario_id", ids);
  } else if (!["Administrador", "Administrador Adjunto", "Funcionário"].includes(role)) {
    return fail("Não tens permissões para consultar presenças.", 403);
  }

  const { data: attendance, error: attendanceError } = await attendanceQuery;
  if (attendanceError) return fail("Não foi possível carregar as presenças.", 500);
  const attendanceRows = (attendance ?? []) as Row[];
  if (!attendanceRows.length) return NextResponse.json({ records: [] });

  const studentIds = [...new Set(attendanceRows.map(row => str(row.aluno_id)))];
  const attendanceIds = attendanceRows.map(row => str(row.id));
  const scheduleById = new Map(allSchedules.map(row => [str(row.id), row]));
  const { data: studentUsers } = await admin.from("users").select("id,name,email").in("id", studentIds);
  const studentById = new Map(((studentUsers ?? []) as Row[]).map(row => [str(row.id), row]));
  const { data: justifications, error: justificationError } = await admin
    .from("justificacoes_faltas").select("*").in("presenca_id", attendanceIds);
  if (justificationError) return fail("Não foi possível carregar as justificações.", 500);
  const justificationRows = (justifications ?? []) as Row[];
  const justificationIds = justificationRows.map(row => str(row.id));
  const { data: history } = justificationIds.length
    ? await admin.from("justificacoes_faltas_historico").select("*").in("justificacao_id", justificationIds).order("created_at", { ascending: true })
    : { data: [] as Row[] };
  const historyById = new Map<string, Row[]>();
  for (const item of (history ?? []) as Row[]) {
    const key = str(item.justificacao_id);
    historyById.set(key, [...(historyById.get(key) ?? []), item]);
  }

  const disciplineClassIds = [...new Set(allSchedules.map(row => str(row.disciplina_turma_id)).filter(Boolean))];
  const { data: disciplineLinks } = disciplineClassIds.length
    ? await admin.from("disciplinas_turmas").select("id,disciplina_id").in("id", disciplineClassIds)
    : { data: [] as Row[] };
  const linkRows = (disciplineLinks ?? []) as Row[];
  const disciplineIds = [...new Set(linkRows.map(row => str(row.disciplina_id)).filter(Boolean))];
  const { data: disciplines } = disciplineIds.length
    ? await admin.from("disciplinas").select("id,nome").in("id", disciplineIds)
    : { data: [] as Row[] };
  const disciplineName = new Map(((disciplines ?? []) as Row[]).map(row => [str(row.id), str(row.nome)]));
  const linkName = new Map(linkRows.map(row => [str(row.id), disciplineName.get(str(row.disciplina_id)) ?? "Disciplina"]));
  const justificationByPresence = new Map(justificationRows.map(row => [str(row.presenca_id), row]));

  const records = await Promise.all(attendanceRows.map(async row => {
    const schedule = scheduleById.get(str(row.horario_id));
    const turma = classById.get(str(schedule?.turma_id));
    const justification = justificationByPresence.get(str(row.id));
    let attachmentUrl = "";
    if (justification?.anexo_path) {
      const { data } = await admin.storage.from("justificacoes-faltas").createSignedUrl(str(justification.anexo_path), 300);
      attachmentUrl = data?.signedUrl ?? "";
    }
    return {
      ...row,
      aluno_nome: str(studentById.get(str(row.aluno_id))?.name) || "Aluno",
      aluno_email: str(studentById.get(str(row.aluno_id))?.email),
      turma_nome: str(turma?.nome),
      disciplina_nome: linkName.get(str(schedule?.disciplina_turma_id)) ?? "Disciplina",
      hora_inicio: str(schedule?.hora_inicio),
      hora_fim: str(schedule?.hora_fim),
      professor_id: str(schedule?.professor_id),
      coordenador_id: str(turma?.professor_coordenador_id),
      justificacao: justification ? {
        ...justification,
        anexo_url: attachmentUrl,
        historico: historyById.get(str(justification.id)) ?? [],
      } : null,
    };
  }));

  return NextResponse.json({ records });
}

export async function POST(request: Request) {
  const session = await sessionProfile();
  if ("error" in session) return session.error;
  const { user, profile, admin } = session;
  if (profile.role !== "Aluno") return fail("Só o aluno pode submeter a sua justificação.", 403);

  const body = await request.json().catch(() => null) as { presenca_id?: string; motivo?: string; anexo_path?: string } | null;
  const presenceId = str(body?.presenca_id);
  const motivo = str(body?.motivo).trim();
  const attachmentPath = str(body?.anexo_path);
  if (!presenceId || motivo.length < 10 || motivo.length > 3000) return fail("Indica um motivo entre 10 e 3000 caracteres.");

  const { data: presence, error: presenceError } = await admin.from("presencas")
    .select("id,aluno_id,estado").eq("id", presenceId).eq("aluno_id", user.id).maybeSingle();
  if (presenceError || !presence || presence.estado !== "Falta") return fail("Só podes justificar uma falta tua ainda não justificada.", 403);

  const { data: existing } = await admin.from("justificacoes_faltas")
    .select("id").eq("presenca_id", presenceId).maybeSingle();
  if (existing) return fail("Já existe uma justificação para esta falta.", 409);

  if (attachmentPath && !attachmentPath.startsWith(presenceId + "/")) return fail("O anexo não corresponde à falta selecionada.", 400);
  const { data, error } = await admin.from("justificacoes_faltas").insert({
    presenca_id: presenceId, aluno_id: user.id, motivo, anexo_path: attachmentPath || null,
  }).select("id").single();
  if (error) return fail(error.message.includes("duplicate") ? "Já existe uma justificação para esta falta." : "Não foi possível submeter a justificação.", 400);
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(request: Request) {
  const session = await sessionProfile();
  if ("error" in session) return session.error;
  const { user, profile, admin } = session;
  const body = await request.json().catch(() => null) as { id?: string; estado?: string; decisao_motivo?: string } | null;
  const id = str(body?.id);
  const estado = str(body?.estado);
  const decisionReason = str(body?.decisao_motivo).trim();
  if (!id || !["Aceite", "Rejeitada"].includes(estado)) return fail("Decisão inválida.");
  if (estado === "Rejeitada" && decisionReason.length < 5) return fail("Indica o motivo da rejeição (mínimo 5 caracteres).");

  const { data: justification, error } = await admin.from("justificacoes_faltas")
    .select("id,presenca_id,estado").eq("id", id).maybeSingle();
  if (error || !justification || justification.estado !== "Pendente") return fail("A justificação já foi decidida ou não existe.", 409);

  const { data: presence } = await admin.from("presencas")
    .select("horario_id").eq("id", justification.presenca_id).maybeSingle();
  const { data: schedule } = presence?.horario_id
    ? await admin.from("horarios").select("turma_id").eq("id", presence.horario_id).maybeSingle()
    : { data: null };
  const { data: turma } = schedule?.turma_id
    ? await admin.from("turmas").select("professor_coordenador_id").eq("id", schedule.turma_id).maybeSingle()
    : { data: null };

  const allowed = ["Administrador", "Administrador Adjunto"].includes(str(profile.role)) ||
    (profile.role === "Professor" && str(turma?.professor_coordenador_id) === user.id);
  if (!allowed) return fail("Apenas a direção ou o professor coordenador desta turma pode decidir.", 403);

  const { data: updated, error: updateError } = await admin.from("justificacoes_faltas").update({
    estado, decisao_motivo: decisionReason || null, decidido_por: user.id, decidido_em: new Date().toISOString(),
  }).eq("id", id).eq("estado", "Pendente").select("id").maybeSingle();
  if (updateError) return fail("Não foi possível registar a decisão.", 400);
  if (!updated) return fail("Esta justificação já foi decidida por outra pessoa. Atualiza a lista para veres o estado mais recente.", 409);
  return NextResponse.json({ ok: true });
}
