import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashDeviceToken } from "../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const agentKey = request.headers.get("x-pc-agent-key");
  if (!agentKey || agentKey.length !== 64 || !/^[a-f0-9]{64}$/i.test(agentKey)) {
    return NextResponse.json({ error: "Credencial do computador inválida." }, { status: 401 });
  }

  try {
    const body = await request.json() as { computer_id?: string; code?: string };
    if (!body.computer_id || !UUID_PATTERN.test(body.computer_id) || typeof body.code !== "string" || !/^\d{6}$/.test(body.code.replace(/\s+/g, ""))) {
      return NextResponse.json({ error: "Indica o computador e um código de 6 dígitos válido." }, { status: 400 });
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

    // The active database only has the legacy RPC, which does not bind a
    // temporary code to the target computer. Never use it for the QR flow:
    // doing so would allow a valid code to be replayed at another PC.
    return NextResponse.json({
      error: "O início de sessão por QR está temporariamente indisponível. A base de dados ainda não tem a validação que associa o código a este computador. Não foi iniciada nenhuma sessão.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("PC agent session start failed:", error);
    return NextResponse.json({ error: "Não foi possível validar o pedido de início de sessão." }, { status: 500 });
  }
}
