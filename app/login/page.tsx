"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { readDemoSession, writeDemoSession } from "../lib/session";
import { getSupabaseErrorMessage, isSupabaseConfigured, supabase } from "../lib/supabase";

const profiles = ["Administrador", "Professor", "Aluno", "Funcionário"] as const;
type Profile = (typeof profiles)[number];

const roleDestinations: Record<Profile, string> = {
  Administrador: "/dashboard",
  Professor: "/dashboard",
  Aluno: "/aluno",
  Funcionário: "/funcionario",
};

function normalizeProfile(value: string | undefined): Profile {
  switch (value?.toLocaleLowerCase("pt-PT")) {
    case "administrador":
    case "admin":
      return "Administrador";
    case "professor":
      return "Professor";
    case "aluno":
      return "Aluno";
    case "funcionário":
    case "funcionario":
      return "Funcionário";
    default:
      return "Administrador";
  }
}

function inferRoleFromEmail(email: string): Profile {
  const normalized = email.trim().toLocaleLowerCase("pt-PT");
  if (normalized.includes("admin")) return "Administrador";
  if (normalized.includes("professor")) return "Professor";
  if (normalized.includes("funcionario") || normalized.includes("funcionário")) return "Funcionário";
  return "Aluno";
}

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<Profile>("Administrador");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberSession, setRememberSession] = useState(false);
  const [error, setError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    const session = readDemoSession();
    if (!session) return;

    const destination = session.role === "Aluno" ? "/aluno" : session.role === "Funcionário" ? "/funcionario" : "/dashboard";
    router.replace(destination);
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Introduza o email e a palavra-passe.");
      return;
    }

    const demoNames: Record<Profile, string> = {
      Administrador: "Alexandra Costa",
      Professor: "Maria Santos",
      Aluno: "João Silva",
      Funcionário: "Carlos Almeida",
    };

    let resolvedRole: Profile = role;
    let resolvedName = demoNames[role];

    if (isSupabaseConfigured && supabase) {
      setIsAuthenticating(true);
      setError("");

      try {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (authError) {
          setError(getSupabaseErrorMessage(authError));
          return;
        }

        const normalizedEmail = email.trim().toLocaleLowerCase("pt-PT");
        const { data: userData } = await supabase.auth.getUser();
        const currentUser = userData?.user;

        let { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("full_name, role")
          .ilike("email", normalizedEmail)
          .maybeSingle();

        if (profileError) {
          console.error("Não foi possível carregar o perfil do utilizador.", profileError);
        }

        if (!profile?.role && currentUser?.id) {
          const fallbackRole = inferRoleFromEmail(normalizedEmail);
          const suggestedName = normalizedEmail.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (value) => value.toLocaleUpperCase("pt-PT"));
          const { data: createdProfile, error: insertError } = await supabase
            .from("profiles")
            .insert({
              id: currentUser.id,
              full_name: suggestedName,
              email: normalizedEmail,
              role: fallbackRole,
            })
            .select("full_name, role")
            .single();

          if (insertError) {
            console.error("Não foi possível criar o perfil do utilizador.", insertError);
            setError("A conta foi autenticada, mas não foi possível associar o perfil do utilizador.");
            return;
          }

          profile = createdProfile;
        }

        if (!profile?.role) {
          setError("Esta conta ainda não está associada a nenhum perfil de utilizador.");
          return;
        }

        resolvedRole = normalizeProfile(profile.role);
        resolvedName = typeof profile.full_name === "string" && profile.full_name.trim() ? profile.full_name : demoNames[resolvedRole];
      } catch (authFailure) {
        setError(getSupabaseErrorMessage(authFailure));
        return;
      } finally {
        setIsAuthenticating(false);
      }
    }

    writeDemoSession({ role: resolvedRole, name: resolvedName, email: email.trim(), remember: rememberSession });
    router.push(roleDestinations[resolvedRole] ?? "/dashboard");
  }

  return <main className="login-screen">
    <Link className="login-brand" href="/"><span className="brand-mark">S</span><span>smart<span className="brand-light">campus</span></span></Link>
    <section className="login-showcase">
      <div className="showcase-top"><div className="campus-card"><div className="campus-card-head"><strong>Visão geral do campus</strong><span>● Em direto</span></div><div className="campus-card-stats"><span><strong>352</strong><small>Alunos</small></span><span><strong>18</strong><small>Turmas ativas</small></span><span><strong>35</strong><small>PCs livres</small></span></div></div></div>
      <div className="showcase-copy"><div className="eyebrow">UM CAMPUS, LIGADO</div><h1>A escola mais organizada começa aqui.</h1><p>Presenças, salas, horários e computadores — tudo numa plataforma feita para a comunidade escolar.</p><div className="showcase-points"><span>Gestão simples</span><span>Informação em tempo real</span><span>Acesso por perfil</span></div></div>
    </section>
    <section className="login-panel"><form className="login-form" onSubmit={submit}>
      <div className="eyebrow">BEM-VINDO AO SMART CAMPUS</div><h2>Inicie sessão</h2><p>Introduza os seus dados para aceder à plataforma.</p>
      {error && <div className="login-error" role="alert">{error}</div>}
      <label>Email<input className="field-control" type="email" autoComplete="username" placeholder="nome@escola.pt" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>Palavra-passe<input className="field-control" type="password" autoComplete="current-password" placeholder="Introduza a sua palavra-passe" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <div className="login-meta"><label><input type="checkbox" checked={rememberSession} onChange={(event) => setRememberSession(event.target.checked)} /> Manter sessão iniciada</label><span>Precisa de ajuda?</span></div>
      <button className="button button-primary button-full" disabled={isAuthenticating}>
        {isAuthenticating ? "A autenticar..." : "Entrar na plataforma"} <span>→</span>
      </button>
      <div className="login-divider">ACESSO POR PERFIL</div><div className="demo-note">Cada conta entra no seu espaço: administrador, professor, aluno ou funcionário têm permissões e rotas diferentes.</div>
      <div className="login-footer">© 2026 Smart Campus · Escola Profissional do Infante</div>
    </form></section>
  </main>;
}
