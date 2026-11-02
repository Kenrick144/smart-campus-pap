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
    const body = await request.json() as { computer_id?: string; code?: string };
    if (!body.computer_id || !body.code || !/^\d{6}$/.test(body.code)) {
      return NextResponse.json({ error: "Indica o computador e um código de 6 dígitos." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const codeHash = createHash("sha256").update(body.code).digest("hex");
    const agentKeyHash = createHash("sha256").update(agentKey).digest("hex");
    const { data, error } = await admin.rpc("pc_agent_start_session", {
      p_computer_id: body.computer_id,
      p_code_hash: codeHash,
      p_agent_key_hash: agentKeyHash,
    });

    if (error) {
      return NextResponse.json({ error: error.message || "Não foi possível iniciar a sessão." }, { status: 409 });
    }

    return NextResponse.json({ session: data }, { status: 200 });
  } catch (error) {
    console.error("PC agent session start failed:", error);
    return NextResponse.json({ error: "Pedido de início de sessão inválido." }, { status: 400 });
  }
}
