import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashDeviceToken } from "../../_lib";

export const runtime = "nodejs";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const END_REASONS = new Set(["aluno", "administrador", "timeout", "desligado", "erro"]);

export async function POST(request: NextRequest) {
  const agentKey = request.headers.get("x-pc-agent-key");
  if (!agentKey || agentKey.length !== 64 || !/^[a-f0-9]{64}$/i.test(agentKey)) {
    return NextResponse.json({ error: "Credencial do computador inválida." }, { status: 401 });
  }

  try {
    const body = await request.json() as { computer_id?: string; session_id?: string; reason?: string };
    if (!body.computer_id || !UUID_PATTERN.test(body.computer_id) || !body.session_id || !UUID_PATTERN.test(body.session_id)) {
      return NextResponse.json({ error: "Indica o computador e a sessão válidos." }, { status: 400 });
    }

    const reason = body.reason ?? "desligado";
    if (!END_REASONS.has(reason)) {
      return NextResponse.json({ error: "Motivo de fim de sessão inválido." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("pc_agent_end_session", {
      p_computador_id: body.computer_id,
      p_session_id: body.session_id,
      p_agent_key_hash: hashDeviceToken(agentKey),
      p_end_reason: reason,
    });

    if (error) {
      if ((error.message ?? "").includes("INVALID_DEVICE_CREDENTIAL")) {
        return NextResponse.json({ error: "Este computador não está registado ou a credencial foi revogada." }, { status: 401 });
      }
      console.error("PC agent end RPC failed:", error);
      return NextResponse.json({ error: "Não foi possível terminar a sessão do computador." }, { status: 409 });
    }

    return NextResponse.json({ ended: data === true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("PC agent session end failed:", error);
    return NextResponse.json({ error: "Pedido de fim de sessão inválido." }, { status: 400 });
  }
}
