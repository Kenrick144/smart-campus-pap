import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { getPcAuthContext, hashTemporaryCode, writePcLog } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { context, response } = await getPcAuthContext();
  if (!context) return response ?? NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (context.role !== "Aluno") {
    return NextResponse.json({ error: "Apenas os alunos podem consultar os seus códigos temporários." }, { status: 403 });
  }

  const { data, error } = await context.admin
    .from("codigos_temporarios")
    .select("id, created_at, expires_at, used_at, revoked_at")
    .eq("aluno_id", context.userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Erro ao consultar códigos temporários:", error.message);
    return NextResponse.json({ error: "Não foi possível consultar os códigos temporários." }, { status: 500 });
  }

  const now = Date.now();
  const codes = (data ?? []).map((row) => {
    const expired = new Date(row.expires_at).getTime() <= now;
    const status = row.used_at
      ? "Utilizado"
      : row.revoked_at
        ? "Cancelado"
        : expired
          ? "Expirado"
          : "Ativo";
    return {
      id: row.id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      revokedAt: row.revoked_at,
      status,
    };
  });

  const activeCode = codes.find((item) => item.status === "Ativo") ?? null;
  return NextResponse.json({ activeCode, history: codes });
}

export async function POST() {
  const { context, response } = await getPcAuthContext();
  if (!context) return response ?? NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (context.role !== "Aluno") {
    return NextResponse.json({ error: "Apenas os alunos podem gerar códigos temporários." }, { status: 403 });
  }

  try {
    const code = String(randomInt(10_000_000, 100_000_000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data, error } = await context.admin.rpc("issue_pc_temporary_code", {
      p_aluno_id: context.userId,
      p_codigo_hash: hashTemporaryCode(code),
      p_expires_at: expiresAt,
    });

    if (error) {
      const message = error.message || "";
      if (message.includes("CODE_RATE_LIMITED")) {
        return NextResponse.json({ error: "Atingiste o limite de 5 códigos em 15 minutos. Aguarda antes de gerar outro." }, { status: 429 });
      }
      if (message.includes("STUDENT_HAS_ACTIVE_SESSION")) {
        return NextResponse.json({ error: "Já tens uma sessão de computador ativa. Termina essa sessão antes de gerar outro código." }, { status: 409 });
      }
      if (message.includes("STUDENT_NOT_ENROLLED")) {
        return NextResponse.json({ error: "A tua conta ainda não está associada a uma turma ativa. Contacta a secretaria." }, { status: 403 });
      }
      if (message.includes("STUDENT_NOT_ACTIVE")) {
        return NextResponse.json({ error: "A conta de aluno não está ativa." }, { status: 403 });
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
      "O aluno gerou um código temporário para acesso ao parque informático."
    );

    // O código em texto simples é devolvido uma única vez e nunca é guardado na base de dados.
    return NextResponse.json({ id: row.id, code, expiresAt: row.expires_at }, { status: 201 });
  } catch (error) {
    console.error("Falha ao gerar código temporário:", error);
    return NextResponse.json({ error: "Ocorreu um erro ao gerar o código." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { context, response } = await getPcAuthContext();
  if (!context) return response ?? NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (context.role !== "Aluno") {
    return NextResponse.json({ error: "Apenas os alunos podem cancelar os seus códigos." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { id?: string };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Identificador do código em falta." }, { status: 400 });

  const { data, error } = await context.admin
    .from("codigos_temporarios")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("aluno_id", context.userId)
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

  await writePcLog(
    context.admin,
    context.userId,
    "Cancelar código temporário",
    "codigos_temporarios",
    id,
    "O aluno cancelou um código temporário ainda não utilizado."
  );

  return NextResponse.json({ success: true });
}
