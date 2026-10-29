import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Role = "Aluno" | "Professor" | "Funcionário" | "Administrador Adjunto" | "Administrador";
type NoticeRow = {
  id: string;
  titulo: string;
  mensagem: string;
  tipo_destinatario: string;
  turma_id: string | null;
  data_publicacao: string;
  data_expiracao: string | null;
};

const roleTargets: Record<Role, string> = {
  Aluno: "Alunos",
  Professor: "Professores",
  Funcionário: "Funcionários",
  Administrador: "Administradores",
  "Administrador Adjunto": "Administradores",
};

async function getVisibleNotifications(userId: string, role: Role) {
  const admin = createAdminClient();
  const now = new Date();

  const { data: rows, error } = await admin
    .from("avisos")
    .select("id, titulo, mensagem, tipo_destinatario, turma_id, data_publicacao, data_expiracao")
    .eq("estado", "Publicado")
    .lte("data_publicacao", now.toISOString())
    .order("data_publicacao", { ascending: false })
    .limit(100);

  if (error) throw new Error("Não foi possível carregar as notificações.");

  let classIds = new Set<string>();
  if (role === "Aluno") {
    const { data, error: membershipError } = await admin
      .from("alunos_turmas")
      .select("turma_id")
      .eq("aluno_id", userId)
      .is("data_fim", null);
    if (membershipError) throw new Error("Não foi possível validar as notificações da turma.");
    classIds = new Set((data ?? []).map((row) => row.turma_id));
  } else if (role === "Professor") {
    const { data, error: membershipError } = await admin
      .from("professores_turmas")
      .select("turma_id")
      .eq("professor_id", userId)
      .is("data_fim", null);
    if (membershipError) throw new Error("Não foi possível validar as notificações da turma.");
    classIds = new Set((data ?? []).map((row) => row.turma_id));
  }

  const visible = ((rows ?? []) as NoticeRow[]).filter((notice) => {
    if (notice.data_expiracao && new Date(notice.data_expiracao) <= now) return false;
    if (notice.tipo_destinatario === "Todos" || notice.tipo_destinatario === roleTargets[role]) return true;
    return notice.tipo_destinatario === "Turma" && Boolean(notice.turma_id) && classIds.has(notice.turma_id as string);
  });

  const visibleIds = visible.map((notice) => notice.id);
  let readIds = new Set<string>();
  if (visibleIds.length) {
    const { data: reads, error: readError } = await admin
      .from("avisos_leituras")
      .select("aviso_id")
      .eq("user_id", userId)
      .in("aviso_id", visibleIds);
    if (readError) throw new Error("Não foi possível carregar o estado das notificações.");
    readIds = new Set((reads ?? []).map((row) => row.aviso_id));
  }

  return {
    admin,
    notifications: visible.map((notice) => ({
      id: notice.id,
      title: notice.titulo,
      message: notice.mensagem,
      publishedAt: notice.data_publicacao,
      read: readIds.has(notice.id),
    })),
  };
}

async function getAuthorizedUser() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  const roles: Role[] = ["Aluno", "Professor", "Funcionário", "Administrador", "Administrador Adjunto"];
  if (profileError || !profile || profile.status !== "Ativo" || !roles.includes(profile.role as Role)) {
    return { error: NextResponse.json({ error: "Conta inativa ou perfil inválido." }, { status: 403 }) };
  }

  return { user, role: profile.role as Role };
}

export async function GET() {
  try {
    const auth = await getAuthorizedUser();
    if ("error" in auth) return auth.error;

    const result = await getVisibleNotifications(auth.user.id, auth.role);
    return NextResponse.json({
      notifications: result.notifications,
      unreadCount: result.notifications.filter((notice) => !notice.read).length,
    });
  } catch (error) {
    console.error("Erro ao carregar notificações:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível carregar as notificações." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthorizedUser();
    if ("error" in auth) return auth.error;

    const body = await request.json() as { id?: string; all?: boolean };
    const result = await getVisibleNotifications(auth.user.id, auth.role);
    const selected = body.all
      ? result.notifications
      : result.notifications.filter((notice) => notice.id === body.id);

    if (!selected.length) {
      return NextResponse.json({ error: "A notificação selecionada não existe ou não está disponível para a tua conta." }, { status: 404 });
    }

    const readAt = new Date().toISOString();
    const { error } = await result.admin
      .from("avisos_leituras")
      .upsert(
        selected.map((notice) => ({ aviso_id: notice.id, user_id: auth.user.id, lido_em: readAt })),
        { onConflict: "aviso_id,user_id" },
      );

    if (error) {
      console.error("Erro ao marcar notificações como lidas:", error);
      return NextResponse.json({ error: "Não foi possível atualizar as notificações." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao atualizar notificações:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível atualizar as notificações." },
      { status: 500 },
    );
  }
}
