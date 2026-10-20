import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

type Role =
  | "Aluno"
  | "Professor"
  | "Funcionário"
  | "Administrador Adjunto"
  | "Administrador";

const roleRoutes: Record<Role, string[]> = {
  Administrador: [
    "/dashboard", "/utilizadores", "/alunos", "/professor", "/turmas",
    "/disciplinas", "/presencas", "/horarios", "/salas", "/computadores",
    "/qr-code", "/relatorios", "/logs", "/configuracoes", "/avisos",
    "/avaliacoes", "/notas", "/aluno", "/funcionario", "/pc",
  ],
  "Administrador Adjunto": [
    "/dashboard", "/utilizadores", "/alunos", "/professor", "/turmas",
    "/disciplinas", "/presencas", "/horarios", "/salas", "/computadores",
    "/qr-code", "/relatorios", "/logs", "/configuracoes", "/avisos",
    "/avaliacoes", "/notas", "/aluno", "/funcionario", "/pc",
  ],
  Professor: [
    "/dashboard", "/alunos", "/turmas", "/disciplinas", "/presencas",
    "/horarios", "/computadores", "/qr-code", "/relatorios", "/avaliacoes",
    "/notas", "/avisos", "/pc",
  ],
  "Funcionário": [
    "/dashboard", "/funcionario", "/horarios", "/salas", "/computadores",
    "/avisos", "/pc",
  ],
  Aluno: ["/aluno", "/horarios", "/qr-code", "/notas", "/avaliacoes", "/avisos", "/pc"],
};

const roleHome: Record<Role, string> = {
  Administrador: "/dashboard",
  "Administrador Adjunto": "/dashboard",
  Professor: "/dashboard",
  "Funcionário": "/funcionario",
  Aluno: "/aluno",
};

function isRole(value: string): value is Role {
  return [
    "Aluno",
    "Professor",
    "Funcionário",
    "Administrador Adjunto",
    "Administrador",
  ].includes(value);
}

function canAccess(role: Role, pathname: string) {
  return roleRoutes[role].some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/") {
      return response;
    }
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    return NextResponse.redirect(login);
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === "/login";
  const isRoot = pathname === "/";
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;
  const isAuthenticated = !claimsError && Boolean(userId);

  if (!isAuthenticated) {
    if (isLogin || isRoot) return response;
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    return NextResponse.redirect(login);
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role, status")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile || profile.status !== "Ativo" || !isRole(profile.role)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    const redirect = NextResponse.redirect(login);
    redirect.cookies.delete("sb-access-token");
    return redirect;
  }

  if (isRoot || isLogin) {
    const destination = request.nextUrl.clone();
    destination.pathname = roleHome[profile.role];
    destination.search = "";
    return NextResponse.redirect(destination);
  }

  if (!canAccess(profile.role, pathname)) {
    const destination = request.nextUrl.clone();
    destination.pathname = roleHome[profile.role];
    destination.search = "";
    return NextResponse.redirect(destination);
  }

  if (
    pathname.startsWith("/api/admin/users") &&
    profile.role !== "Administrador" &&
    profile.role !== "Administrador Adjunto"
  ) {
    return NextResponse.json({ error: "Não tens permissão para gerir utilizadores." }, { status: 403 });
  }

  return response;
}
