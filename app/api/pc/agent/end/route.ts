import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const agentKey = request.headers.get("x-pc-agent-key");
  if (!agentKey || agentKey.length < 32) {
    return NextResponse.json({ error: "Credencial do computador inválida." }, { status: 401 });
  }

  try {
    const body = await request.json() as { computer_id?: string; session_id?: string; reason?: string };
    if (!body.computer_id || !body.session_id) {
      return NextResponse.json({ error: "Indica o computador e a sessão." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const agentKeyHash = createHash("sha256").update(agentKey).digest("hex");
    const { data, error } = await admin.rpc("pc_agent_end_session", {
      p_computer_id: body.computer_id,
      p_session_id: body.session_id,
      p_agent_key_hash: agentKeyHash,
      p_end_reason: body.reason ?? "ended",
    });

    if (error) {
      return NextResponse.json({ error: error.message || "Não foi possível terminar a sessão." }, { status: 409 });
    }

    return NextResponse.json({ ended: data === true }, { status: 200 });
  } catch (error) {
    console.error("PC agent session end failed:", error);
    return NextResponse.json({ error: "Pedido de fim de sessão inválido." }, { status: 400 });
  }
}
