"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";

type ComputerInfo = {
  name: string;
  room: { nome?: string } | { nome?: string }[] | null;
  inventory_state: string;
  available_for_use: boolean;
};

type IssuedCode = {
  code: string;
  expires_at: string;
  expires_in_seconds: number;
  computer: { name: string; room: { nome?: string } | { nome?: string }[] | null };
};

function roomName(room: ComputerInfo["room"] | IssuedCode["computer"]["room"]) {
  if (Array.isArray(room)) return room[0]?.nome ?? "Sala não indicada";
  return room?.nome ?? "Sala não indicada";
}

export default function PcQrAuthorization({ qrPublicId }: { qrPublicId: string }) {
  const [computer, setComputer] = useState<ComputerInfo | null>(null);
  const [code, setCode] = useState<IssuedCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/pc/lookup/${encodeURIComponent(qrPublicId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível localizar o computador.");
        if (active) setComputer(payload.computer as ComputerInfo);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Erro ao consultar o computador.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [qrPublicId]);

  async function requestCode() {
    setError("");
    setCode(null);
    setCopied(false);
    setIssuing(true);
    try {
      if (!supabase) throw new Error("A autenticação Smart Campus não está configurada.");
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) {
        window.location.assign(`/login?next=${encodeURIComponent(`/pc/${qrPublicId}`)}`);
        return;
      }

      const response = await fetch("/api/pc/codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({ qr_public_id: qrPublicId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível gerar o código.");
      setCode(payload as IssuedCode);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível gerar o código.");
    } finally {
      setIssuing(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
    } catch {
      setError("Não foi possível copiar automaticamente. Podes selecionar o código.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-950 text-2xl text-white">SC</div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">Smart Campus</p>
          <h1 className="mt-2 text-3xl font-bold">Acesso ao computador</h1>
          <p className="mt-2 text-sm text-slate-600">Confirma o posto e gera um código de utilização.</p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {loading ? (
            <p className="py-8 text-center text-slate-600">A consultar computador…</p>
          ) : computer ? (
            <>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Computador</p>
                <h2 className="mt-1 text-2xl font-bold">{computer.name}</h2>
                <p className="mt-1 text-sm text-slate-600">{roomName(computer.room)}</p>
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <span className={computer.available_for_use ? "h-2.5 w-2.5 rounded-full bg-emerald-500" : "h-2.5 w-2.5 rounded-full bg-amber-500"} />
                  <span>{computer.available_for_use ? "Operacional" : computer.inventory_state}</span>
                </div>
              </div>

              {computer.available_for_use ? (
                <div className="mt-6">
                  <p className="text-sm leading-6 text-slate-600">
                    Inicia sessão com a tua conta institucional do Smart Campus. O código será válido apenas para este computador, durante 10 minutos e uma única utilização.
                  </p>
                  <button
                    type="button"
                    onClick={requestCode}
                    disabled={issuing}
                    className="mt-5 w-full rounded-xl bg-blue-950 px-5 py-3.5 font-semibold text-white transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {issuing ? "A gerar código…" : "Gerar código de acesso"}
                  </button>
                </div>
              ) : (
                <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
                  Este computador não pode receber novas sessões neste momento. Escolhe outro posto ou contacta um funcionário.
                </p>
              )}

              {code && (
                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                  <p className="text-sm font-semibold text-emerald-900">O teu código temporário</p>
                  <p className="my-3 font-mono text-4xl font-bold tracking-[0.25em] text-slate-950">{code.code}</p>
                  <p className="text-xs text-emerald-900">Válido durante 10 minutos · uma utilização · apenas neste computador</p>
                  <button type="button" onClick={copyCode} className="mt-4 rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100">
                    {copied ? "Código copiado" : "Copiar código"}
                  </button>
                  <p className="mt-3 text-xs text-emerald-900">Introduz este código no launcher do computador. Não o partilhes.</p>
                </div>
              )}
            </>
          ) : null}

          {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        </section>

        <footer className="mt-6 text-center text-xs text-slate-500">
          O QR identifica o computador, mas não concede acesso por si só.
          <div className="mt-2"><Link href="/login" className="font-medium text-blue-800 underline">Entrar no Smart Campus</Link></div>
        </footer>
      </div>
    </main>
  );
}
