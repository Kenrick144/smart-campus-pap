"use client";

import { useMemo, useState } from "react";

type Room = Record<string, string>;

function statusClass(status: string) {
  if (status === "Em manutenção") return "is-maintenance";
  if (status === "Inativa") return "is-inactive";
  return "is-active";
}

export default function RoomsFloorPlan({
  rooms,
  canManage,
  onAdd,
  onEdit,
}: {
  rooms: Room[];
  canManage: boolean;
  onAdd: () => void;
  onEdit: (roomId: string) => void;
}) {
  const buildings = useMemo(
    () => [...new Set(rooms.map((room) => room.edifício?.trim() || "Edifício por definir"))]
      .sort((a, b) => a.localeCompare(b, "pt-PT", { numeric: true, sensitivity: "base" })),
    [rooms],
  );
  const [buildingFilter, setBuildingFilter] = useState("");
  const building = buildings.includes(buildingFilter) ? buildingFilter : buildings[0] ?? "";
  const buildingRooms = rooms.filter((room) => (room.edifício?.trim() || "Edifício por definir") === building);
  const floors = useMemo(
    () => [...new Set(buildingRooms.map((room) => room.piso?.trim() || "Piso por definir"))]
      .sort((a, b) => a.localeCompare(b, "pt-PT", { numeric: true, sensitivity: "base" })),
    [buildingRooms],
  );
  const [floorFilter, setFloorFilter] = useState("");
  const floor = floors.includes(floorFilter) ? floorFilter : floors[0] ?? "";
  const visibleRooms = buildingRooms
    .filter((room) => (room.piso?.trim() || "Piso por definir") === floor)
    .sort((a, b) => (a.sala || "").localeCompare(b.sala || "", "pt-PT", { numeric: true, sensitivity: "base" }));
  const [selectedId, setSelectedId] = useState("");
  const selected = visibleRooms.find((room) => room.id === selectedId) ?? visibleRooms[0] ?? null;

  const activeCount = rooms.filter((room) => room.estado === "Ativa").length;
  const inactiveCount = rooms.filter((room) => room.estado === "Inativa").length;
  const maintenanceCount = rooms.filter((room) => room.estado === "Em manutenção").length;
  const totalCapacity = rooms.reduce((sum, room) => sum + (Number(room.capacidade) || 0), 0);
  const computerCount = selected ? Number(selected["N.º de computadores"] || 0) : 0;

  return (
    <section className="surface rooms-plan rooms-plan-v1">
      <div className="rooms-v1-heading">
        <div>
          <span className="eyebrow">SMART CAMPUS · GESTÃO DE ESPAÇOS</span>
          <h2>Planta das salas</h2>
          <p>Explora os espaços por edifício e piso. Seleciona uma sala para consultar a sua ficha.</p>
        </div>
        {canManage && <button type="button" className="button button-primary" onClick={onAdd}>＋ Nova sala</button>}
      </div>

      <div className="rooms-v1-metrics">
        <article><span className="rooms-v1-metric-icon">⌂</span><div><strong>{buildings.length}</strong><small>Edifícios</small></div></article>
        <article><span className="rooms-v1-metric-icon">▣</span><div><strong>{rooms.length}</strong><small>Salas registadas</small></div></article>
        <article><span className="rooms-v1-metric-icon is-green">✓</span><div><strong>{activeCount}</strong><small>Salas ativas</small></div></article>
        <article><span className="rooms-v1-metric-icon is-violet">♙</span><div><strong>{totalCapacity}</strong><small>Lugares de capacidade</small></div></article>
      </div>

      <div className="rooms-v1-toolbar">
        <div className="rooms-v1-toolbar-title"><span>▦</span><div><strong>Planta esquemática</strong><small>Representação visual — não é uma planta arquitetónica</small></div></div>
        <div className="rooms-v1-legend">
          <span><i className="legend-active" />Ativa</span>
          <span><i className="legend-inactive" />Inativa</span>
          <span><i className="legend-maintenance" />Manutenção</span>
        </div>
      </div>

      {rooms.length ? (
        <div className="rooms-v1-layout">
          <aside className="rooms-v1-location">
            <div className="rooms-v1-location-heading"><span>⌖</span><strong>Localização</strong></div>
            <label>Edifício
              <select value={building} onChange={(event) => { setBuildingFilter(event.target.value); setFloorFilter(""); }}>
                {buildings.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>Piso
              <select value={floor} onChange={(event) => setFloorFilter(event.target.value)}>
                {floors.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <div className="rooms-v1-floor-list">
              <strong>Pisos deste edifício</strong>
              {floors.map((item) => (
                <button type="button" key={item} className={item === floor ? "is-current" : ""} onClick={() => setFloorFilter(item)}>
                  <span>▤</span>{item}<small>{buildingRooms.filter((room) => (room.piso?.trim() || "Piso por definir") === item).length} salas</small>
                </button>
              ))}
            </div>
            <div className="rooms-v1-state-summary">
              <span><i className="legend-active" />Ativas <b>{activeCount}</b></span>
              <span><i className="legend-inactive" />Inativas <b>{inactiveCount}</b></span>
              <span><i className="legend-maintenance" />Em manutenção <b>{maintenanceCount}</b></span>
            </div>
          </aside>

          <div className="rooms-v1-map-panel">
            <div className="rooms-v1-map-title"><div><span>⌂</span><strong>{building} — {floor}</strong></div><small>{visibleRooms.length} {visibleRooms.length === 1 ? "sala" : "salas"}</small></div>
            <div className="rooms-v1-map-note">Organização ilustrativa das salas deste piso</div>
            <div className="rooms-v1-room-grid">
              {visibleRooms.map((room) => (
                <button
                  type="button"
                  key={room.id}
                  className={"rooms-v1-room " + statusClass(room.estado || "Ativa") + (selected?.id === room.id ? " is-selected" : "")}
                  onClick={() => setSelectedId(room.id)}
                  aria-pressed={selected?.id === room.id}
                >
                  <span className="rooms-v1-room-icon">{room.tipo?.toLowerCase().includes("informática") || room.tipo?.toLowerCase().includes("laboratório") ? "▣" : "▤"}</span>
                  <strong>{room.sala || "Sala sem nome"}</strong>
                  <small>{room.tipo || "Tipo não definido"}</small>
                  <span className="rooms-v1-room-capacity">{room.capacidade ? room.capacidade + " lugares" : "Capacidade não indicada"}</span>
                  <b>{room.estado || "Estado não definido"}</b>
                </button>
              ))}
            </div>
            {!visibleRooms.length && <p className="rooms-v1-empty-floor">Não existem salas registadas neste piso.</p>}
          </div>

          {selected && (
            <aside className="rooms-v1-detail">
              <div className="rooms-v1-detail-cover"><span>⌂</span><small>FICHA DO ESPAÇO</small></div>
              <div className="rooms-v1-detail-title">
                <div><h3>{selected.sala || "Sala sem nome"}</h3><p>{selected.tipo || "Tipo não definido"}</p></div>
                <b className={statusClass(selected.estado || "Ativa")}>{selected.estado || "Estado não definido"}</b>
              </div>
              <div className="rooms-v1-detail-facts">
                <div><small>Edifício</small><strong>{selected.edifício || "Por definir"}</strong></div>
                <div><small>Piso</small><strong>{selected.piso || "Por definir"}</strong></div>
                <div><small>Capacidade</small><strong>{selected.capacidade ? selected.capacidade + " lugares" : "Não indicada"}</strong></div>
                <div><small>Computadores</small><strong>{computerCount}</strong></div>
              </div>
              <div className="rooms-v1-detail-equipment"><small>Equipamentos por tipo</small><strong>{selected["Equipamentos por tipo"] || "Nenhum equipamento registado"}</strong></div>
              {selected.observações && <p className="rooms-v1-detail-observations">{selected.observações}</p>}
              {canManage && <button type="button" className="button button-primary rooms-v1-edit" onClick={() => onEdit(selected.id)}>✎ Editar sala</button>}
            </aside>
          )}
        </div>
      ) : (
        <div className="rooms-plan-empty">
          <span>⌂</span><strong>A planta ainda não tem salas</strong>
          <p>Adiciona a primeira sala e indica o edifício e o piso para começar a organizar o mapa.</p>
          {canManage && <button type="button" className="button button-primary" onClick={onAdd}>Adicionar primeira sala</button>}
        </div>
      )}
      <p className="rooms-plan-footnote">Versão 1 · Planta esquemática. A posição dos cartões não representa a localização física real. Os estados apresentados correspondem ao inventário de salas, não à ocupação em tempo real.</p>
    </section>
  );
}
