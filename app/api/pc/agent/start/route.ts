import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-admin";

export const runtime = "nodejs";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const agentKey = request.headers.get("x-pc-agent-key");
  if (!agentKey || agentKey.length < 32 || agentKey.length > 512) {
    return NextResponse.json({ error: "Credencial do computador inválida." }, { status: 401 });
  }

  try {
    const body = await request.json() as { computer_id?: string; code?: string };
    if (!body.computer_id || !UUID_PATTERN.test(body.computer_id) || !body.code || !/^\d{6}$/.test(body.code)) {
      return NextResponse.json({ error: "Indica o computador e um código de 6 dígitos válido." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const codeHash = createHash("sha256").update(body.code).digest("hex");
    const agentKeyHash = createHash("sha256").update(agentKey).digest("hex");
    const { data, error } = await admin.rpc("pc_agent_start_session", {
      p_computador_id: body.computer_id,
      p_code_hash: codeHash,
      p_agent_key_hash: agentKeyHash,
    });

    if (error) {
      const message = error.message ?? "";
      if (message.includes("INVALID_DEVICE_CREDENTIAL")) {
        return NextResponse.json({ error: "Este computador não está registado ou a credencial foi revogada." }, { status: 401 });
      }
      if (message.includes("COMPUTER_NOT_AVAILABLE") || message.includes("COMPUTER_IN_USE")) {
        return NextResponse.json({ error: "Este computador não está disponível neste momento." }, { status: 409 });
      }
      if (message.includes("INVALID_OR_EXPIRED_CODE_FOR_COMPUTER")) {
        return NextResponse.json({ error: "Código inválido, expirado ou emitido para outro computador." }, { status: 401 });
      }
      if (message.includes("USER_HAS_ACTIVE_SESSION")) {
        return NextResponse.json({ error: "Já tens uma sessão ativa noutro computador." }, { status: 409 });
      }
      console.error("PC agent start RPC failed:", error);
      return NextResponse.json({ error: "Não foi possível iniciar a sessão deste computador." }, { status: 409 });
    }

    return NextResponse.json({ session: Array.isArray(data) ? data[0] ?? null : data }, { status: 200 });
  } catch (error) {
    console.error("PC agent session start failed:", error);
    return NextResponse.json({ error: "Pedido de início de sessão inválido." }, { status: 400 });
  }
}
