import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashDeviceToken, writePcLog } from "../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const END_REASONS = new Set(["aluno", "timeout", "desligado", "erro"]);

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

    // The active schema has no PC-agent end RPC. Scope the privileged update
    // by both session and authenticated device computer to prevent cross-PC IDOR.
    const { data: session, error: sessionError } = await admin
      .from("sessoes_computador")
      .update({ ended_at: new Date().toISOString(), ended_reason: reason })
      .eq("id", body.session_id)
      .eq("computador_id", body.computer_id)
      .is("ended_at", null)
      .select("id, aluno_id")
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) {
      return NextResponse.json({ ended: false }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    await writePcLog(
      admin,
      session.aluno_id,
      "Terminar sessão de computador",
      "sessoes_computador",
      session.id,
      "O agente terminou a sessão do computador (" + reason + ").",
    );

    return NextResponse.json({ ended: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("PC agent session end failed:", error);
    return NextResponse.json({ error: "Não foi possível terminar a sessão do computador." }, { status: 500 });
  }
}
