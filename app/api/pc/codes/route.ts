import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { getPcAuthContext, hashTemporaryCode, writePcLog } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ELIGIBLE_ROLES = new Set(["Aluno", "Professor", "Funcionário"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  const { context, response } = await getPcAuthContext();
  if (!context) return response ?? NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!ELIGIBLE_ROLES.has(context.role)) {
    return NextResponse.json({ error: "Este perfil não pode gerir códigos de acesso ao parque informático." }, { status: 403 });
  }

  const { data, error } = await context.admin
    .from("codigos_temporarios")
    .select("id, created_at, expires_at, used_at, revoked_at, computador_id, computadores(nome)")
    .eq("user_id", context.userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Erro ao consultar códigos temporários:", error.message);
    return NextResponse.json({ error: "Não foi possível consultar os códigos temporários." }, { status: 500 });
  }

  const now = Date.now();
  const history = (data ?? []).map((row) => {
    const expired = new Date(row.expires_at).getTime() <= now;
    const status = row.used_at ? "Utilizado" : row.revoked_at ? "Cancelado" : expired ? "Expirado" : "Ativo";
    const computer = Array.isArray(row.computadores) ? row.computadores[0] : row.computadores;
    return {
      id: row.id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      revokedAt: row.revoked_at,
      computerName: computer?.nome ?? "Computador",
      status,
    };
  });

  return NextResponse.json({ activeCode: history.find((item) => item.status === "Ativo") ?? null, history });
}

export async function POST(request: Request) {
  const { context, response } = await getPcAuthContext();
  if (!context) return response ?? NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!ELIGIBLE_ROLES.has(context.role)) {
    return NextResponse.json({ error: "Este perfil não pode gerar códigos de acesso ao parque informático." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { qr_public_id?: string };
  const qrPublicId = typeof body.qr_public_id === "string" ? body.qr_public_id : "";
  if (!UUID_PATTERN.test(qrPublicId)) {
    return NextResponse.json({ error: "QR do computador inválido. Lê novamente o QR permanente." }, { status: 400 });
  }

  const { data: computer, error: computerError } = await context.admin
    .from("computadores")
    .select("id, nome, estado, salas(nome)")
    .eq("qr_public_id", qrPublicId)
    .maybeSingle();

  if (computerError) {
    console.error("Erro ao localizar computador para código:", computerError.message);
    return NextResponse.json({ error: "Não foi possível localizar o computador." }, { status: 500 });
  }
  if (!computer) return NextResponse.json({ error: "Computador não encontrado." }, { status: 404 });
  if (computer.estado !== "Operacional") {
    return NextResponse.json({ error: "Este computador não está operacional." }, { status: 409 });
  }

  try {
    const code = String(randomInt(100_000, 1_000_000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data, error } = await context.admin.rpc("issue_pc_temporary_code", {
      p_user_id: context.userId,
      p_computador_id: computer.id,
      p_codigo_hash: hashTemporaryCode(code),
      p_expires_at: expiresAt,
    });

    if (error) {
      const message = error.message || "";
      if (message.includes("CODE_RATE_LIMITED")) {
        return NextResponse.json({ error: "Atingiste o limite de 5 códigos em 15 minutos. Aguarda antes de gerar outro." }, { status: 429 });
      }
      if (message.includes("USER_HAS_ACTIVE_SESSION")) {
        return NextResponse.json({ error: "Já tens uma sessão de computador ativa. Termina essa sessão antes de gerar outro código." }, { status: 409 });
      }
      if (message.includes("COMPUTER_NOT_AVAILABLE") || message.includes("COMPUTER_IN_USE")) {
        return NextResponse.json({ error: "Este computador não está disponível neste momento." }, { status: 409 });
      }
      if (message.includes("STUDENT_NOT_ENROLLED")) {
        return NextResponse.json({ error: "A tua conta de aluno ainda não está associada a uma turma ativa." }, { status: 403 });
      }
      if (message.includes("STUDENT_NOT_ACTIVE") || message.includes("TEACHER_NOT_ACTIVE") || message.includes("STAFF_NOT_ACTIVE")) {
        return NextResponse.json({ error: "A tua conta institucional não está ativa para utilizar computadores." }, { status: 403 });
      }
      if (message.includes("USER_NOT_ALLOWED")) {
        return NextResponse.json({ error: "Este perfil não está autorizado a utilizar computadores." }, { status: 403 });
      }
      console.error("Erro ao gerar código temporário:", error.message);
      return NextResponse.json({ error: "Não foi possível gerar o código temporário." }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.id) {
      return NextResponse.json({ error: "O servidor não confirmou a criação do código." }, { status: 500 });
    }

    await writePcLog(
      context.admin,
      context.userId,
      "Gerar código temporário",
      "codigos_temporarios",
      row.id,
      context.role + " gerou um código temporário para " + computer.nome + "."
    );

    const room = Array.isArray(computer.salas) ? computer.salas[0] : computer.salas;
    return NextResponse.json({
      id: row.id,
      code,
      expires_at: row.expires_at,
      expires_in_seconds: 600,
      computer: { name: computer.nome, room: room ?? null },
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falha ao gerar código temporário:", error);
    return NextResponse.json({ error: "Ocorreu um erro ao gerar o código." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { context, response } = await getPcAuthContext();
  if (!context) return response ?? NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!ELIGIBLE_ROLES.has(context.role)) {
    return NextResponse.json({ error: "Este perfil não pode cancelar códigos de acesso." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { id?: string };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Identificador do código em falta." }, { status: 400 });

  const { data, error } = await context.admin
    .from("codigos_temporarios")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", context.userId)
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Erro ao cancelar código temporário:", error.message);
    return NextResponse.json({ error: "Não foi possível cancelar o código." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "O código já foi utilizado, expirou ou não pertence à tua conta." }, { status: 409 });

  await writePcLog(context.admin, context.userId, "Cancelar código temporário", "codigos_temporarios", id,
    context.role + " cancelou um código temporário ainda não utilizado.");

  return NextResponse.json({ success: true });
}
