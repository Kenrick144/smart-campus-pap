"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { downloadCsv, readDemoValue, writeDemoValue } from "./lib/demo-data";
import { readSupabaseRecords, readLookupRecords, saveSupabaseRecord, deleteSupabaseRecord, updateSupabaseRecord } from "./lib/supabase-data";
import { createClient } from "@/lib/supabase/client";
import { QrImage, QrScanner } from "./qr-tools";

type Role = "Aluno" | "Professor" | "Funcionário" | "Administrador Adjunto" | "Administrador";
type RecordItem = Record<string, string>;
type TemporaryCode = { code: string; expiresAt: number };
type CampusNotification = {
  id: string;
  title: string;
  message: string;
  publishedAt: string;
  read: boolean;
};
type CampusData = {
  academicYears: RecordItem[];
  students: RecordItem[];
  teachers: RecordItem[];
  classes: RecordItem[];
  computers: RecordItem[];
  attendance: RecordItem[];
  rooms: RecordItem[];
  timetable: RecordItem[];
  logs: RecordItem[];
};

const navigation = [
  { label: "Painel principal", icon: "◫", href: "/dashboard", roles: ["Administrador", "Administrador Adjunto", "Professor", "Funcionário"] },
  { label: "Utilizadores", icon: "♙", href: "/utilizadores", roles: ["Administrador", "Administrador Adjunto"] },
  { label: "Alunos", icon: "◎", href: "/alunos", roles: ["Administrador", "Administrador Adjunto", "Professor"] },
  { label: "Professores", icon: "♧", href: "/professor", roles: ["Administrador", "Administrador Adjunto"] },
  { label: "Turmas", icon: "▤", href: "/turmas", roles: ["Administrador", "Administrador Adjunto", "Professor"] },
  { label: "Anos letivos", icon: "▣", href: "/anos-letivos", roles: ["Administrador", "Administrador Adjunto"] },
  { label: "Disciplinas", icon: "▧", href: "/disciplinas", roles: ["Administrador", "Administrador Adjunto", "Professor"] },
  { label: "Presenças", icon: "✓", href: "/presencas", roles: ["Administrador", "Administrador Adjunto", "Professor", "Aluno"] },
  { label: "Horários", icon: "◷", href: "/horarios", roles: ["Administrador", "Administrador Adjunto", "Professor", "Aluno", "Funcionário"] },
  { label: "Salas", icon: "⌂", href: "/salas", roles: ["Administrador", "Administrador Adjunto", "Funcionário"] },
  { label: "Computadores", icon: "▣", href: "/computadores", roles: ["Administrador", "Administrador Adjunto", "Professor", "Funcionário"] },
  { label: "Códigos QR", icon: "▦", href: "/qr-code", roles: ["Administrador", "Administrador Adjunto", "Professor", "Aluno"] },
  { label: "Relatórios", icon: "▥", href: "/relatorios", roles: ["Administrador", "Administrador Adjunto", "Professor"] },
  { label: "Registos de atividade", icon: "≡", href: "/logs", roles: ["Administrador", "Administrador Adjunto"] },
  { label: "Configurações", icon: "⚙", href: "/configuracoes", roles: ["Administrador", "Administrador Adjunto"] },
];

const pageNames: Record<string, string> = {
  "/dashboard": "Painel principal",
  "/utilizadores": "Utilizadores",
  "/alunos": "Alunos",
  "/professor": "Professores",
  "/turmas": "Turmas",
  "/anos-letivos": "Anos letivos",
  "/disciplinas": "Disciplinas",
  "/presencas": "Presenças",
  "/horarios": "Horários",
  "/salas": "Salas",
  "/computadores": "Computadores",
  "/qr-code": "Códigos QR",
  "/relatorios": "Relatórios",
  "/logs": "Registos de atividade",
  "/configuracoes": "Configurações",
  "/perfil": "O meu perfil",
  "/aluno": "Área do aluno",
  "/funcionario": "Área do funcionário",
  "/pc": "Estação de trabalho",
};

const roleRoutes: Record<Role, string[]> = {
  Administrador: Object.keys(pageNames),
  "Administrador Adjunto": Object.keys(pageNames),
  Professor: ["/dashboard", "/alunos", "/professor", "/turmas", "/disciplinas", "/presencas", "/horarios", "/salas", "/computadores", "/qr-code", "/relatorios", "/avaliacoes", "/notas", "/avisos", "/pc", "/perfil"],
  Aluno: ["/aluno", "/horarios", "/presencas", "/qr-code", "/notas", "/avaliacoes", "/avisos", "/pc", "/perfil"],
  "Funcionário": ["/dashboard", "/funcionario", "/horarios", "/salas", "/computadores", "/avisos", "/pc", "/perfil"],
};

const roles: Role[] = ["Administrador", "Administrador Adjunto", "Professor", "Aluno", "Funcionário"];

const formFields: Record<string, string[]> = {
  "/anos-letivos": ["nome", "data_inicio", "data_fim", "ativo"],
  "/turmas": ["nome", "ano_letivo_id", "ano_escolar", "curso", "capacidade", "estado", "professor_coordenador_id"],
  "/disciplinas": ["nome", "codigo", "departamento", "descricao", "estado"],
  "/presencas": ["aluno_id", "horario_id", "data", "estado", "observacoes"],
  "/horarios": ["turma_id", "disciplina_turma_id", "professor_id", "sala_id", "dia_semana", "hora_inicio", "hora_fim", "observacoes"],
  "/salas": ["nome", "edificio", "piso", "capacidade", "tipo", "estado", "observacoes"],
  "/computadores": ["sala_id", "tipo", "nome", "numero_inventario", "marca", "modelo", "numero_serie", "estado", "observacoes"],
};

const primaryActions: Record<string, string> = {
  "/anos-letivos": "Criar ano letivo",
  "/turmas": "Criar turma",
  "/disciplinas": "Nova disciplina",
  "/presencas": "Registar presença",
  "/horarios": "Novo horário",
  "/salas": "Adicionar sala",
  "/computadores": "Adicionar equipamento",
};

const roleDestinations: Record<Role, string> = {
  Administrador: "/dashboard",
  "Administrador Adjunto": "/dashboard",
  Professor: "/dashboard",
  Aluno: "/aluno",
  "Funcionário": "/funcionario",
};

export default function Workspace() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [role, setRole] = useState<Role>("Aluno");
  const [showCampusInfo, setShowCampusInfo] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileDetails, setProfileDetails] = useState<RecordItem>({});
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<CampusNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [recordsPath, setRecordsPath] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos os estados");
  const [showForm, setShowForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [pcCode, setPcCode] = useState("");
  const [temporaryCode] = useState<TemporaryCode | null>(null);
  const [temporaryCodeActive] = useState(false);
  const [pcRecords, setPcRecords] = useState<RecordItem[]>([]);
  const [activeComputer] = useState("");
  const [period, setPeriod] = useState("Esta semana");
  const [campusData, setCampusData] = useState<CampusData>({
    academicYears: [],
    students: [],
    teachers: [],
    classes: [],
    computers: [],
    attendance: [],
    rooms: [],
    timetable: [],
    logs: [],
  });

  const title = pageNames[pathname] ?? "Painel principal";
  const activeAcademicYear = campusData.academicYears.find((year) =>
    ["true", "ativo", "sim"].includes((year.ativo ?? "").toLocaleLowerCase("pt-PT"))
  );
  const isCampusAdministrator = role === "Administrador" || role === "Administrador Adjunto";
  const dataRoutes = [
    "/alunos", "/professor", "/turmas", "/anos-letivos", "/disciplinas",
    "/presencas", "/horarios", "/salas", "/computadores", "/qr-code", "/logs",
  ];

  async function refreshWorkspaceData(currentRole: Role, route: string) {
    const pathsByRole: Record<Role, string[]> = {
      Administrador: dataRoutes,
      "Administrador Adjunto": dataRoutes,
      Professor: [
        "/alunos", "/professor", "/turmas", "/disciplinas", "/presencas",
        "/horarios", "/salas", "/computadores", "/qr-code",
      ],
      Aluno: ["/alunos", "/presencas", "/horarios", "/computadores", "/qr-code"],
      "Funcionário": ["/horarios", "/salas", "/computadores"],
    };

    const allowed = new Set(pathsByRole[currentRole]);
    const pathsToLoad = [...new Set([...pathsByRole[currentRole], ...(dataRoutes.includes(route) ? [route] : [])])];

    const results = await Promise.all(
      pathsToLoad.map(async (path) => [path, allowed.has(path) ? await readSupabaseRecords(path, []) : []] as const)
    );
    const byPath = new Map<string, RecordItem[]>(results);

    const snapshot: CampusData = {
      academicYears: byPath.get("/anos-letivos") ?? [],
      students: byPath.get("/alunos") ?? [],
      teachers: byPath.get("/professor") ?? [],
      classes: byPath.get("/turmas") ?? [],
      computers: byPath.get("/computadores") ?? [],
      attendance: byPath.get("/presencas") ?? [],
      rooms: byPath.get("/salas") ?? [],
      timetable: byPath.get("/horarios") ?? [],
      logs: byPath.get("/logs") ?? [],
    };

    setCampusData(snapshot);
    setPcRecords(snapshot.computers);
    setRecords(dataRoutes.includes(route) ? (byPath.get(route) ?? []) : []);
    setRecordsPath(route);
  }

  useEffect(() => {
    let active = true;

    async function loadWorkspace() {
      setSessionReady(false);
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          router.replace("/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("id, name, email, role, status, username, birth_date, phone, nif, document_type, document_number, niss, health_number, address, department, employee_position, hiring_date, contract_type, professional_status, created_at")
          .eq("id", authData.user.id)
          .maybeSingle();

        const knownRoles: Role[] = [
          "Aluno",
          "Professor",
          "Funcionário",
          "Administrador Adjunto",
          "Administrador",
        ];

        if (
          profileError ||
          !profile ||
          profile.status !== "Ativo" ||
          !knownRoles.includes(profile.role as Role)
        ) {
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }

        const currentRole = profile.role as Role;
        if (pathname !== "/pc" && !roleRoutes[currentRole].some(
          (route) => pathname === route || pathname.startsWith(route + "/")
        )) {
          router.replace(roleDestinations[currentRole]);
          return;
        }

        if (!active) return;
        setRole(currentRole);
        setProfileName(profile.name);
        setProfileEmail(profile.email);

        const roleDetails: Record<string, unknown> = {};
        if (currentRole === "Aluno") {
          const { data } = await supabase
            .from("alunos")
            .select("student_number, school_year, course, enrollment_date")
            .eq("id", profile.id)
            .maybeSingle();
          Object.assign(roleDetails, data ?? {});
        } else if (currentRole === "Professor") {
          const { data } = await supabase
            .from("professores")
            .select("professional_number, department, hiring_date, contract_type, professional_status")
            .eq("id", profile.id)
            .maybeSingle();
          Object.assign(roleDetails, data ?? {});
        } else if (currentRole === "Funcionário") {
          const { data } = await supabase
            .from("funcionarios")
            .select("employee_number, department, employee_position, hiring_date, contract_type, professional_status")
            .eq("id", profile.id)
            .maybeSingle();
          Object.assign(roleDetails, data ?? {});
        }

        const combinedProfile = { ...profile, ...roleDetails };
        setProfileDetails(Object.fromEntries(
          Object.entries(combinedProfile).map(([key, value]) => [key, value === null || value === undefined ? "" : String(value)])
        ) as RecordItem);

        await refreshWorkspaceData(currentRole, pathname);

        if (!active) return;
        setSearch("");
        setStatusFilter("Todos os estados");
        setShowForm(false);
        setEditingIndex(null);
        setSessionReady(true);
      } catch (error) {
        console.error("Erro ao carregar o espaço de trabalho:", error);
        if (active) {
          setNotice(error instanceof Error ? error.message : "Não foi possível carregar os dados do campus.");
          setSessionReady(true);
          setRecordsPath(pathname);
        }
      }
    }

    void loadWorkspace();
    return () => { active = false; };
  }, [pathname, router, supabase]);

  const visibleNavigation = navigation.filter((item) => item.roles.includes(role));
  const filteredRecords = useMemo(() => {
    const query = search.toLocaleLowerCase("pt-PT").trim();
    return records.filter((record) =>
      (statusFilter === "Todos os estados" || record.estado === statusFilter) &&
      (!query || Object.entries(record).some(([key, value]) => key !== "id" && String(value).toLocaleLowerCase("pt-PT").includes(query))),
    );
  }, [records, search, statusFilter]);

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const item = Object.fromEntries(
      Array.from(form.entries()).map(([key, value]) => [key, String(value).trim()])
    ) as RecordItem;

    const existing = editingIndex === null ? undefined : records[editingIndex];
    if (editingIndex !== null && !existing?.id) {
      setNotice("Não foi encontrado o identificador deste registo. Atualiza a página e tenta novamente.");
      return;
    }

    const result = await saveSupabaseRecord(pathname, item, existing?.id);
    if (!result.ok) {
      setNotice(result.error ?? "Não foi possível guardar o registo.");
      return;
    }

    setShowForm(false);
    setEditingIndex(null);
    await refreshWorkspaceData(role, pathname);
    setNotice(existing ? "Registo atualizado com sucesso." : "Registo criado com sucesso.");
  }

  async function deleteRecord(index: number) {
    const item = records[index];
    if (!item?.id || !window.confirm("Pretende eliminar o registo \"" + (Object.values(item)[1] ?? Object.values(item)[0] ?? "registo") + "\"?")) return;

    const result = await deleteSupabaseRecord(pathname, item.id);
    if (!result.ok) {
      setNotice(result.error ?? "Não foi possível eliminar o registo.");
      return;
    }

    await refreshWorkspaceData(role, pathname);
    setNotice("Registo eliminado.");
  }

  async function updateAttendance(index: number, status: string) {
    const item = records[index];
    if (!item?.id) {
      setNotice("O registo de presença não tem um identificador válido.");
      return;
    }

    const result = await updateSupabaseRecord("/presencas", item.id, { ...item, estado: status });
    if (!result.ok) {
      setNotice(result.error ?? "Não foi possível atualizar a presença.");
      return;
    }

    await refreshWorkspaceData(role, pathname);
    setNotice("Presença atualizada.");
  }

  async function markPresence(scannedCode?: string) {
    const code = (scannedCode ?? qrCode).trim();
    if (!code) {
      setNotice("Introduza ou leia o código QR da sala.");
      return;
    }

    try {
      const response = await fetch("/api/attendance/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error ?? "Não foi possível registar a presença.");
        return;
      }

      setQrCode("");
      await refreshWorkspaceData(role, pathname);
      setNotice(result.message ?? "Presença registada.");
    } catch {
      setNotice("Não foi possível comunicar com o servidor para registar a presença.");
    }
  }

  function startComputer() {
    setNotice("A sessão de utilização de computadores ainda não está ligada a um registo de sessão no Supabase. Nenhum equipamento foi alterado.");
  }

  function endComputerSession() {
    setNotice("A sessão de computador ainda não está ligada ao registo de utilização no Supabase.");
  }

  function generateTemporaryCode() {
    setNotice("Os códigos temporários ainda não têm uma tabela de sessões no Supabase. Nenhum código de demonstração foi criado.");
  }

  async function loadNotifications() {
    setNotificationsLoading(true);
    setNotificationsError("");
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar as notificações.");
      setNotifications((result.notifications ?? []) as CampusNotification[]);
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : "Não foi possível carregar as notificações.");
    } finally {
      setNotificationsLoading(false);
    }
  }

  async function toggleNotifications() {
    const opening = !showNotifications;
    setShowNotifications(opening);
    if (opening) await loadNotifications();
  }

  async function markNotificationRead(id?: string) {
    setNotificationsError("");
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { all: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar as notificações.");
      await loadNotifications();
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : "Não foi possível atualizar as notificações.");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (!sessionReady || recordsPath !== pathname) {
    return <main className="login-screen" aria-busy="true"><p>A carregar o espaço de trabalho...</p></main>;
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard" aria-label="Smart Campus — painel principal">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span className="brand-copy">
            <span className="brand-wordmark"><span className="brand-smart">smart</span><span className="brand-light">campus</span></span>
            <small>GESTÃO ESCOLAR</small>
          </span>
        </Link>
        <button
          className={"school-switch" + (showCampusInfo ? " is-open" : "")}
          type="button"
          aria-expanded={showCampusInfo}
          aria-controls="campus-info-panel"
          onClick={() => setShowCampusInfo((open) => !open)}
        >
          <span className="school-avatar">I</span>
          <span className="school-switch-copy"><strong>Escola Profissional</strong><small>Campus principal</small></span>
          <span className={"chevron" + (showCampusInfo ? " is-rotated" : "")} aria-hidden="true">⌄</span>
        </button>
        {showCampusInfo && (
          <section className="campus-info-panel" id="campus-info-panel" aria-label="Informações do campus">
            <div className="campus-info-heading">
              <span className="campus-info-icon">⌂</span>
              <div><strong>Campus principal</strong><small>Campus atual</small></div>
            </div>
            <div className="campus-info-divider" />
            <div className="campus-year-info">
              <span className="campus-year-icon">▣</span>
              <div>
                <small>ANO LETIVO</small>
                <strong>{activeAcademicYear?.nome || "Por configurar"}</strong>
                <span className={"campus-year-status" + (activeAcademicYear ? " is-configured" : "")}>
                  <i />{activeAcademicYear ? "Ano letivo ativo" : "Sem ano letivo ativo"}
                </span>
              </div>
            </div>
            {activeAcademicYear?.data_inicio && activeAcademicYear?.data_fim && (
              <p className="campus-year-dates">
                {new Date(activeAcademicYear.data_inicio + "T00:00:00").toLocaleDateString("pt-PT")} – {new Date(activeAcademicYear.data_fim + "T00:00:00").toLocaleDateString("pt-PT")}
              </p>
            )}
            {isCampusAdministrator && (
              <Link className="campus-configure-link" href="/anos-letivos" onClick={() => setShowCampusInfo(false)}>
                {activeAcademicYear ? "Gerir ano letivo" : "Configurar ano letivo"} <span aria-hidden="true">↗</span>
              </Link>
            )}
          </section>
        )}
        <div className="nav-caption">ESPAÇO DE TRABALHO</div>
        <nav className="main-nav" aria-label="Navegação principal">
          {visibleNavigation.map((item) => (
            <Link key={item.href} className={"nav-item " + (pathname === item.href ? "selected" : "")} href={item.href} title={item.label}>
              <span className="nav-icon">{item.icon}</span>{item.label}
            </Link>
          ))}
          {role === "Aluno" && <Link className={"nav-item " + (pathname === "/aluno" ? "selected" : "")} href="/aluno"><span className="nav-icon">◎</span>A minha área</Link>}
          {role === "Funcionário" && <Link className={"nav-item " + (pathname === "/funcionario" ? "selected" : "")} href="/funcionario"><span className="nav-icon">⌂</span>Área de serviço</Link>}
        </nav>
        <div className="sidebar-bottom">
          <Link className="help-card" href="/configuracoes"><span className="help-icon">?</span><span><strong>Precisa de ajuda?</strong><small>Consulte o guia do campus</small></span><span>↗</span></Link>
          <button className="profile-card" onClick={signOut}>
            <span className="avatar avatar-purple">{profileName.split(" ").map((part) => part[0]).join("").slice(0,2).toUpperCase()}</span>
            <span className="profile-text"><strong>{profileName}</strong><small>{role}</small></span><span className="profile-menu">↪ Sair</span>
          </button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Smart Campus</span><span>/</span><strong>{title}</strong></div>
          <div className="topbar-actions">
            <label className="top-search"><span>⌕</span><input aria-label="Pesquisar" placeholder="Pesquisar..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label>
            <div className="notification-anchor">
              <button
                className="icon-button notifications"
                type="button"
                aria-label="Abrir notificações"
                aria-expanded={showNotifications}
                onClick={toggleNotifications}
              >
                ♧
                {notifications.some((item) => !item.read) && <i />}
              </button>
              {showNotifications && (
                <section className="notification-popover" role="dialog" aria-label="Notificações">
                  <header className="notification-popover-header">
                    <div>
                      <h2>Notificações</h2>
                      <p>{notifications.filter((item) => !item.read).length} por ler</p>
                    </div>
                    <div className="notification-popover-actions">
                      {notifications.some((item) => !item.read) && (
                        <button type="button" className="notification-text-button" onClick={() => markNotificationRead()}>
                          Marcar todas como lidas
                        </button>
                      )}
                      <button type="button" className="notification-close" aria-label="Fechar notificações" onClick={() => setShowNotifications(false)}>×</button>
                    </div>
                  </header>
                  {notificationsLoading ? (
                    <p className="notification-state">A carregar notificações…</p>
                  ) : notificationsError ? (
                    <div className="notification-state notification-state-error">
                      <p>{notificationsError}</p>
                      <button type="button" className="notification-text-button" onClick={loadNotifications}>Tentar novamente</button>
                    </div>
                  ) : notifications.length ? (
                    <div className="notification-list">
                      {notifications.map((item) => (
                        <button
                          type="button"
                          className={"notification-item" + (item.read ? " is-read" : " is-unread")}
                          key={item.id}
                          onClick={() => !item.read && markNotificationRead(item.id)}
                        >
                          <span className="notification-item-icon">♧</span>
                          <span className="notification-item-copy">
                            <strong>{item.title}</strong>
                            <span>{item.message}</span>
                            <time>{new Date(item.publishedAt).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}</time>
                          </span>
                          {!item.read && <i className="notification-unread-dot" aria-label="Por ler" />}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="notification-empty">
                      <span className="notification-empty-icon">♧</span>
                      <strong>Sem novas notificações</strong>
                      <p>Quando houver avisos publicados para a tua conta, aparecem aqui.</p>
                    </div>
                  )}
                  <footer className="notification-popover-footer">
                    <button type="button" onClick={loadNotifications}>Atualizar lista</button>
                  </footer>
                </section>
              )}
            </div>
            <span className="top-divider" />
            <Link className="avatar avatar-purple top-avatar profile-avatar-link" href="/perfil" aria-label="Ver o meu perfil" title="Ver o meu perfil">
              {profileName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || profileEmail.charAt(0).toUpperCase()}
            </Link>
          </div>
        </header>

        <div className="page-content">
          {notice && <div className="notice" role="status"><span>ℹ</span>{notice}<button onClick={() => setNotice("")} aria-label="Fechar">×</button></div>}
          {pathname === "/dashboard" ? (
            <Dashboard role={role} profileName={profileName} period={period} setPeriod={setPeriod} campusData={campusData} />
          ) : pathname === "/perfil" ? (
            <ProfilePage profile={profileDetails} role={role} />
          ) : pathname === "/aluno" ? (
            <StudentPage name={profileName} qrCode={qrCode} setQrCode={setQrCode} onScan={markPresence} attendance={campusData.attendance} computers={campusData.computers} timetable={campusData.timetable} />
          ) : pathname === "/funcionario" ? (
            <StaffPage profileName={profileName} campusData={campusData} />
          ) : pathname === "/pc" ? (
            <PcPage code={pcCode} setCode={setPcCode} onStart={startComputer} onEnd={endComputerSession} computers={pcRecords} activeComputer={activeComputer} />
          ) : pathname === "/relatorios" ? (
            <ReportsPage period={period} setPeriod={setPeriod} attendance={campusData.attendance} computers={pcRecords} logs={campusData.logs} />
          ) : pathname === "/configuracoes" ? (
            <SettingsPage />
          ) : (
            <DataPage
              pathname={pathname}
              title={title}
              role={role}
              records={filteredRecords}
              allRecords={records}
              search={search}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              temporaryCode={temporaryCode}
              temporaryCodeActive={temporaryCodeActive}
              onAdd={() => { setEditingIndex(null); setShowForm(true); }}
              onEdit={(index) => { setEditingIndex(index); setShowForm(true); }}
              onDelete={deleteRecord}
              onStatus={updateAttendance}
              onGenerateCode={generateTemporaryCode}
              onScan={markPresence}
              qrCode={qrCode}
              setQrCode={setQrCode}
            />
          )}
        </div>
      </section>

      {showForm && <RecordModal
        resource={pathname}
        title={editingIndex === null ? (primaryActions[pathname] ?? "Adicionar registo") : "Editar registo"}
        fields={(formFields[pathname] ?? ["nome", "descrição", "estado"]).filter((field) => editingIndex === null || field !== "palavra-passe")}
        initialValues={editingIndex === null ? undefined : records[editingIndex]}
        onClose={() => { setShowForm(false); setEditingIndex(null); }}
        onSubmit={saveRecord}
      />}
    </main>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{action}</div>;
}



function ProfilePage({ profile, role }: { profile: RecordItem; role: Role }) {
  const initials = (profile.name ?? "").split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const personalFields: [string, string][] = [
    ["Email", "email"],
    ["Nome de utilizador", "username"],
    ["Estado da conta", "status"],
    ["Telefone", "phone"],
    ["Data de nascimento", "birth_date"],
    ["NIF", "nif"],
    ["Tipo de documento", "document_type"],
    ["Número de identificação", "document_number"],
    ["NISS", "niss"],
    ["Número de utente", "health_number"],
    ["Morada", "address"],
  ];
  const academicFields: [string, string][] = [
    ["Número de aluno", "student_number"],
    ["Ano escolar", "school_year"],
    ["Curso", "course"],
    ["Data de inscrição", "enrollment_date"],
  ];
  const professionalFields: [string, string][] = [
    ["Número profissional", role === "Funcionário" ? "employee_number" : "professional_number"],
    ["Departamento", "department"],
    ["Cargo", "employee_position"],
    ["Data de contratação", "hiring_date"],
    ["Tipo de contrato", "contract_type"],
    ["Estado profissional", "professional_status"],
  ];
  const fields = role === "Aluno" ? academicFields : role === "Professor" || role === "Funcionário" ? professionalFields : [];
  const visibleValue = (key: string) => {
    const value = profile[key];
    return value && value.trim() ? value : "Não indicado";
  };

  return <>
    <PageHeading eyebrow="CONTA PESSOAL" title="O meu perfil" description="Consulta os dados associados à tua conta do Smart Campus." />
    <section className="profile-page-hero surface">
      <div className="profile-page-avatar">{initials || "SC"}</div>
      <div className="profile-page-identity">
        <span className="profile-page-eyebrow">PERFIL DO UTILIZADOR</span>
        <h2>{profile.name || "Utilizador"}</h2>
        <p>{profile.email || "Email não disponível"}</p>
        <div className="profile-page-badges">
          <span className="profile-page-role">{role}</span>
          <span className={"profile-page-status" + (profile.status === "Ativo" ? " is-active" : "")}>{profile.status || "Estado desconhecido"}</span>
        </div>
      </div>
      <div className="profile-page-account">
        <small>MEMBRO DESDE</small>
        <strong>{profile.created_at ? new Date(profile.created_at).toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" }) : "—"}</strong>
      </div>
    </section>

    <section className="profile-detail-grid">
      <article className="surface profile-detail-card">
        <div className="surface-heading"><div><h2>Dados pessoais e de acesso</h2><p>Informação guardada na tua conta</p></div></div>
        <dl className="profile-fields">
          {personalFields.map(([label, key]) => (
            <div key={key}><dt>{label}</dt><dd>{visibleValue(key)}</dd></div>
          ))}
        </dl>
      </article>
      {fields.length > 0 && (
        <article className="surface profile-detail-card">
          <div className="surface-heading"><div><h2>{role === "Aluno" ? "Dados académicos" : "Dados profissionais"}</h2><p>Informação associada ao teu perfil</p></div></div>
          <dl className="profile-fields">
            {fields.map(([label, key]) => (
              <div key={key}><dt>{label}</dt><dd>{visibleValue(key)}</dd></div>
            ))}
          </dl>
        </article>
      )}
    </section>
  </>;
}

function Dashboard({ role, profileName, period, setPeriod, campusData }: { role: Role; profileName: string; period: string; setPeriod: (value: string) => void; campusData: CampusData }) {
  const isAdmin = role === "Administrador" || role === "Administrador Adjunto";
  const description = isAdmin
    ? "Aqui está o resumo do que está a acontecer no campus hoje."
    : role === "Professor"
      ? "Consulte as suas turmas, horários e presenças num só lugar."
      : role === "Aluno"
        ? "Consulte as suas aulas e presenças."
        : "Veja o estado das salas e equipamentos do campus.";

  return <>
    {isAdmin
      ? <AdminDashboardHero profileName={profileName} />
      : <PageHeading eyebrow="RESUMO DIÁRIO DO CAMPUS" title={"Bom dia, " + profileName.split(" ")[0] + " 👋"} description={description} action={<button className="button button-secondary" onClick={() => window.print()}>↓ <span>Exportar resumo</span></button>} />}
    {isAdmin ? <AdminDashboard period={period} setPeriod={setPeriod} campusData={campusData} /> : role === "Professor" ? <TeacherDashboard campusData={campusData} /> : role === "Aluno" ? <StudentDashboardSummary campusData={campusData} /> : <StaffPage profileName={profileName} campusData={campusData} />}
  </>;
}

function AdminDashboardHero({ profileName }: { profileName: string }) {
  const today = new Date();
  const weekday = today.toLocaleDateString("pt-PT", { weekday: "long" });
  const dateLabel = today.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });
  const hour = today.getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 19 ? "Boa tarde" : "Boa noite";
  const firstName = profileName.trim().split(" ")[0] || "Administrador";

  return (
    <section className="admin-dashboard-hero">
      <div className="admin-dashboard-hero-copy">
        <div className="eyebrow">RESUMO DIÁRIO DO CAMPUS</div>
        <h1>{greeting}, {firstName} <span aria-hidden="true">👋</span></h1>
        <p>Acompanhe o estado do campus e aceda rapidamente às tarefas de gestão.</p>
        <div className="admin-dashboard-hero-meta">
          <span><i /> Painel de administração</span>
          <span className="admin-dashboard-date-inline">{weekday} · {dateLabel}</span>
        </div>
      </div>
      <div className="admin-dashboard-hero-tools">
        <div className="admin-dashboard-hero-tools-heading">
          <div><span>ACESSO RÁPIDO</span><strong>O que pretende fazer?</strong></div>
          <button className="button button-secondary" onClick={() => window.print()}>↓ <span>Exportar resumo</span></button>
        </div>
        <div className="admin-dashboard-shortcuts">
          <Link className="admin-quick-action" href="/utilizadores">
            <span className="admin-quick-action-icon violet">♙</span>
            <span><strong>Utilizadores</strong><small>Contas e acessos</small></span><b aria-hidden="true">↗</b>
          </Link>
          <Link className="admin-quick-action" href="/anos-letivos">
            <span className="admin-quick-action-icon blue">▣</span>
            <span><strong>Anos letivos</strong><small>Configurar calendário</small></span><b aria-hidden="true">↗</b>
          </Link>
          <Link className="admin-quick-action" href="/turmas">
            <span className="admin-quick-action-icon amber">▤</span>
            <span><strong>Turmas</strong><small>Organizar turmas</small></span><b aria-hidden="true">↗</b>
          </Link>
          <Link className="admin-quick-action" href="/horarios">
            <span className="admin-quick-action-icon green">◷</span>
            <span><strong>Horários</strong><small>Consultar aulas</small></span><b aria-hidden="true">↗</b>
          </Link>
        </div>
      </div>
    </section>
  );
}

function AdminDashboard({ period, setPeriod, campusData }: { period: string; setPeriod: (value: string) => void; campusData: CampusData }) {
  const equipmentState = (computer: RecordItem) =>
    (computer.__estado_db || computer.estado || "").trim().toLocaleLowerCase("pt-PT");
  const computerEquipment = campusData.computers.filter(
    (computer) => (computer.tipo || "").trim().toLocaleLowerCase("pt-PT") === "computador"
  );
  const freeComputers = computerEquipment.filter((computer) =>
    ["operacional", "livre"].includes(equipmentState(computer))
  ).length;
  const computerCount = campusData.computers.length;
  const pcCounts = [
    { status: "Operacional", state: ["operacional", "livre"], tone: "green" },
    { status: "Em manutenção", state: ["em manutenção", "manutenção"], tone: "amber" },
    { status: "Avariado", state: ["avariado"], tone: "red" },
    { status: "Inativo", state: ["inativo"], tone: "slate" },
  ].map((category) => ({
    status: category.status,
    count: campusData.computers.filter((computer) => category.state.includes(equipmentState(computer))).length,
    tone: category.tone,
  }));
  const activeStudentCount = campusData.students.filter(
    (student) => (student.estado || "").trim().toLocaleLowerCase("pt-PT") === "ativo"
  ).length;
  const activeTeacherCount = campusData.teachers.filter(
    (teacher) =>
      (teacher.estado || "").trim().toLocaleLowerCase("pt-PT") === "ativo" &&
      (teacher.estado_conta || "").trim().toLocaleLowerCase("pt-PT") === "ativo"
  ).length;
  const activeClassCount = campusData.classes.filter(
    (item) => (item.estado || "").trim().toLocaleLowerCase("pt-PT") === "ativa"
  ).length;
  const stats = [
    { label: "Alunos ativos", value: String(activeStudentCount), change: "Contas ativas · Supabase", icon: "◎", color: "violet" },
    { label: "Professores ativos", value: String(activeTeacherCount), change: "Perfil e conta ativos", icon: "♧", color: "blue" },
    { label: "Turmas ativas", value: String(activeClassCount), change: "Estado da turma", icon: "▤", color: "amber" },
    { label: "PCs operacionais", value: String(freeComputers), change: "de " + computerEquipment.length + " computadores", icon: "▣", color: "green" },
  ];

  const dateKey = (date: Date) =>
    date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  const now = new Date();
  const currentIsoDay = now.getDay() === 0 ? 7 : now.getDay();
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const upcomingLessons = campusData.timetable
    .map((lesson) => {
      const dayNumber = Number(lesson.dia_semana);
      const startTime = (lesson.hora_inicio || lesson.hora || "").split(/[–-]/)[0].trim().slice(0, 5);
      const [hours, minutes] = startTime.split(":").map(Number);
      if (
        !Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 7 ||
        !Number.isFinite(hours) || !Number.isFinite(minutes)
      ) return null;
      let daysUntil = (dayNumber - currentIsoDay + 7) % 7;
      const startMinute = hours * 60 + minutes;
      if (daysUntil === 0 && startMinute <= currentMinute) daysUntil = 7;
      return { lesson, nextOccurrence: daysUntil * 1440 + startMinute };
    })
    .filter((lesson) => lesson !== null)
    .sort((a, b) => a.nextOccurrence - b.nextOccurrence)
    .slice(0, 4);


  const recordDateKey = (value: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : dateKey(parsed);
  };
  const makeBucket = (start: Date, end: Date, label: string) => ({
    startKey: dateKey(start),
    endKey: dateKey(end),
    label,
  });

  let activityBuckets: { startKey: string; endKey: string; label: string }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (period === "Esta semana") {
    // Use Monday–Sunday, matching the period definition in ReportsPage.
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    activityBuckets = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + index);
      return makeBucket(day, day, day.toLocaleDateString("pt-PT", { weekday: "short" }).replace(".", ""));
    });
  } else if (period === "Este mês") {
    const year = today.getFullYear();
    const month = today.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    let bucketStart = new Date(monthStart);

    // Group the month into calendar weeks, clipped to the days of this month.
    while (bucketStart <= monthEnd) {
      const daysFromMonday = (bucketStart.getDay() + 6) % 7;
      const calendarWeekEnd = new Date(bucketStart);
      calendarWeekEnd.setDate(bucketStart.getDate() + (6 - daysFromMonday));
      const bucketEnd = calendarWeekEnd > monthEnd ? monthEnd : calendarWeekEnd;
      activityBuckets.push(makeBucket(bucketStart, bucketEnd, bucketStart.getDate() + "–" + bucketEnd.getDate()));
      bucketStart = new Date(bucketEnd);
      bucketStart.setDate(bucketStart.getDate() + 1);
    }
  } else {
    const activeAcademicYear = campusData.academicYears.find((item) =>
      ["true", "ativo", "sim"].includes((item.ativo ?? "").toLocaleLowerCase())
    );
    const startValue = activeAcademicYear?.data_inicio;
    const endValue = activeAcademicYear?.data_fim;
    const startDate = startValue ? new Date(startValue.slice(0, 10) + "T00:00:00") : null;
    const endDate = endValue ? new Date(endValue.slice(0, 10) + "T00:00:00") : null;

    if (
      startDate && endDate &&
      !Number.isNaN(startDate.getTime()) &&
      !Number.isNaN(endDate.getTime()) &&
      startDate <= endDate
    ) {
      const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      while (cursor <= endDate) {
        const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
        const bucketStart = monthStart < startDate ? startDate : monthStart;
        const bucketEnd = monthEnd > endDate ? endDate : monthEnd;
        const label = cursor.toLocaleDateString("pt-PT", { month: "short" }).replace(".", "");
        activityBuckets.push(makeBucket(bucketStart, bucketEnd, label));
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
  }

  const weekActivities = activityBuckets.map((bucket) => {
    const inBucket = (value: string) => {
      const key = recordDateKey(value);
      return Boolean(key) && key >= bucket.startKey && key <= bucket.endKey;
    };
    const attendanceCount = campusData.attendance.filter((item) => inBucket(item.data)).length;
    const bucketLogs = campusData.logs.filter((item) => inBucket(item.data));
    const pcCount = bucketLogs.filter((item) => {
      const action = (item.atividade || "").toLocaleLowerCase("pt-PT");
      // Count actual PC/computer session or usage events, not inventory edits.
      return /(pc|computador)/.test(action) &&
        /(utiliza[çc][ãa]o|sess[aã]o|iniciar|iniciada|terminar|terminada)/.test(action);
    }).length;
    const qrCount = bucketLogs.filter((item) => {
      const action = (item.atividade || "").toLocaleLowerCase("pt-PT");
      return action.includes("qr") ||
        (/(leitura|scan|scaneamento)/.test(action) && /(c[oó]digo|sala)/.test(action));
    }).length;
    return { ...bucket, attendanceCount, pcCount, qrCount };
  });
  const maxActivity = Math.max(1, ...weekActivities.flatMap((item) => [item.attendanceCount, item.pcCount, item.qrCount]));
  const activityTotal = weekActivities.reduce((sum, item) => sum + item.attendanceCount + item.pcCount + item.qrCount, 0);

  return <>
    <section className="stat-grid">{stats.map((stat) => <article className="stat-card" key={stat.label}><div className={"stat-icon " + stat.color}>{stat.icon}</div><div className="stat-meta">{stat.label}<span>↗</span></div><strong>{stat.value}</strong><small>{stat.change}</small></article>)}</section>
    <section className="dashboard-grid">
      <article className="surface chart-card">
        <div className="surface-heading"><div><h2>Atividade do campus</h2><p>Presenças registadas, sessões de PCs e leituras QR</p></div><select className="select-control" value={period} onChange={(event) => setPeriod(event.target.value)}><option>Esta semana</option><option>Este mês</option><option>Este período letivo</option></select></div>
        <div className="chart-legend"><span><i className="legend-dot violet-dot" />Presenças</span><span><i className="legend-dot green-dot" />Utilização de PCs</span><span><i className="legend-dot amber-dot" />Presenças por QR</span></div>
        <div className="activity-chart"><div className="chart-y"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0</span></div><div className="chart-plot"><div className="chart-grid-lines"><i /><i /><i /><i /><i /></div>
          <div className="chart-columns">{weekActivities.map((item) => <div className="chart-day" key={item.startKey} style={{ width: (100 / Math.max(1, weekActivities.length)) + "%" }}><div className="bar-group"><i className="bar bar-purple" style={{ height: (item.attendanceCount / maxActivity * 100) + "%" }} /><i className="bar bar-green" style={{ height: (item.pcCount / maxActivity * 100) + "%" }} /><i className="bar bar-amber" style={{ height: (item.qrCount / maxActivity * 100) + "%" }} /></div><small>{item.label}</small></div>)}</div>
        </div></div>
        {weekActivities.length === 0
          ? <p className="muted">Não existe um ano letivo ativo com datas válidas para apresentar este período.</p>
          : activityTotal === 0
            ? <p className="muted">Não há presenças, utilizações de PCs ou leituras QR neste período.</p>
            : null}
      </article>
      <article className="surface pc-status-card">
        <div className="surface-heading"><div><h2>Estado dos equipamentos</h2><p>Inventário real do campus</p></div><Link className="text-link" href="/computadores">Ver todos ↗</Link></div>
        <div className="pc-summary">
          <div className="donut-chart" style={{ background: "conic-gradient(" + pcCounts.map((item, index) => {
            const previous = pcCounts.slice(0, index).reduce((sum, part) => sum + part.count, 0);
            const next = previous + item.count;
            const color = item.tone === "green" ? "#35a66c" : item.tone === "red" ? "#e96b70" : item.tone === "amber" ? "#e8aa44" : "#8994a7";
            const start = computerCount ? previous / computerCount * 360 : 0;
            const finish = computerCount ? next / computerCount * 360 : 360;
            return color + " " + start + "deg " + finish + "deg";
          }).join(",") + ")" }}><div><strong>{campusData.computers.length}</strong><small>equipamentos</small></div></div>
          <div className="pc-legend">{pcCounts.map((item) => <StatusLine key={item.status} name={item.status} count={String(item.count)} color={item.tone} />)}</div>
        </div>
        <div className="pc-footnote"><span className="live-pulse" /> Estado consultado no Supabase</div>
      </article>
      <article className="surface activity-card"><div className="surface-heading"><div><h2>Atividade recente</h2><p>Últimas ações registadas no sistema</p></div><Link className="text-link" href="/logs">Ver atividade ↗</Link></div>
        <div className="activity-list">{campusData.logs.slice(0, 4).map((item, index) => <Activity key={item.id ?? (item.data + "-" + index)} icon={item.atividade.toLocaleLowerCase().includes("presença") ? "✓" : item.atividade.toLocaleLowerCase().includes("pc") ? "▣" : "▦"} tone={index === 0 ? "green" : "violet"} title={item.atividade} detail={(item.utilizador || "Sistema") + " · " + item.destino} time={new Date(item.data).toLocaleString("pt-PT")} />)}</div>
        {campusData.logs.length === 0 && <p className="muted">Ainda não existem registos de atividade.</p>}
      </article>
      <article className="surface schedule-card"><div className="surface-heading"><div><h2>Próximas aulas</h2><p>Horários registados no campus</p></div><Link className="text-link" href="/horarios">Ver horário ↗</Link></div>
        <div className="schedule-list">{upcomingLessons.map((entry, index) => <Schedule key={entry.lesson.id ?? (entry.lesson.turma + "-" + entry.lesson.hora + "-" + index)} time={(entry.lesson.hora_inicio || entry.lesson.hora).split(/[–-]/)[0].trim()} subject={entry.lesson.disciplina} className={[entry.lesson.turma, entry.lesson.dia].filter(Boolean).join(" · ")} room={entry.lesson.sala} tone={index % 2 ? "blue" : "violet"} />)}</div>
        {upcomingLessons.length === 0 && <p className="muted">{campusData.timetable.length ? "Não há próximas aulas com dia e hora válidos." : "Não existem horários registados."}</p>}
      </article>
    </section>
  </>;
}

function StatusLine({ name, count, color }: { name: string; count: string; color: string }) {
  return <div className="status-line"><span><i className={"legend-dot " + color + "-dot"} />{name}</span><strong>{count}</strong></div>;
}
function Activity({ icon, tone, title, detail, time }: { icon: string; tone: string; title: string; detail: string; time: string }) {
  return <div className="activity-row"><span className={"activity-icon " + tone}>{icon}</span><span className="activity-copy"><strong>{title}</strong><small>{detail}</small></span><time>{time}</time></div>;
}
function Schedule({ time, subject, className, room, tone }: { time: string; subject: string; className: string; room: string; tone: string }) {
  return <div className="schedule-row"><time>{time}</time><i className={"schedule-line " + tone} /><span><strong>{subject || "Aula"}</strong><small>{className || "Turma não definida"} <b>·</b> {room || "Sala não definida"}</small></span></div>;
}


function TeacherDashboard({ campusData }: { campusData: CampusData }) {
  const activeClasses = campusData.classes.filter((item) => item.estado !== "Inativa");
  const today = new Date().toISOString().slice(0, 10);
  const todayAttendance = campusData.attendance.filter((item) => item.data === today);
  const present = todayAttendance.filter((item) => item.estado === "Presente" || item.estado === "Atrasado").length;
  const presenceRate = todayAttendance.length ? Math.round((present / todayAttendance.length) * 100) : null;

  return <>
    <section className="stat-grid stat-grid-three">
      <article className="stat-card"><div className="stat-icon violet">▤</div><div className="stat-meta">Turmas atribuídas</div><strong>{activeClasses.length}</strong><small>Dados das turmas acessíveis</small></article>
      <article className="stat-card"><div className="stat-icon green">✓</div><div className="stat-meta">Presenças de hoje</div><strong>{presenceRate === null ? "—" : presenceRate + "%"}</strong><small>{todayAttendance.length} registos de hoje</small></article>
      <article className="stat-card"><div className="stat-icon amber">◷</div><div className="stat-meta">Aulas no horário</div><strong>{campusData.timetable.length}</strong><small>Horários associados à conta</small></article>
    </section>
    <section className="dashboard-grid teacher-grid">
      <article className="surface"><div className="surface-heading"><div><h2>As minhas turmas</h2><p>Turmas e disciplinas atribuídas</p></div><Link className="text-link" href="/turmas">Ver turmas ↗</Link></div>
        <div className="class-cards">{activeClasses.slice(0, 4).map((item, index) => <div className={"class-card " + (index % 2 ? "blue-edge" : "violet-edge")} key={item.id ?? item.turma}><span>{item["ano escolar"] || item.turma}</span><strong>{item.turma}</strong><small>{item.curso || "Curso não definido"}</small></div>)}</div>
        {activeClasses.length === 0 && <p className="muted">Ainda não existem turmas atribuídas à tua conta.</p>}
      </article>
      <article className="surface"><div className="surface-heading"><div><h2>Agenda</h2><p>Horários atribuídos</p></div><Link className="text-link" href="/horarios">Ver horário ↗</Link></div>
        <div className="schedule-list">{campusData.timetable.slice(0, 5).map((item, index) => <Schedule key={item.id ?? index} time={item.hora} subject={item.disciplina} className={item.turma} room={item.sala} tone={index % 2 ? "blue" : "violet"} />)}</div>
        {campusData.timetable.length === 0 && <p className="muted">Não existem horários atribuídos.</p>}
      </article>
      <article className="surface attendance-card"><div className="surface-heading"><div><h2>Presenças recentes</h2><p>Registos das tuas aulas</p></div><Link className="text-link" href="/presencas">Ver presenças ↗</Link></div>
        <div className="activity-list">{campusData.attendance.slice(0, 5).map((item, index) => <div className="activity-row" key={item.id ?? index}><span className="activity-copy"><strong>{item.aluno} · {item.turma}</strong><small>{item.data} · {item.disciplina}</small></span><span className={"pill " + statusTone(item.estado)}>{item.estado}</span></div>)}</div>
        {campusData.attendance.length === 0 && <p className="muted">Ainda não existem presenças para as turmas atribuídas.</p>}
      </article>
    </section>
  </>;
}

function StudentDashboardSummary({ campusData }: { campusData: CampusData }) {
  const today = new Date().toISOString().slice(0, 10);
  const todaysAttendance = campusData.attendance.filter((item) => item.data === today);
  const available = campusData.computers.filter((item) => item.estado === "Livre").length;

  return <>
    <section className="stat-grid stat-grid-three">
      <article className="stat-card"><div className="stat-icon violet">◷</div><div className="stat-meta">Horários disponíveis</div><strong>{campusData.timetable.length}</strong><small>Associados à tua conta</small></article>
      <article className="stat-card"><div className="stat-icon green">✓</div><div className="stat-meta">Presenças hoje</div><strong>{todaysAttendance.length}</strong><small>Registos do dia</small></article>
      <article className="stat-card"><div className="stat-icon amber">▣</div><div className="stat-meta">Equipamentos operacionais</div><strong>{available}</strong><small>Disponibilidade do campus</small></article>
    </section>
    <section className="dashboard-grid">
      <article className="surface"><div className="surface-heading"><div><h2>Próximas aulas</h2><p>Horário associado à tua conta</p></div><Link className="text-link" href="/horarios">Ver horário ↗</Link></div>
        <div className="schedule-list">{campusData.timetable.slice(0, 5).map((item, index) => <Schedule key={item.id ?? index} time={item.hora} subject={item.disciplina} className={item.turma} room={item.sala} tone={index % 2 ? "blue" : "violet"} />)}</div>
        {campusData.timetable.length === 0 && <p className="muted">Ainda não tens horários associados à conta.</p>}
      </article>
      <article className="surface"><div className="surface-heading"><div><h2>As minhas presenças</h2><p>Últimos registos</p></div><Link className="text-link" href="/presencas">Ver presenças ↗</Link></div>
        <div className="activity-list">{campusData.attendance.slice(0, 5).map((item, index) => <div className="activity-row" key={item.id ?? index}><span className="activity-copy"><strong>{item.disciplina} · {item.turma}</strong><small>{item.data} · {item.sala}</small></span><span className={"pill " + statusTone(item.estado)}>{item.estado}</span></div>)}</div>
        {campusData.attendance.length === 0 && <p className="muted">Ainda não existem presenças associadas à tua conta.</p>}
      </article>
    </section>
  </>;
}


function DataPage({
  pathname,
  title,
  role,
  records,
  allRecords,
  search,
  statusFilter,
  setStatusFilter,
  temporaryCode,
  temporaryCodeActive,
  onAdd,
  onEdit,
  onDelete,
  onStatus,
  onGenerateCode,
  onScan,
  qrCode,
  setQrCode,
}: {
  pathname: string;
  title: string;
  role: Role;
  records: RecordItem[];
  allRecords: RecordItem[];
  search: string;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  temporaryCode: TemporaryCode | null;
  temporaryCodeActive: boolean;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onStatus: (index: number, status: string) => void;
  onGenerateCode: () => void;
  onScan: (value?: string) => void;
  qrCode: string;
  setQrCode: (value: string) => void;
}) {
  const isAttendance = pathname === "/presencas";
  const canManage = role === "Administrador" || role === "Administrador Adjunto" || (role === "Professor" && pathname === "/presencas");
  const hasAction = Boolean(primaryActions[pathname]) && canManage;
  const columns = records.length ? Object.keys(records[0]).filter((column) => column !== "id" && !column.endsWith("_id") && !column.startsWith("__")) : (formFields[pathname] ?? ["nome", "descrição"]).filter((field) => field !== "palavra-passe" && !field.endsWith("_id"));
  const statuses = [...new Set(allRecords.map((record) => record.estado).filter(Boolean))];
  return <>
    <PageHeading eyebrow="GESTÃO DO CAMPUS" title={title} description={descriptionFor(pathname)} action={hasAction ? <button className="button button-primary" onClick={onAdd}><span>＋</span>{primaryActions[pathname]}</button> : undefined} />
    <div className="toolbar"><div className="result-count"><strong>{allRecords.length}</strong> registos <span>·</span> ano letivo 2026/2027</div><div className="toolbar-actions">{statuses.length > 0 && <select className="select-control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por estado"><option>Todos os estados</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select>}<button className="button button-secondary" onClick={() => downloadCsv(`${pathname.slice(1)}.csv`, allRecords)}>↓ Exportar CSV</button></div></div>
    <section className="surface table-surface"><div className="table-wrap"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}{isAttendance && <th>Presença</th>}{hasAction && <th>Ações</th>}</tr></thead><tbody>{records.map((record) => { const index = allRecords.indexOf(record); return <tr key={`${Object.values(record).join("-")}-${index}`}>{columns.map((column) => <td key={column}>{column === "código" && pathname === "/qr-code" ? <span className="qr-code-cell">{record[column]}<QrImage value={record[column]} /></span> : column === "estado" ? <span className={`pill ${statusTone(record[column])}`}>{record[column]}</span> : column === "email" ? <a className="email-link" href={`mailto:${record[column]}`}>{record[column]}</a> : column === "utilizador" && record[column] === "—" ? <span className="muted">Disponível</span> : record[column]}</td>)}{isAttendance && <td>{role === "Professor" || role === "Administrador" || role === "Administrador Adjunto" ? <select className="inline-select" aria-label={`Estado da presença de ${record.aluno}`} value={record.estado} onChange={(event) => onStatus(index, event.target.value)}><option>Presente</option><option>Atrasado</option><option>Ausente</option><option>Falta justificada</option></select> : <span className={`pill ${statusTone(record.estado)}`}>{record.estado}</span>}</td>}{hasAction && <td><div className="row-actions"><button className="button button-secondary" onClick={() => onEdit(index)}>Editar</button>{!(role === "Professor" && pathname === "/presencas") && <button className="button button-secondary" onClick={() => onDelete(index)}>Eliminar</button>}</div></td>}</tr>; })}</tbody></table>{records.length === 0 && <div className="empty-state"><span>⌕</span><strong>{search || statusFilter !== "Todos os estados" ? "Não encontrámos resultados" : "Ainda não existem registos"}</strong><p>{search || statusFilter !== "Todos os estados" ? "Altere os filtros e tente novamente." : "Adicione o primeiro registo para começar."}</p></div>}</div><div className="table-footer"><span>A mostrar <strong>{records.length}</strong> de <strong>{allRecords.length}</strong> registos</span><div><button disabled>← Anterior</button><button className="current-page">1</button><button disabled>Seguinte →</button></div></div></section>
    {pathname === "/computadores" && <section className="surface lower-panel"><div className="surface-heading"><div><h2>Estado do parque informático</h2><p>Alterar o estado de um computador</p></div><Link className="text-link" href="/pc">Abrir interface do PC ↗</Link></div><div className="pc-state-grid">{["Livre", "Manutenção", "Avariado", "Inativo"].map((state) => <span className={`pc-state ${statusTone(state)}`} key={state}><i />{state}<strong>{allRecords.filter((record) => record.estado === state).length}</strong></span>)}</div><div className="code-generator"><div><strong>{temporaryCodeActive ? temporaryCode?.code : "Sem código ativo"}</strong><small>A geração de códigos temporários ainda não está ligada à base de dados.</small></div><button className="button button-primary" onClick={onGenerateCode}>Gerar código temporário</button></div></section>}
    {pathname === "/qr-code" && <section className="surface lower-panel"><div className="surface-heading"><div><h2>Leitura rápida</h2><p>Introduza ou leia um código de sala ativo para registar a presença do utilizador atual.</p></div></div><form className="scan-row" onSubmit={(event) => { event.preventDefault(); onScan(); }}><input className="field-control" value={qrCode} onChange={(event) => setQrCode(event.target.value)} placeholder="Código do QR da sala" aria-label="Código QR da sala" /><button className="button button-primary">▦ Ler código</button><QrScanner onDetected={onScan} /></form></section>}
  </>;
}

function descriptionFor(pathname: string) {
  const descriptions: Record<string, string> = {
    "/utilizadores": "Gira contas, perfis e permissões de acesso à plataforma.",
    "/alunos": "Consulte e atualize os dados dos alunos inscritos no campus.",
    "/professor": "Professores, disciplinas atribuídas e turmas acompanhadas.",
    "/turmas": "Organize as turmas, os cursos, as salas e os diretores de turma.",
    "/disciplinas": "Gira as disciplinas e a respetiva distribuição letiva.",
    "/presencas": "Acompanhe e registe a assiduidade dos alunos por turma.",
    "/horarios": "Consulte e organize o horário semanal de aulas.",
    "/salas": "Gira os espaços, a capacidade e os equipamentos disponíveis.",
    "/computadores": "Monitorize a disponibilidade dos computadores em tempo real.",
    "/qr-code": "Crie e gira os códigos QR para salas e computadores.",
    "/logs": "Histórico de ações e eventos registados na plataforma.",
  };
  return descriptions[pathname] ?? "Consulte e gira a informação do seu campus.";
}

function statusTone(status: string) {
  if (["Presente", "Ativo", "Livre", "Disponível"].includes(status)) return "pill-green";
  if (["Atrasado", "Reservado", "Ocupada"].includes(status)) return "pill-amber";
  if (["Ausente", "Inativo", "Ocupado"].includes(status)) return "pill-red";
  return "pill-slate";
}

function RecordModal({ title, resource, fields, initialValues, onClose, onSubmit }: { title: string; resource: string; fields: string[]; initialValues?: RecordItem; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><div className="eyebrow">SMART CAMPUS</div><h2 id="modal-title">{title}</h2></div><button type="button" className="icon-button close-button" onClick={onClose} aria-label="Fechar">×</button></div><p className="modal-description">Preencha os dados abaixo. Os campos assinalados são obrigatórios.</p><form onSubmit={onSubmit}><div className="form-grid">{fields.map((field) => <label className={field === "encarregado de educação" || field === "equipamentos" || field === "observacoes" ? "form-wide" : ""} key={field}>{field.replaceAll("_", " ")}<FormInput resource={resource} field={field} initialValue={initialValues?.[field]} /></label>)}</div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary">Guardar registo</button></div></form></section></div>;
}


function FormInput({ resource, field, initialValue }: { resource: string; field: string; initialValue?: string }) {
  const lookupFields: Record<string, string> = {
    ano_letivo_id: "anos_letivos",
    professor_coordenador_id: "professores",
    sala_id: "salas",
    turma_id: "turmas",
    disciplina_turma_id: "disciplinas_turmas",
    professor_id: "professores",
    aluno_id: "alunos",
    horario_id: "horarios",
  };
  const lookupKey = lookupFields[field] ?? "";
  const [options, setOptions] = useState<RecordItem[]>([]);

  useEffect(() => {
    let active = true;
    if (!lookupKey) {
      setOptions([]);
      return () => { active = false; };
    }
    void readLookupRecords(lookupKey).then((loaded) => {
      if (active) setOptions(loaded);
    });
    return () => { active = false; };
  }, [lookupKey]);

  const optionalFields = [
    "observacoes", "equipamentos", "encarregado de educação",
    "contacto", "palavra-passe", "departamento", "piso",
    "marca", "modelo", "numero_serie", "numero_inventario",
    "descricao", "descrição",
  ];
  const common = {
    className: "field-control",
    required: !optionalFields.includes(field),
    name: field,
    defaultValue: initialValue ?? "",
  };

  if (lookupKey) {
    return <select {...common}>
      <option value="">Selecionar...</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>;
  }

  if (field === "ativo") {
    return <select {...common}><option value="true">Ativo</option><option value="false">Inativo</option></select>;
  }

  if (field === "dia_semana") {
    return <select {...common}>
      <option value="">Selecionar dia...</option>
      {[
        ["1", "Segunda-feira"], ["2", "Terça-feira"], ["3", "Quarta-feira"],
        ["4", "Quinta-feira"], ["5", "Sexta-feira"], ["6", "Sábado"], ["7", "Domingo"],
      ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>;
  }

  if (field === "estado") {
    const optionsByResource: Record<string, string[]> = {
      "/turmas": ["Ativa", "Inativa"],
      "/disciplinas": ["Ativa", "Inativa"],
      "/salas": ["Ativa", "Inativa", "Em manutenção"],
      "/presencas": ["Presente", "Atrasado", "Ausente", "Falta justificada"],
      "/computadores": ["Livre", "Manutenção", "Avariado", "Inativo"],
    };
    const choices = optionsByResource[resource] ?? ["Ativo", "Inativo"];
    return <select {...common}><option value="">Selecionar...</option>{choices.map((option) => <option key={option}>{option}</option>)}</select>;
  }

  if (field === "tipo") {
    const choices = resource === "/salas"
      ? ["Sala de aula", "Laboratório", "Sala de informática", "Sala de reuniões", "Outro"]
      : ["Computador", "Projetor", "Monitor", "Impressora", "Quadro interativo", "Outro"];
    return <select {...common}><option value="">Selecionar...</option>{choices.map((option) => <option key={option}>{option}</option>)}</select>;
  }

  if (field === "email") return <input {...common} type="email" placeholder="nome@escola.pt" />;
  if (field.toLowerCase().includes("data")) return <input {...common} type="date" />;
  if (["hora", "hora de início", "hora de fim", "hora_inicio", "hora_fim"].includes(field)) return <input {...common} type="time" />;
  if (field === "capacidade" || field === "carga_horaria_semanal") return <input {...common} type="number" min={1} />;
  if (field === "palavra-passe") return <input {...common} type="password" minLength={8} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" />;
  return <input {...common} placeholder={"Introduza " + field.replaceAll("_", " ")} />;
}



function StudentPage({
  name,
  qrCode,
  setQrCode,
  onScan,
  attendance,
  computers,
  timetable,
}: {
  name: string;
  qrCode: string;
  setQrCode: (value: string) => void;
  onScan: (value?: string) => void;
  attendance: RecordItem[];
  computers: RecordItem[];
  timetable: RecordItem[];
}) {
  const available = computers.filter((item) => item.estado === "Livre");
  const count = (state: string) => attendance.filter((item) => item.estado === state).length;
  const nextLesson = timetable[0];

  return <>
    <PageHeading eyebrow="ESPAÇO DO ALUNO" title={"Olá, " + name.split(" ")[0] + " 👋"} description="Consulta os horários e as presenças associados à tua conta." />
    <section className="student-grid">
      <article className="surface student-qr">
        <div className="qr-visual" aria-hidden="true"><span>▦</span><i>✦</i></div>
        <div className="eyebrow">ASSIDUIDADE</div>
        <h2>Regista a tua presença</h2>
        <p>Lê o código QR da sala durante uma aula que esteja no teu horário.</p>
        <label className="input-label" htmlFor="qr-input">Código da sala</label>
        <input id="qr-input" className="field-control" value={qrCode} onChange={(event) => setQrCode(event.target.value)} placeholder="Ler ou introduzir o código da sala" />
        <button className="button button-primary button-full" onClick={() => onScan()}>▦ Registar presença</button>
        <QrScanner onDetected={onScan} />
        <small className="privacy-note">A presença só é aceite para uma sala e horário válidos para a tua conta.</small>
      </article>

      <div className="student-side">
        <article className="surface next-class">
          <div className="surface-heading"><div><h2>Próxima aula</h2><p>Horário associado à tua conta</p></div><Link href="/horarios" className="text-link">Ver horário ↗</Link></div>
          {nextLesson ? <div className="next-class-main"><div className="time-badge">{nextLesson.hora.split("–")[0].trim()}<small>{nextLesson.hora.split("–")[1]?.trim() ?? ""}</small></div><div><h3>{nextLesson.disciplina || "Aula"}</h3><p>{nextLesson.professor || "Professor não definido"} · {nextLesson.turma || "Turma"}</p><p>⌂ {nextLesson.sala || "Sala não definida"}</p></div></div> : <p className="muted">Ainda não há horários associados à tua conta.</p>}
        </article>

        <article className="surface">
          <div className="surface-heading"><div><h2>Computadores operacionais</h2><p>Equipamentos operacionais registados no campus</p></div><Link href="/pc" className="text-link">Ver estação ↗</Link></div>
          <div className="available-pcs">{available.slice(0, 3).map((computer) => <span key={computer.id ?? computer.computador}><i className="legend-dot green-dot" />{computer.computador} · {computer.sala}<b>Operacional</b></span>)}{available.length === 0 && <span className="muted">Não existem computadores operacionais disponíveis para consulta.</span>}</div>
        </article>

        <article className="surface student-records" id="student-records">
          <div className="surface-heading"><div><h2>As minhas presenças</h2><p>{attendance.length} registos associados à tua conta</p></div></div>
          <div className="attendance-stats"><span><strong>{count("Presente")}</strong><small>Presentes</small></span><span><strong>{count("Atrasado")}</strong><small>Atrasos</small></span><span><strong>{count("Ausente")}</strong><small>Faltas</small></span></div>
          <div className="activity-list">{attendance.slice(0, 5).map((item, index) => <div className="activity-row" key={item.id ?? (item.data + "-" + index)}><span className="activity-copy"><strong>{item.disciplina} · {item.turma}</strong><small>{item.data} · {item.sala}</small></span><span className={"pill " + statusTone(item.estado)}>{item.estado}</span></div>)}</div>
          {attendance.length === 0 && <p className="muted">Ainda não há presenças associadas à tua conta.</p>}
        </article>
      </div>
    </section>
  </>;
}


function StaffPage({ profileName, campusData }: { profileName: string; campusData: CampusData }) {
  const activeRooms = campusData.rooms.filter((room) => room.estado === "Ativa");
  const operationalComputers = campusData.computers.filter((computer) => computer.estado === "Livre");
  const nextLesson = campusData.timetable[0];

  return <>
    <PageHeading eyebrow="OPERAÇÕES DO CAMPUS" title={"Olá, " + profileName.split(" ")[0]} description="Consulta as salas, os horários e os equipamentos visíveis para a tua função." action={<Link className="button button-primary" href="/salas">⌂ Consultar salas</Link>} />
    <section className="stat-grid stat-grid-three">
      <article className="stat-card"><div className="stat-icon green">⌂</div><div className="stat-meta">Salas ativas</div><strong>{activeRooms.length}<span className="stat-suffix"> / {campusData.rooms.length}</span></strong><small>Dados do inventário</small></article>
      <article className="stat-card"><div className="stat-icon violet">▣</div><div className="stat-meta">Equipamentos operacionais</div><strong>{operationalComputers.length}<span className="stat-suffix"> / {campusData.computers.length}</span></strong><small>Estado do inventário</small></article>
      <article className="stat-card"><div className="stat-icon amber">◷</div><div className="stat-meta">Horários visíveis</div><strong>{campusData.timetable.length}</strong><small>Registos associados</small></article>
    </section>
    <section className="dashboard-grid staff-grid">
      <article className="surface"><div className="surface-heading"><div><h2>Estado dos equipamentos</h2><p>Equipamentos registados no campus</p></div><Link className="text-link" href="/computadores">Ver todos ↗</Link></div>
        <div className="mini-pc-list">{campusData.computers.slice(0, 8).map((computer, index) => <div key={computer.id ?? index}><strong>{computer.computador}</strong><span>{computer.sala || "Sala não definida"}</span><b className={"pill " + statusTone(computer.estado)}>{computer.estado}</b></div>)}</div>
        {campusData.computers.length === 0 && <p className="muted">Não existem equipamentos para apresentar.</p>}
      </article>
      <article className="surface"><div className="surface-heading"><div><h2>Salas ativas</h2><p>Inventário dos espaços disponíveis</p></div><Link className="text-link" href="/salas">Consultar salas ↗</Link></div>
        <div className="room-occupancy">{activeRooms.slice(0, 6).map((room, index) => <div key={room.id ?? index}><span className="room-label">{room.sala}</span><strong>{room.tipo || "Sala" } · Capacidade {room.capacidade || "—"}</strong><span className="pill pill-green">Ativa</span></div>)}</div>
        {activeRooms.length === 0 && <p className="muted">Não existem salas ativas para apresentar.</p>}
      </article>
      <article className="surface"><div className="surface-heading"><div><h2>Próxima aula no horário</h2><p>Horários visíveis para a tua conta</p></div><Link className="text-link" href="/horarios">Ver horários ↗</Link></div>
        {nextLesson ? <div className="schedule-list"><Schedule time={nextLesson.hora} subject={nextLesson.disciplina} className={nextLesson.turma} room={nextLesson.sala} tone="blue" /></div> : <p className="muted">Não existem horários disponíveis para apresentar.</p>}
      </article>
    </section>
  </>;
}


function PcPage({ code, setCode, onStart, onEnd, computers, activeComputer }: { code: string; setCode: (value: string) => void; onStart: () => void; onEnd: () => void; computers: RecordItem[]; activeComputer: string }) {
  const active = computers.find((computer) => computer.computador === activeComputer);
  const sala = active?.sala ?? "Sala 101";
  return <><PageHeading eyebrow="SMART CAMPUS · ESTAÇÃO DE TRABALHO" title={activeComputer || "Estação de trabalho"} description={`${sala} · Campus principal`} /><section className="pc-station"><article className="surface station-main"><div className="station-state"><div className="checkmark">{active ? "✓" : "•"}</div><h2>{active ? "Em utilização" : "Disponível"}</h2><p>{active ? `${activeComputer} está associado a ${active.utilizador}.` : "Selecione um computador livre para iniciar a utilização."}</p></div>{active ? <div className="station-form"><button className="button button-secondary button-full" onClick={onEnd}>Terminar utilização</button></div> : <div className="station-form"><div className="eyebrow">INICIAR SESSÃO</div><h3>Introduza o código temporário</h3><p>Peça um código ativo ao professor ou funcionário do campus.</p><form onSubmit={(event) => {event.preventDefault(); onStart();}}><input className="field-control" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código de 6 dígitos" aria-label="Código temporário" required /><button className="button button-primary button-full">Começar a utilizar</button></form><small>O código expira 15 minutos após ser gerado.</small></div>}</article><article className="surface station-list"><div className="surface-heading"><div><h2>Estado dos computadores</h2><p>Disponibilidade atual</p></div><span className="live-pulse" /></div>{computers.map((computer) => <div className="station-pc" key={computer.computador}><strong>{computer.computador}</strong><span className={`pill ${statusTone(computer.estado)}`}>{computer.estado}</span></div>)}</article></section></>;
}

function dateIsInPeriod(value: string, period: string) {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const ptMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  let date: Date;
  if (isoMatch) {
    date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  } else if (ptMatch) {
    date = new Date(Number(ptMatch[3]), Number(ptMatch[2]) - 1, Number(ptMatch[1]));
  } else {
    return false;
  }

  const today = new Date();
  if (period === "Este período letivo") return date.getFullYear() === today.getFullYear();
  if (period === "Este mês") return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const finish = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return date >= start && date < finish;
}

function ReportsPage({ period, setPeriod, attendance, computers, logs }: { period: string; setPeriod: (value: string) => void; attendance: RecordItem[]; computers: RecordItem[]; logs: RecordItem[] }) {
  const [selectedClass, setSelectedClass] = useState("Todas as turmas");
  const [reportType, setReportType] = useState("Resumo geral");
  const reportAttendance = attendance.filter((item) =>
    dateIsInPeriod(item.data, period) && (selectedClass === "Todas as turmas" || item.turma === selectedClass),
  );
  const periodLogs = logs.filter((item) => dateIsInPeriod(item.data, period));
  const pcLogs = periodLogs.filter((item) => item.atividade.toLocaleLowerCase().includes("pc") || item.atividade.toLocaleLowerCase().includes("equipamento"));
  const qrLogs = periodLogs.filter((item) => item.atividade.toLocaleLowerCase().includes("qr") || item.atividade.toLocaleLowerCase().includes("presença"));
  const classes = [...new Set(attendance.map((item) => item.turma).filter(Boolean))];
  const grouped = reportAttendance.reduce<Record<string, { present: number; total: number }>>((result, item) => {
    const group = result[item.turma] ?? { present: 0, total: 0 };
    group.total += 1;
    if (item.estado === "Presente" || item.estado === "Atrasado") group.present += 1;
    result[item.turma] = group;
    return result;
  }, {});
  const exportRows = reportType === "Presenças" ? reportAttendance : reportType === "Utilização de PCs" ? pcLogs : reportType === "Scans QR" ? qrLogs : periodLogs;

  return <>
    <PageHeading eyebrow="ANÁLISE E DESEMPENHO" title="Relatórios" description="Resumo calculado a partir dos registos existentes no Supabase." action={<button className="button button-primary" onClick={() => downloadCsv("relatorio-smart-campus.csv", exportRows)}>↓ Exportar CSV</button>} />
    <section className="report-filters surface">
      <label>Período<select className="select-control" value={period} onChange={(event) => setPeriod(event.target.value)}><option>Esta semana</option><option>Este mês</option><option>Este período letivo</option></select></label>
      <label>Turma<select className="select-control" value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}><option>Todas as turmas</option>{classes.map((className) => <option key={className}>{className}</option>)}</select></label>
      <label>Tipo de relatório<select className="select-control" value={reportType} onChange={(event) => setReportType(event.target.value)}><option>Resumo geral</option><option>Presenças</option><option>Utilização de PCs</option><option>Scans QR</option></select></label>
    </section>
    <section className="stat-grid stat-grid-three">
      <article className="stat-card"><div className="stat-icon violet">✓</div><div className="stat-meta">Presenças no período</div><strong>{reportAttendance.length}</strong><small>Registos de presenças</small></article>
      <article className="stat-card"><div className="stat-icon blue">▣</div><div className="stat-meta">Equipamentos monitorizados</div><strong>{computers.length}</strong><small>Registos no inventário</small></article>
      <article className="stat-card"><div className="stat-icon amber">▦</div><div className="stat-meta">Atividades no período</div><strong>{periodLogs.length}</strong><small>Registos de atividade reais</small></article>
    </section>
    <section className="surface lower-panel">
      <div className="surface-heading"><div><h2>Resumo de assiduidade por turma</h2><p>Dados agregados · {period.toLocaleLowerCase("pt-PT")}</p></div><button className="button button-secondary" onClick={() => downloadCsv("presencas-smart-campus.csv", reportAttendance)}>↓ Descarregar CSV</button></div>
      {Object.keys(grouped).length ? <div className="report-bars">{Object.entries(grouped).map(([name, value]) => { const percentage = Math.round((value.present / value.total) * 100); return <div key={name}><span>{name}</span><i><b style={{ width: percentage + "%" }} /></i><strong>{percentage}%</strong></div>; })}</div> : <div className="empty-state"><strong>Sem dados para este período</strong><p>As presenças serão apresentadas aqui quando forem registadas.</p></div>}
    </section>
  </>;
}


function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const settings = readDemoValue("smartcampus_settings", { institution: "Escola Profissional do Infante", year: "2026/2027", email: "secretaria@escola.pt", notifications: true });
    for (const [name, value] of Object.entries(settings)) {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
        if (field instanceof HTMLInputElement && field.type === "checkbox") field.checked = Boolean(value);
        else field.value = String(value);
      }
    }
  }, []);
  return <><PageHeading eyebrow="PREFERÊNCIAS" title="Configurações" description="Personalize a experiência do Smart Campus." /><section className="surface settings-panel"><div className="surface-heading"><div><h2>Dados da escola</h2><p>Informação geral apresentada aos utilizadores</p></div></div><form ref={formRef} onSubmit={(event) => {event.preventDefault(); const values = new FormData(event.currentTarget); writeDemoValue("smartcampus_settings", { institution: String(values.get("institution") ?? ""), year: String(values.get("year") ?? ""), email: String(values.get("email") ?? ""), notifications: values.has("notifications") }); setSaved(true); window.setTimeout(() => setSaved(false), 3000);}}><div className="form-grid"><label>Nome da instituição<input className="field-control" name="institution" defaultValue="Escola Profissional do Infante" required /></label><label>Ano letivo<select className="field-control" name="year" defaultValue="2026/2027"><option>2026/2027</option><option>2027/2028</option></select></label><label>Email de contacto<input className="field-control" name="email" type="email" defaultValue="secretaria@escola.pt" /></label><label>Fuso horário<select className="field-control" defaultValue="Europe/Lisbon"><option value="Europe/Lisbon">Lisboa (GMT+00:00)</option></select></label></div><div className="settings-toggle"><div><strong>Notificações de atividade</strong><small>Receber alertas de assiduidade e computadores.</small></div><input name="notifications" aria-label="Ativar notificações" type="checkbox" defaultChecked /></div><div className="settings-footer">{saved && <span className="success-text">✓ Alterações guardadas</span>}<button className="button button-primary">Guardar alterações</button></div></form></section></>;
}
