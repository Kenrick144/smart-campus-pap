import { NextResponse } from "next/server";
import { getPcAuthContext, isPcAdmin } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { context, response } = await getPcAuthContext();
  if (!context) return response ?? NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!["Administrador", "Administrador Adjunto", "Professor", "Funcionário"].includes(context.role)) {
    return NextResponse.json({ error: "Não tens permissão para consultar o estado do parque informático." }, { status: 403 });
  }

  const now = new Date();
  const staleBefore = new Date(now.getTime() - 2 * 60 * 1000).toISOString();

  // GET é apenas de leitura: sessões sem heartbeat recente são tratadas como expiradas.
  const [{ data: computers, error: computerError }, { data: sessions, error: sessionError }, { data: rooms, error: roomError }] = await Promise.all([
    context.admin.from("computadores").select("id, nome, sala_id, numero_inventario, estado").order("nome"),
    context.admin.from("sessoes_computador").select("id, computador_id, aluno_id, started_at, heartbeat_at").is("ended_at", null),
    context.admin.from("salas").select("id, nome"),
  ]);

  if (computerError || sessionError || roomError) {
    console.error("Erro ao consultar o parque informático:", computerError?.message, sessionError?.message, roomError?.message);
    return NextResponse.json({ error: "Não foi possível consultar o parque informático." }, { status: 500 });
  }

  const activeSessions = (sessions ?? []).filter((session) => session.heartbeat_at >= staleBefore);
  const sessionByComputer = new Map(activeSessions.map((session) => [session.computador_id, session]));
  const studentIds = [...new Set(activeSessions.map((session) => session.aluno_id))];
  const { data: students, error: studentError } = studentIds.length
    ? await context.admin.from("users").select("id, name").in("id", studentIds)
    : { data: [], error: null };

  if (studentError) {
    return NextResponse.json({ error: "Não foi possível consultar os alunos com sessão ativa." }, { status: 500 });
  }

  const roomById = new Map((rooms ?? []).map((room) => [room.id, room.nome]));
  const studentById = new Map((students ?? []).map((student) => [student.id, student.name]));
  const records = (computers ?? []).map((computer) => {
    const session = sessionByComputer.get(computer.id);
    const state = computer.estado === "Operacional"
      ? session ? "Ocupado" : "Livre"
      : computer.estado;
    return {
      id: computer.id,
      name: computer.nome,
      room: roomById.get(computer.sala_id) ?? "Sala não definida",
      inventoryNumber: computer.numero_inventario ?? "",
      physicalState: computer.estado,
      availability: state,
      studentName: session && isPcAdmin(context.role) ? studentById.get(session.aluno_id) ?? "Aluno" : null,
      startedAt: session?.started_at ?? null,
      heartbeatAt: session?.heartbeat_at ?? null,
    };
  });

  return NextResponse.json({
    records,
    totals: {
      Livre: records.filter((item) => item.availability === "Livre").length,
      Ocupado: records.filter((item) => item.availability === "Ocupado").length,
      "Em manutenção": records.filter((item) => item.availability === "Em manutenção").length,
      Avariado: records.filter((item) => item.availability === "Avariado").length,
      Inativo: records.filter((item) => item.availability === "Inativo").length,
    },
    refreshedAt: now.toISOString(),
  });
}

export async function POST() {
  const { context, response } = await getPcAuthContext();
  if (!context) return response ?? NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (context.role !== "Administrador") {
    return NextResponse.json({ error: "Apenas o Administrador pode executar a limpeza de sessões." }, { status: 403 });
  }

  const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const { data, error } = await context.admin
    .from("sessoes_computador")
    .update({ ended_at: now, ended_reason: "timeout" })
    .is("ended_at", null)
    .lt("heartbeat_at", staleBefore)
    .select("id");

  if (error) {
    console.error("Erro ao terminar sessões expiradas:", error.message);
    return NextResponse.json({ error: "Não foi possível terminar as sessões expiradas." }, { status: 500 });
  }

  return NextResponse.json({ success: true, closedSessions: data?.length ?? 0, cleanedAt: now });
}
