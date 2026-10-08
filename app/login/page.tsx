"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const profiles = ["Administrador", "Professor", "Aluno", "Funcionário"] as const;
type Profile = (typeof profiles)[number];

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<Profile>("Administrador");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
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
    window.localStorage.setItem("smartcampus_session", JSON.stringify({ role, name: demoNames[role], email }));
    router.push(role === "Aluno" ? "/aluno" : role === "Funcionário" ? "/funcionario" : "/dashboard");
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
      <label>Entrar como<select className="field-control" value={role} onChange={(event) => setRole(event.target.value as Profile)}>{profiles.map((profile) => <option key={profile}>{profile}</option>)}</select></label>
      <div className="login-meta"><label><input type="checkbox" /> Manter sessão iniciada</label><span>Precisa de ajuda?</span></div>
      <button className="button button-primary button-full">Entrar na plataforma <span>→</span></button>
      <div className="login-divider">ACESSO DE DEMONSTRAÇÃO</div><div className="demo-note">Pode usar qualquer email e palavra-passe. Escolha um perfil para explorar as interfaces. Os dados ficam guardados apenas neste navegador. Não introduza credenciais reais nem dados pessoais de alunos: esta demonstração ainda não autentica com o Supabase.</div>
      <div className="login-footer">© 2026 Smart Campus · Escola Profissional do Infante</div>
    </form></section>
  </main>;
}
