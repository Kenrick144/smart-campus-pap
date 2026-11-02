import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type UserRole = "Aluno" | "Professor" | "Funcionário" | "Administrador" | "Administrador Adjunto";
type Row = Record<string, unknown>;

const adminRoles: UserRole[] = ["Administrador", "Administrador Adjunto"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

async function authorizeAdministrator() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.status !== "Ativo" || !adminRoles.includes(profile.role as UserRole)) {
    return { response: NextResponse.json({ error: "Só um Administrador ou Administrador Adjunto pode gerir as associações dos alunos." }, { status: 403 }) };
  }

  return { user, role: profile.role as UserRole, admin: createAdminClient() };
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAdministrator();
    if ("response" in auth) return auth.response;

    const studentId = new URL(request.url).searchParams.get("studentId")?.trim();
    if (!studentId || !uuidPattern.test(studentId)) {
      return NextResponse.json({ error: "Identificador de aluno inválido." }, { status: 400 });
    }

    const [studentResult, profileResult, yearsResult, currentResult] = await Promise.all([
      auth.admin.from("alunos").select("id").eq("id", studentId).maybeSingle(),
      auth.admin.from("users").select("id, name, status, role").eq("id", studentId).maybeSingle(),
      auth.admin.from("anos_letivos").select("id, nome, ativo, data_inicio, data_fim").eq("ativo", true).order("data_inicio"),
      auth.admin.from("alunos_turmas").select("turma_id, data_inicio").eq("aluno_id", studentId).is("data_fim", null).maybeSingle(),
    ]);

    if (studentResult.error || profileResult.error || yearsResult.error || currentResult.error) {
      console.error("Erro ao preparar a associação de turma:", studentResult.error || profileResult.error || yearsResult.error || currentResult.error);
      return NextResponse.json({ error: "Não foi possível carregar os dados para associar a turma." }, { status: 500 });
    }

    if (!studentResult.data || !profileResult.data || profileResult.data.role !== "Aluno") {
      return NextResponse.json({ error: "Não foi encontrada uma ficha académica válida para este aluno." }, { status: 404 });
    }

    const activeYears = yearsResult.data ?? [];
    const activeYearIds = activeYears.map((year) => year.id);
    const activeYearById = new Map(activeYears.map((year) => [year.id, year]));

    const { data: classRows, error: classError } = activeYearIds.length
      ? await auth.admin
          .from("turmas")
          .select("id, nome, ano_escolar, curso, capacidade, estado, ano_letivo_id")
          .in("ano_letivo_id", activeYearIds)
          .eq("estado", "Ativa")
          .order("nome")
      : { data: [], error: null };

    if (classError) {
      console.error("Erro ao carregar turmas ativas:", classError);
      return NextResponse.json({ error: "Não foi possível carregar as turmas ativas." }, { status: 500 });
    }

    const classes = classRows ?? [];
    const classIds = classes.map((item) => item.id);
    const { data: memberships, error: membershipsError } = classIds.length
      ? await auth.admin.from("alunos_turmas").select("aluno_id, turma_id").in("turma_id", classIds).is("data_fim", null)
      : { data: [], error: null };

    if (membershipsError) {
      console.error("Erro ao contar alunos por turma:", membershipsError);
      return NextResponse.json({ error: "Não foi possível calcular a ocupação das turmas." }, { status: 500 });
    }

    const counts = new Map<string, number>();
    for (const membership of memberships ?? []) {
      counts.set(membership.turma_id, (counts.get(membership.turma_id) ?? 0) + 1);
    }

    const currentClassId = currentResult.data?.turma_id ?? "";
    const classOptions = classes.map((item) => {
      const activeStudentCount = counts.get(item.id) ?? 0;
      const capacity = Number(item.capacidade);
      const year = activeYearById.get(item.ano_letivo_id);
      return {
        id: item.id,
        nome: item.nome,
        anoEscolar: item.ano_escolar,
        curso: item.curso,
        anoLetivo: year?.nome ?? "",
        capacidade: capacity,
        alunosAtivos: activeStudentCount,
        vagasDisponiveis: Math.max(0, capacity - activeStudentCount),
        isCurrent: item.id === currentClassId,
      };
    });

    const currentClass = classOptions.find((item) => item.id === currentClassId);
    return NextResponse.json({
      ok: true,
      student: { id: studentId, name: profileResult.data.name, status: profileResult.data.status },
      activeYearConfigured: activeYears.length > 0,
      classes: classOptions,
      currentClassId,
      currentClassName: currentClass?.nome ?? "",
    });
  } catch (error) {
    console.error("Erro inesperado ao preparar associação de turma:", error);
    return NextResponse.json({ error: "Ocorreu um erro inesperado ao carregar as turmas." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeAdministrator();
    if ("response" in auth) return auth.response;

    let body: { studentId?: string; classId?: string };
    try {
      body = await request.json() as { studentId?: string; classId?: string };
    } catch {
      return NextResponse.json({ error: "O pedido não contém dados JSON válidos." }, { status: 400 });
    }

    const studentId = body.studentId?.trim() ?? "";
    const classId = body.classId?.trim() ?? "";
    if (!uuidPattern.test(studentId) || !uuidPattern.test(classId)) {
      return NextResponse.json({ error: "Seleciona um aluno e uma turma válidos." }, { status: 400 });
    }

    const { data, error } = await auth.admin.rpc("assign_student_to_class", {
      p_student_id: studentId,
      p_turma_id: classId,
    });

    if (error) {
      const knownMessages = [
        "O aluno não existe ou a conta não está ativa.",
        "A turma selecionada não existe.",
        "Não é possível associar alunos a uma turma inativa.",
        "A turma não pertence a um ano letivo ativo. Ativa o ano letivo correto antes de continuar.",
        "A turma selecionada já atingiu a capacidade máxima.",
        "O aluno já tem uma turma ativa ou a associação foi alterada em simultâneo. Atualiza a página e tenta novamente.",
      ];
      const message = knownMessages.find((item) => error.message.includes(item));
      if (!message) console.error("Falha na associação de turma:", error);
      return NextResponse.json({ error: message ?? "Não foi possível associar o aluno à turma. Verifica os dados e tenta novamente." }, { status: 400 });
    }

    const result = (data ?? {}) as { message?: string; className?: string; changed?: boolean };
    if (result.changed) {
      const { error: logError } = await auth.admin.from("logs").insert({
        user_id: auth.user.id,
        acao: "Associar aluno a turma",
        entidade: "alunos_turmas",
        entidade_id: studentId,
        descricao: `Associação do aluno ${studentId} à turma ${result.className ?? classId} (${result.changed ? "alteração efetuada" : "sem alteração"}).`,
      });
      if (logError) console.error("Não foi possível registar a associação no histórico de atividade:", logError);
    }

    return NextResponse.json({ ok: true, ...(data as object) });
  } catch (error) {
    console.error("Erro inesperado na associação de turma:", error);
    return NextResponse.json({ error: "Ocorreu um erro inesperado ao guardar a associação." }, { status: 500 });
  }
}
