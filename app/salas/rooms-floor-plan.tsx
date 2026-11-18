"use client";

import { useMemo, useState } from "react";

type Room = Record<string, string>;

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
  const groups = useMemo(() => {
    const map = new Map<string, Room[]>();
    for (const room of rooms) {
      const building = room.edifício?.trim() || "Edifício por definir";
      const floor = room.piso?.trim() || "Piso por definir";
      const key = building + "||" + floor;
      map.set(key, [...(map.get(key) ?? []), room]);
    }
    return [...map.entries()].map(([key, items]) => {
      const [building, floor] = key.split("||");
      return { building, floor, rooms: items.sort((a, b) => (a.sala || "").localeCompare(b.sala || "", "pt-PT")) };
    }).sort((a, b) => a.building.localeCompare(b.building, "pt-PT") || a.floor.localeCompare(b.floor, "pt-PT"));
  }, [rooms]);
  const [selectedId, setSelectedId] = useState("");
  const selected = rooms.find((room) => room.id === selectedId) ?? null;
  const activeCount = rooms.filter((room) => room.estado === "Ativa").length;
  const maintenanceCount = rooms.filter((room) => room.estado === "Em manutenção").length;

  return (
    <section className="surface rooms-plan">
      <div className="surface-heading rooms-plan-heading">
        <div>
          <span className="eyebrow">MAPA DO CAMPUS</span>
          <h2>Planta esquemática das salas</h2>
          <p>Organização provisória por edifício e piso. Seleciona uma sala para consultar os detalhes.</p>
        </div>
        {canManage && <button type="button" className="button button-primary" onClick={onAdd}>＋ Adicionar sala</button>}
      </div>
      <div className="rooms-plan-stats">
        <span><strong>{rooms.length}</strong> salas registadas</span>
        <span><strong>{activeCount}</strong> ativas</span>
        <span><strong>{maintenanceCount}</strong> em manutenção</span>
      </div>
      {groups.length ? (
        <div className="rooms-floor-groups">
          {groups.map((group) => (
            <section className="rooms-floor-group" key={group.building + group.floor}>
              <div className="rooms-floor-title">
                <span className="rooms-floor-icon" aria-hidden="true">⌂</span>
                <div><strong>{group.building}</strong><small>{group.floor}</small></div>
                <span className="rooms-floor-count">{group.rooms.length} {group.rooms.length === 1 ? "sala" : "salas"}</span>
              </div>
              <div className="rooms-floor-grid">
                {group.rooms.map((room) => (
                  <button
                    type="button"
                    key={room.id}
                    className={"room-map-tile" + (selectedId === room.id ? " is-selected" : "") + (room.estado === "Em manutenção" ? " is-maintenance" : room.estado !== "Ativa" ? " is-inactive" : "")}
                    onClick={() => setSelectedId(room.id)}
                    aria-pressed={selectedId === room.id}
                  >
                    <span className="room-map-symbol" aria-hidden="true">▦</span>
                    <strong>{room.sala || "Sala sem nome"}</strong>
                    <small>{room.tipo || "Tipo não definido"}</small>
                    <span className="room-map-state">{room.estado || "Estado não definido"}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rooms-plan-empty">
          <span aria-hidden="true">⌂</span>
          <strong>A planta ainda não tem salas</strong>
          <p>Adiciona a primeira sala e indica o edifício e o piso para começar a organizar o mapa.</p>
          {canManage && <button type="button" className="button button-primary" onClick={onAdd}>Adicionar primeira sala</button>}
        </div>
      )}
      {selected && (
        <aside className="room-map-details" aria-live="polite">
          <div>
            <span className="eyebrow">DETALHES DA SALA</span>
            <h3>{selected.sala}</h3>
            <p>{selected.edifício || "Edifício por definir"} · {selected.piso || "Piso por definir"}</p>
          </div>
          <div className="room-map-detail-grid">
            <span><small>Capacidade</small><strong>{selected.capacidade || "—"} lugares</strong></span>
            <span><small>Tipo</small><strong>{selected.tipo || "—"}</strong></span>
            <span><small>Computadores</small><strong>{selected["N.º de computadores"] || "0"}</strong></span>
            <span><small>Estado</small><strong>{selected.estado || "—"}</strong></span>
          </div>
          <div className="room-map-equipment"><small>Equipamentos</small><strong>{selected["Equipamentos por tipo"] || "Nenhum"}</strong></div>
          {selected.observações && <p className="room-map-observations">{selected.observações}</p>}
          {canManage && <button type="button" className="button button-secondary" onClick={() => onEdit(selected.id)}>Editar esta sala</button>}
        </aside>
      )}
      <p className="rooms-plan-footnote">Esta planta é esquemática: a posição dos cartões não representa ainda a localização física real das salas.</p>
    </section>
  );
}
