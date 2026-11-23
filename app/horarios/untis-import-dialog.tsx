"use client";

import { useState } from "react";

const REQUIRED_FILES = [
  "Turmas.xlsx", "Professores.xlsx", "Disciplinas.xlsx",
  "Salas.xlsx", "Horarios.xlsx", "Aulas.TXT",
] as const;

type PreviewResult = {
  ok: boolean;
  error?: string;
  message?: string;
  counts?: Record<string, number>;
  unresolvedGroups?: string[];
  conflicts?: Array<{ recurso: string; dia: number; periodo: number; aulas: string[] }>;
  issues?: Array<{ sourceId: string; message: string }>;
  preview?: Array<{
    sourceId: string; turmaCodigo: string; turmaNome: string;
    professorNome: string; disciplinaNome: string; salaNome: string;
    diaSemana: number; periodo: number; horaInicio: string; horaFim: string;
    warnings: string[];
  }>;
};

export default function UntisImportDialog({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<Partial<Record<(typeof REQUIRED_FILES)[number], File>>>({});
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function previewImport() {
    setError("");
    setResult(null);
    const missing = REQUIRED_FILES.filter(name => !files[name]);
    if (missing.length) {
      setError("Seleciona todos os ficheiros: " + missing.join(", ") + ".");
      return;
    }
    const form = new FormData();
    for (const name of REQUIRED_FILES) form.append(name, files[name] as File);
    setBusy(true);
    try {
      const response = await fetch("/api/horarios/untis/preview", { method: "POST", body: form });
      const payload = await response.json() as PreviewResult;
      if (!response.ok) throw new Error(payload.error || "Não foi possível analisar os ficheiros.");
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao analisar os ficheiros.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="attendance-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="attendance-modal" role="dialog" aria-modal="true" aria-labelledby="untis-import-title" style={{ width: "min(1100px, 96vw)", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="surface-heading">
          <div><h2 id="untis-import-title">Importar horário do Untis 2026/2027</h2><p>Pré-visualização e validação antes de qualquer gravação.</p></div>
          <button type="button" className="icon-button" onClick={onClose} disabled={busy}>×</button>
        </div>
        <div className="attendance-reason">
          <strong>Seleciona os seis ficheiros exportados</strong>
          <p>Os ficheiros são analisados em conjunto. Nenhum dado do Smart Campus será alterado nesta etapa.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 12, margin: "18px 0" }}>
          {REQUIRED_FILES.map(name => (
            <label key={name} className="attendance-field">
              {name}
              <input type="file" accept={name.endsWith(".xlsx") ? ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : ".txt,text/plain"} onChange={event => {
                const file = event.target.files?.[0];
                if (file) setFiles(current => ({ ...current, [name]: file }));
              }} />
              <small>{files[name]?.name || "Nenhum ficheiro selecionado"}</small>
            </label>
          ))}
        </div>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        {result?.counts && (
          <div className="attendance-reason">
            <strong>Resultado da análise</strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 10, marginTop: 12 }}>
              {Object.entries(result.counts).map(([label, count]) => (
                <div key={label} style={{ padding: 10, border: "1px solid var(--border, #ddd)", borderRadius: 10 }}>
                  <strong style={{ display: "block", fontSize: 22 }}>{count}</strong>
                  <small>{label}</small>
                </div>
              ))}
            </div>
            {!!result.unresolvedGroups?.length && <p><strong>Grupos por identificar:</strong> {result.unresolvedGroups.join(", ")}</p>}
            {!!result.conflicts?.length && <p><strong>Conflitos encontrados:</strong> {result.conflicts.length}. Estes conflitos precisam de revisão antes da importação.</p>}
            {!!result.issues?.length && <p><strong>Ocorrências a rever:</strong> {result.issues.length}. A lista completa está disponível na resposta da pré-visualização.</p>}
            <p>{result.message}</p>
            {!!result.preview?.length && (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table className="data-table">
                  <thead><tr><th>Turma</th><th>Disciplina</th><th>Professor</th><th>Sala</th><th>Dia</th><th>Período</th><th>Hora</th></tr></thead>
                  <tbody>{result.preview.slice(0, 20).map((row, index) => (
                    <tr key={row.sourceId + "-" + row.turmaCodigo + "-" + index}>
                      <td>{row.turmaCodigo}</td><td>{row.disciplinaNome}</td><td>{row.professorNome}</td><td>{row.salaNome || "—"}</td>
                      <td>{["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta"][row.diaSemana]}</td>
                      <td>{row.periodo}</td><td>{row.horaInicio}–{row.horaFim}</td>
                    </tr>
                  ))}</tbody>
                </table>
                <small>A mostrar as primeiras 20 linhas. A pré-visualização não grava nem substitui horários.</small>
              </div>
            )}
          </div>
        )}
        <div className="attendance-modal-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Fechar</button>
          <button type="button" className="button button-primary" onClick={() => void previewImport()} disabled={busy}>{busy ? "A analisar ficheiros…" : "Analisar exportação"}</button>
        </div>
      </section>
    </div>
  );
}
