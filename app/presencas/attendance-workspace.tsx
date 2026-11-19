"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Justification = {
  id: string; motivo: string; estado: "Pendente" | "Aceite" | "Rejeitada";
  decisao_motivo?: string | null; anexo_url?: string; anexo_path?: string;
  historico?: Array<{ estado_anterior: string | null; estado_novo: string; motivo_decisao?: string | null; created_at: string }>;
};
type Attendance = {
  id: string; aluno_id: string; aluno_nome: string; turma_nome: string; disciplina_nome: string;
  data: string; estado: string; hora_inicio: string; hora_fim: string; coordenador_id: string;
  justificacao: Justification | null;
};
type Role = "Aluno" | "Professor" | "Funcionário" | "Administrador Adjunto" | "Administrador";

const dateLabel = (value: string) => value ? new Date(value + "T12:00:00").toLocaleDateString("pt-PT") : "—";
const stateLabel = (value: string) => value === "Falta" ? "Falta" : value === "Falta justificada" ? "Falta justificada" : value === "Atraso" ? "Atraso" : value;

export default function AttendanceWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const [role, setRole] = useState<Role | "">("");
  const [userId, setUserId] = useState("");
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [month, setMonth] = useState("");
  const [studentFilter, setStudentFilter] = useState("Todos");
  const [subjectFilter, setSubjectFilter] = useState("Todas");
  const [selected, setSelected] = useState<Attendance | null>(null);
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Inicia sessão para consultar as presenças.");
      setUserId(user.id);
      const { data: profile, error: profileError } = await supabase.from("users").select("role,status").eq("id", user.id).maybeSingle();
      if (profileError || !profile || profile.status !== "Ativo") throw new Error("Não foi possível validar o teu perfil.");
      setRole(profile.role as Role);
      const response = await fetch("/api/attendance/justifications", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar os registos.");
      setRecords(Array.isArray(result.records) ? result.records as Attendance[] : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocorreu um erro ao carregar os dados.");
    } finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const students = useMemo(() => [...new Set(records.map(item => item.aluno_nome))].sort((a,b)=>a.localeCompare(b,"pt-PT")), [records]);
  const subjects = useMemo(() => [...new Set(records.map(item => item.disciplina_nome))].sort((a,b)=>a.localeCompare(b,"pt-PT")), [records]);
  const filtered = useMemo(() => records.filter(item =>
    (!month || item.data.startsWith(month)) &&
    (studentFilter === "Todos" || item.aluno_nome === studentFilter) &&
    (subjectFilter === "Todas" || item.disciplina_nome === subjectFilter)
  ), [records, month, studentFilter, subjectFilter]);

  const totals = useMemo(() => ({
    present: filtered.filter(item => item.estado === "Presente").length,
    absent: filtered.filter(item => item.estado === "Falta" || item.estado === "Falta justificada").length,
    late: filtered.filter(item => item.estado === "Atraso").length,
    justified: filtered.filter(item => item.estado === "Falta justificada").length,
    pending: filtered.filter(item => item.justificacao?.estado === "Pendente").length,
  }), [filtered]);

  const canDecide = role === "Administrador" || role === "Administrador Adjunto" ||
    (role === "Professor" && selected?.coordenador_id === userId);

  async function submitJustification(event: FormEvent) {
    event.preventDefault();
    if (!selected || reason.trim().length < 10) return;
    setBusy(true); setError(""); setNotice("");
    let uploadedPath = "";
    try {
      if (file) {
        const allowed = ["application/pdf", "image/jpeg", "image/png"];
        if (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("O anexo deve ser PDF, JPG ou PNG e não pode exceder 10 MB.");
        uploadedPath = selected.id + "/" + crypto.randomUUID() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const { error: uploadError } = await supabase.storage.from("justificacoes-faltas").upload(uploadedPath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw new Error("Não foi possível carregar o comprovativo: " + uploadError.message);
      }
      const response = await fetch("/api/attendance/justifications", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presenca_id: selected.id, motivo: reason.trim(), anexo_path: uploadedPath }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível submeter a justificação.");
      setNotice("Justificação submetida. Estado: Pendente.");
      setSelected(null); setReason(""); setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível submeter a justificação.");
      if (uploadedPath) await supabase.storage.from("justificacoes-faltas").remove([uploadedPath]);
    } finally { setBusy(false); }
  }

  async function decide(item: Attendance, state: "Aceite" | "Rejeitada") {
    if (!item.justificacao) return;
    if (state === "Rejeitada" && decisionReason.trim().length < 5) {
      setError("Indica o motivo da rejeição (mínimo 5 caracteres)."); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/attendance/justifications", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.justificacao.id, estado: state, decisao_motivo: decisionReason.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível registar a decisão.");
      setNotice(state === "Aceite" ? "Justificação aceite. A falta passou a Falta justificada." : "Justificação rejeitada. A falta original foi preservada.");
      setDecisionReason("");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao decidir."); }
    finally { setBusy(false); }
  }

  return <main className="page-content">
    <div className="page-heading">
      <div><div className="eyebrow">GESTÃO ESCOLAR</div><h1>Presenças e faltas</h1><p>Registos por aula, justificações e histórico de decisões.</p></div>
      <button className="button button-secondary" onClick={() => void load()} disabled={loading}>↻ Atualizar</button>
    </div>
    {notice && <div className="notice"><span>✓</span>{notice}<button onClick={()=>setNotice("")}>×</button></div>}
    {error && <div className="notice" style={{background:"#fff3f3",borderColor:"#f1caca",color:"#a53c45"}}>{error}<button onClick={()=>setError("")}>×</button></div>}
    <section className="stat-grid">
      <article className="stat-card"><div className="stat-icon green">✓</div><div className="stat-meta">Presenças</div><strong>{totals.present}</strong><small>Registos presentes</small></article>
      <article className="stat-card"><div className="stat-icon amber">!</div><div className="stat-meta">Faltas</div><strong>{totals.absent}</strong><small>Inclui faltas justificadas</small></article>
      <article className="stat-card"><div className="stat-icon blue">◷</div><div className="stat-meta">Atrasos</div><strong>{totals.late}</strong><small>Registos de atraso</small></article>
      <article className="stat-card"><div className="stat-icon violet">▤</div><div className="stat-meta">Justificações pendentes</div><strong>{totals.pending}</strong><small>{totals.justified} faltas justificadas</small></article>
    </section>
    <section className="surface" style={{marginBottom:16}}>
      <div className="surface-heading"><div><h2>Filtrar registos</h2><p>Filtra por mês, aluno e disciplina.</p></div></div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:14}}>
        <label className="attendance-filter">Mês <input type="month" value={month} onChange={e=>setMonth(e.target.value)} /></label>
        {role !== "Aluno" && <label className="attendance-filter">Aluno <select value={studentFilter} onChange={e=>setStudentFilter(e.target.value)}><option>Todos</option>{students.map(name=><option key={name}>{name}</option>)}</select></label>}
        <label className="attendance-filter">Disciplina <select value={subjectFilter} onChange={e=>setSubjectFilter(e.target.value)}><option>Todas</option>{subjects.map(name=><option key={name}>{name}</option>)}</select></label>
      </div>
    </section>
    <section className="surface table-surface">
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>Data</th>{role!=="Aluno"&&<th>Aluno</th>}<th>Turma</th><th>Disciplina</th><th>Aula</th><th>Estado</th><th>Justificação</th><th>Comprovativo</th><th>Ações</th></tr></thead>
        <tbody>{filtered.map(item=><tr key={item.id}>
          <td>{dateLabel(item.data)}</td>{role!=="Aluno"&&<td>{item.aluno_nome}</td>}<td>{item.turma_nome||"—"}</td><td>{item.disciplina_nome}</td>
          <td>{item.hora_inicio.slice(0,5)}–{item.hora_fim.slice(0,5)}</td>
          <td><span className={`pill ${item.estado==="Presente"?"pill-green":item.estado==="Atraso"?"pill-amber":item.estado==="Falta justificada"?"pill-blue":"pill-red"}`}>{stateLabel(item.estado)}</span></td>
          <td>{item.justificacao ? <span className={`pill ${item.justificacao.estado==="Pendente"?"pill-amber":item.justificacao.estado==="Aceite"?"pill-green":"pill-red"}`}>{item.justificacao.estado}</span> : "—"}</td>
          <td>{item.justificacao?.anexo_url ? <a className="text-link" href={item.justificacao.anexo_url} target="_blank" rel="noreferrer">Abrir ficheiro ↗</a> : "—"}</td>
          <td><div className="row-actions">
            {role==="Aluno" && item.estado==="Falta" && !item.justificacao && <button className="button button-secondary" onClick={()=>{setSelected(item);setReason("");setFile(null);}}>Justificar</button>}
            {(role==="Administrador" || role==="Administrador Adjunto" || (role==="Professor" && item.coordenador_id===userId)) && item.justificacao?.estado==="Pendente" && <button className="button button-secondary" onClick={()=>{setSelected(item);setDecisionReason("");}}>Analisar</button>}
          </div></td>
        </tr>)}</tbody>
      </table>
      {!loading && filtered.length===0 && <div className="empty-state"><span>⌕</span><strong>Sem registos para apresentar</strong><p>Não existem presenças que correspondam aos filtros selecionados.</p></div>}
      {loading && <div className="empty-state">A carregar presenças e faltas…</div>}
      </div>
    </section>

    {selected && role==="Aluno" && <div className="attendance-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}>
      <section className="attendance-modal" role="dialog" aria-modal="true" aria-labelledby="attendance-dialog-title">
        <div className="surface-heading"><div><h2 id="attendance-dialog-title">Justificar falta</h2><p>{selected.disciplina_nome} · {dateLabel(selected.data)} · {selected.turma_nome}</p></div><button className="icon-button" onClick={()=>setSelected(null)}>×</button></div>
        <form onSubmit={submitJustification}>
          <label className="attendance-field">Motivo da falta<textarea required minLength={10} maxLength={3000} rows={5} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explica o motivo da ausência…"/></label>
          <label className="attendance-field">Comprovativo (opcional)<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e:ChangeEvent<HTMLInputElement>)=>setFile(e.target.files?.[0]??null)}/><small>PDF, JPG ou PNG · máximo 10 MB</small></label>
          <div className="attendance-modal-actions"><button type="button" className="button button-secondary" onClick={()=>setSelected(null)}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}>{busy?"A submeter…":"Submeter justificação"}</button></div>
        </form>
      </section>
    </div>}

    {selected && role!=="Aluno" && <div className="attendance-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}>
      <section className="attendance-modal" role="dialog" aria-modal="true" aria-labelledby="attendance-review-title">
        <div className="surface-heading"><div><h2 id="attendance-review-title">Analisar justificação</h2><p>{selected.aluno_nome} · {selected.disciplina_nome} · {dateLabel(selected.data)}</p></div><button className="icon-button" onClick={()=>setSelected(null)}>×</button></div>
        <div className="attendance-reason"><strong>Motivo apresentado</strong><p>{selected.justificacao?.motivo}</p></div>
        {selected.justificacao?.historico?.length ? <div className="attendance-history"><strong>Histórico</strong>{selected.justificacao.historico.map((entry,i)=><p key={i}>{entry.estado_novo} · {new Date(entry.created_at).toLocaleString("pt-PT")}</p>)}</div>:null}
        <label className="attendance-field">Motivo da rejeição (obrigatório se rejeitar)<textarea rows={3} value={decisionReason} onChange={e=>setDecisionReason(e.target.value)} placeholder="Indica o motivo da decisão…"/></label>
        <div className="attendance-modal-actions"><button className="button button-secondary" onClick={()=>setSelected(null)}>Fechar</button><button className="button button-secondary" disabled={busy||!canDecide} onClick={()=>void decide(selected,"Rejeitada")}>Rejeitar</button><button className="button button-primary" disabled={busy||!canDecide} onClick={()=>void decide(selected,"Aceite")}>Aceitar justificação</button></div>
      </section>
    </div>}
  </main>;
}
