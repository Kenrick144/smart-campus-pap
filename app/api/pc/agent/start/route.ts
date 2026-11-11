import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashDeviceToken, hashTemporaryCode } from "../../_lib";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GuardedStartResult = {
  ok?: boolean;
  error?: string;
  retry_at?: string | null;
  attempts_remaining?: number;
  session?: {
    session_id: string;
    user_id: string;
    user_name: string;
    user_role: string;
    computador_id: string;
    computador_nome: string;
    started_at: string;
  };
};

export async function POST(request: NextRequest) {
  const agentKey = request.headers.get("x-pc-agent-key");
  if (!agentKey || agentKey.length !== 64 || !/^[a-f0-9]{64}$/i.test(agentKey)) {
    return NextResponse.json({ error: "Credencial do computador inválida." }, { status: 401 });
  }

  try {
    const body = await request.json() as { computer_id?: string; code?: string };
    if (!body.computer_id || !UUID_PATTERN.test(body.computer_id) || !body.code || !/^\d{6}$/.test(body.code)) {
      return NextResponse.json({ error: "Indica o computador e um código de 6 dígitos válido." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("pc_agent_start_session_guarded", {
      p_computador_id: body.computer_id,
      p_code_hash: hashTemporaryCode(body.code),
      p_agent_key_hash: hashDeviceToken(agentKey),
    });

    if (error) {
      console.error("PC agent guarded start RPC failed:", error);
      return NextResponse.json({ error: "Não foi possível validar a sessão deste computador." }, { status: 503 });
    }

    const result = data as GuardedStartResult | null;
    if (!result?.ok) {
      const codeError = result?.error ?? "UNKNOWN";
      if (codeError === "INVALID_DEVICE_CREDENTIAL") {
        return NextResponse.json({ error: "Este computador não está registado ou a credencial foi revogada." }, { status: 401 });
      }
      if (codeError === "DEVICE_TEMPORARILY_LOCKED") {
        return NextResponse.json({
          error: "Demasiadas tentativas inválidas. Este computador está temporariamente bloqueado durante 10 minutos.",
          retryAt: result?.retry_at ?? null,
        }, { status: 429 });
      }
      if (codeError === "COMPUTER_NOT_FOUND" || codeError === "COMPUTER_NOT_AVAILABLE") {
        return NextResponse.json({ error: "Este computador não está disponível neste momento." }, { status: 409 });
      }
      if (codeError === "INVALID_OR_EXPIRED_CODE_FOR_COMPUTER") {
        return NextResponse.json({
          error: "Código inválido, expirado, cancelado ou emitido para outro computador.",
          attemptsRemaining: result?.attempts_remaining ?? null,
        }, { status: 401 });
      }
      if (codeError === "USER_HAS_ACTIVE_SESSION" || codeError === "COMPUTER_IN_USE") {
        return NextResponse.json({ error: "Já existe uma sessão ativa para este utilizador ou computador." }, { status: 409 });
      }
      if (["USER_NOT_ALLOWED", "STUDENT_NOT_ENROLLED", "TEACHER_NOT_ACTIVE", "STAFF_NOT_ACTIVE"].includes(codeError)) {
        return NextResponse.json({ error: "A conta não está autorizada a utilizar este computador." }, { status: 403 });
      }
      console.error("PC agent start rejected:", codeError);
      return NextResponse.json({ error: "Não foi possível iniciar a sessão deste computador." }, { status: 409 });
    }

    if (!result.session?.session_id) {
      return NextResponse.json({ error: "O servidor não devolveu uma sessão válida." }, { status: 500 });
    }

    return NextResponse.json({ session: result.session }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("PC agent session start failed:", error);
    return NextResponse.json({ error: "Pedido de início de sessão inválido." }, { status: 400 });
  }
}
