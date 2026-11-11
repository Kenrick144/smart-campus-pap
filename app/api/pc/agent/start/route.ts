import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashDeviceToken, hashTemporaryCode, writePcLog } from "../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GuardedStartResult = {
  ok?: boolean;
  error?: string;
  retry_at?: string | null;
  attempts_remaining?: number;
  session_id?: string;
  aluno_id?: string;
  aluno_nome?: string;
  computador_id?: string;
  computador_nome?: string;
  started_at?: string;
};

export async function POST(request: NextRequest) {
  const agentKey = request.headers.get("x-pc-agent-key");
  if (!agentKey || agentKey.length !== 64 || !/^[a-f0-9]{64}$/i.test(agentKey)) {
    return NextResponse.json({ error: "Credencial do computador inválida." }, { status: 401 });
  }

  try {
    const body = await request.json() as { computer_id?: string; code?: string };
    if (!body.computer_id || !UUID_PATTERN.test(body.computer_id) || typeof body.code !== "string") {
      return NextResponse.json({ error: "Indica o computador e um código de 6 dígitos válido." }, { status: 400 });
    }

    const code = body.code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "O código deve conter exatamente 6 dígitos." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: credential, error: credentialError } = await admin
      .from("pc_device_credentials")
      .select("id")
      .eq("computador_id", body.computer_id)
      .eq("token_hash", hashDeviceToken(agentKey))
      .is("revoked_at", null)
      .maybeSingle();

    if (credentialError) throw credentialError;
    if (!credential) {
      return NextResponse.json({ error: "Este computador não está registado ou a credencial foi revogada." }, { status: 401 });
    }

    // Use the exact RPC signature deployed in the active database.
    // This legacy function is student-only and does not bind a code to a QR;
    // QR-bound sessions remain unavailable until the reviewed DB migration is authorized.
    const { data, error } = await admin.rpc("start_pc_session_guarded", {
      p_computador_id: body.computer_id,
      p_codigo_hash: hashTemporaryCode(code),
      p_device_credential_id: credential.id,
    });

    if (error) {
      console.error("PC agent guarded start RPC failed:", error.message);
      return NextResponse.json({ error: "Não foi possível validar a sessão deste computador." }, { status: 503 });
    }

    const result = data as GuardedStartResult | null;
    if (!result?.ok) {
      const codeError = result?.error ?? "UNKNOWN";
      if (codeError === "DEVICE_CREDENTIAL_INVALID") {
        return NextResponse.json({ error: "Este computador não está registado ou a credencial foi revogada." }, { status: 401 });
      }
      if (codeError === "DEVICE_TEMPORARILY_LOCKED") {
        return NextResponse.json({
          error: "Demasiadas tentativas inválidas. Este computador está temporariamente bloqueado durante 10 minutos.",
          retryAt: result?.retry_at ?? null,
        }, { status: 429 });
      }
      if (codeError === "COMPUTER_NOT_FOUND") {
        return NextResponse.json({ error: "Este computador não está registado." }, { status: 404 });
      }
      if (codeError === "COMPUTER_NOT_OPERATIONAL") {
        return NextResponse.json({ error: "Este computador não está operacional." }, { status: 409 });
      }
      if (codeError === "INVALID_OR_EXPIRED_CODE") {
        return NextResponse.json({
          error: "Código inválido, expirado, cancelado ou já utilizado.",
          attemptsRemaining: result?.attempts_remaining ?? null,
        }, { status: 401 });
      }
      if (codeError === "COMPUTER_IN_USE") {
        return NextResponse.json({ error: "Este computador já está a ser utilizado." }, { status: 409 });
      }
      if (codeError === "STUDENT_HAS_ACTIVE_SESSION") {
        return NextResponse.json({ error: "Este aluno já tem uma sessão ativa noutro computador." }, { status: 409 });
      }
      if (codeError === "STUDENT_NOT_ENROLLED" || codeError === "STUDENT_NOT_ACTIVE") {
        return NextResponse.json({ error: "A conta do aluno não está ativa ou não tem matrícula ativa." }, { status: 403 });
      }
      console.error("PC agent start rejected:", codeError);
      return NextResponse.json({ error: "Não foi possível iniciar a sessão deste computador." }, { status: 409 });
    }

    if (!result.session_id || !result.aluno_id) {
      return NextResponse.json({ error: "O servidor não devolveu uma sessão válida." }, { status: 500 });
    }

    await writePcLog(
      admin,
      result.aluno_id,
      "Iniciar sessão de computador",
      "sessoes_computador",
      result.session_id,
      "O aluno " + (result.aluno_nome ?? "") + " iniciou uma sessão em " + (result.computador_nome ?? "um computador") + ".",
    );

    return NextResponse.json({
      session: {
        session_id: result.session_id,
        user_id: result.aluno_id,
        user_name: result.aluno_nome ?? "Aluno",
        user_role: "Aluno",
        computador_id: result.computador_id,
        computador_nome: result.computador_nome,
        started_at: result.started_at,
      },
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("PC agent session start failed:", error);
    return NextResponse.json({ error: "Pedido de início de sessão inválido." }, { status: 400 });
  }
}
