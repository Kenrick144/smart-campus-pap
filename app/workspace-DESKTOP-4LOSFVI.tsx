"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Role = "Administrador" | "Professor" | "Aluno" | "Funcionário";
type RecordItem = Record<string, string>;

const navigation = [
  { label: "Painel principal", icon: "◫", href: "/dashboard", roles: ["Administrador", "Professor", "Funcionário"] },
  { label: "Utilizadores", icon: "♙", href: "/utilizadores", roles: ["Administrador"] },
  { label: "Alunos", icon: "◎", href: "/alunos", roles: ["Administrador", "Professor"] },
  { label: "Professores", icon: "♧", href: "/professor", roles: ["Administrador"] },
  { label: "Turmas", icon: "▤", href: "/turmas", roles: ["Administrador", "Professor"] },
  { label: "Disciplinas", icon: "▧", href: "/disciplinas", roles: ["Administrador", "Professor"] },
  { label: "Presenças", icon: "✓", href: "/presencas", roles: ["Administrador", "Professor"] },
  { label: "Horários", icon: "◷", href: "/horarios", roles: ["Administrador", "Professor", "Aluno", "Funcionário"] },
  { label: "Salas", icon: "⌂", href: "/salas", roles: ["Administrador", "Funcionário"] },
  { label: "Computadores", icon: "▣", href: "/computadores", roles: ["Administrador", "Funcionário"] },
  { label: "Códigos QR", icon: "▦", href: "/qr-code", roles: ["Administrador", "Professor", "Aluno"] },
  { label: "Relatórios", icon: "▥", href: "/relatorios", roles: ["Administrador", "Professor"] },
  { label: "Registos de atividade", icon: "≡", href: "/logs", roles: ["Administrador"] },
  { label: "Configurações", icon: "⚙", href: "/configuracoes", roles: ["Administrador"] },
];

const pageNames: Record<string, string> = {
  "/dashboard": "Painel principal",
  "/utilizadores": "Utilizadores",
  "/alunos": "Alunos",
  "/professor": "Professores",
  "/turmas": "Turmas",
  "/disciplinas": "Disciplinas",
  "/presencas": "Presenças",
  "/horarios": "Horários",
  "/salas": "Salas",
  "/computadores": "Computadores",
  "/qr-code": "Códigos QR",
  "/relatorios": "Relatórios",
  "/logs": "Registos de atividade",
  "/configuracoes": "Configurações",
  "/aluno": "Área do aluno",
  "/funcionario": "Área do funcionário",
  "/pc": "Estação de trabalho",
};

const roles: Role[] = ["Administrador", "Professor", "Aluno", "Funcionário"];

const initialData: Record<string, RecordItem[]> = {
  "/utilizadores": [
    { nome: "Maria Santos", email: "maria.santos@smartcampus.pt", perfil: "Professora", estado: "Ativo" },
    { nome: "João Silva", email: "joao.silva@smartcampus.pt", perfil: "Aluno", estado: "Ativo" },
    { nome: "Carlos Almeida", email: "carlos.almeida@smartcampus.pt", perfil: "Funcionário", estado: "Ativo" },
    { nome: "Ana Pereira", email: "ana.pereira@smartcampus.pt", perfil: "Aluna", estado: "Ativo" },
  ],
  "/alunos": [
    { nome: "João Silva", número: "2025001", turma: "12.º T1", email: "joao.silva@smartcampus.pt", estado: "Ativo" },
    { nome: "Ana Pereira", número: "2025002", turma: "12.º T1", email: "ana.pereira@smartcampus.pt", estado: "Ativo" },
    { nome: "Pedro Costa", número: "2025003", turma: "11.º T2", email: "pedro.costa@smartcampus.pt", estado: "Ativo" },
  ],
  "/professor": [
    { nome: "Maria Santos", disciplina: "Matemática", turmas: "12.º T1, 11.º T2", email: "maria.santos@smartcampus.pt", estado: "Ativo" },
    { nome: "Rita Fernandes", disciplina: "Português", turmas: "12.º T1", email: "rita.fernandes@smartcampus.pt", estado: "Ativo" },
    { nome: "Carlos Mendes", disciplina: "Informática", turmas: "10.º T1, 11.º T2", email: "carlos.mendes@smartcampus.pt", estado: "Ativo" },
  ],
  "/turmas": [
    { turma: "12.º T1", curso: "Gestão e Programação de Sistemas Informáticos", diretor: "Maria Santos", sala: "Sala 101", alunos: "24" },
    { turma: "11.º T2", curso: "Multimédia", diretor: "Rita Fernandes", sala: "Sala 202", alunos: "21" },
    { turma: "10.º T1", curso: "Informática", diretor: "Carlos Mendes", sala: "Sala 105", alunos: "23" },
  ],
  "/disciplinas": [
    { disciplina: "Matemática", código: "MAT12", professor: "Maria Santos", turmas: "12.º T1, 11.º T2", estado: "Ativa" },
    { disciplina: "Português", código: "POR12", professor: "Rita Fernandes", turmas: "12.º T1", estado: "Ativa" },
    { disciplina: "Programação", código: "INF12", professor: "Carlos Mendes", turmas: "12.º T1", estado: "Ativa" },
  ],
  "/presencas": [
    { aluno: "João Silva", turma: "12.º T1", disciplina: "Matemática", data: "08/10/2026", hora: "09:04", estado: "Presente" },
    { aluno: "Ana Pereira", turma: "12.º T1", disciplina: "Matemática", data: "08/10/2026", hora: "09:06", estado: "Atrasado" },
    { aluno: "Pedro Costa", turma: "11.º T2", disciplina: "Português", data: "08/10/2026", hora: "10:02", estado: "Ausente" },
  ],
  "/horarios": [
    { dia: "Quarta-feira", hora: "09:00 – 10:30", turma: "12.º T1", disciplina: "Matemática", professor: "Maria Santos", sala: "Sala 101" },
    { dia: "Quarta-feira", hora: "10:45 – 12:15", turma: "11.º T2", disciplina: "Informática", professor: "Carlos Mendes", sala: "Sala 202" },
    { dia: "Quarta-feira", hora: "13:30 – 15:00", turma: "12.º T1", disciplina: "Português", professor: "Rita Fernandes", sala: "Sala 101" },
  ],
  "/salas": [
    { sala: "Sala 101", edifício: "Bloco A", capacidade: "28", equipamentos: "24 computadores", estado: "Disponível" },
    { sala: "Sala 202", edifício: "Bloco B", capacidade: "25", equipamentos: "Projetor", estado: "Ocupada" },
    { sala: "Sala 105", edifício: "Bloco A", capacidade: "30", equipamentos: "Quadro interativo", estado: "Disponível" },
  ],
  "/computadores": [
    { computador: "PC-01", sala: "Sala 101", utilizador: "—", utilização: "—", estado: "Livre" },
    { computador: "PC-02", sala: "Sala 101", utilizador: "João Silva", utilização: "09:15", estado: "Ocupado" },
    { computador: "PC-03", sala: "Sala 101", utilizador: "—", utilização: "—", estado: "Livre" },
    { computador: "PC-04", sala: "Sala 202", utilizador: "—", utilização: "—", estado: "Reservado" },
    { computador: "PC-05", sala: "Sala 202", utilizador: "—", utilização: "08:00", estado: "Manutenção" },
  ],
  "/qr-code": [
    { código: "QR-S101", tipo: "Sala", destino: "Sala 101", criado: "01/09/2026", estado: "Ativo" },
    { código: "QR-PC01", tipo: "Computador", destino: "PC-01", criado: "01/09/2026", estado: "Ativo" },
    { código: "QR-S202", tipo: "Sala", destino: "Sala 202", criado: "03/09/2026", estado: "Ativo" },
  ],
  "/logs": [
    { atividade: "Presença registada", utilizador: "João Silva", destino: "12.º T1 · Matemática", data: "Hoje, 09:04" },
    { atividade: "Sessão iniciada", utilizador: "Maria Santos", destino: "Painel do professor", data: "Hoje, 08:55" },
    { atividade: "PC ocupado", utilizador: "João Silva", destino: "PC-02 · Sala 101", data: "Hoje, 09:15" },
  ],
};

const formFields: Record<string, string[]> = {
  "/utilizadores": ["nome", "email", "perfil", "palavra-passe", "estado"],
  "/alunos": ["nome", "número", "turma", "data de nascimento", "email", "encarregado de educação", "contacto", "estado"],
  "/professor": ["nome", "email", "contacto", "disciplina", "turmas", "estado"],
  "/turmas": ["turma", "curso", "diretor de turma", "sala", "ano letivo", "alunos"],
  "/disciplinas": ["disciplina", "código", "professor", "turmas", "carga horária", "estado"],
  "/presencas": ["aluno", "turma", "disciplina", "data", "hora", "estado"],
  "/horarios": ["dia", "hora de início", "hora de fim", "turma", "disciplina", "professor", "sala"],
  "/salas": ["sala", "edifício", "capacidade", "equipamentos", "estado"],
  "/computadores": ["computador", "sala", "estado"],
  "/qr-code": ["código", "tipo", "destino", "estado"],
};

const primaryActions: Record<string, string> = {
  "/utilizadores": "Adicionar utilizador",
  "/alunos": "Adicionar aluno",
  "/professor": "Adicionar professor",
  "/turmas": "Criar turma",
  "/disciplinas": "Nova disciplina",
  "/presencas": "Registar presença",
  "/horarios": "Novo horário",
  "/salas": "Adicionar sala",
  "/computadores": "Adicionar computador",
  "/qr-code": "Criar código QR",
};

const roleDestinations: Record<Role, string> = {
  Administrador: "/dashboard",
  Professor: "/dashboard",
  Aluno: "/aluno",
  Funcionário: "/funcionario",
};

const accessibleScreens: Record<Role, string[]> = {
  Administrador: Object.keys(pageNames),
  Professor: ["/dashboard", "/alunos", "/turmas", "/disciplinas", "/presencas", "/horarios", "/qr-code"],
  Aluno: ["/aluno", "/horarios", "/qr-code", "/pc", "/presencas"],
  Funcionário: ["/dashboard", "/funcionario", "/salas", "/computadores", "/horarios", "/pc"],
};

function canAccess(role: Role, pathname: string) {
  return accessibleScreens[role].includes(pathname);
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch (error) {
    console.error(`Não foi possível carregar os dados locais (${key}).`, error);
    return fallback;
  }
}

export default function Workspace() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<Role>("Administrador");
  const [profileName, setProfileName] = useState("Alexandra Costa");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");
  const [qrCode, setQrCode] = useState("");
  const [pcCode, setPcCode] = useState("");
  const [pcStatus, setPcStatus] = useState("Livre");
  const [period, setPeriod] = useState("Esta semana");
  const title = pageNames[pathname] ?? "Painel principal";

  useEffect(() => {
    const session = readStored<{ role?: Role; name?: string }>("smartcampus_session", {});
    // Hydrate the selected demo profile after the browser can read localStorage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session.role && roles.includes(session.role)) setRole(session.role);
    if (session.name) setProfileName(session.name);
    setRecords(readStored(`smartcampus_data_${pathname}`, initialData[pathname] ?? []));
    setSearch("");
    setShowForm(false);
    if (pathname === "/pc") {
      const computers = readStored<RecordItem[]>("smartcampus_data_/computadores", initialData["/computadores"]);
      const savedStatus = computers.find((computer) => computer.computador === "PC-01")?.estado ?? "Livre";
      setPcStatus(savedStatus);
    }
    if (session.role && roles.includes(session.role) && !canAccess(session.role, pathname)) {
      router.replace(roleDestinations[session.role]);
    }
  }, [pathname, router]);

  useEffect(() => {
    if (records.length) window.localStorage.setItem(`smartcampus_data_${pathname}`, JSON.stringify(records));
  }, [pathname, records]);

  const visibleNavigation = navigation.filter((item) => item.roles.includes(role));
  const filteredRecords = useMemo(() => {
    const query = search.toLocaleLowerCase("pt-PT").trim();
    return records.filter((record) => !query || Object.values(record).some((value) => value.toLocaleLowerCase("pt-PT").includes(query)));
  }, [records, search]);

  function changeRole(nextRole: Role) {
    setRole(nextRole);
    window.localStorage.setItem("smartcampus_session", JSON.stringify({ role: nextRole, name: nextRole === "Aluno" ? "João Silva" : nextRole === "Professor" ? "Maria Santos" : nextRole === "Funcionário" ? "Carlos Almeida" : "Alexandra Costa" }));
    setProfileName(nextRole === "Aluno" ? "João Silva" : nextRole === "Professor" ? "Maria Santos" : nextRole === "Funcionário" ? "Carlos Almeida" : "Alexandra Costa");
    if (!canAccess(nextRole, pathname)) router.push(roleDestinations[nextRole]);
  }

  function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const item = Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value).trim()])) as RecordItem;
    setRecords((current) => [...current, item]);
    setShowForm(false);
    setNoticeType("success");
    setNotice("Registo guardado com sucesso.");
    window.setTimeout(() => setNotice(""), 3200);
  }

  function markPresence() {
    if (!qrCode.trim()) {
      setNoticeType("error");
      setNotice("Introduza ou leia o código QR da sala.");
      return;
    }
    const codes = readStored<RecordItem[]>("smartcampus_data_/qr-code", initialData["/qr-code"]);
    const code = codes.find((item) => item.código?.toLowerCase() === qrCode.trim().toLowerCase() && item.estado === "Ativo");
    if (!code || code.tipo !== "Sala") {
      setNoticeType("error");
      setNotice(code ? "Este código é de um computador. Utilize a página da estação de trabalho." : "Código QR não reconhecido ou inativo.");
      return;
    }
    const now = new Date();
    const attendance = readStored<RecordItem[]>("smartcampus_data_/presencas", initialData["/presencas"]);
    const nextAttendance = [...attendance, {
      aluno: profileName,
      turma: "12.º T1",
      disciplina: "Matemática",
      data: new Intl.DateTimeFormat("pt-PT").format(now),
      hora: new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" }).format(now),
      estado: "Presente",
    }];
    window.localStorage.setItem("smartcampus_data_/presencas", JSON.stringify(nextAttendance));
    const logs = readStored<RecordItem[]>("smartcampus_data_/logs", initialData["/logs"]);
    logs.unshift({ atividade: "Presença registada", utilizador: profileName, destino: `${code.destino} · ${code.código}`, data: `Hoje, ${nextAttendance[nextAttendance.length - 1].hora}` });
    window.localStorage.setItem("smartcampus_data_/logs", JSON.stringify(logs));
    setNoticeType("success");
    setNotice(`Presença registada para ${profileName} · ${qrCode.trim()}`);
    setQrCode("");
  }

  function startComputer() {
    if (pcCode.replace(/\s/g, "") !== "482915") {
      setNoticeType("error");
      setNotice("Código temporário inválido. No modo de demonstração, use 482 915.");
      return;
    }
    const computers = readStored<RecordItem[]>("smartcampus_data_/computadores", initialData["/computadores"]);
    const station = computers.find((computer) => computer.computador === "PC-01");
    if (!station || station.estado !== "Livre") {
      setNoticeType("error");
      setNotice("O PC-01 não está disponível. Escolha outro computador livre.");
      return;
    }
    const nextComputers = computers.map((computer) => computer.computador === "PC-01" ? { ...computer, utilizador: profileName, utilização: new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" }).format(new Date()), estado: "Ocupado" } : computer);
    window.localStorage.setItem("smartcampus_data_/computadores", JSON.stringify(nextComputers));
    setPcStatus("Ocupado");
    const logs = readStored<RecordItem[]>("smartcampus_data_/logs", initialData["/logs"]);
    logs.unshift({ atividade: "PC ocupado", utilizador: profileName, destino: "PC-01 · Sala 101", data: `Hoje, ${new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" }).format(new Date())}` });
    window.localStorage.setItem("smartcampus_data_/logs", JSON.stringify(logs));
    setNoticeType("success");
    setNotice("Código aceite. O computador está agora associado à sua sessão.");
    setPcCode("");
  }

  function signOut() {
    window.localStorage.removeItem("smartcampus_session");
    router.push("/login");
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard" aria-label="Smart Campus — painel principal">
          <span className="brand-mark">S</span>
          <span>smart<span className="brand-light">campus</span><small>GESTÃO ESCOLAR</small></span>
        </Link>
        <div className="school-switch"><span className="school-avatar">I</span><span><strong>Escola Profissional</strong><small>Campus principal</small></span><span className="chevron">⌄</span></div>
        <div className="nav-caption">ESPAÇO DE TRABALHO</div>
        <nav className="main-nav" aria-label="Navegação principal">
          {visibleNavigation.map((item) => (
            <Link key={item.href} className={`nav-item ${pathname === item.href ? "selected" : ""}`} href={item.href} title={item.label}>
              <span className="nav-icon">{item.icon}</span>{item.label}
              {item.href === "/presencas" && <span className="nav-count">3</span>}
            </Link>
          ))}
          {role === "Aluno" && <Link className={`nav-item ${pathname === "/aluno" ? "selected" : ""}`} href="/aluno"><span className="nav-icon">◎</span>A minha área</Link>}
          {role === "Funcionário" && <Link className={`nav-item ${pathname === "/funcionario" ? "selected" : ""}`} href="/funcionario"><span className="nav-icon">⌂</span>Área de serviço</Link>}
        </nav>
        <div className="sidebar-bottom">
          <Link className="help-card" href={role === "Administrador" ? "/configuracoes" : role === "Professor" ? "/horarios" : role === "Aluno" ? "/aluno" : "/funcionario"}><span className="help-icon">?</span><span><strong>Precisa de ajuda?</strong><small>Consulte o guia do campus</small></span><span>↗</span></Link>
          <button className="profile-card" onClick={signOut}><span className="avatar avatar-purple">{role === "Administrador" ? "AC" : role === "Professor" ? "MS" : role === "Aluno" ? "JS" : "CA"}</span><span className="profile-text"><strong>{profileName}</strong><small>{role}</small></span><span className="profile-menu">⋯</span></button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Smart Campus</span><span>/</span><strong>{title}</strong></div>
          <div className="topbar-actions">
            <label className="top-search"><span>⌕</span><input aria-label="Pesquisar" placeholder="Pesquisar..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label>
            <button className="icon-button notifications" aria-label="Notificações">♧<i /></button>
            <span className="top-divider" />
            <label className="role-picker"><span className="sr-only">Perfil de demonstração</span><select value={role} onChange={(event) => changeRole(event.target.value as Role)}>{roles.map((item) => <option key={item}>{item}</option>)}</select></label>
            <span className="avatar avatar-purple top-avatar">{role === "Administrador" ? "AC" : role === "Professor" ? "MS" : role === "Aluno" ? "JS" : "CA"}</span>
          </div>
        </header>

        <div className="page-content">
          {notice && <div className={`notice ${noticeType === "error" ? "notice-error" : ""}`} role={noticeType === "error" ? "alert" : "status"}><span>{noticeType === "error" ? "!" : "✓"}</span>{notice}<button onClick={() => setNotice("")} aria-label="Fechar">×</button></div>}
          {pathname === "/dashboard" ? (
            <Dashboard role={role} profileName={profileName} period={period} setPeriod={setPeriod} />
          ) : pathname === "/aluno" ? (
            <StudentPage qrCode={qrCode} setQrCode={setQrCode} onScan={markPresence} />
          ) : pathname === "/funcionario" ? (
            <StaffPage />
          ) : pathname === "/pc" ? (
            <PcPage code={pcCode} setCode={setPcCode} status={pcStatus} onStart={startComputer} />
          ) : pathname === "/qr-code" && role === "Aluno" ? (
            <QrScannerPage qrCode={qrCode} setQrCode={setQrCode} onScan={markPresence} />
          ) : pathname === "/presencas" && role === "Aluno" ? (
            <StudentHistoryPage profileName={profileName} records={filteredRecords.filter((record) => record.aluno === profileName)} />
          ) : pathname === "/relatorios" ? (
            <ReportsPage period={period} setPeriod={setPeriod} />
          ) : pathname === "/configuracoes" ? (
            <SettingsPage />
          ) : (
            <DataPage role={role} pathname={pathname} title={title} records={filteredRecords} allRecords={records} search={search} onAdd={() => setShowForm(true)} onStatus={(index, status) => setRecords((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, estado: status } : item))} />
          )}
        </div>
      </section>

      {showForm && <RecordModal title={primaryActions[pathname] ?? "Adicionar registo"} fields={formFields[pathname] ?? ["nome", "descrição", "estado"]} onClose={() => setShowForm(false)} onSubmit={saveRecord} />}
    </main>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Dashboard({ role, profileName, period, setPeriod }: { role: Role; profileName: string; period: string; setPeriod: (value: string) => void }) {
  const isAdmin = role === "Administrador";
  return <>
    <PageHeading eyebrow="QUINTA-FEIRA, 8 DE OUTUBRO DE 2026" title={`Bom dia, ${profileName.split(" ")[0]} 👋`} description={isAdmin ? "Aqui está o resumo do que está a acontecer no campus hoje." : role === "Professor" ? "Consulte as suas aulas, turmas e presenças num só lugar." : "Veja o estado das salas e equipamentos do campus."} action={<button className="button button-secondary" onClick={() => window.print()}>↓ <span>Exportar resumo</span></button>} />
    {isAdmin ? <AdminDashboard period={period} setPeriod={setPeriod} /> : role === "Professor" ? <TeacherDashboard /> : <StaffPage />}
  </>;
}

function AdminDashboard({ period, setPeriod }: { period: string; setPeriod: (value: string) => void }) {
  const stats = [
    { label: "Alunos inscritos", value: "352", change: "+12 este mês", icon: "◎", color: "violet" },
    { label: "Professores", value: "28", change: "+2 este mês", icon: "♧", color: "blue" },
    { label: "Turmas ativas", value: "18", change: "Ano letivo 2026/27", icon: "▤", color: "amber" },
    { label: "PCs disponíveis", value: "35", change: "de 40 equipamentos", icon: "▣", color: "green" },
  ];
  return <>
    <section className="stat-grid">{stats.map((stat) => <article className="stat-card" key={stat.label}><div className={`stat-icon ${stat.color}`}>{stat.icon}</div><div className="stat-meta">{stat.label}<span>↗</span></div><strong>{stat.value}</strong><small><i className="positive">↗</i> {stat.change}</small></article>)}</section>
    <section className="dashboard-grid">
      <article className="surface chart-card"><div className="surface-heading"><div><h2>Atividade do campus</h2><p>Presenças, utilização de PCs e scans QR</p></div><select className="select-control" value={period} onChange={(event) => setPeriod(event.target.value)}><option>Esta semana</option><option>Este mês</option><option>Este período letivo</option></select></div><div className="chart-legend"><span><i className="legend-dot violet-dot" />Presenças</span><span><i className="legend-dot green-dot" />Utilização de PCs</span><span><i className="legend-dot amber-dot" />Scans QR</span></div><div className="activity-chart"><div className="chart-y"><span>120</span><span>90</span><span>60</span><span>30</span><span>0</span></div><div className="chart-plot"><div className="chart-grid-lines"><i /><i /><i /><i /><i /></div><div className="chart-columns">{[["seg.",68,34,23],["ter.",79,44,29],["qua.",56,39,26],["qui.",90,58,33],["sex.",73,46,21],["sáb.",25,15,10],["dom.",12,8,6]].map(([day, a, b, c]) => <div className="chart-day" key={day}><div className="bar-group"><i className="bar bar-purple" style={{height:`${a}%`}} /><i className="bar bar-green" style={{height:`${b}%`}} /><i className="bar bar-amber" style={{height:`${c}%`}} /></div><small>{day}</small></div>)}</div></div></div></article>
      <article className="surface pc-status-card"><div className="surface-heading"><div><h2>Estado dos computadores</h2><p>Atualizado agora</p></div><Link className="text-link" href="/computadores">Ver todos ↗</Link></div><div className="pc-summary"><div className="donut-chart"><div><strong>40</strong><small>equipamentos</small></div></div><div className="pc-legend"><StatusLine name="Livre" count="35" color="green" /><StatusLine name="Ocupado" count="3" color="red" /><StatusLine name="Reservado" count="1" color="amber" /><StatusLine name="Manutenção" count="1" color="slate" /></div></div><div className="pc-footnote"><span className="live-pulse" /> Monitorização em tempo real</div></article>
      <article className="surface activity-card"><div className="surface-heading"><div><h2>Atividade recente</h2><p>Últimas ações registadas no sistema</p></div><Link className="text-link" href="/logs">Ver atividade ↗</Link></div><div className="activity-list"><Activity icon="✓" tone="green" title="Presença registada" detail="João Silva · 12.º T1, Matemática" time="09:04" /><Activity icon="▣" tone="violet" title="Utilização de computador" detail="PC-02 · Sala 101" time="09:02" /><Activity icon="♙" tone="blue" title="Nova sessão iniciada" detail="Maria Santos · Professora" time="08:55" /><Activity icon="▦" tone="amber" title="Leitura de código QR" detail="Sala 101 · Entrada" time="08:49" /></div></article>
      <article className="surface schedule-card"><div className="surface-heading"><div><h2>Próximas aulas</h2><p>Agenda de hoje · 8 de outubro</p></div><Link className="text-link" href="/horarios">Ver horário ↗</Link></div><div className="schedule-list"><Schedule time="09:00" subject="Matemática" className="12.º T1" room="Sala 101" tone="violet" /><Schedule time="10:45" subject="Informática" className="11.º T2" room="Sala 202" tone="blue" /><Schedule time="13:30" subject="Português" className="12.º T1" room="Sala 101" tone="amber" /></div></article>
    </section>
  </>;
}

function StatusLine({ name, count, color }: { name: string; count: string; color: string }) { return <div className="status-line"><span><i className={`legend-dot ${color}-dot`} />{name}</span><strong>{count}</strong></div>; }
function Activity({ icon, tone, title, detail, time }: { icon: string; tone: string; title: string; detail: string; time: string }) { return <div className="activity-row"><span className={`activity-icon ${tone}`}>{icon}</span><span className="activity-copy"><strong>{title}</strong><small>{detail}</small></span><time>{time}</time></div>; }
function Schedule({ time, subject, className, room, tone }: { time: string; subject: string; className: string; room: string; tone: string }) { return <div className="schedule-row"><time>{time}</time><i className={`schedule-line ${tone}`} /><span><strong>{subject}</strong><small>{className} <b>·</b> {room}</small></span></div>; }

function TeacherDashboard() {
  return <><section className="stat-grid stat-grid-three"><article className="stat-card"><div className="stat-icon violet">▤</div><div className="stat-meta">As minhas turmas</div><strong>4</strong><small>64 alunos no total</small></article><article className="stat-card"><div className="stat-icon green">✓</div><div className="stat-meta">Presenças de hoje</div><strong>92%</strong><small>+4% face à semana passada</small></article><article className="stat-card"><div className="stat-icon amber">◷</div><div className="stat-meta">Aulas esta semana</div><strong>18</strong><small>Próxima aula às 10:45</small></article></section><section className="dashboard-grid teacher-grid"><article className="surface"><div className="surface-heading"><div><h2>As minhas turmas</h2><p>Turmas e disciplinas atribuídas</p></div><Link className="text-link" href="/turmas">Ver turmas ↗</Link></div><div className="class-cards"><div className="class-card violet-edge"><span>12.º T1</span><strong>Matemática</strong><small>24 alunos · Sala 101</small><div className="progress"><i style={{width:"86%"}} /></div><small>86% de presenças</small></div><div className="class-card blue-edge"><span>11.º T2</span><strong>Matemática</strong><small>21 alunos · Sala 202</small><div className="progress"><i style={{width:"91%"}} /></div><small>91% de presenças</small></div></div></article><article className="surface"><div className="surface-heading"><div><h2>Agenda de hoje</h2><p>As suas próximas aulas</p></div></div><div className="schedule-list"><Schedule time="09:00" subject="Matemática" className="12.º T1" room="Sala 101" tone="violet" /><Schedule time="10:45" subject="Matemática" className="11.º T2" room="Sala 202" tone="blue" /><Schedule time="14:00" subject="Apoio ao estudo" className="12.º T1" room="Sala 101" tone="amber" /></div></article><article className="surface attendance-card"><div className="surface-heading"><div><h2>Presenças · 12.º T1</h2><p>Aula de Matemática · hoje</p></div><Link className="text-link" href="/presencas">Marcar presenças ↗</Link></div><div className="attendance-stats"><span><strong>21</strong><small>Presentes</small></span><span><strong>2</strong><small>Atrasados</small></span><span><strong>1</strong><small>Ausentes</small></span></div><div className="mini-student-list"><span><i className="avatar avatar-green">JS</i>João Silva <b className="pill pill-green">Presente</b></span><span><i className="avatar avatar-blue">AP</i>Ana Pereira <b className="pill pill-amber">Atrasado</b></span><span><i className="avatar avatar-violet">PC</i>Pedro Costa <b className="pill pill-red">Ausente</b></span></div></article></section></>;
}

function DataPage({ role, pathname, title, records, allRecords, search, onAdd, onStatus }: { role: Role; pathname: string; title: string; records: RecordItem[]; allRecords: RecordItem[]; search: string; onAdd: () => void; onStatus: (index: number, status: string) => void }) {
  const isAttendance = pathname === "/presencas";
  const canManage = role === "Administrador" || role === "Funcionário" && ["/salas", "/computadores", "/horarios"].includes(pathname);
  const hasAction = Boolean(primaryActions[pathname]) && (canManage || role === "Professor" && isAttendance);
  const canUpdateStatus = role === "Administrador" && isAttendance || role === "Professor" && isAttendance || role === "Funcionário" && pathname === "/computadores";
  const columns = records.length ? Object.keys(records[0]) : (formFields[pathname] ?? ["nome", "descrição"]).filter((field) => field !== "palavra-passe");
  return <>
    <PageHeading eyebrow="GESTÃO DO CAMPUS" title={title} description={role === "Professor" && pathname !== "/presencas" ? `Consulte ${title.toLocaleLowerCase("pt-PT")} associados às suas turmas.` : descriptionFor(pathname)} action={hasAction ? <button className="button button-primary" onClick={onAdd}><span>＋</span>{primaryActions[pathname]}</button> : undefined} />
    <div className="toolbar"><div className="result-count"><strong>{allRecords.length}</strong> registos <span>·</span> ano letivo 2026/2027</div><div className="toolbar-actions"><select className="select-control"><option>Todos os estados</option><option>Ativo</option><option>Inativo</option></select><button className="button button-secondary" onClick={() => window.print()}>↓ Exportar</button></div></div>
    <section className="surface table-surface"><div className="table-wrap"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}{canUpdateStatus && <th>Ação</th>}</tr></thead><tbody>{records.map((record, index) => <tr key={`${Object.values(record).join("-")}-${index}`}>{columns.map((column) => <td key={column}>{column === "estado" && role === "Funcionário" && pathname === "/computadores" ? <select className="inline-select" aria-label={`Estado de ${record.computador}`} value={record[column]} onChange={(event) => onStatus(allRecords.indexOf(record), event.target.value)}>{["Livre", "Ocupado", "Reservado", "Manutenção"].map((status) => <option key={status}>{status}</option>)}</select> : column === "estado" ? <span className={`pill ${statusTone(record[column])}`}>{record[column]}</span> : column === "email" ? <a className="email-link" href={`mailto:${record[column]}`}>{record[column]}</a> : column === "utilizador" && record[column] === "—" ? <span className="muted">Disponível</span> : record[column]}</td>)}{canUpdateStatus && isAttendance && <td><select className="inline-select" aria-label={`Estado da presença de ${record.aluno}`} value={record.estado} onChange={(event) => onStatus(allRecords.indexOf(record), event.target.value)}><option>Presente</option><option>Atrasado</option><option>Ausente</option></select></td>}</tr>)}</tbody></table>{records.length === 0 && <div className="empty-state"><span>⌕</span><strong>{search ? "Não encontrámos resultados" : "Ainda não existem registos"}</strong><p>{search ? "Experimente outro termo de pesquisa." : "Adicione o primeiro registo para começar."}</p></div>}</div><div className="table-footer"><span>A mostrar <strong>{records.length}</strong> de <strong>{allRecords.length}</strong> registos</span><div><button disabled>← Anterior</button><button className="current-page">1</button><button disabled>Seguinte →</button></div></div></section>
    {pathname === "/computadores" && <section className="surface lower-panel"><div className="surface-heading"><div><h2>Estado do parque informático</h2><p>Alterar o estado de um computador</p></div><Link className="text-link" href="/pc">Abrir interface do PC ↗</Link></div><div className="pc-state-grid">{["Livre", "Ocupado", "Reservado", "Manutenção"].map((state) => <span className={`pc-state ${statusTone(state)}`} key={state}><i />{state}<strong>{allRecords.filter((record) => record.estado === state).length}</strong></span>)}</div></section>}
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

function RecordModal({ title, fields, onClose, onSubmit }: { title: string; fields: string[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><div className="eyebrow">SMART CAMPUS</div><h2 id="modal-title">{title}</h2></div><button className="icon-button close-button" onClick={onClose} aria-label="Fechar">×</button></div><p className="modal-description">Preencha os dados abaixo. Os campos assinalados são obrigatórios.</p><form onSubmit={onSubmit}><div className="form-grid">{fields.map((field) => <label className={field === "encarregado de educação" || field === "equipamentos" ? "form-wide" : ""} key={field}>{field}<FormInput field={field} /></label>)}</div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary">Guardar registo</button></div></form></section></div>;
}

function FormInput({ field }: { field: string }) {
  const common = { className: "field-control", required: !["equipamentos", "encarregado de educação", "contacto"].includes(field), name: field };
  if (field === "palavra-passe") return <input {...common} type="password" minLength={8} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" />;
  if (field === "email") return <input {...common} type="email" placeholder="nome@escola.pt" />;
  if (field.includes("data")) return <input {...common} type="date" />;
  if (["hora", "hora de início", "hora de fim"].includes(field)) return <input {...common} type="time" />;
  if (field === "estado" || field === "perfil" || field === "tipo") {
    const options = field === "perfil" ? ["Aluno", "Professor", "Funcionário", "Administrador"] : field === "tipo" ? ["Sala", "Computador"] : field === "estado" ? ["Ativo", "Inativo", "Presente", "Ausente", "Atrasado", "Livre", "Ocupado", "Reservado", "Manutenção"] : [];
    return <select {...common}><option value="">Selecione...</option>{options.map((option) => <option key={option}>{option}</option>)}</select>;
  }
  return <input {...common} placeholder={`Introduza ${field}`} />;
}

function StudentPage({ qrCode, setQrCode, onScan }: { qrCode: string; setQrCode: (value: string) => void; onScan: () => void }) {
  return <><PageHeading eyebrow="ESPAÇO DO ALUNO" title="Olá, João 👋" description="Tudo o que precisa para o seu dia no campus." /><section className="student-grid"><article className="surface student-qr"><div className="qr-visual" aria-hidden="true"><span>▦</span><i>✦</i></div><div className="eyebrow">ASSIDUIDADE</div><h2>Registe a sua presença</h2><p>Leia o código QR da sala ou introduza o código para confirmar a sua presença.</p><label className="input-label" htmlFor="qr-input">Código da sala</label><input id="qr-input" className="field-control" value={qrCode} onChange={(event) => setQrCode(event.target.value)} placeholder="Ex.: QR-S101" /><button className="button button-primary button-full" onClick={onScan}>▦ Registar presença</button><small className="privacy-note">O registo fica associado à sua conta e à aula atual.</small></article><div className="student-side"><article className="surface next-class"><div className="surface-heading"><div><h2>Próxima aula</h2><p>Quinta-feira, 8 de outubro</p></div><span className="pill pill-green">A decorrer</span></div><div className="next-class-main"><div className="time-badge">09:00<small>10:30</small></div><div><h3>Matemática</h3><p>Maria Santos · 12.º T1</p><p>⌂ Sala 101</p></div></div></article><article className="surface"><div className="surface-heading"><div><h2>Computadores disponíveis</h2><p>Na sala onde está a decorrer a aula</p></div><Link href="/pc" className="text-link">Usar PC ↗</Link></div><div className="available-pcs"><span><i className="legend-dot green-dot" />PC-01 <b>Disponível</b></span><span><i className="legend-dot green-dot" />PC-03 <b>Disponível</b></span><span className="muted">+ 33 computadores disponíveis</span></div></article><article className="surface student-records"><div className="surface-heading"><div><h2>As minhas presenças</h2><p>Resumo desta semana</p></div><Link href="/presencas" className="text-link">Ver histórico ↗</Link></div><div className="attendance-stats"><span><strong>18</strong><small>Presentes</small></span><span><strong>1</strong><small>Atrasada</small></span><span><strong>1</strong><small>Ausente</small></span></div></article></div></section></>;
}

function QrScannerPage({ qrCode, setQrCode, onScan }: { qrCode: string; setQrCode: (value: string) => void; onScan: () => void }) {
  return <><PageHeading eyebrow="ÁREA DO ALUNO" title="Ler código QR" description="Registe a presença na aula ou inicie a utilização de um computador." /><section className="surface student-qr qr-scan-page"><div className="qr-visual" aria-hidden="true"><span>▦</span><i>✦</i></div><div className="eyebrow">LEITURA DE CÓDIGO</div><h2>Aponte a câmara ao código da sala</h2><p>Em alternativa, introduza o código impresso junto à entrada da sala.</p><label className="input-label" htmlFor="qr-scan-input">Código da sala ou computador</label><input id="qr-scan-input" className="field-control" value={qrCode} onChange={(event) => setQrCode(event.target.value)} placeholder="Ex.: QR-S101" /><button className="button button-primary button-full" onClick={onScan}>Validar código e registar</button><small className="privacy-note">A leitura de câmara será ativada quando a aplicação estiver ligada ao serviço QR do campus.</small></section></>;
}

function StudentHistoryPage({ profileName, records }: { profileName: string; records: RecordItem[] }) {
  return <><PageHeading eyebrow="ESPAÇO DO ALUNO" title="As minhas presenças" description={`Histórico de assiduidade de ${profileName}.`} /><section className="stat-grid stat-grid-three"><article className="stat-card"><div className="stat-icon green">✓</div><div className="stat-meta">Presente</div><strong>{records.filter((record) => record.estado === "Presente").length}</strong><small>Presenças registadas</small></article><article className="stat-card"><div className="stat-icon amber">◷</div><div className="stat-meta">Atrasado</div><strong>{records.filter((record) => record.estado === "Atrasado").length}</strong><small>Entradas após o início</small></article><article className="stat-card"><div className="stat-icon violet">▤</div><div className="stat-meta">Registos</div><strong>{records.length}</strong><small>Este período</small></article></section><section className="surface table-surface"><div className="table-wrap"><table className="data-table"><thead><tr><th>Data</th><th>Disciplina</th><th>Turma</th><th>Hora</th><th>Estado</th></tr></thead><tbody>{records.map((record, index) => <tr key={`${record.data}-${record.disciplina}-${index}`}><td>{record.data}</td><td>{record.disciplina}</td><td>{record.turma}</td><td>{record.hora}</td><td><span className={`pill ${statusTone(record.estado)}`}>{record.estado}</span></td></tr>)}</tbody></table>{records.length === 0 && <div className="empty-state"><span>✓</span><strong>Ainda não tem presenças registadas</strong><p>Os registos das suas aulas aparecerão aqui.</p></div>}</div></section></>;
}

function StaffPage() {
  return <><PageHeading eyebrow="OPERAÇÕES DO CAMPUS" title="Bom dia, Carlos 👋" description="Acompanhe salas, horários e equipamentos do campus." action={<Link className="button button-primary" href="/salas">⌂ Gerir salas</Link>} /><section className="stat-grid stat-grid-three"><article className="stat-card"><div className="stat-icon green">⌂</div><div className="stat-meta">Salas disponíveis</div><strong>18<span className="stat-suffix"> / 24</span></strong><small>6 salas ocupadas agora</small></article><article className="stat-card"><div className="stat-icon violet">▣</div><div className="stat-meta">Computadores livres</div><strong>35<span className="stat-suffix"> / 40</span></strong><small>3 em utilização · 1 manutenção</small></article><article className="stat-card"><div className="stat-icon amber">◷</div><div className="stat-meta">Próxima aula</div><strong>10:45</strong><small>Informática · Sala 202</small></article></section><section className="dashboard-grid staff-grid"><article className="surface"><div className="surface-heading"><div><h2>Estado dos computadores</h2><p>Monitorização por sala</p></div><Link className="text-link" href="/computadores">Ver todos ↗</Link></div><div className="mini-pc-list">{["PC-01|Sala 101|Livre","PC-02|Sala 101|Ocupado","PC-03|Sala 101|Livre","PC-04|Sala 202|Reservado","PC-05|Sala 202|Manutenção"].map((line) => { const [pc, room, state] = line.split("|"); return <div key={pc}><strong>{pc}</strong><span>{room}</span><b className={`pill ${statusTone(state)}`}>{state}</b></div>; })}</div></article><article className="surface"><div className="surface-heading"><div><h2>Salas em utilização</h2><p>Ocupação atual no campus</p></div><Link className="text-link" href="/salas">Gerir salas ↗</Link></div><div className="room-occupancy"><div><span className="room-label">Sala 101</span><strong>Matemática · 12.º T1</strong><span className="pill pill-amber">Em aula</span></div><div><span className="room-label">Sala 202</span><strong>Informática · 11.º T2</strong><span className="pill pill-amber">Em aula</span></div><div><span className="room-label">Sala 105</span><strong>Sem aulas agendadas</strong><span className="pill pill-green">Disponível</span></div></div></article></section></>;
}

function PcPage({ code, setCode, status, onStart }: { code: string; setCode: (value: string) => void; status: string; onStart: () => void }) {
  const available = status === "Livre";
  return <><PageHeading eyebrow="SMART CAMPUS · ESTAÇÃO DE TRABALHO" title="PC-01" description="Sala 101 · Campus principal" /><section className="pc-station"><article className="surface station-main"><div className="station-state"><div className={`checkmark ${available ? "" : "station-busy"}`}>{available ? "✓" : "•"}</div><h2 className={available ? "" : "station-busy-text"}>{available ? "Disponível" : status}</h2><p>{available ? "Este computador está livre para utilização." : "Este computador já está associado a uma sessão."}</p></div><div className="station-form"><div className="eyebrow">INICIAR SESSÃO</div><h3>Introduza o seu código temporário</h3><p>Peça o código ao seu professor para associar este computador à sua conta.</p><form onSubmit={(event) => {event.preventDefault(); onStart();}}><input className="field-control" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Ex.: 482 915" aria-label="Código temporário" /><button className="button button-primary button-full" disabled={!available}>Começar a utilizar</button></form><small>Código de demonstração: 482 915 · Ao terminar, o PC fica livre para outro aluno.</small></div></article><article className="surface station-list"><div className="surface-heading"><div><h2>Estado dos PCs na Sala 101</h2><p>Disponibilidade atual</p></div><span className="live-pulse" /></div>{["PC-01", "PC-02", "PC-03", "PC-04", "PC-05"].map((name) => {const state = name === "PC-01" ? status : name === "PC-02" ? "Ocupado" : name === "PC-03" ? "Livre" : name === "PC-04" ? "Reservado" : "Manutenção"; return <div className="station-pc" key={name}><strong>{name}</strong><span className={`pill ${statusTone(state)}`}>{state}</span></div>;})}</article></section></>;
}

function ReportsPage({ period, setPeriod }: { period: string; setPeriod: (value: string) => void }) {
  return <><PageHeading eyebrow="ANÁLISE E DESEMPENHO" title="Relatórios" description="Acompanhe a atividade e a assiduidade do campus." action={<button className="button button-primary" onClick={() => window.print()}>↓ Exportar relatório</button>} /><section className="report-filters surface"><label>Período<select className="select-control" value={period} onChange={(event) => setPeriod(event.target.value)}><option>Esta semana</option><option>Este mês</option><option>Este período letivo</option></select></label><label>Turma<select className="select-control"><option>Todas as turmas</option><option>12.º T1</option><option>11.º T2</option></select></label><label>Tipo de relatório<select className="select-control"><option>Resumo geral</option><option>Presenças</option><option>Utilização de PCs</option><option>Scans QR</option></select></label></section><section className="stat-grid stat-grid-three"><article className="stat-card"><div className="stat-icon violet">✓</div><div className="stat-meta">Presenças registadas</div><strong>1 284</strong><small>+8,4% face ao período anterior</small></article><article className="stat-card"><div className="stat-icon blue">▣</div><div className="stat-meta">Utilizações de PCs</div><strong>436</strong><small>40 computadores monitorizados</small></article><article className="stat-card"><div className="stat-icon amber">▦</div><div className="stat-meta">Leituras de QR</div><strong>672</strong><small>Em 24 salas do campus</small></article></section><section className="surface lower-panel"><div className="surface-heading"><div><h2>Resumo de assiduidade por turma</h2><p>Dados agregados · {period.toLocaleLowerCase("pt-PT")}</p></div><button className="button button-secondary" onClick={() => window.print()}>↓ Descarregar CSV</button></div><div className="report-bars">{[["12.º T1","94%"],["11.º T2","88%"],["10.º T1","91%"],["12.º T2","82%"]].map(([name, value]) => <div key={name}><span>{name}</span><i><b style={{width:value}} /></i><strong>{value}</strong></div>)}</div></section></>;
}

function SettingsPage() {
  const [saved, setSaved] = useState(false);
  return <><PageHeading eyebrow="PREFERÊNCIAS" title="Configurações" description="Personalize a experiência do Smart Campus." /><section className="surface settings-panel"><div className="surface-heading"><div><h2>Dados da escola</h2><p>Informação geral apresentada aos utilizadores</p></div></div><form onSubmit={(event) => {event.preventDefault(); setSaved(true); window.setTimeout(() => setSaved(false), 3000);}}><div className="form-grid"><label>Nome da instituição<input className="field-control" defaultValue="Escola Profissional do Infante" required /></label><label>Ano letivo<select className="field-control" defaultValue="2026/2027"><option>2026/2027</option><option>2027/2028</option></select></label><label>Email de contacto<input className="field-control" type="email" defaultValue="secretaria@escola.pt" /></label><label>Fuso horário<select className="field-control" defaultValue="Europe/Lisbon"><option value="Europe/Lisbon">Lisboa (GMT+01:00)</option></select></label></div><div className="settings-toggle"><div><strong>Notificações de atividade</strong><small>Receber alertas de assiduidade e computadores.</small></div><input aria-label="Ativar notificações" type="checkbox" defaultChecked /></div><div className="settings-footer">{saved && <span className="success-text">✓ Alterações guardadas</span>}<button className="button button-primary">Guardar alterações</button></div></form></section></>;
}
