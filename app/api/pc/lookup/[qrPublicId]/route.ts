import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-admin";

export const runtime = "nodejs";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: NextRequest, context: { params: Promise<{ qrPublicId: string }> }) {
  const { qrPublicId } = await context.params;
  if (!UUID_PATTERN.test(qrPublicId)) {
    return NextResponse.json({ error: "QR Code inválido." }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: computer, error } = await admin
      .from("computadores")
      .select("id, nome, estado, salas(nome)")
      .eq("qr_public_id", qrPublicId)
      .maybeSingle();

    if (error) throw error;
    if (!computer) return NextResponse.json({ error: "Computador não encontrado." }, { status: 404 });

    const { count, error: sessionError } = await admin
      .from("sessoes_computador")
      .select("id", { count: "exact", head: true })
      .eq("computador_id", computer.id)
      .is("ended_at", null);

    if (sessionError) throw sessionError;
    const available = computer.estado === "Operacional" && (count ?? 0) === 0;

    return NextResponse.json({
      computer: {
        name: computer.nome,
        room: computer.salas,
        inventory_state: computer.estado,
        available_for_use: available,
        availability: available ? "Livre" : computer.estado !== "Operacional" ? "Indisponível" : "Ocupado",
      },
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("PC QR lookup failed:", error);
    return NextResponse.json({ error: "Não foi possível consultar este computador." }, { status: 500 });
  }
}
