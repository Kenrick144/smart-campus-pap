"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { appendDemoLog, downloadCsv, readDemoRecords, readDemoValue, writeDemoRecords, writeDemoValue } from "./lib/demo-data";
import { QrImage, QrScanner } from "./qr-tools";

type Role = "Administrador" | "Professor" | "Aluno" | "Funcionário";
type RecordItem = Record<string, string>;
type DemoSession = { role: Role; name: string; email?: string };
type TemporaryCode = { code: string; expiresAt: number };
type CampusData = {
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
  { label: "Painel principal", icon: "◫", href: "/dashboard", roles: ["Administrador", "Professor", "Funcionário"] },
  { label: "Utilizadores", icon: "♙", href: "/utilizadores", roles: ["Administrador"] },
  { label: "Alunos", icon: "◎", href: "/alunos", roles: ["Administrador", "Professor"] },
  { label: "Professores", icon: "♧", href: "/professor", roles: ["Administrador"] },
  { label: "Turmas", icon: "▤", href: "/turmas", roles: ["Administrador", "Professor"] },
  { label: "Disciplinas", icon: "▧", href: "/disciplinas", roles: ["Administrador", "Professor"] },
  { label: "Presenças", icon: "✓", href: "/presencas", roles: ["Administrador", "Professor"] },
  { label: "Horários", icon: "◷", href: "/horarios", roles: ["Administrador", "Professor", "Aluno", "Funcionário"] },
  { label: "Salas", icon: "⌂", href: "/salas", roles: ["Administrador", "Funcionário"] },
  { label: "Computadores", icon: "▣", href: "/computadores", roles: ["Administrador", "Professor", "Funcionário"] },
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

const roleRoutes: Record<Role, string[]> = {
  Administrador: Object.keys(pageNames),
  Professor: ["/dashboard", "/alunos", "/turmas", "/disciplinas", "/presencas", "/horarios", "/computadores", "/qr-code", "/relatorios"],
  Aluno: ["/aluno", "/horarios", "/qr-code"],
  Funcionário: ["/dashboard", "/funcionario", "/horarios", "/salas", "/computadores"],
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

export default function Workspace() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<Role>("Administrador");
  const [profileName, setProfileName] = useState("Alexandra Costa");
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
  const [temporaryCode, setTemporaryCode] = useState<TemporaryCode | null>(null);
  const [temporaryCodeActive, setTemporaryCodeActive] = useState(false);
  const [pcRecords, setPcRecords] = useState<RecordItem[]>(initialData["/computadores"]);
  const [activeComputer, setActiveComputer] = useState("");
  const [period, setPeriod] = useState("Esta semana");
  const title = pageNames[pathname] ?? "Painel principal";

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const session = readDemoValue<Partial<DemoSession>>("smartcampus_session", {});
      if (!session.role || !roles.includes(session.role) || !session.name) {
        if (pathname !== "/pc") {
          router.replace("/login");
          return;
        }
      } else {
        setRole(session.role);
        setProfileName(session.name);
        if (pathname !== "/pc" && !roleRoutes[session.role].includes(pathname)) {
          router.replace(roleDestinations[session.role]);
          return;
        }
      }

      setRecords(readDemoRecords(pathname, initialData[pathname] ?? []));
      setRecordsPath(pathname);
      setPcRecords(readDemoRecords("/computadores", initialData["/computadores"]));
      const storedCode = readDemoValue<TemporaryCode | null>("smartcampus_pc_access_code", null);
      setTemporaryCode(storedCode);
      setTemporaryCodeActive(Boolean(storedCode && storedCode.expiresAt > Date.now()));
      setActiveComputer(readDemoValue<string>("smartcampus_active_pc", ""));
      setSearch("");
      setStatusFilter("Todos os estados");
      setShowForm(false);
      setEditingIndex(null);
      setSessionReady(true);
    });
    return () => { active = false; };
  }, [pathname, router]);

  useEffect(() => {
    if (recordsPath === pathname) writeDemoRecords(pathname, records);
  }, [pathname, records, recordsPath]);

  const visibleNavigation = navigation.filter((item) => item.roles.includes(role));
  const filteredRecords = useMemo(() => {
    const query = search.toLocaleLowerCase("pt-PT").trim();
    return records.filter((record) =>
      (statusFilter === "Todos os estados" || record.estado === statusFilter) &&
      (!query || Object.values(record).some((value) => value.toLocaleLowerCase("pt-PT").includes(query))),
    );
  }, [records, search, statusFilter]);
  function changeRole(nextRole: Role) {
    setRole(nextRole);
    const demoName = nextRole === "Aluno" ? "João Silva" : nextRole === "Professor" ? "Maria Santos" : nextRole === "Funcionário" ? "Carlos Almeida" : "Alexandra Costa";
    writeDemoValue("smartcampus_session", { role: nextRole, name: demoName });
    setProfileName(demoName);
    if (pathname !== "/pc" && !roleRoutes[nextRole].includes(pathname)) router.push(roleDestinations[nextRole]);
  }

  function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const item = Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value).trim()])) as RecordItem;
    const duplicate = records.some((record, index) =>
      index !== editingIndex &&
      ((item.email && record.email?.toLocaleLowerCase() === item.email.toLocaleLowerCase()) ||
        (item.número && record.número === item.número) ||
        (item.computador && record.computador?.toLocaleLowerCase() === item.computador.toLocaleLowerCase()) ||
        (item.código && record.código?.toLocaleLowerCase() === item.código.toLocaleLowerCase())),
    );
    if (duplicate) {
      setNotice("Já existe um registo com esse email, número ou código.");
      return;
    }

    const updated = editingIndex === null
      ? [...records, item]
      : records.map((record, index) => index === editingIndex ? item : record);
    setRecords(updated);
    appendDemoLog(editingIndex === null ? "Registo criado" : "Registo atualizado", profileName, `${title}: ${Object.values(item)[0] ?? "registo"}`);

    if (pathname === "/utilizadores" && ["Aluno", "Aluna"].includes(item.perfil)) {
      const students = readDemoRecords("/alunos", initialData["/alunos"]);
      if (item.email && !students.some((student) => student.email === item.email)) {
        writeDemoRecords("/alunos", [...students, { nome: item.nome, email: item.email, turma: "", número: "", estado: item.estado || "Ativo" }]);
      }
    }
    setShowForm(false);
    setEditingIndex(null);
    setNotice(editingIndex === null ? "Registo guardado com sucesso." : "Registo atualizado com sucesso.");
  }

  function deleteRecord(index: number) {
    const item = records[index];
    if (!item || !window.confirm(`Pretende eliminar o registo "${Object.values(item)[0]}"?`)) return;
    setRecords((current) => current.filter((_, itemIndex) => itemIndex !== index));
    appendDemoLog("Registo eliminado", profileName, `${title}: ${Object.values(item)[0] ?? "registo"}`);
    setNotice("Registo eliminado.");
  }

  function updateAttendance(index: number, status: string) {
    const item = records[index];
    setRecords((current) => current.map((record, itemIndex) => itemIndex === index ? { ...record, estado: status } : record));
    if (item) appendDemoLog("Presença atualizada", profileName, `${item.aluno}: ${status}`);
  }

  function markPresence(scannedCode?: string) {
    const submittedCode = (scannedCode ?? qrCode).trim();
    if (!submittedCode) {
      setNotice("Introduza ou leia o código QR da sala.");
      return;
    }
    const code = submittedCode.toLocaleUpperCase();
    const qrCodes = readDemoRecords("/qr-code", initialData["/qr-code"]);
    const qr = qrCodes.find((item) => item.código.toLocaleUpperCase() === code && item.estado === "Ativo");
    if (!qr) {
      setNotice("Código QR inválido ou inativo. Verifique o código e tente novamente.");
      return;
    }
    if (qr.tipo !== "Sala") {
      setNotice("Este código identifica um computador. Utilize o código da sala para marcar presença.");
      return;
    }

    const now = new Date();
    const date = now.toLocaleDateString("pt-PT");
    const timetable = readDemoRecords("/horarios", initialData["/horarios"]);
    const lesson = timetable.find((item) => item.sala === qr.destino);
    const existing = readDemoRecords("/presencas", initialData["/presencas"]);
    if (existing.some((item) => item.aluno === profileName && item.data === date && item.sala === qr.destino)) {
      setNotice("A sua presença nesta sala já foi registada hoje.");
      return;
    }
    const startTime = lesson?.hora.split("–")[0].trim() ?? "09:00";
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const late = now.getHours() * 60 + now.getMinutes() > startHour * 60 + startMinute + 10;
    const attendance = {
      aluno: profileName,
      turma: lesson?.turma ?? "12.º T1",
      disciplina: lesson?.disciplina ?? "Aula",
      sala: qr.destino,
      data: date,
      hora: now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
      estado: late ? "Atrasado" : "Presente",
    };
    writeDemoRecords("/presencas", [attendance, ...existing]);
    appendDemoLog("Presença registada", profileName, `${attendance.turma} · ${attendance.disciplina} · ${qr.destino}`);
    setNotice(`Presença registada em ${qr.destino}.`);
    setQrCode("");
  }

  function startComputer() {
    if (!sessionReady || role !== "Aluno") {
      setNotice("Inicie sessão com um perfil de aluno antes de utilizar um computador.");
      return;
    }
    if (!pcCode.trim()) {
      setNotice("Introduza o código temporário fornecido pelo professor.");
      return;
    }
    const accessCode = readDemoValue<TemporaryCode | null>("smartcampus_pc_access_code", null);
    if (!accessCode || accessCode.expiresAt < Date.now() || pcCode.trim() !== accessCode.code) {
      setNotice("Código inválido ou expirado. Peça um novo código ao professor.");
      return;
    }
    const available = pcRecords.find((computer) => computer.estado === "Livre");
    if (!available) {
      setNotice("Não existem computadores livres neste momento.");
      return;
    }
    const updated = pcRecords.map((computer) => computer.computador === available.computador
      ? { ...computer, estado: "Ocupado", utilizador: profileName, utilização: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) }
      : computer);
    writeDemoRecords("/computadores", updated);
    writeDemoValue("smartcampus_active_pc", available.computador);
    setPcRecords(updated);
    setActiveComputer(available.computador);
    appendDemoLog("PC ocupado", profileName, `${available.computador} · ${available.sala}`);
    setNotice(`${available.computador} está agora associado à sua sessão.`);
    setPcCode("");
  }

  function endComputerSession() {
    if (!activeComputer) return;
    const updated = pcRecords.map((computer) => computer.computador === activeComputer
      ? { ...computer, estado: "Livre", utilizador: "—", utilização: "—" }
      : computer);
    writeDemoRecords("/computadores", updated);
    window.localStorage.removeItem("smartcampus_active_pc");
    setPcRecords(updated);
    setActiveComputer("");
    appendDemoLog("Sessão de PC terminada", profileName, activeComputer);
    setNotice(`${activeComputer} está novamente livre.`);
  }

  function generateTemporaryCode() {
    const value = { code: String(Math.floor(100000 + Math.random() * 900000)), expiresAt: Date.now() + 15 * 60 * 1000 };
    writeDemoValue("smartcampus_pc_access_code", value);
    setTemporaryCode(value);
    setTemporaryCodeActive(true);
    window.setTimeout(() => setTemporaryCodeActive(false), 15 * 60 * 1000);
    setNotice("Código temporário gerado. É válido durante 15 minutos.");
  }

  function signOut() {
    window.localStorage.removeItem("smartcampus_session");
    router.push("/login");
  }

  if (!sessionReady || recordsPath !== pathname) return <main className="login-screen" aria-busy="true"><p>A carregar o espaço de trabalho...</p></main>;

  const campusData: CampusData = {
    students: readDemoRecords("/alunos", initialData["/alunos"]),
    teachers: readDemoRecords("/professor", initialData["/professor"]),
    classes: readDemoRecords("/turmas", initialData["/turmas"]),
    computers: pcRecords,
    attendance: readDemoRecords("/presencas", initialData["/presencas"]),
    rooms: readDemoRecords("/salas", initialData["/salas"]),
    timetable: readDemoRecords("/horarios", initialData["/horarios"]),
    logs: readDemoRecords("/logs", initialData["/logs"]),
  };

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
          <Link className="help-card" href="/configuracoes"><span className="help-icon">?</span><span><strong>Precisa de ajuda?</strong><small>Consulte o guia do campus</small></span><span>↗</span></Link>
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
          {notice && <div className="notice" role="status"><span>✓</span>{notice}<button onClick={() => setNotice("")} aria-label="Fechar">×</button></div>}
          {pathname === "/dashboard" ? (
            <Dashboard role={role} profileName={profileName} period={period} setPeriod={setPeriod} campusData={campusData} />
          ) : pathname === "/aluno" ? (
            <StudentPage name={profileName} qrCode={qrCode} setQrCode={setQrCode} onScan={markPresence} />
          ) : pathname === "/funcionario" ? (
            <StaffPage />
          ) : pathname === "/pc" ? (
            <PcPage code={pcCode} setCode={setPcCode} onStart={startComputer} onEnd={endComputerSession} computers={pcRecords} activeComputer={activeComputer} />
          ) : pathname === "/relatorios" ? (
            <ReportsPage period={period} setPeriod={setPeriod} attendance={readDemoRecords("/presencas", initialData["/presencas"])} computers={pcRecords} />
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

function Dashboard({ role, profileName, period, setPeriod, campusData }: { role: Role; profileName: string; period: string; setPeriod: (value: string) => void; campusData: CampusData }) {
  const isAdmin = role === "Administrador";
  return <>
    <PageHeading eyebrow="RESUMO DIÁRIO DO CAMPUS" title={`Bom dia, ${profileName.split(" ")[0]} 👋`} description={isAdmin ? "Aqui está o resumo do que está a acontecer no campus hoje." : role === "Professor" ? "Consulte as suas turmas, horários e presenças num só lugar." : "Veja o estado das salas e equipamentos do campus."} action={<button className="button button-secondary" onClick={() => window.print()}>↓ <span>Exportar resumo</span></button>} />
    {isAdmin ? <AdminDashboard period={period} setPeriod={setPeriod} campusData={campusData} /> : role === "Professor" ? <TeacherDashboard /> : <StaffPage />}
  </>;
}

function AdminDashboard({ period, setPeriod, campusData }: { period: string; setPeriod: (value: string) => void; campusData: CampusData }) {
  const freeComputers = campusData.computers.filter((computer) => computer.estado === "Livre").length;
  const computerCount = campusData.computers.length;
  const pcCounts = ["Livre", "Ocupado", "Reservado", "Manutenção"].map((status) => ({
    status,
    count: campusData.computers.filter((computer) => computer.estado === status).length,
    tone: status === "Livre" ? "green" : status === "Ocupado" ? "red" : status === "Reservado" ? "amber" : "slate",
  }));
  const stats = [
    { label: "Alunos inscritos", value: String(campusData.students.filter((student) => student.estado !== "Inativo").length), change: "Registos ativos", icon: "◎", color: "violet" },
    { label: "Professores", value: String(campusData.teachers.filter((teacher) => teacher.estado !== "Inativo").length), change: "Registos ativos", icon: "♧", color: "blue" },
    { label: "Turmas ativas", value: String(campusData.classes.length), change: "Ano letivo 2026/27", icon: "▤", color: "amber" },
    { label: "PCs disponíveis", value: String(freeComputers), change: `de ${computerCount} equipamentos`, icon: "▣", color: "green" },
  ];
  return <>
    <section className="stat-grid">{stats.map((stat) => <article className="stat-card" key={stat.label}><div className={`stat-icon ${stat.color}`}>{stat.icon}</div><div className="stat-meta">{stat.label}<span>↗</span></div><strong>{stat.value}</strong><small><i className="positive">↗</i> {stat.change}</small></article>)}</section>
    <section className="dashboard-grid">
      <article className="surface chart-card"><div className="surface-heading"><div><h2>Atividade do campus</h2><p>Presenças, utilização de PCs e scans QR</p></div><select className="select-control" value={period} onChange={(event) => setPeriod(event.target.value)}><option>Esta semana</option><option>Este mês</option><option>Este período letivo</option></select></div><div className="chart-legend"><span><i className="legend-dot violet-dot" />Presenças</span><span><i className="legend-dot green-dot" />Utilização de PCs</span><span><i className="legend-dot amber-dot" />Scans QR</span></div><div className="activity-chart"><div className="chart-y"><span>120</span><span>90</span><span>60</span><span>30</span><span>0</span></div><div className="chart-plot"><div className="chart-grid-lines"><i /><i /><i /><i /><i /></div><div className="chart-columns">{[["seg.",68,34,23],["ter.",79,44,29],["qua.",56,39,26],["qui.",90,58,33],["sex.",73,46,21],["sáb.",25,15,10],["dom.",12,8,6]].map(([day, a, b, c]) => <div className="chart-day" key={day}><div className="bar-group"><i className="bar bar-purple" style={{height:`${a}%`}} /><i className="bar bar-green" style={{height:`${b}%`}} /><i className="bar bar-amber" style={{height:`${c}%`}} /></div><small>{day}</small></div>)}</div></div></div></article>
      <article className="surface pc-status-card"><div className="surface-heading"><div><h2>Estado dos computadores</h2><p>Estado dos registos locais</p></div><Link className="text-link" href="/computadores">Ver todos ↗</Link></div><div className="pc-summary"><div className="donut-chart" style={{ background: `conic-gradient(${pcCounts.map((item, index) => { const previous = pcCounts.slice(0, index).reduce((sum, part) => sum + part.count, 0); const next = previous + item.count; const color = item.tone === "green" ? "#35a66c" : item.tone === "red" ? "#e96b70" : item.tone === "amber" ? "#e8aa44" : "#8994a7"; return `${color} ${computerCount ? previous / computerCount * 360 : 0}deg ${computerCount ? next / computerCount * 360 : 360}deg`; }).join(",")})` }}><div><strong>{computerCount}</strong><small>equipamentos</small></div></div><div className="pc-legend">{pcCounts.map((item) => <StatusLine key={item.status} name={item.status} count={String(item.count)} color={item.tone} />)}</div></div><div className="pc-footnote"><span className="live-pulse" /> Estado dos registos deste navegador</div></article>
      <article className="surface activity-card"><div className="surface-heading"><div><h2>Atividade recente</h2><p>Últimas ações registadas no sistema</p></div><Link className="text-link" href="/logs">Ver atividade ↗</Link></div><div className="activity-list">{campusData.logs.slice(0, 4).map((item, index) => <Activity key={`${item.data}-${index}`} icon={item.atividade.toLocaleLowerCase().includes("presença") ? "✓" : item.atividade.toLocaleLowerCase().includes("pc") ? "▣" : "▦"} tone={index === 0 ? "green" : "violet"} title={item.atividade} detail={`${item.utilizador} · ${item.destino}`} time={item.data.split(" ").at(-1) ?? item.data} />)}</div></article>
      <article className="surface schedule-card"><div className="surface-heading"><div><h2>Próximas aulas</h2><p>Agenda do campus</p></div><Link className="text-link" href="/horarios">Ver horário ↗</Link></div><div className="schedule-list">{campusData.timetable.slice(0, 4).map((lesson, index) => <Schedule key={`${lesson.turma}-${lesson.hora}-${index}`} time={lesson.hora.split("–")[0].trim()} subject={lesson.disciplina} className={lesson.turma} room={lesson.sala} tone={index % 2 ? "blue" : "violet"} />)}</div></article>
    </section>
  </>;
}

function StatusLine({ name, count, color }: { name: string; count: string; color: string }) { return <div className="status-line"><span><i className={`legend-dot ${color}-dot`} />{name}</span><strong>{count}</strong></div>; }
function Activity({ icon, tone, title, detail, time }: { icon: string; tone: string; title: string; detail: string; time: string }) { return <div className="activity-row"><span className={`activity-icon ${tone}`}>{icon}</span><span className="activity-copy"><strong>{title}</strong><small>{detail}</small></span><time>{time}</time></div>; }
function Schedule({ time, subject, className, room, tone }: { time: string; subject: string; className: string; room: string; tone: string }) { return <div className="schedule-row"><time>{time}</time><i className={`schedule-line ${tone}`} /><span><strong>{subject}</strong><small>{className} <b>·</b> {room}</small></span></div>; }

function TeacherDashboard() {
  return <><section className="stat-grid stat-grid-three"><article className="stat-card"><div className="stat-icon violet">▤</div><div className="stat-meta">As minhas turmas</div><strong>4</strong><small>64 alunos no total</small></article><article className="stat-card"><div className="stat-icon green">✓</div><div className="stat-meta">Presenças de hoje</div><strong>92%</strong><small>+4% face à semana passada</small></article><article className="stat-card"><div className="stat-icon amber">◷</div><div className="stat-meta">Aulas esta semana</div><strong>18</strong><small>Próxima aula às 10:45</small></article></section><section className="dashboard-grid teacher-grid"><article className="surface"><div className="surface-heading"><div><h2>As minhas turmas</h2><p>Turmas e disciplinas atribuídas</p></div><Link className="text-link" href="/turmas">Ver turmas ↗</Link></div><div className="class-cards"><div className="class-card violet-edge"><span>12.º T1</span><strong>Matemática</strong><small>24 alunos · Sala 101</small><div className="progress"><i style={{width:"86%"}} /></div><small>86% de presenças</small></div><div className="class-card blue-edge"><span>11.º T2</span><strong>Matemática</strong><small>21 alunos · Sala 202</small><div className="progress"><i style={{width:"91%"}} /></div><small>91% de presenças</small></div></div></article><article className="surface"><div className="surface-heading"><div><h2>Agenda de hoje</h2><p>As suas próximas aulas</p></div></div><div className="schedule-list"><Schedule time="09:00" subject="Matemática" className="12.º T1" room="Sala 101" tone="violet" /><Schedule time="10:45" subject="Matemática" className="11.º T2" room="Sala 202" tone="blue" /><Schedule time="14:00" subject="Apoio ao estudo" className="12.º T1" room="Sala 101" tone="amber" /></div></article><article className="surface attendance-card"><div className="surface-heading"><div><h2>Presenças · 12.º T1</h2><p>Aula de Matemática · hoje</p></div><Link className="text-link" href="/presencas">Marcar presenças ↗</Link></div><div className="attendance-stats"><span><strong>21</strong><small>Presentes</small></span><span><strong>2</strong><small>Atrasados</small></span><span><strong>1</strong><small>Ausentes</small></span></div><div className="mini-student-list"><span><i className="avatar avatar-green">JS</i>João Silva <b className="pill pill-green">Presente</b></span><span><i className="avatar avatar-blue">AP</i>Ana Pereira <b className="pill pill-amber">Atrasado</b></span><span><i className="avatar avatar-violet">PC</i>Pedro Costa <b className="pill pill-red">Ausente</b></span></div></article></section></>;
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
  const canManage = role === "Administrador" || (role === "Professor" && pathname === "/presencas");
  const hasAction = Boolean(primaryActions[pathname]) && canManage;
  const columns = records.length ? Object.keys(records[0]) : (formFields[pathname] ?? ["nome", "descrição"]).filter((field) => field !== "palavra-passe");
  const statuses = [...new Set(allRecords.map((record) => record.estado).filter(Boolean))];
  return <>
    <PageHeading eyebrow="GESTÃO DO CAMPUS" title={title} description={descriptionFor(pathname)} action={hasAction ? <button className="button button-primary" onClick={onAdd}><span>＋</span>{primaryActions[pathname]}</button> : undefined} />
    <div className="toolbar"><div className="result-count"><strong>{allRecords.length}</strong> registos <span>·</span> ano letivo 2026/2027</div><div className="toolbar-actions">{statuses.length > 0 && <select className="select-control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por estado"><option>Todos os estados</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select>}<button className="button button-secondary" onClick={() => downloadCsv(`${pathname.slice(1)}.csv`, allRecords)}>↓ Exportar CSV</button></div></div>
    <section className="surface table-surface"><div className="table-wrap"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}{isAttendance && <th>Presença</th>}{hasAction && <th>Ações</th>}</tr></thead><tbody>{records.map((record) => { const index = allRecords.indexOf(record); return <tr key={`${Object.values(record).join("-")}-${index}`}>{columns.map((column) => <td key={column}>{column === "código" && pathname === "/qr-code" ? <span className="qr-code-cell">{record[column]}<QrImage value={record[column]} /></span> : column === "estado" ? <span className={`pill ${statusTone(record[column])}`}>{record[column]}</span> : column === "email" ? <a className="email-link" href={`mailto:${record[column]}`}>{record[column]}</a> : column === "utilizador" && record[column] === "—" ? <span className="muted">Disponível</span> : record[column]}</td>)}{isAttendance && <td>{role === "Professor" || role === "Administrador" ? <select className="inline-select" aria-label={`Estado da presença de ${record.aluno}`} value={record.estado} onChange={(event) => onStatus(index, event.target.value)}><option>Presente</option><option>Atrasado</option><option>Ausente</option></select> : <span className={`pill ${statusTone(record.estado)}`}>{record.estado}</span>}</td>}{hasAction && <td><div className="row-actions"><button className="button button-secondary" onClick={() => onEdit(index)}>Editar</button><button className="button button-secondary" onClick={() => onDelete(index)}>Eliminar</button></div></td>}</tr>; })}</tbody></table>{records.length === 0 && <div className="empty-state"><span>⌕</span><strong>{search || statusFilter !== "Todos os estados" ? "Não encontrámos resultados" : "Ainda não existem registos"}</strong><p>{search || statusFilter !== "Todos os estados" ? "Altere os filtros e tente novamente." : "Adicione o primeiro registo para começar."}</p></div>}</div><div className="table-footer"><span>A mostrar <strong>{records.length}</strong> de <strong>{allRecords.length}</strong> registos</span><div><button disabled>← Anterior</button><button className="current-page">1</button><button disabled>Seguinte →</button></div></div></section>
    {pathname === "/computadores" && <section className="surface lower-panel"><div className="surface-heading"><div><h2>Estado do parque informático</h2><p>Alterar o estado de um computador</p></div><Link className="text-link" href="/pc">Abrir interface do PC ↗</Link></div><div className="pc-state-grid">{["Livre", "Ocupado", "Reservado", "Manutenção"].map((state) => <span className={`pc-state ${statusTone(state)}`} key={state}><i />{state}<strong>{allRecords.filter((record) => record.estado === state).length}</strong></span>)}</div><div className="code-generator"><div><strong>{temporaryCodeActive ? temporaryCode?.code : "Sem código ativo"}</strong><small> Código válido durante 15 minutos para a demonstração local</small></div><button className="button button-primary" onClick={onGenerateCode}>Gerar código temporário</button></div></section>}
    {pathname === "/qr-code" && <section className="surface lower-panel"><div className="surface-heading"><div><h2>Leitura rápida</h2><p>Introduza ou leia um código de sala ativo para registar a presença do utilizador atual.</p></div></div><form className="scan-row" onSubmit={(event) => { event.preventDefault(); onScan(); }}><input className="field-control" value={qrCode} onChange={(event) => setQrCode(event.target.value)} placeholder="Ex.: QR-S101" aria-label="Código QR da sala" /><button className="button button-primary">▦ Ler código</button><QrScanner onDetected={onScan} /></form></section>}
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

function RecordModal({ title, fields, initialValues, onClose, onSubmit }: { title: string; fields: string[]; initialValues?: RecordItem; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><div className="eyebrow">SMART CAMPUS</div><h2 id="modal-title">{title}</h2></div><button type="button" className="icon-button close-button" onClick={onClose} aria-label="Fechar">×</button></div><p className="modal-description">Preencha os dados abaixo. Os campos assinalados são obrigatórios.</p><form onSubmit={onSubmit}><div className="form-grid">{fields.map((field) => <label className={field === "encarregado de educação" || field === "equipamentos" ? "form-wide" : ""} key={field}>{field}<FormInput field={field} initialValue={initialValues?.[field]} /></label>)}</div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary">Guardar registo</button></div></form></section></div>;
}

function FormInput({ field, initialValue }: { field: string; initialValue?: string }) {
  const common = { className: "field-control", required: !["equipamentos", "encarregado de educação", "contacto", "palavra-passe"].includes(field), name: field, defaultValue: initialValue };
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

function StudentPage({ name, qrCode, setQrCode, onScan }: { name: string; qrCode: string; setQrCode: (value: string) => void; onScan: (value?: string) => void }) {
  const attendance = readDemoRecords("/presencas", initialData["/presencas"]).filter((item) => item.aluno === name);
  const available = readDemoRecords("/computadores", initialData["/computadores"]).filter((item) => item.estado === "Livre");
  const count = (state: string) => attendance.filter((item) => item.estado === state).length;
  return <><PageHeading eyebrow="ESPAÇO DO ALUNO" title={`Olá, ${name.split(" ")[0]} 👋`} description="Tudo o que precisa para o seu dia no campus." /><section className="student-grid"><article className="surface student-qr"><div className="qr-visual" aria-hidden="true"><span>▦</span><i>✦</i></div><div className="eyebrow">ASSIDUIDADE</div><h2>Registe a sua presença</h2><p>Leia o código QR da sala ou introduza o código para confirmar a sua presença.</p><label className="input-label" htmlFor="qr-input">Código da sala</label><input id="qr-input" className="field-control" value={qrCode} onChange={(event) => setQrCode(event.target.value)} placeholder="Ex.: QR-S101" /><button className="button button-primary button-full" onClick={() => onScan()}>▦ Registar presença</button><QrScanner onDetected={onScan} /><small className="privacy-note">Os códigos QR ativos estão disponíveis na área de gestão.</small></article><div className="student-side"><article className="surface next-class"><div className="surface-heading"><div><h2>Próxima aula</h2><p>Consulte o seu horário semanal</p></div><Link href="/horarios" className="text-link">Ver horário ↗</Link></div><div className="next-class-main"><div className="time-badge">09:00<small>10:30</small></div><div><h3>Matemática</h3><p>Maria Santos · 12.º T1</p><p>⌂ Sala 101</p></div></div></article><article className="surface"><div className="surface-heading"><div><h2>Computadores disponíveis</h2><p>Disponibilidade no campus</p></div><Link href="/pc" className="text-link">Usar PC ↗</Link></div><div className="available-pcs">{available.slice(0, 3).map((computer) => <span key={computer.computador}><i className="legend-dot green-dot" />{computer.computador} · {computer.sala}<b>Disponível</b></span>)}{available.length === 0 && <span className="muted">Não existem computadores livres.</span>}</div></article><article className="surface student-records" id="student-records"><div className="surface-heading"><div><h2>As minhas presenças</h2><p>{attendance.length} registos associados à sua conta</p></div></div><div className="attendance-stats"><span><strong>{count("Presente")}</strong><small>Presentes</small></span><span><strong>{count("Atrasado")}</strong><small>Atrasados</small></span><span><strong>{count("Ausente")}</strong><small>Ausentes</small></span></div><div className="activity-list">{attendance.slice(0, 5).map((item, index) => <div className="activity-row" key={`${item.data}-${item.hora}-${index}`}><span className="activity-copy"><strong>{item.disciplina} · {item.turma}</strong><small>{item.data} · {item.sala}</small></span><span className={`pill ${statusTone(item.estado)}`}>{item.estado}</span></div>)}</div></article></div></section></>;
}

function StaffPage() {
  return <><PageHeading eyebrow="OPERAÇÕES DO CAMPUS" title="Bom dia, Carlos 👋" description="Acompanhe salas, horários e equipamentos do campus." action={<Link className="button button-primary" href="/salas">⌂ Gerir salas</Link>} /><section className="stat-grid stat-grid-three"><article className="stat-card"><div className="stat-icon green">⌂</div><div className="stat-meta">Salas disponíveis</div><strong>18<span className="stat-suffix"> / 24</span></strong><small>6 salas ocupadas agora</small></article><article className="stat-card"><div className="stat-icon violet">▣</div><div className="stat-meta">Computadores livres</div><strong>35<span className="stat-suffix"> / 40</span></strong><small>3 em utilização · 1 manutenção</small></article><article className="stat-card"><div className="stat-icon amber">◷</div><div className="stat-meta">Próxima aula</div><strong>10:45</strong><small>Informática · Sala 202</small></article></section><section className="dashboard-grid staff-grid"><article className="surface"><div className="surface-heading"><div><h2>Estado dos computadores</h2><p>Monitorização por sala</p></div><Link className="text-link" href="/computadores">Ver todos ↗</Link></div><div className="mini-pc-list">{["PC-01|Sala 101|Livre","PC-02|Sala 101|Ocupado","PC-03|Sala 101|Livre","PC-04|Sala 202|Reservado","PC-05|Sala 202|Manutenção"].map((line) => { const [pc, room, state] = line.split("|"); return <div key={pc}><strong>{pc}</strong><span>{room}</span><b className={`pill ${statusTone(state)}`}>{state}</b></div>; })}</div></article><article className="surface"><div className="surface-heading"><div><h2>Salas em utilização</h2><p>Ocupação atual no campus</p></div><Link className="text-link" href="/salas">Gerir salas ↗</Link></div><div className="room-occupancy"><div><span className="room-label">Sala 101</span><strong>Matemática · 12.º T1</strong><span className="pill pill-amber">Em aula</span></div><div><span className="room-label">Sala 202</span><strong>Informática · 11.º T2</strong><span className="pill pill-amber">Em aula</span></div><div><span className="room-label">Sala 105</span><strong>Sem aulas agendadas</strong><span className="pill pill-green">Disponível</span></div></div></article></section></>;
}

function PcPage({ code, setCode, onStart, onEnd, computers, activeComputer }: { code: string; setCode: (value: string) => void; onStart: () => void; onEnd: () => void; computers: RecordItem[]; activeComputer: string }) {
  const active = computers.find((computer) => computer.computador === activeComputer);
  const sala = active?.sala ?? "Sala 101";
  return <><PageHeading eyebrow="SMART CAMPUS · ESTAÇÃO DE TRABALHO" title={activeComputer || "Estação de trabalho"} description={`${sala} · Campus principal`} /><section className="pc-station"><article className="surface station-main"><div className="station-state"><div className="checkmark">{active ? "✓" : "•"}</div><h2>{active ? "Em utilização" : "Disponível"}</h2><p>{active ? `${activeComputer} está associado a ${active.utilizador}.` : "Selecione um computador livre para iniciar a utilização."}</p></div>{active ? <div className="station-form"><button className="button button-secondary button-full" onClick={onEnd}>Terminar utilização</button></div> : <div className="station-form"><div className="eyebrow">INICIAR SESSÃO</div><h3>Introduza o código temporário</h3><p>Peça um código ativo ao professor ou funcionário do campus.</p><form onSubmit={(event) => {event.preventDefault(); onStart();}}><input className="field-control" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código de 6 dígitos" aria-label="Código temporário" required /><button className="button button-primary button-full">Começar a utilizar</button></form><small>O código expira 15 minutos após ser gerado.</small></div>}</article><article className="surface station-list"><div className="surface-heading"><div><h2>Estado dos computadores</h2><p>Disponibilidade atual</p></div><span className="live-pulse" /></div>{computers.map((computer) => <div className="station-pc" key={computer.computador}><strong>{computer.computador}</strong><span className={`pill ${statusTone(computer.estado)}`}>{computer.estado}</span></div>)}</article></section></>;
}

function dateIsInPeriod(value: string, period: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return true;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  const today = new Date();
  if (period === "Este período letivo") return date.getFullYear() === today.getFullYear();
  if (period === "Este mês") return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return date >= start && date < end;
}

function ReportsPage({ period, setPeriod, attendance, computers }: { period: string; setPeriod: (value: string) => void; attendance: RecordItem[]; computers: RecordItem[] }) {
  const [selectedClass, setSelectedClass] = useState("Todas as turmas");
  const [reportType, setReportType] = useState("Resumo geral");
  const logs = readDemoRecords("/logs", initialData["/logs"]);
  const reportAttendance = attendance.filter((item) =>
    dateIsInPeriod(item.data, period) && (selectedClass === "Todas as turmas" || item.turma === selectedClass),
  );
  const periodLogs = logs.filter((item) => dateIsInPeriod(item.data.split(" ")[0], period));
  const pcLogs = periodLogs.filter((item) => item.atividade.toLocaleLowerCase().includes("pc"));
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
  return <><PageHeading eyebrow="ANÁLISE E DESEMPENHO" title="Relatórios" description="Estatísticas calculadas a partir dos registos guardados neste navegador." action={<button className="button button-primary" onClick={() => downloadCsv("relatorio-smart-campus.csv", exportRows)}>↓ Exportar CSV</button>} /><section className="report-filters surface"><label>Período<select className="select-control" value={period} onChange={(event) => setPeriod(event.target.value)}><option>Esta semana</option><option>Este mês</option><option>Este período letivo</option></select></label><label>Turma<select className="select-control" value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}><option>Todas as turmas</option>{classes.map((className) => <option key={className}>{className}</option>)}</select></label><label>Tipo de relatório<select className="select-control" value={reportType} onChange={(event) => setReportType(event.target.value)}><option>Resumo geral</option><option>Presenças</option><option>Utilização de PCs</option><option>Scans QR</option></select></label></section><section className="stat-grid stat-grid-three"><article className="stat-card"><div className="stat-icon violet">✓</div><div className="stat-meta">Presenças no período</div><strong>{reportAttendance.length}</strong><small>Presente, atrasado e ausente</small></article><article className="stat-card"><div className="stat-icon blue">▣</div><div className="stat-meta">Utilizações de PCs</div><strong>{pcLogs.length}</strong><small>{computers.length} computadores monitorizados</small></article><article className="stat-card"><div className="stat-icon amber">▦</div><div className="stat-meta">Leituras QR e presenças</div><strong>{qrLogs.length}</strong><small>Eventos registados no período</small></article></section><section className="surface lower-panel"><div className="surface-heading"><div><h2>Resumo de assiduidade por turma</h2><p>Dados agregados · {period.toLocaleLowerCase("pt-PT")}</p></div><button className="button button-secondary" onClick={() => downloadCsv("presencas-smart-campus.csv", reportAttendance)}>↓ Descarregar CSV</button></div>{Object.keys(grouped).length ? <div className="report-bars">{Object.entries(grouped).map(([name, value]) => { const percentage = Math.round((value.present / value.total) * 100); return <div key={name}><span>{name}</span><i><b style={{ width: `${percentage}%` }} /></i><strong>{percentage}%</strong></div>; })}</div> : <div className="empty-state"><strong>Sem dados para este período</strong><p>As presenças serão apresentadas aqui quando forem registadas.</p></div>}</section></>;
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
