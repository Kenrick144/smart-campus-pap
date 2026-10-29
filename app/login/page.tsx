"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type UserRole =
  | "Aluno"
  | "Professor"
  | "Funcionário"
  | "Administrador Adjunto"
  | "Administrador";

const validRoles: UserRole[] = [
  "Aluno",
  "Professor",
  "Funcionário",
  "Administrador Adjunto",
  "Administrador",
];

function destinationFor(role: UserRole) {
  if (role === "Aluno") return "/aluno";
  if (role === "Funcionário") return "/funcionario";
  return "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError("Introduza o email e a palavra-passe.");
      return;
    }

    setIsAuthenticating(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (authError) {
        setError("Email ou palavra-passe incorretos.");
        return;
      }

      const { data: authData, error: userError } = await supabase.auth.getUser();
      if (userError || !authData.user) {
        await supabase.auth.signOut();
        setError("Não foi possível confirmar a sessão. Tente novamente.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id, name, email, role, status")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        setError("A conta não tem um perfil válido associado no Smart Campus.");
        return;
      }

      if (profile.status !== "Ativo") {
        await supabase.auth.signOut();
        setError("Esta conta está inativa. Contacte a administração da escola.");
        return;
      }

      if (!validRoles.includes(profile.role as UserRole)) {
        await supabase.auth.signOut();
        setError("O cargo desta conta não está configurado corretamente.");
        return;
      }

      router.replace(destinationFor(profile.role as UserRole));
      router.refresh();
    } catch (authError) {
      console.error("Erro ao iniciar sessão:", authError);
      setError(
        authError instanceof Error
          ? authError.message
          : "Não foi possível ligar ao sistema. Verifique a configuração do Supabase."
      );
    } finally {
      setIsAuthenticating(false);
    }
  }

  return (
    <main className="login-screen">
      <Link className="login-brand" href="/">
        <span className="brand-mark">S</span>
        <span>smart<span className="brand-light">campus</span></span>
      </Link>

      <section className="login-showcase">
        <div className="showcase-top">
          <div className="campus-card">
            <div className="campus-card-head">
              <strong>Plataforma escolar</strong>
              <span>● Acesso seguro</span>
            </div>
            <div className="campus-card-stats">
              <span><strong>Gestão</strong><small>Utilizadores</small></span>
              <span><strong>Campus</strong><small>Salas e horários</small></span>
              <span><strong>Assiduidade</strong><small>Presenças</small></span>
            </div>
          </div>
        </div>

        <div className="showcase-copy">
          <div className="eyebrow">UM CAMPUS, LIGADO</div>
          <h1>A escola mais organizada começa aqui.</h1>
          <p>
            Presenças, salas, horários e computadores — tudo numa plataforma
            feita para a comunidade escolar.
          </p>
          <div className="showcase-points">
            <span>Gestão simples</span>
            <span>Dados do sistema</span>
            <span>Acesso por perfil</span>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <div className="eyebrow">BEM-VINDO AO SMART CAMPUS</div>
          <h2>Inicie sessão</h2>
          <p>Introduza os seus dados para aceder à plataforma.</p>

          {error && <div className="login-error" role="alert">{error}</div>}

          <label>
            Email
            <input
              className="field-control"
              type="email"
              autoComplete="username"
              placeholder="nome@escola.pt"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            Palavra-passe
            <input
              className="field-control"
              type="password"
              autoComplete="current-password"
              placeholder="Introduza a sua palavra-passe"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <button className="button button-primary button-full" disabled={isAuthenticating}>
            {isAuthenticating ? "A autenticar..." : "Entrar na plataforma"}
            <span>→</span>
          </button>

          <div className="login-divider">ACESSO POR PERFIL</div>
          <div className="demo-note">
            O sistema identifica o seu cargo a partir da conta autenticada.
            Alunos, professores, funcionários e administradores têm acessos diferentes.
          </div>
          <div className="login-footer">© 2026 Smart Campus · Escola Profissional do Infante</div>
        </form>
      </section>
    </main>
  );
}
