import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashDeviceToken, hashTemporaryCode } from "../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StartResult = {
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

const ERROR_MESSAGES: Record<string, string> = {
  DEVICE_TEMPORARILY_LOCKED: "Este computador foi bloqueado temporariamente após cinco tentativas inválidas. Tenta novamente daqui a 10 minutos.",
  INVALID_DEVICE_CREDENTIAL: "Este computador não está registado ou a credencial foi revogada.",
  COMPUTER_NOT_FOUND: "O computador indicado não existe.",
  COMPUTER_NOT_AVAILABLE: "Este computador não está operacional.",
  INVALID_OR_EXPIRED_CODE_FOR_COMPUTER: "O código está incorreto, expirou ou pertence a outro computador.",
  USER_NOT_ALLOWED: "Esta conta não está autorizada a utilizar computadores.",
  STUDENT_NOT_ENROLLED: "A matrícula do aluno não está ativa.",
  TEACHER_NOT_ACTIVE: "O registo do professor não está ativo.",
  STAFF_NOT_ACTIVE: "O registo do funcionário não está ativo.",
  USER_HAS_ACTIVE_SESSION: "Esta conta já tem uma sessão ativa noutro computador.",
  COMPUTER_IN_USE: "Este computador já está a ser utilizado.",
};

export async function POST(request: NextRequest) {
  const agentKey = request.headers.get("x-pc-agent-key");
  if (!agentKey || agentKey.length !== 64 || !/^[a-f0-9]{64}$/i.test(agentKey)) {
    return NextResponse.json({ error: "Credencial do computador inválida." }, { status: 401 });
  }

  try {
    const body = await request.json() as { computer_id?: string; code?: string };
    const code = typeof body.code === "string" ? body.code.replace(/\s+/g, "") : "";
    if (!body.computer_id || !UUID_PATTERN.test(body.computer_id) || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Indica o computador e um código de 6 dígitos válido." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("pc_agent_start_session_guarded", {
      p_computador_id: body.computer_id,
      p_code_hash: hashTemporaryCode(code),
      p_agent_key_hash: hashDeviceToken(agentKey),
    });

    if (error) {
      const message = error.message || "";
      console.error("PC agent guarded start RPC failed:", message);
      if (/pc_agent_start_session_guarded|schema cache|does not exist/i.test(message)) {
        return NextResponse.json({
          error: "A integração QR ainda não está instalada na base de dados. Nenhuma sessão foi iniciada.",
        }, { status: 503, headers: { "Cache-Control": "no-store" } });
      }
      return NextResponse.json({ error: "Não foi possível validar o início da sessão." }, { status: 500 });
    }

    const result = (Array.isArray(data) ? data[0] : data) as StartResult | null;
    if (!result?.ok || !result.session) {
      const reason = result?.error || "INVALID_OR_EXPIRED_CODE_FOR_COMPUTER";
      return NextResponse.json({
        error: ERROR_MESSAGES[reason] || "O acesso a este computador não foi autorizado.",
        code: reason,
        attempts_remaining: result?.attempts_remaining,
        retry_at: result?.retry_at,
      }, {
        status: reason === "DEVICE_TEMPORARILY_LOCKED" ? 423
          : ["INVALID_DEVICE_CREDENTIAL"].includes(reason) ? 401
          : ["USER_NOT_ALLOWED", "STUDENT_NOT_ENROLLED", "TEACHER_NOT_ACTIVE", "STAFF_NOT_ACTIVE"].includes(reason) ? 403
          : ["COMPUTER_NOT_FOUND"].includes(reason) ? 404
          : 409,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return NextResponse.json({
      success: true,
      session: result.session,
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("PC agent session start failed:", error);
    return NextResponse.json({ error: "Não foi possível validar o pedido de início de sessão." }, { status: 500 });
  }
}
