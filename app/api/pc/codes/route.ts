import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { getPcAuthContext, hashTemporaryCode, writePcLog } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Códigos temporários permitem iniciar sessões e são uma operação de escrita.
// Funcionário tem todos_leitura e não pode gerar, consultar ou cancelar códigos.
const ALLOWED_ROLES = new Set(["Aluno", "Professor"]);

function schemaNotReady() {
  return NextResponse.json(
    { error: "A integração de QR e códigos ainda não está instalada na base de dados. Contacta a administração." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function statusOf(row: { used_at: string | null; revoked_at: string | null; expires_at: string }) {
  if (row.used_at) return "Utilizado";
  if (row.revoked_at) return "Cancelado";
  return new Date(row.expires_at).getTime() <= Date.now() ? "Expirado" : "Ativo";
}

export async function GET() {
  const { context, response } = await getPcAuthContext();
  if (!context) return response ?? NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!ALLOWED_ROLES.has(context.role)) {
    return NextResponse.json({ error: "Este perfil não pode gerir códigos de acesso aos computadores." }, { status: 403 });
  }

  const { data, error } = await context.admin
    .from("codigos_temporarios")
    .select("id, created_at, expires_at, used_at, revoked_at, computador_id")
    .eq("user_id", context.userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Erro ao consultar códigos temporários:", error.message);
    if (/user_id|computador_id|schema cache|does not exist/i.test(error.message)) return schemaNotReady();
    return NextResponse.json({ error: "Não foi possível consultar os códigos temporários." }, { status: 500 });
  }

  const history = (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    revokedAt: row.revoked_at,
    computerId: row.computador_id,
    status: statusOf(row),
  }));
  const activeCode = history.find((item) => item.status === "Ativo") ?? null;

  return NextResponse.json({ activeCode, history }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { context, response } = await getPcAuthContext();
  if (!context) return response ?? NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!ALLOWED_ROLES.has(context.role)) {
    return NextResponse.json({ error: "Apenas Alunos e Professores podem gerar códigos." }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({})) as { qr_public_id?: string };
    const qrPublicId = typeof body.qr_public_id === "string" ? body.qr_public_id.trim() : "";
    if (!UUID_PATTERN.test(qrPublicId)) {
      return NextResponse.json(
        { error: "Digitaliza o QR permanente do computador que pretendes utilizar para gerar um código associado a esse posto." },
        { status: 400 },
      );
    }

    const { data: computer, error: computerError } = await context.admin
      .from("computadores")
      .select("id, nome, estado, salas(nome)")
      .eq("qr_public_id", qrPublicId)
      .maybeSingle();

    if (computerError) {
      console.error("Erro ao localizar computador pelo QR:", computerError.message);
      if (/qr_public_id|schema cache|does not exist/i.test(computerError.message)) return schemaNotReady();
      return NextResponse.json({ error: "Não foi possível validar o computador." }, { status: 500 });
    }
    if (!computer) return NextResponse.json({ error: "O QR não corresponde a um computador registado." }, { status: 404 });
    if (computer.estado !== "Operacional") {
      return NextResponse.json({ error: "Este computador não está operacional e não pode receber uma nova sessão." }, { status: 409 });
    }

    // The launcher accepts six digits. Hashing here and at agent start uses
    // the same server-only pepper, so the code can be verified consistently.
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
      if (/function .*issue_pc_temporary_code|schema cache|p_user_id|p_computador_id/i.test(message)) return schemaNotReady();
      if (message.includes("CODE_RATE_LIMITED")) {
        return NextResponse.json({ error: "Atingiste o limite de 5 códigos em 15 minutos. Aguarda antes de gerar outro." }, { status: 429 });
      }
      if (message.includes("COMPUTER_NOT_AVAILABLE") || message.includes("COMPUTER_IN_USE")) {
        return NextResponse.json({ error: "Este computador deixou de estar disponível. Digitaliza o QR de outro posto." }, { status: 409 });
      }
      if (message.includes("USER_HAS_ACTIVE_SESSION")) {
        return NextResponse.json({ error: "Já tens uma sessão ativa noutro computador. Termina essa sessão primeiro." }, { status: 409 });
      }
      if (message.includes("STUDENT_NOT_ENROLLED") || message.includes("TEACHER_NOT_ACTIVE") || message.includes("STAFF_NOT_ACTIVE") || message.includes("USER_NOT_ALLOWED")) {
        return NextResponse.json({ error: "A tua conta não está autorizada a utilizar computadores. Contacta a administração." }, { status: 403 });
      }
      console.error("Erro ao gerar código temporário:", message);
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
      "Foi gerado um código temporário para o computador " + computer.nome + ".",
    );

    const room = computer.salas;
    return NextResponse.json({
      id: row.id,
      code,
      expires_at: row.expires_at,
      expires_in_seconds: 600,
      computer: { name: computer.nome, room },
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falha ao gerar código temporário:", error);
    return NextResponse.json({ error: "Ocorreu um erro ao gerar o código." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { context, response } = await getPcAuthContext();
  if (!context) return response ?? NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!ALLOWED_ROLES.has(context.role)) {
    return NextResponse.json({ error: "Este perfil não pode cancelar códigos temporários." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { id?: string };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Identificador do código inválido." }, { status: 400 });

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
    if (/user_id|schema cache|does not exist/i.test(error.message)) return schemaNotReady();
    return NextResponse.json({ error: "Não foi possível cancelar o código." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "O código já foi utilizado, expirou ou não pertence à tua conta." }, { status: 409 });

  await writePcLog(
    context.admin,
    context.userId,
    "Cancelar código temporário",
    "codigos_temporarios",
    id,
    "O utilizador cancelou um código temporário ainda não utilizado.",
  );

  return NextResponse.json({ success: true });
}
