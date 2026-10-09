export type DemoRole = "Administrador" | "Professor" | "Aluno" | "Funcionário";

export type DemoSession = {
  role: DemoRole;
  name: string;
  email?: string;
  remember?: boolean;
};

const SESSION_KEY = "smartcampus_session";

export function readDemoSession(): DemoSession | null {
  if (typeof window === "undefined") return null;

  const storageOrder = [window.localStorage, window.sessionStorage];
  for (const storage of storageOrder) {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) continue;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        const session = parsed as Partial<DemoSession>;
        if (typeof session.role === "string" && typeof session.name === "string") {
          return { role: session.role as DemoRole, name: session.name, email: session.email, remember: session.remember ?? false };
        }
      }
    } catch (error) {
      console.error("Não foi possível carregar a sessão do utilizador.", error);
    }
  }

  return null;
}

export function writeDemoSession(session: DemoSession) {
  if (typeof window === "undefined") return;

  const payload = JSON.stringify({ ...session, remember: Boolean(session.remember) });
  if (session.remember) {
    window.localStorage.setItem(SESSION_KEY, payload);
    window.sessionStorage.removeItem(SESSION_KEY);
    return;
  }

  window.sessionStorage.setItem(SESSION_KEY, payload);
  window.localStorage.removeItem(SESSION_KEY);
}

export function clearDemoSession() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(SESSION_KEY);
  window.sessionStorage.removeItem(SESSION_KEY);
}
