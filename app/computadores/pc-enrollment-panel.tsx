"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { QrImage } from "@/app/qr-tools";
import QRCode from "qrcode";
import { supabase, isSupabaseConfigured } from "@/app/lib/supabase";

type Room = { id: string; nome: string };
type Computer = {
  id: string;
  nome: string;
  numero_inventario: string | null;
  estado: string;
  sala_id: string;
  qr_public_id: string;
  agent_enrolled: boolean;
};
type Enrollment = { computer: Computer; qr_url: string; device_secret: string; secret_notice: string };

export default function PcEnrollmentPanel() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [computers, setComputers] = useState<Computer[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [inventory, setInventory] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const request = useCallback(async (method: "GET" | "POST", body?: object) => {
    if (!isSupabaseConfigured || !supabase) throw new Error("A autenticação Supabase não está configurada.");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Inicia sessão com a tua conta institucional para gerir os PCs.");
    const response = await fetch("/api/pc/enrollment", {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
    return result;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await request("GET");
      setRooms(result.rooms);
      setComputers(result.computers);
      if (!roomId && result.rooms.length) setRoomId(result.rooms[0].id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao carregar os computadores.");
    } finally {
      setLoading(false);
    }
  }, [request, roomId]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    setEnrollment(null);
    try {
      const result = await request("POST", {
        nome: name,
        sala_id: roomId,
        numero_inventario: inventory,
        marca: brand,
        modelo: model,
      });
      setEnrollment(result);
      setName("");
      setInventory("");
      setBrand("");
      setModel("");
      setNotice("Computador registado e credencial criada.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registar o computador.");
    } finally {
      setSaving(false);
    }
  }

  async function printQr(qrUrl: string, label: string) {\n    const printWindow = window.open("", "_blank");\n    if (!printWindow) { setError("Permite janelas de pop-up para imprimir o QR."); return; }\n    try {\n      const image = await QRCode.toDataURL(qrUrl, { width: 480, margin: 2, errorCorrectionLevel: "H" });\n      printWindow.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>QR - ${label}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:32px}img{width:320px;height:320px}h1{font-size:22px}p{font-size:13px;color:#555}</style></head><body><h1>${label}</h1><img src="${image}" alt="Código QR permanente"><p>Smart Campus · Identificação do computador</p><script>window.onload=()=>window.print()<\\/script></body></html>`);\n      printWindow.document.close();\n    } catch { printWindow.close(); setError("Não foi possível gerar a versão para impressão."); }\n  }\n\n  async function copySecret() {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.device_secret);
      setNotice("Credencial copiada. Guarda-a no agente deste computador; não a partilhes.");
    } catch {
      setError("Não foi possível copiar automaticamente. Seleciona e copia a credencial manualmente.");
    }
  }

  return (
    <section className="pc-enrollment">
      <div className="pc-enrollment-heading">
        <div><span className="pc-eyebrow">GESTÃO DE ESTAÇÕES</span><h2>Registar computador</h2><p>Cria a identidade permanente do PC, o QR físico e a credencial exclusiva do agente.</p></div>
        <button type="button" className="pc-refresh" onClick={() => void load()} disabled={loading}>Atualizar lista</button>
      </div>

      {error && <p className="pc-alert pc-error" role="alert">{error}</p>}
      {notice && <p className="pc-alert pc-success" role="status">{notice}</p>}

      <form className="pc-enrollment-form" onSubmit={submit}>
        <label>Nome do computador<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: PC-SALA-101-01" /></label>
        <label>Sala<select required value={roomId} onChange={(event) => setRoomId(event.target.value)}><option value="">Selecionar sala</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.nome}</option>)}</select></label>
        <label>Número de inventário<input maxLength={100} value={inventory} onChange={(event) => setInventory(event.target.value)} placeholder="Opcional" /></label>
        <label>Marca<input maxLength={100} value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Opcional" /></label>
        <label>Modelo<input maxLength={100} value={model} onChange={(event) => setModel(event.target.value)} placeholder="Opcional" /></label>
        <button type="submit" disabled={saving || loading || !rooms.length}>{saving ? "A registar…" : "Registar PC e gerar QR"}</button>
      </form>
      {!loading && rooms.length === 0 && <p className="pc-muted">Não existem salas registadas. Cria primeiro uma sala.</p>}

      {enrollment && <div className="pc-enrollment-result">
        <div><h3>{enrollment.computer.nome}</h3><p>QR permanente — imprime e cola no computador.</p><QrImage value={enrollment.qr_url} /><a href={enrollment.qr_url} target="_blank" rel="noreferrer">{enrollment.qr_url}</a><button type="button" className="pc-print" onClick={() => void printQr(enrollment.qr_url, enrollment.computer.nome)}>Imprimir QR</button></div>
        <div className="pc-secret"><strong>Credencial do agente — mostrar apenas agora</strong><code>{enrollment.device_secret}</code><button type="button" onClick={() => void copySecret()}>Copiar credencial</button><small>{enrollment.secret_notice} Guarda-a no PC através do instalador do agente, protegido por DPAPI. Não a coloques no QR.</small></div>
      </div>}

      <div className="pc-list-heading"><h3>Computadores registados</h3><span>{computers.length} no total</span></div>
      {loading ? <p className="pc-muted">A carregar…</p> : <div className="pc-computer-list">{computers.map((computer) => {
        const url = typeof window !== "undefined" ? `${window.location.origin}/pc/${computer.qr_public_id}` : "";
        return <article key={computer.id} className="pc-computer-row"><div><strong>{computer.nome}</strong><span>{computer.numero_inventario || "Sem número de inventário"} · {computer.estado}</span></div><span className={computer.agent_enrolled ? "pc-tag pc-tag-ok" : "pc-tag"}>{computer.agent_enrolled ? "Agente registado" : "Sem agente"}</span>{url && <div className="pc-mini-qr"><QrImage value={url} /><button type="button" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>Abrir QR</button></div>}</article>;
      })}</div>}

      <style jsx>{`
        .pc-enrollment{margin:24px 0;padding:24px;border:1px solid var(--border,#e5e7eb);border-radius:18px;background:var(--surface,#fff);color:var(--foreground,#172033)}
        .pc-enrollment-heading,.pc-list-heading,.pc-computer-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
        .pc-enrollment-heading h2{margin:5px 0;font-size:22px}.pc-enrollment-heading p,.pc-muted{margin:0;color:#667085;font-size:13px}
        .pc-eyebrow{font-size:10px;font-weight:700;letter-spacing:.12em;color:#64748b}
        .pc-refresh,.pc-mini-qr button{border:1px solid #d7dce5;background:#fff;border-radius:9px;padding:9px 12px;cursor:pointer}
        .pc-enrollment-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:20px}
        .pc-enrollment-form label{display:grid;gap:6px;font-size:12px;font-weight:600}
        .pc-enrollment-form input,.pc-enrollment-form select{width:100%;padding:11px;border:1px solid #d7dce5;border-radius:9px;background:transparent;color:inherit}
        .pc-enrollment-form button,.pc-secret button{align-self:end;border:0;border-radius:9px;background:#283b72;color:white;padding:12px 16px;font-weight:600;cursor:pointer}
        .pc-enrollment-form button:disabled,.pc-refresh:disabled{opacity:.55;cursor:not-allowed}
        .pc-alert{padding:10px 12px;border-radius:9px;font-size:13px}.pc-error{background:#fff1f0;color:#a12622}.pc-success{background:#ecfdf3;color:#176b3a}
        .pc-enrollment-result{display:grid;grid-template-columns:1fr 1.5fr;gap:18px;margin-top:20px;padding:18px;border:1px solid #cbd5e1;border-radius:12px}
        .pc-enrollment-result h3{margin:0 0 5px}.pc-enrollment-result p,.pc-secret small{font-size:12px;color:#667085}.pc-enrollment-result a{display:block;overflow-wrap:anywhere;font-size:12px}
        .pc-secret{display:grid;gap:10px;align-content:start}.pc-secret code{padding:12px;background:#f1f5f9;border-radius:8px;overflow-wrap:anywhere;color:#111827}
        .pc-secret button{justify-self:start}.pc-print{margin-top:10px;border:1px solid #d7dce5;background:#fff;border-radius:9px;padding:8px 12px;cursor:pointer}.pc-list-heading{margin-top:24px}.pc-list-heading h3{font-size:16px}.pc-list-heading span,.pc-computer-row span{font-size:12px;color:#667085}
        .pc-computer-list{display:grid;gap:10px}.pc-computer-row{padding:12px 0;border-top:1px solid #edf0f4}.pc-computer-row>div:first-child{display:grid;gap:4px}
        .pc-tag{padding:5px 8px;border-radius:999px;background:#fff7ed;color:#9a3412!important}.pc-tag-ok{background:#ecfdf3;color:#176b3a!important}
        .pc-mini-qr{display:flex;align-items:center;gap:8px}.pc-mini-qr :global(.qr-preview){width:48px;height:48px}
        @media(max-width:700px){.pc-enrollment{padding:16px}.pc-enrollment-form,.pc-enrollment-result{grid-template-columns:1fr}.pc-enrollment-heading{align-items:flex-start;flex-direction:column}.pc-computer-row{align-items:flex-start;flex-wrap:wrap}}
      `}</style>
    </section>
  );
}
