import { createHash, randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-admin";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["Aluno", "Professor", "Funcionário"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Sessão não autenticada." }, { status: 401 });

  try {
    const body = await request.json() as { qr_public_id?: string };
    if (!body.qr_public_id || !UUID_PATTERN.test(body.qr_public_id)) {
      return NextResponse.json({ error: "QR Code inválido. Lê o código do computador novamente." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { data: user, error: userError } = await admin
      .from("users")
      .select("id, name, role, status")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (userError) throw userError;
    if (!user || user.status !== "Ativo" || !ALLOWED_ROLES.has(user.role)) {
      return NextResponse.json({ error: "Este perfil não pode utilizar os computadores." }, { status: 403 });
    }

    const { data: computer, error: computerError } = await admin
      .from("computadores")
      .select("id, nome, estado, qr_public_id, salas(nome)")
      .eq("qr_public_id", body.qr_public_id)
      .maybeSingle();

    if (computerError) throw computerError;
    if (!computer) return NextResponse.json({ error: "Computador não encontrado." }, { status: 404 });
    if (computer.estado !== "Operacional") {
      return NextResponse.json({ error: "Este computador não está disponível." }, { status: 409 });
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const codeHash = createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data: issued, error: issueError } = await admin.rpc("issue_pc_temporary_code", {
      p_user_id: authData.user.id,
      p_computador_id: computer.id,
      p_codigo_hash: codeHash,
      p_expires_at: expiresAt,
    });

    if (issueError) {
      const message = issueError.message ?? "";
      if (message.includes("CODE_RATE_LIMITED")) {
        return NextResponse.json({ error: "Atingiste o limite de 5 códigos em 15 minutos." }, { status: 429 });
      }
      if (message.includes("USER_HAS_ACTIVE_SESSION")) {
        return NextResponse.json({ error: "Já tens uma sessão ativa num computador." }, { status: 409 });
      }
      if (message.includes("COMPUTER_NOT_AVAILABLE")) {
        return NextResponse.json({ error: "Este computador não está disponível." }, { status: 409 });
      }
      if (message.includes("STUDENT_NOT_ENROLLED") || message.includes("TEACHER_NOT_ACTIVE") || message.includes("STAFF_NOT_ACTIVE")) {
        return NextResponse.json({ error: "O teu registo escolar não está ativo ou autorizado." }, { status: 403 });
      }
      console.error("PC temporary code RPC failed:", issueError);
      return NextResponse.json({ error: "Não foi possível gerar o código temporário." }, { status: 500 });
    }

    return NextResponse.json({
      code,
      expires_at: Array.isArray(issued) ? issued[0]?.expires_at ?? expiresAt : expiresAt,
      expires_in_seconds: 600,
      computer: { id: computer.id, name: computer.nome, room: computer.salas },
    }, { status: 201 });
  } catch (error) {
    console.error("PC temporary code generation failed:", error);
    return NextResponse.json({ error: "Pedido de código inválido." }, { status: 400 });
  }
}
