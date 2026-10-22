import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Row = Record<string, unknown>;
const text = (row: Row | null | undefined, key: string) =>
  row?.[key] === undefined || row?.[key] === null ? "" : String(row[key]);

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Inicia sessão antes de registar a presença." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("name, role, status")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || profile.status !== "Ativo" || profile.role !== "Aluno") {
      return NextResponse.json({ error: "A leitura de presença por QR está disponível para contas de aluno ativas." }, { status: 403 });
    }

    const body = await request.json() as { code?: string };
    const code = String(body.code ?? "").trim();
    const match = /^SALA-([0-9a-f-]{36})$/i.exec(code);

    if (!match) {
      return NextResponse.json({ error: "Código de sala inválido. Utilize um QR de sala ativo." }, { status: 400 });
    }

    const admin = createAdminClient();
    const roomId = match[1];
    const { data: room, error: roomError } = await admin
      .from("salas")
      .select("id, nome, estado")
      .eq("id", roomId)
      .maybeSingle();

    if (roomError || !room || room.estado !== "Ativa") {
      return NextResponse.json({ error: "A sala deste código não existe ou está inativa." }, { status: 404 });
    }

    const { data: memberships, error: membershipError } = await admin
      .from("alunos_turmas")
      .select("turma_id")
      .eq("aluno_id", user.id)
      .is("data_fim", null);

    if (membershipError) {
      return NextResponse.json({ error: "Não foi possível validar a inscrição do aluno." }, { status: 500 });
    }

    const classIds = [...new Set((memberships ?? []).map((item) => String(item.turma_id)))];
    if (!classIds.length) {
      return NextResponse.json({ error: "A conta ainda não está associada a uma turma ativa." }, { status: 403 });
    }

    // Use Lisbon wall-clock parts directly. Avoid parsing a localized date string,
    // which would apply the server's timezone a second time.
    const now = new Date();
    const lisbonParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Lisbon",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const lisbonPart = (type: string) =>
      lisbonParts.find((part) => part.type === type)?.value ?? "";
    const year = lisbonPart("year");
    const month = lisbonPart("month");
    const day = lisbonPart("day");
    const hour = lisbonPart("hour");
    const minute = lisbonPart("minute");

    if (![year, month, day, hour, minute].every(Boolean)) {
      throw new Error("Não foi possível determinar a data e hora de Lisboa.");
    }

    const currentTime = `${hour}:${minute}`;
    const today = `${year}-${month}-${day}`;
    const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay();
    const isoDay = weekday === 0 ? 7 : weekday;

    const { data: schedules, error: scheduleError } = await admin
      .from("horarios")
      .select("id, turma_id, professor_id, hora_inicio, hora_fim, sala_id")
      .eq("sala_id", roomId)
      .eq("dia_semana", isoDay)
      .in("turma_id", classIds)
      .lte("hora_inicio", currentTime)
      .gte("hora_fim", currentTime);

    if (scheduleError) {
      return NextResponse.json({ error: "Não foi possível validar o horário desta sala." }, { status: 500 });
    }

    const schedule = schedules?.[0];
    if (!schedule) {
      return NextResponse.json({ error: "Não existe uma aula tua em curso nesta sala neste momento." }, { status: 404 });
    }

    const { data: existing, error: existingError } = await admin
      .from("presencas")
      .select("id, estado")
      .eq("aluno_id", user.id)
      .eq("horario_id", schedule.id)
      .eq("data", today)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: "Não foi possível verificar se a presença já foi registada." }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json({ ok: true, message: "A tua presença nesta aula já estava registada." });
    }

    const startParts = String(schedule.hora_inicio).slice(0, 5).split(":").map(Number);
    const currentParts = currentTime.split(":").map(Number);
    const startMinutes = (startParts[0] ?? 0) * 60 + (startParts[1] ?? 0);
    const currentMinutes = (currentParts[0] ?? 0) * 60 + (currentParts[1] ?? 0);
    const late = currentMinutes > startMinutes + 10;
    const { error: insertError } = await admin.from("presencas").insert({
      aluno_id: user.id,
      horario_id: schedule.id,
      data: today,
      estado: late ? "Atraso" : "Presente",
    });

    if (insertError) {
      // The database's unique constraint is the final safeguard against simultaneous QR scans.
      // Treat a duplicate created by a concurrent request as an already-registered presence.
      if (insertError.code === "23505") {
        return NextResponse.json({
          ok: true,
          message: "A tua presença nesta aula já estava registada.",
        });
      }

      console.error("Erro ao registar presença por QR:", insertError);
      return NextResponse.json({ error: "Não foi possível guardar a presença." }, { status: 400 });
    }

    await admin.from("logs").insert({
      user_id: user.id,
      acao: "Presença registada por QR",
      entidade: "presencas",
      descricao: "Presença registada na " + String(room.nome) + " para o horário " + String(schedule.id) + ".",
    });

    return NextResponse.json({
      ok: true,
      message: late ? "Presença registada como atraso." : "Presença registada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao processar QR de presença:", error);
    return NextResponse.json({ error: "Ocorreu um erro inesperado ao registar a presença." }, { status: 500 });
  }
}
