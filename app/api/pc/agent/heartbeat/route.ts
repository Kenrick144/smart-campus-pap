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
    const body = await request.json() as { computer_id?: string; session_id?: string };
    if (!body.computer_id || !UUID_PATTERN.test(body.computer_id) || !body.session_id || !UUID_PATTERN.test(body.session_id)) {
      return NextResponse.json({ error: "Indica o computador e a sessão válidos." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const tokenHash = createHash("sha256").update(agentKey, "utf8").digest("hex");
    const { data: credential, error: credentialError } = await admin
      .from("pc_device_credentials")
      .select("id")
      .eq("computador_id", body.computer_id)
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (credentialError) throw credentialError;
    if (!credential) return NextResponse.json({ error: "Credencial do computador inválida ou revogada." }, { status: 401 });

    const now = new Date().toISOString();
    const { data: session, error: sessionError } = await admin
      .from("sessoes_computador")
      .update({ heartbeat_at: now })
      .eq("id", body.session_id)
      .eq("computador_id", body.computer_id)
      .is("ended_at", null)
      .select("id")
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) return NextResponse.json({ active: false }, { status: 409 });

    const { error: seenError } = await admin
      .from("pc_device_credentials")
      .update({ last_seen_at: now })
      .eq("id", credential.id);
    if (seenError) throw seenError;

    return NextResponse.json({ active: true, heartbeat_at: now }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("PC agent heartbeat failed:", error);
    return NextResponse.json({ error: "Não foi possível atualizar a sessão do computador." }, { status: 500 });
  }
}
