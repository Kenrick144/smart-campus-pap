"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AtualizarPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function prepareRecovery() {
      const code = searchParams.get("code");
      if (!code) {
        if (active) setError("O link de recuperação é inválido ou já foi utilizado. Peça um novo link.");
        return;
      }
      const supabase = createClient();
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (!active) return;
      if (exchangeError) setError("O link de recuperação expirou ou já foi utilizado. Peça um novo link.");
      else setReady(true);
    }
    void prepareRecovery();
    return () => { active = false; };
  }, [searchParams]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("A palavra-passe deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("As palavras-passe não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      router.replace("/login?password=updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar a palavra-passe.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <Link className="login-brand" href="/"><span className="brand-mark">S</span><span>smart<span className="brand-light">campus</span></span></Link>
      <section className="login-showcase"><div className="showcase-copy"><div className="eyebrow">SEGURANÇA DA CONTA</div><h1>Defina uma nova palavra-passe.</h1><p>Escolha uma palavra-passe nova e volte a utilizar a plataforma.</p></div></section>
      <section className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <div className="eyebrow">SMART CAMPUS</div>
          <h2>Nova palavra-passe</h2>
          <p>Utilize pelo menos 8 caracteres.</p>
          {error && <div className="login-error" role="alert">{error}</div>}
          {!ready ? <p>A validar o link de recuperação...</p> : <>
            <label>Nova palavra-passe<input className="field-control" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} /></label>
            <label>Confirmar palavra-passe<input className="field-control" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required minLength={8} /></label>
            <button className="button button-primary button-full" disabled={loading}>{loading ? "A guardar..." : "Guardar nova palavra-passe"}</button>
          </>}
          <p><Link href="/login">Voltar ao início de sessão</Link></p>
        </form>
      </section>
    </main>
  );
}
