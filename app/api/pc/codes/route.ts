import { createHash, randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-admin";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["Aluno", "Professor", "Funcionário"]);

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Sessão não autenticada." }, { status: 401 });

  try {
    const admin = getSupabaseAdmin();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile || !ALLOWED_ROLES.has(profile.role)) {
      return NextResponse.json({ error: "Este perfil não pode gerar códigos para os computadores." }, { status: 403 });
    }

    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin
      .from("pc_access_codes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", authData.user.id)
      .gte("created_at", since);

    if (countError) throw countError;
    if ((count ?? 0) >= 5) {
      return NextResponse.json({ error: "Atingiste o limite de 5 códigos em 15 minutos." }, { status: 429 });
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const codeHash = createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertError } = await admin.from("pc_access_codes").insert({
      user_id: authData.user.id,
      code_hash: codeHash,
      expires_at: expiresAt,
    });
    if (insertError) throw insertError;

    return NextResponse.json({ code, expires_at: expiresAt, expires_in_seconds: 600 }, { status: 201 });
  } catch (error) {
    console.error("PC access code generation failed:", error);
    return NextResponse.json({ error: "Não foi possível gerar o código temporário." }, { status: 500 });
  }
}
