"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type CampusRole =
  | "Aluno"
  | "Professor"
  | "Funcionário"
  | "Administrador Adjunto"
  | "Administrador";

export type CampusNotification = {
  id: string;
  title: string;
  message: string;
  publishedAt: string;
  read: boolean;
};

export type CampusNavigationItem = {
  label: string;
  icon: string;
  href: string;
  roles: readonly string[];
};

export type CampusAcademicYear = Record<string, string>;

type ExtraNavigationItem = {
  label: string;
  icon: string;
  href: string;
};

type CampusShellProps = {
  title: string;
  pathname: string;
  role: CampusRole;
  userName: string;
  userEmail?: string;
  navigationItems: CampusNavigationItem[];
  extraNavigationItems?: ExtraNavigationItem[];
  className?: string;
  searchValue: string;
  searchPlaceholder?: string;
  onSearchChange: (value: string) => void;
  showCampusInfo: boolean;
  onToggleCampusInfo: () => void | Promise<void>;
  activeAcademicYear: CampusAcademicYear | null;
  campusYearLoading?: boolean;
  showNotifications: boolean;
  notifications: CampusNotification[];
  notificationsLoading: boolean;
  notificationsError: string;
  onToggleNotifications: () => void | Promise<void>;
  onLoadNotifications: () => void | Promise<void>;
  onMarkNotificationRead: (id?: string) => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
  children: ReactNode;
};

export default function CampusShell({
  title,
  pathname,
  role,
  userName,
  userEmail = "",
  navigationItems,
  extraNavigationItems = [],
  className = "",
  searchValue,
  searchPlaceholder = "Pesquisar...",
  onSearchChange,
  showCampusInfo,
  onToggleCampusInfo,
  activeAcademicYear,
  campusYearLoading = false,
  showNotifications,
  notifications,
  notificationsLoading,
  notificationsError,
  onToggleNotifications,
  onLoadNotifications,
  onMarkNotificationRead,
  onSignOut,
  children,
}: CampusShellProps) {
  const isCampusAdministrator =
    role === "Administrador" || role === "Administrador Adjunto";
  const hasUnreadNotifications = notifications.some((item) => !item.read);
  const initials =
    userName
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    userEmail.charAt(0).toUpperCase() ||
    "SC";

  return (
    <main className={("workspace " + className).trim()}>
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
          onClick={() => void onToggleCampusInfo()}
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
                <strong>{activeAcademicYear?.nome || (campusYearLoading ? "A carregar…" : "Por configurar")}</strong>
                <span className={"campus-year-status" + (activeAcademicYear ? " is-configured" : "")}>
                  <i />{activeAcademicYear ? "Ano letivo ativo" : campusYearLoading ? "A consultar estado" : "Sem ano letivo ativo"}
                </span>
              </div>
            </div>
            {activeAcademicYear?.data_inicio && activeAcademicYear?.data_fim && (
              <p className="campus-year-dates">
                {new Date(activeAcademicYear.data_inicio + "T00:00:00").toLocaleDateString("pt-PT")} – {new Date(activeAcademicYear.data_fim + "T00:00:00").toLocaleDateString("pt-PT")}
              </p>
            )}
            {isCampusAdministrator && (
              <Link className="campus-configure-link" href="/anos-letivos">
                {activeAcademicYear ? "Gerir ano letivo" : "Configurar ano letivo"} <span aria-hidden="true">↗</span>
              </Link>
            )}
          </section>
        )}

        <div className="nav-caption">ESPAÇO DE TRABALHO</div>
        <nav className="main-nav" aria-label="Navegação principal">
          {navigationItems.map((item) => (
            <Link key={item.href} className={"nav-item " + (pathname === item.href ? "selected" : "")} href={item.href} title={item.label}>
              <span className="nav-icon">{item.icon}</span>{item.label}
            </Link>
          ))}
          {extraNavigationItems.map((item) => (
            <Link key={item.href} className={"nav-item " + (pathname === item.href ? "selected" : "")} href={item.href} title={item.label}>
              <span className="nav-icon">{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <Link className="help-card" href="/configuracoes">
            <span className="help-icon">?</span><span><strong>Precisa de ajuda?</strong><small>Consulte o guia do campus</small></span><span>↗</span>
          </Link>
          <button type="button" className="profile-card" onClick={() => void onSignOut()} aria-label="Terminar sessão">
            <span className="avatar avatar-purple">{initials}</span>
            <span className="profile-text"><strong>{userName || userEmail || role}</strong><small>{role}</small></span>
            <span className="profile-menu">↪ Sair</span>
          </button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Smart Campus</span><span>/</span><strong>{title}</strong></div>
          <div className="topbar-actions">
            <label className="top-search">
              <span>⌕</span>
              <input
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
              />
              <kbd>⌘ K</kbd>
            </label>
            <div className="notification-anchor">
              <button
                className="icon-button notifications"
                type="button"
                aria-label="Abrir notificações"
                aria-expanded={showNotifications}
                onClick={() => void onToggleNotifications()}
              >
                ♧{hasUnreadNotifications && <i />}
              </button>
              {showNotifications && (
                <section className="notification-popover" role="dialog" aria-label="Notificações">
                  <header className="notification-popover-header">
                    <div>
                      <h2>Notificações</h2>
                      <p>{notifications.filter((item) => !item.read).length} por ler</p>
                    </div>
                    <div className="notification-popover-actions">
                      {hasUnreadNotifications && (
                        <button type="button" className="notification-text-button" onClick={() => void onMarkNotificationRead()}>
                          Marcar todas como lidas
                        </button>
                      )}
                      <button type="button" className="notification-close" aria-label="Fechar notificações" onClick={() => { /* controlled by the page */ }}>
                        ×
                      </button>
                    </div>
                  </header>
                  {notificationsLoading ? (
                    <p className="notification-state">A carregar notificações…</p>
                  ) : notificationsError ? (
                    <div className="notification-state notification-state-error">
                      <p>{notificationsError}</p>
                      <button type="button" className="notification-text-button" onClick={() => void onLoadNotifications()}>Tentar novamente</button>
                    </div>
                  ) : notifications.length ? (
                    <div className="notification-list">
                      {notifications.map((item) => (
                        <button
                          type="button"
                          className={"notification-item" + (item.read ? " is-read" : " is-unread")}
                          key={item.id}
                          onClick={() => !item.read && void onMarkNotificationRead(item.id)}
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
                    <button type="button" onClick={() => void onLoadNotifications()}>Atualizar lista</button>
                  </footer>
                </section>
              )}
            </div>
            <span className="top-divider" />
            <Link className="avatar avatar-purple top-avatar profile-avatar-link" href="/perfil" aria-label="Ver o meu perfil" title="Ver o meu perfil">
              {initials}
            </Link>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
