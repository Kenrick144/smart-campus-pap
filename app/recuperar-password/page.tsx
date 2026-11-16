"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RecuperarPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Introduza o email associado à sua conta.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: window.location.origin + "/atualizar-password",
      });
      if (resetError) throw resetError;
      setMessage("Se existir uma conta associada a este email, receberá uma mensagem com um link para criar uma nova palavra-passe. Verifique também o spam.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o email. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <Link className="login-brand" href="/"><span className="brand-mark">S</span><span>smart<span className="brand-light">campus</span></span></Link>
      <section className="login-showcase">
        <div className="showcase-copy">
          <div className="eyebrow">RECUPERAÇÃO DE ACESSO</div>
          <h1>Volte a entrar no Smart Campus.</h1>
          <p>Indique o email da sua conta. Enviaremos um link seguro para definir uma nova palavra-passe.</p>
        </div>
      </section>
      <section className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <div className="eyebrow">SMART CAMPUS</div>
          <h2>Esqueceu-se da palavra-passe?</h2>
          <p>Vamos enviar-lhe um link de recuperação por email.</p>
          {error && <div className="login-error" role="alert">{error}</div>}
          {message && <div className="login-success" role="status">{message}</div>}
          <label>Email
            <input className="field-control" type="email" autoComplete="email" placeholder="nome@escola.pt" value={email} onChange={event => setEmail(event.target.value)} required />
          </label>
          <button className="button button-primary button-full" disabled={loading}>{loading ? "A enviar..." : "Enviar link de recuperação"}</button>
          <p><Link href="/login">Voltar ao início de sessão</Link></p>
        </form>
      </section>
    </main>
  );
}
