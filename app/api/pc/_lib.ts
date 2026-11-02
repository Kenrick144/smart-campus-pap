import "server-only";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type PcRole =
  | "Aluno"
  | "Professor"
  | "Funcionário"
  | "Administrador Adjunto"
  | "Administrador";

export type PcAuthContext = {
  userId: string;
  name: string;
  role: PcRole;
  admin: ReturnType<typeof createAdminClient>;
};

const roles: PcRole[] = [
  "Aluno",
  "Professor",
  "Funcionário",
  "Administrador Adjunto",
  "Administrador",
];

export async function getPcAuthContext() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return { context: null, response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, name, role, status")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.status !== "Ativo" || !roles.includes(profile.role as PcRole)) {
    return { context: null, response: NextResponse.json({ error: "Conta inativa ou perfil inválido." }, { status: 403 }) };
  }

  return {
    context: {
      userId: authData.user.id,
      name: profile.name || "Utilizador",
      role: profile.role as PcRole,
      admin: createAdminClient(),
    } satisfies PcAuthContext,
    response: null,
  };
}

export function isPcAdmin(role: PcRole) {
  return role === "Administrador" || role === "Administrador Adjunto";
}

export function hashTemporaryCode(code: string) {
  const pepper = process.env.SUPABASE_SECRET_KEY;
  if (!pepper) throw new Error("A chave secreta do Supabase não está configurada no servidor.");
  return createHash("sha256").update(pepper + ":" + code).digest("hex");
}

export function hashDeviceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function writePcLog(
  admin: ReturnType<typeof createAdminClient>,
  userId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  description: string
) {
  const { error } = await admin.from("logs").insert({
    user_id: userId,
    acao: action,
    entidade: entity,
    entidade_id: entityId,
    descricao: description,
  });
  if (error) console.error("Não foi possível registar a atividade do PC:", error.message);
}
