"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { defaultPermissionsForRole } from "../lib/permissions";
import { createClient } from "@/lib/supabase/client";

type UserRole = "Aluno" | "Professor" | "Administrador" | "Administrador Adjunto"
  | "Funcionário";
type UserStatus = "Ativo" | "Inativo";
type CampusNotification = {
  id: string;
  title: string;
  message: string;
  publishedAt: string;
  read: boolean;
};
type AcademicYearSummary = Record<string, string>;

const USERS_STORAGE_KEY = "smartcampus_users";

type User = {
  id?: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  birthDate?: string;
  phone?: string;
  nif?: string;
  documentType?: "Cartão de Cidadão" | "Passaporte" | "Título de Residência";
  documentNumber?: string;
  niss?: string;
  healthNumber?: string;
  address?: string;
  schoolYear?: string;
  studentNumber?: string;
  course?: string;
  className?: string;
  enrollmentDate?: string;
  guardianName?: string;
  guardianRelationship?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  guardianNif?: string;
  guardianDocumentType?: "Cartão de Cidadão" | "Passaporte" | "Título de Residência";
  guardianDocumentNumber?: string;
  guardianAddress?: string;
  guardianAlternativePhone?: string;
  professionalNumber?: string;
  employeeNumber?: string;
  employeePosition?: string;
  administratorNumber?: string;
  department?: string;
  hiringDate?: string;
  contractType?: string;
  professionalStatus?: UserStatus;
  username?: string;
  password?: string;
  permissions?: string[];
};

const initialUsers: User[] = [
  {
    name: "Maria Santos",
    email: "maria.santos@smartcampus.com",
    role: "Professor",
    status: "Ativo",
  },
  {
    name: "João Silva",
    email: "joao.silva@smartcampus.com",
    role: "Aluno",
    status: "Ativo",
  },
  {
    name: "Ana Pereira",
    email: "ana.pereira@smartcampus.com",
    role: "Aluno",
    status: "Ativo",
  },
  {
    name: "Pedro Costa",
    email: "pedro.costa@smartcampus.com",
    role: "Professor",
    status: "Ativo",
  },
  {
    name: "Lucas Ferreira",
    email: "lucas.ferreira@smartcampus.com",
    role: "Administrador",
    status: "Inativo",
  },
];

const menuItems = [
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

export default function Utilizadores() {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<"Todos" | UserRole>("Todos");

  const [currentRole, setCurrentRole] = useState<UserRole>("Administrador");
  const [currentName, setCurrentName] = useState("");
  const [currentEmail, setCurrentEmail] = useState("");
  const [showCampusInfo, setShowCampusInfo] = useState(false);
  const [activeAcademicYear, setActiveAcademicYear] = useState<AcademicYearSummary | null>(null);
  const [campusYearLoaded, setCampusYearLoaded] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<CampusNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadUsers() {
      setLoadingUsers(true);
      setLoadError("");

      try {
        const response = await fetch("/api/admin/users", { cache: "no-store" });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Não foi possível carregar os utilizadores.");
        }

        if (!active) return;
        setCurrentRole(result.currentRole as UserRole);
        setCurrentName(String(result.currentUser?.name ?? ""));
        setCurrentEmail(String(result.currentUser?.email ?? ""));
        setUsers((result.users ?? []) as User[]);
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os utilizadores."
          );
        }
      } finally {
        if (active) setLoadingUsers(false);
      }
    }

    loadUsers();
    return () => { active = false; };
  }, []);

  const [showForm, setShowForm] = useState(false);
  const [editingUserEmail, setEditingUserEmail] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("Aluno");
  const [status, setStatus] = useState<UserStatus>("Ativo");

  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [nif, setNif] = useState("");
  const [documentType, setDocumentType] = useState<User["documentType"]>("Cartão de Cidadão");
  const [documentNumber, setDocumentNumber] = useState("");
  const [niss, setNiss] = useState("");
  const [healthNumber, setHealthNumber] = useState("");
  const [address, setAddress] = useState("");

  const [schoolYear, setSchoolYear] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [course, setCourse] = useState("");
  const [className, setClassName] = useState("");
  const [enrollmentDate, setEnrollmentDate] = useState("");

  const [guardianName, setGuardianName] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianNif, setGuardianNif] = useState("");
  const [guardianDocumentType, setGuardianDocumentType] = useState<User["guardianDocumentType"]>("Cartão de Cidadão");
  const [guardianDocumentNumber, setGuardianDocumentNumber] = useState("");
  const [guardianAddress, setGuardianAddress] = useState("");
  const [guardianAlternativePhone, setGuardianAlternativePhone] = useState("");

  const [department, setDepartment] = useState("");
  const [employeePosition, setEmployeePosition] = useState("");
  const [hiringDate, setHiringDate] = useState("");
  const [contractType, setContractType] = useState("");
  const [professionalStatus, setProfessionalStatus] = useState<UserStatus>("Ativo");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const employeeDepartments = [
    "Direção", "Administração", "Secretaria", "Recursos Humanos",
    "Contabilidade e Finanças", "Coordenação Pedagógica",
    "Psicologia e Orientação", "Biblioteca", "Manutenção e Infraestruturas"
  ];

  const employeePositions = [
    "Diretor", "Subdiretor", "Assistente Administrativo", "Técnico Administrativo",
    "Técnico de Recursos Humanos", "Técnico de Contabilidade",
    "Coordenador Pedagógico", "Psicólogo", "Bibliotecário",
    "Técnico de Biblioteca", "Técnico de Manutenção", "Assistente Operacional", "Outro"
  ];

  
function openForm() {
  setEditingUserEmail(null);
  setEditingUserId(null);
  resetForm();
  setShowForm(true);
}

  function editUser(user: User) {
    if (!user.id) {
      alert("Não foi possível identificar esta conta. Atualiza a lista e tenta novamente.");
      return;
    }

    setEditingUserId(user.id);
    setEditingUserEmail(user.email);
    setName(user.name);
    setEmail(user.email);
    setRole(user.role);
    setStatus(user.status);

    setBirthDate(user.birthDate ?? "");
    setPhone(user.phone ?? "");
    setNif(user.nif ?? "");
    setDocumentType(user.documentType ?? "Cartão de Cidadão");
    setDocumentNumber(user.documentNumber ?? "");
    setNiss(user.niss ?? "");
    setHealthNumber(user.healthNumber ?? "");
    setAddress(user.address ?? "");

    setSchoolYear(user.schoolYear ?? "");
    setStudentNumber(user.studentNumber ?? "");
    setCourse(user.course ?? "");
    setClassName(user.className ?? "");
    setEnrollmentDate(user.enrollmentDate ?? "");

    setGuardianName(user.guardianName ?? "");
    setGuardianRelationship(user.guardianRelationship ?? "");
    setGuardianPhone(user.guardianPhone ?? "");
    setGuardianEmail(user.guardianEmail ?? "");
    setGuardianNif(user.guardianNif ?? "");
    setGuardianDocumentType(user.guardianDocumentType ?? "Cartão de Cidadão");
    setGuardianDocumentNumber(user.guardianDocumentNumber ?? "");
    setGuardianAddress(user.guardianAddress ?? "");
    setGuardianAlternativePhone(user.guardianAlternativePhone ?? "");

    setDepartment(user.department ?? "");
    setEmployeePosition(user.employeePosition ?? "");
    setHiringDate(user.hiringDate ?? "");
    setContractType(user.contractType ?? "");
    setProfessionalStatus(user.professionalStatus ?? "Ativo");

    setUsername(user.username ?? "");
    setPassword("");
    setConfirmPassword("");
    setShowForm(true);
  }
  function closeForm() {
    setShowForm(false);
    setEditingUserEmail(null);
    setEditingUserId(null);
  }

  function resetForm() {
    setName(""); setEmail(""); setRole("Aluno"); setStatus("Ativo");
    setBirthDate(""); setPhone(""); setNif(""); setDocumentType("Cartão de Cidadão");
    setDocumentNumber(""); setNiss(""); setHealthNumber(""); setAddress("");
    setSchoolYear(""); setStudentNumber(""); setCourse(""); setClassName(""); setEnrollmentDate("");
    setGuardianName(""); setGuardianRelationship(""); setGuardianPhone(""); setGuardianEmail("");
    setGuardianNif(""); setGuardianDocumentType("Cartão de Cidadão"); setGuardianDocumentNumber("");
    setGuardianAddress(""); setGuardianAlternativePhone("");
    setDepartment(""); setEmployeePosition(""); setHiringDate(""); setContractType(""); setProfessionalStatus("Ativo");
    setUsername(""); setPassword(""); setConfirmPassword("");
  }

  function generateNumber(prefix: string, existing: User[], field: keyof User) {
    const nums = existing.map(u => Number(String(u[field] ?? "").replace(/\D/g, ""))).filter(n => Number.isFinite(n) && n > 0);
    return `${prefix}${String(nums.length ? Math.max(...nums) + 1 : 1).padStart(4, "0")}`;
  }

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();
    const isEditing = Boolean(editingUserId);

    if (!cleanName || !cleanEmail || (!isEditing && !cleanUsername) || (!isEditing && !password)) {
      alert("Preenche o nome, email e os dados de acesso obrigatórios.");
      return;
    }

    if ((!isEditing || password) && password !== confirmPassword) {
      alert("A palavra-passe e a confirmação não coincidem.");
      return;
    }

    if (
      !isEditing &&
      users.some((user) => user.email.toLowerCase() === cleanEmail)
    ) {
      alert("Já existe um utilizador com esse email.");
      return;
    }

    if (
      !isEditing &&
      users.some((user) => user.username?.toLowerCase() === cleanUsername.toLowerCase())
    ) {
      alert("Já existe um utilizador com esse nome de utilizador.");
      return;
    }

    const professionalNumber =
      role === "Professor"
        ? (isEditing
            ? users.find((user) => user.id === editingUserId)?.professionalNumber
              ?? generateNumber("PROF-", users, "professionalNumber")
            : generateNumber("PROF-", users, "professionalNumber"))
        : undefined;
    const employeeNumber =
      role === "Funcionário"
        ? (isEditing
            ? users.find((user) => user.id === editingUserId)?.employeeNumber
              ?? generateNumber("FUNC-", users, "employeeNumber")
            : generateNumber("FUNC-", users, "employeeNumber"))
        : undefined;

    const payload = {
      ...(isEditing ? { id: editingUserId } : {}),
      name: cleanName,
      email: cleanEmail,
      ...(password ? { password } : {}),
      role,
      status,
      birthDate: birthDate || undefined,
      phone: phone || undefined,
      nif: nif || undefined,
      documentType,
      documentNumber: documentNumber || undefined,
      niss: niss || undefined,
      healthNumber: healthNumber || undefined,
      address: address || undefined,
      schoolYear: role === "Aluno" ? schoolYear || undefined : undefined,
      studentNumber: role === "Aluno" ? studentNumber || undefined : undefined,
      course: role === "Aluno" ? course || undefined : undefined,
      enrollmentDate: role === "Aluno" ? enrollmentDate || undefined : undefined,
      guardianName: role === "Aluno" ? guardianName || undefined : undefined,
      guardianRelationship: role === "Aluno" ? guardianRelationship || undefined : undefined,
      guardianPhone: role === "Aluno" ? guardianPhone || undefined : undefined,
      guardianEmail: role === "Aluno" ? guardianEmail || undefined : undefined,
      guardianNif: role === "Aluno" ? guardianNif || undefined : undefined,
      guardianDocumentType: role === "Aluno" ? guardianDocumentType : undefined,
      guardianDocumentNumber: role === "Aluno" ? guardianDocumentNumber || undefined : undefined,
      guardianAddress: role === "Aluno" ? guardianAddress || undefined : undefined,
      guardianAlternativePhone: role === "Aluno" ? guardianAlternativePhone || undefined : undefined,
      professionalNumber,
      employeeNumber,
      department: role !== "Aluno" ? department || undefined : undefined,
      employeePosition: role === "Funcionário" ? employeePosition || undefined : undefined,
      hiringDate: role !== "Aluno" ? hiringDate || undefined : undefined,
      contractType: role !== "Aluno" ? contractType || undefined : undefined,
      professionalStatus: role !== "Aluno" ? professionalStatus : undefined,
      username: cleanUsername || undefined,
    };

    try {
      const response = await fetch("/api/admin/users", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        alert(result.error || (isEditing ? "Não foi possível atualizar o utilizador." : "Não foi possível criar o utilizador."));
        return;
      }

      const refreshedResponse = await fetch("/api/admin/users", { cache: "no-store" });
      const refreshedResult = await refreshedResponse.json();
      if (refreshedResponse.ok) {
        setUsers((refreshedResult.users ?? []) as User[]);
      } else if (result.user) {
        setUsers((current) => isEditing
          ? current.map((user) => user.id === editingUserId ? { ...user, ...result.user } : user)
          : [...current, result.user as User]);
      }

      alert(isEditing ? "Utilizador atualizado com sucesso." : "Utilizador criado com sucesso.");
      setEditingUserEmail(null);
      setEditingUserId(null);
      resetForm();
      setShowForm(false);
    } catch (error) {
      console.error(isEditing ? "Erro ao atualizar utilizador:" : "Erro ao criar utilizador:", error);
      alert("Ocorreu um erro ao comunicar com o servidor.");
    }
  }

  const filteredUsers = users.filter((user) => {
    const searchText = search.toLowerCase();

    const matchesSearch =
      user.name
        .toLowerCase()
        .includes(searchText) ||
      user.email
        .toLowerCase()
        .includes(searchText);

    const matchesRole =
      filterRole === "Todos" ||
      user.role === filterRole;

    return matchesSearch && matchesRole;
  });

  const totalStudents = users.filter(
    (user) => user.role === "Aluno"
  ).length;

  const totalTeachers = users.filter(
    (user) => user.role === "Professor"
  ).length;

  const totalAdministrators = users.filter(
    (user) => user.role === "Administrador"
  ).length;

  const previewNumber =
    role === "Professor"
      ? users.find((user) => user.id === editingUserId)?.professionalNumber
        ?? generateNumber("PROF-", users, "professionalNumber")
      : role === "Funcionário"
        ? users.find((user) => user.id === editingUserId)?.employeeNumber
          ?? generateNumber("FUNC-", users, "employeeNumber")
        : "Gerado automaticamente";

  const roleMeta: Record<UserRole, { icon: string; title: string; description: string }> = {
    Aluno: { icon: "🎓", title: "Conta académica", description: "Acesso do aluno" },
    Professor: { icon: "👨‍🏫", title: "Conta pedagógica", description: "Acesso do professor" },
    Funcionário: { icon: "👤", title: "Conta profissional", description: "Acesso do funcionário" },
    "Administrador Adjunto": { icon: "🛡️", title: "Conta administrativa", description: "Permissões automáticas" },
    Administrador: { icon: "👨‍💼", title: "Conta de gestão", description: "Acesso total" },
  };

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

  async function loadCampusYear() {
    try {
      const response = await fetch("/api/campus-data?resource=%2Fanos-letivos", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar o ano letivo.");
      const years = (result.records ?? []) as AcademicYearSummary[];
      const activeYear = years.find((year) =>
        ["true", "ativo", "sim"].includes((year.ativo ?? "").toLocaleLowerCase("pt-PT"))
      ) ?? null;
      setActiveAcademicYear(activeYear);
    } catch {
      setActiveAcademicYear(null);
    } finally {
      setCampusYearLoaded(true);
    }
  }

  async function toggleCampusInfo() {
    const opening = !showCampusInfo;
    setShowCampusInfo(opening);
    if (opening && !campusYearLoaded) await loadCampusYear();
  }

  async function signOut() {
    try {
      await createClient().auth.signOut();
    } finally {
      window.location.assign("/login");
    }
  }

  return (
    <main className="workspace users-workspace">
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
          onClick={toggleCampusInfo}
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
                <strong>{activeAcademicYear?.nome || (campusYearLoaded ? "Por configurar" : "A carregar…")}</strong>
                <span className={"campus-year-status" + (activeAcademicYear ? " is-configured" : "")}>
                  <i />{activeAcademicYear ? "Ano letivo ativo" : campusYearLoaded ? "Sem ano letivo ativo" : "A consultar estado"}
                </span>
              </div>
            </div>
            {activeAcademicYear?.data_inicio && activeAcademicYear?.data_fim && (
              <p className="campus-year-dates">
                {new Date(activeAcademicYear.data_inicio + "T00:00:00").toLocaleDateString("pt-PT")} – {new Date(activeAcademicYear.data_fim + "T00:00:00").toLocaleDateString("pt-PT")}
              </p>
            )}
            {(currentRole === "Administrador" || currentRole === "Administrador Adjunto") && (
              <Link className="campus-configure-link" href="/anos-letivos" onClick={() => setShowCampusInfo(false)}>
                {activeAcademicYear ? "Gerir ano letivo" : "Configurar ano letivo"} <span aria-hidden="true">↗</span>
              </Link>
            )}
          </section>
        )}
        <div className="nav-caption">ESPAÇO DE TRABALHO</div>
        <nav className="main-nav" aria-label="Navegação principal">
          {menuItems.filter((item) => item.roles.includes(currentRole)).map((item) => (
            <Link key={item.href} className={"nav-item " + (item.label === "Utilizadores" ? "selected" : "")} href={item.href} title={item.label}>
              <span className="nav-icon">{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link className="help-card" href="/configuracoes">
            <span className="help-icon">?</span><span><strong>Precisa de ajuda?</strong><small>Consulte o guia do campus</small></span><span>↗</span>
          </Link>
          <button type="button" className="profile-card" onClick={signOut} aria-label="Terminar sessão">
            <span className="avatar avatar-purple">{currentName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "SC"}</span>
            <span className="profile-text"><strong>{currentName || currentEmail || currentRole}</strong><small>{currentRole}</small></span>
            <span className="profile-menu">↪ Sair</span>
          </button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Smart Campus</span><span>/</span><strong>Utilizadores</strong></div>
          <div className="topbar-actions">
            <label className="top-search"><span>⌕</span><input aria-label="Pesquisar utilizadores" placeholder="Pesquisar utilizadores..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label>
            <div className="notification-anchor">
              <button
                className="icon-button notifications"
                type="button"
                aria-label="Abrir notificações"
                aria-expanded={showNotifications}
                onClick={toggleNotifications}
              >
                ♧{notifications.some((item) => !item.read) && <i />}
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
                        <button type="button" className="notification-text-button" onClick={() => markNotificationRead()}>Marcar todas como lidas</button>
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
                        <button type="button" className={"notification-item" + (item.read ? " is-read" : " is-unread")} key={item.id} onClick={() => !item.read && markNotificationRead(item.id)}>
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
                  <footer className="notification-popover-footer"><button type="button" onClick={loadNotifications}>Atualizar lista</button></footer>
                </section>
              )}
            </div>
            <span className="top-divider" />
            <Link className="avatar avatar-purple top-avatar profile-avatar-link" href="/perfil" aria-label="Ver o meu perfil" title="Ver o meu perfil">
              {currentName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || currentEmail.charAt(0).toUpperCase() || "SC"}
            </Link>
          </div>
        </header>

        <div className="page-content">
          {loadError && <div className="notice" role="alert"><span>!</span>{loadError}<button type="button" onClick={() => setLoadError("")} aria-label="Fechar aviso">×</button></div>}
          <div className="page-heading">
            <div><div className="eyebrow">GESTÃO DE ACESSOS</div><h1>Utilizadores</h1><p>Gerir todas as contas e permissões do Smart Campus.</p></div>
            <button type="button" className="button button-primary" onClick={openForm}>＋ Adicionar utilizador</button>
          </div>

        {showForm && (
          <div className="user-modal-overlay">
            <div className="user-modal">
              <div className="user-form-header">
                <div>
                  <h2 style={{ marginBottom: 4 }}>
                    {editingUserEmail ? "Editar Utilizador" : "Adicionar Utilizador"}
                  </h2>
                  <p>{editingUserId ? "Atualize os dados da conta e guarde as alterações." : "Preencha os dados para criar uma conta no Smart Campus."}</p>
                </div>
                <button type="button" className="close-button" onClick={closeForm} aria-label="Fechar">×</button>
              </div>

              {/* PASSOS */}
              <div className="user-form-steps">
                {[
                  ["1", "Tipo de utilizador", role],
                  ["2", "Preencher dados", "Complete o formulário"],
                  ["3", "Guardar", editingUserId ? "Guardar alterações" : "Adicionar ao sistema"],
                ].map(([step, title, subtitle], index) => (
                  <div key={step} className={"user-form-step " + (index === 0 ? "is-current" : "")}>
                    <span className="user-form-step-number">
                      {step}
                    </span>
                    <div className="user-form-step-copy">
                      <strong>{title}</strong>
                      <span>{subtitle}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* SELEÇÃO DE PERFIL */}
              <div className="user-role-selector">
                <div className="user-role-copy">
                  <span className="user-role-emoji">{roleMeta[role].icon}</span>
                  <div>
                    <strong>Perfil selecionado: {role}</strong>
                    <span>{roleMeta[role].title} · {roleMeta[role].description}</span>
                  </div>
                </div>
                <select
                  className="user-role-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  aria-label="Escolher tipo de utilizador"
                >
                  {(Object.keys(roleMeta) as UserRole[]).map((itemRole) => (
                    <option key={itemRole} value={itemRole}>{itemRole}</option>
                  ))}
                </select>
              </div>

              <div className="user-form-intro">
                <span className="user-form-role-icon">
                  {roleMeta[role].icon}
                </span>
                <div>
                  <h3>{editingUserId ? "Editar" : "Adicionar"} {role}</h3>
                  <p>{editingUserId ? "Os campos abaixo refletem a informação guardada na conta." : "Os campos obrigatórios estão assinalados com *."}</p>
                </div>
              </div>

              <form onSubmit={addUser}>
                {/* DADOS PESSOAIS */}
                <section className="user-form-section">
                  <div className="user-form-section-heading">👤 &nbsp;Dados pessoais</div>
                  <div className="user-form-grid">
                    <div className="form-field"><label>Nome completo *</label><input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Ex.: Ana Sofia Ribeiro" required /></div>
                    <div className="form-field"><label>Email *</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Ex.: ana.ribeiro@smartcampus.com" required /></div>
                    <div className="form-field"><label>Telefone</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ex.: 912 345 678" /></div>
                    <div className="form-field"><label>Data de nascimento</label><input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} /></div>
                    <div className="form-field"><label>NIF</label><input value={nif} onChange={e => setNif(e.target.value)} placeholder="Ex.: 123 456 789" /></div>
                    <div className="form-field"><label>Número de identificação</label><input value={documentNumber} onChange={e => setDocumentNumber(e.target.value)} placeholder="Ex.: BI12345678" /></div>
                    <div className="form-field"><label>Tipo de documento</label><select value={documentType} onChange={e => setDocumentType(e.target.value as User["documentType"])}><option>Cartão de Cidadão</option><option>Passaporte</option><option>Título de Residência</option></select></div>
                    <div className="form-field"><label>NISS</label><input value={niss} onChange={e => setNiss(e.target.value)} /></div>
                    <div className="form-field"><label>Número de Utente</label><input name="healthNumberFieldNoAutofill" autoComplete="off" autoCorrect="off" spellCheck={false} value={healthNumber} onChange={e => setHealthNumber(e.target.value)} /></div>
                    <div className="form-field form-field-full"><label>Morada</label><input value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, número, código postal e localidade" /></div>
                  </div>
                </section>

                {/* DADOS ACADÉMICOS ALUNO */}
                {role === "Aluno" && (
                  <>
                    <section className="user-form-section">
                      <div className="user-form-section-heading">🎓 &nbsp;Dados académicos</div>
                      <div className="user-form-grid">
                        <div className="form-field"><label>Ano letivo *</label><input placeholder="2026/2027" value={schoolYear} onChange={e => setSchoolYear(e.target.value)} required /></div>
                        <div className="form-field"><label>Número de aluno *</label><input value={studentNumber} onChange={e => setStudentNumber(e.target.value)} required /></div>
                        <div className="form-field"><label>Curso *</label><input value={course} onChange={e => setCourse(e.target.value)} required /></div>
                        <div className="form-field"><label>Turma{!editingUserId ? " *" : ""}</label><input value={className} onChange={e => setClassName(e.target.value)} required={!editingUserId} /></div>
                        <div className="form-field"><label>Data de matrícula</label><input type="date" value={enrollmentDate} onChange={e => setEnrollmentDate(e.target.value)} /></div>
                      </div>
                    </section>

                    <section className="user-form-section">
                      <div className="user-form-section-heading">👨‍👩‍👦 &nbsp;Encarregado de Educação</div>
                      <div className="user-form-grid">
                        <div className="form-field"><label>Nome completo *</label><input value={guardianName} onChange={e => setGuardianName(e.target.value)} required /></div>
                        <div className="form-field"><label>Grau de parentesco *</label><select value={guardianRelationship} onChange={e => setGuardianRelationship(e.target.value)} required><option value="">Selecionar</option><option>Pai</option><option>Mãe</option><option>Avô/Avó</option><option>Tutor legal</option><option>Outro</option></select></div>
                        <div className="form-field"><label>Telefone *</label><input type="tel" value={guardianPhone} onChange={e => setGuardianPhone(e.target.value)} required /></div>
                        <div className="form-field"><label>Email</label><input type="email" value={guardianEmail} onChange={e => setGuardianEmail(e.target.value)} /></div>
                        <div className="form-field"><label>NIF</label><input value={guardianNif} onChange={e => setGuardianNif(e.target.value)} /></div>
                        <div className="form-field"><label>Tipo de documento</label><select value={guardianDocumentType} onChange={e => setGuardianDocumentType(e.target.value as User["guardianDocumentType"])}><option>Cartão de Cidadão</option><option>Passaporte</option><option>Título de Residência</option></select></div>
                        <div className="form-field"><label>Número de identificação</label><input value={guardianDocumentNumber} onChange={e => setGuardianDocumentNumber(e.target.value)} /></div>
                        <div className="form-field"><label>Morada</label><input value={guardianAddress} onChange={e => setGuardianAddress(e.target.value)} /></div>
                        <div className="form-field"><label>Contacto alternativo</label><input type="tel" value={guardianAlternativePhone} onChange={e => setGuardianAlternativePhone(e.target.value)} /></div>
                      </div>
                    </section>
                  </>
                )}

                {/* DADOS PROFISSIONAIS */}
                {role !== "Aluno" && (
                  <section className="user-form-section">
                    <div className="user-form-section-heading">💼 &nbsp;Dados profissionais</div>
                    <div className="user-form-grid">
                      <div className="form-field"><label>{role === "Professor" ? "Número do professor" : role === "Funcionário" ? "Número do funcionário" : "Número do administrador"} *</label><input readOnly value={previewNumber} /></div>
                      <div className="form-field"><label>Departamento *</label><select value={department} onChange={e => setDepartment(e.target.value)} required><option value="">Selecionar departamento</option>{(role === "Funcionário" ? employeeDepartments : ["Matemática e Ciências", "Línguas", "Ciências Sociais e Humanas", "Informática e Tecnologias", "Artes", "Educação Física"]).map(item => <option key={item}>{item}</option>)}</select></div>
                      {role === "Funcionário" && <div className="form-field"><label>Cargo/Função *</label><select value={employeePosition} onChange={e => setEmployeePosition(e.target.value)} required><option value="">Selecionar cargo/função</option>{employeePositions.map(item => <option key={item}>{item}</option>)}</select></div>}
                      <div className="form-field"><label>Data de contratação</label><input type="date" value={hiringDate} onChange={e => setHiringDate(e.target.value)} /></div>
                      <div className="form-field"><label>Tipo de contrato</label><select value={contractType} onChange={e => setContractType(e.target.value)}><option value="">Selecionar</option><option>Contrato sem termo</option><option>Contrato a termo</option><option>Tempo parcial</option><option>Outro</option></select></div>
                      <div className="form-field"><label>Estado profissional</label><select value={professionalStatus} onChange={e => setProfessionalStatus(e.target.value as UserStatus)}><option>Ativo</option><option>Inativo</option></select></div>
                    </div>
                  </section>
                )}

                {/* ACESSOS */}
                <section className="user-form-section">
                  <div className="user-form-section-heading">🔐 &nbsp;Dados de acesso</div>
                  <div className="user-form-grid">
                    <div className="form-field"><label>Nome de utilizador{!editingUserId ? " *" : ""}</label><input value={username} onChange={e => setUsername(e.target.value)} placeholder="Ex.: ana.ribeiro" required={!editingUserId} /></div>
                    {!editingUserId && <div className="form-field"><label>Palavra-passe *</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" minLength={6} required /></div>}
                    {!editingUserId && <div className="form-field"><label>Confirmar palavra-passe *</label><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repita a palavra-passe" minLength={6} required /></div>}
                    <div className="form-field"><label>Estado *</label><select value={status} onChange={e => setStatus(e.target.value as UserStatus)} required><option>Ativo</option><option>Inativo</option></select></div>
                  </div>
                </section>

                {role === "Professor" && (
                  <section className="user-form-section">
                    <div className="user-form-section-heading">🎓 &nbsp;Dados académicos</div>
                    <div className="user-form-grid">
                      <div className="form-field"><label>Disciplinas que leciona</label><select defaultValue=""><option value="">Selecionar disciplinas</option><option>Matemática</option><option>Português</option><option>Informática</option><option>Inglês</option><option>Educação Física</option></select></div>
                      <div className="form-field"><label>Turmas atribuídas</label><select defaultValue=""><option value="">Selecionar turmas</option><option>10.º A</option><option>10.º B</option><option>11.º A</option><option>12.º A</option></select></div>
                    </div>
                  </section>
                )}




                {role === "Administrador" && (
                  <div className="user-admin-notice">
                    <span>🛡️</span>
                    <div><strong>Acesso total ao sistema</strong><p>O Administrador terá acesso à gestão de utilizadores, áreas, configurações, relatórios e segurança.</p></div>
                  </div>
                )}

                <div className="user-form-actions">
                  <button type="button" className="secondary-button" onClick={closeForm}>Cancelar</button>
                  <button type="submit" className="primary-button">
                    👤+ &nbsp;{editingUserEmail ? "Guardar alterações" : `Adicionar ${role.toLowerCase()}`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ESTATÍSTICAS */}
        <section className="stat-grid users-stat-grid" aria-label="Resumo de utilizadores">
          <article className="stat-card"><div className="stat-icon violet">♙</div><div className="stat-meta">Total de utilizadores</div><strong>{users.length}</strong><small>Contas registadas</small></article>
          <article className="stat-card"><div className="stat-icon blue">◎</div><div className="stat-meta">Alunos</div><strong>{totalStudents}</strong><small>Contas de aluno</small></article>
          <article className="stat-card"><div className="stat-icon green">♧</div><div className="stat-meta">Professores</div><strong>{totalTeachers}</strong><small>Contas de professor</small></article>
          <article className="stat-card"><div className="stat-icon amber">♙</div><div className="stat-meta">Funcionários</div><strong>{users.filter((user) => user.role === "Funcionário").length}</strong><small>Contas operacionais</small></article>
          <article className="stat-card"><div className="stat-icon violet">◇</div><div className="stat-meta">Administradores adjuntos</div><strong>{users.filter((user) => user.role === "Administrador Adjunto").length}</strong><small>Contas de gestão</small></article>
          <article className="stat-card"><div className="stat-icon blue">♧</div><div className="stat-meta">Administradores</div><strong>{totalAdministrators}</strong><small>Contas de administração</small></article>
        </section>

        {/* LISTA DE UTILIZADORES */}
        <section className="surface table-surface users-table-surface" aria-labelledby="users-list-title">
          <div className="surface-heading users-table-heading">
            <div>
              <h2 id="users-list-title">Lista de utilizadores</h2>
              <p>{loadingUsers ? "A carregar contas do Smart Campus…" : "Contas e permissões registadas no Smart Campus."}</p>
            </div>
            <select
              className="select-control users-table-filter"
              aria-label="Filtrar utilizadores por perfil"
              value={filterRole}
              onChange={(event) => setFilterRole(event.target.value as "Todos" | UserRole)}
            >
              <option value="Todos">Todos os perfis</option>
              <option value="Aluno">Alunos</option>
              <option value="Professor">Professores</option>
              <option value="Funcionário">Funcionários</option>
              <option value="Administrador Adjunto" disabled={currentRole === "Administrador Adjunto"}>Administradores adjuntos</option>
              <option value="Administrador" disabled={currentRole === "Administrador Adjunto"}>Administradores</option>
            </select>
          </div>

          <div className="table-wrap">
            <table className="data-table user-data-table">
              <thead>
                <tr><th>Utilizador</th><th>Email</th><th>Função</th><th>Estado</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {loadingUsers ? (
                  <tr><td colSpan={5} className="users-empty-cell">A carregar utilizadores…</td></tr>
                ) : filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <tr key={user.email}>
                      <td>
                        <div className="user-name">
                          <div className="table-avatar">{user.name.charAt(0).toUpperCase()}</div>
                          <strong>{user.name}</strong>
                        </div>
                      </td>
                      <td><span className="users-email">{user.email}</span></td>
                      <td><span className="pill pill-slate">{user.role}</span></td>
                      <td><span className={"pill " + (user.status === "Ativo" ? "pill-green" : "pill-slate")}>{user.status}</span></td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="button button-secondary" title="Editar utilizador" onClick={() => editUser(user)}>Editar</button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} className="users-empty-cell">{loadError ? "Não foi possível carregar os utilizadores." : "Nenhum utilizador encontrado."}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      </section>
    </main>
  );
}