export type UserRole = "Aluno" | "Professor" | "Funcionário" | "Administrador Adjunto" | "Administrador";

export const PERMISSIONS = {
  UTILIZADORES: ["Ver utilizadores", "Criar aluno", "Criar professor", "Criar funcionário", "Editar utilizadores", "Desativar utilizadores", "Reativar utilizadores", "Redefinir palavra-passe"],
  ALUNOS: ["Ver alunos", "Criar aluno", "Editar aluno", "Desativar aluno", "Ver dados do encarregado de educação", "Alterar dados académicos", "Associar aluno a turma"],
  PROFESSORES: ["Ver professores", "Editar professor", "Desativar professor", "Associar professor a disciplina", "Associar professor a turma", "Definir professor coordenador de turma"],
  DISCIPLINAS: ["Ver disciplinas", "Criar disciplina", "Editar disciplina", "Desativar disciplina", "Associar professor à disciplina", "Definir coordenador de departamento"],
  TURMAS: ["Ver turmas", "Criar turma", "Editar turma", "Desativar turma", "Associar alunos", "Associar professores", "Associar disciplinas", "Definir professor coordenador"],
  HORARIOS: ["Ver horários", "Criar horário", "Editar horário", "Remover horário", "Associar professor", "Associar disciplina", "Associar turma"],
  ANO_LETIVO: ["Ver anos letivos", "Criar ano letivo", "Editar ano letivo", "Ativar/desativar ano letivo"],
  RELATORIOS: ["Ver relatórios", "Gerar relatórios", "Exportar relatórios"],
  CONFIGURACOES: ["Ver configurações", "Alterar configurações gerais"],
  SEGURANCA: ["Ver registos de atividade", "Ver histórico de alterações", "Bloquear/desbloquear utilizadores"],
} as const;

export const ALL_PERMISSIONS = Object.values(PERMISSIONS).flat() as string[];

const ADJUNCT_PERMISSIONS = [
  ...PERMISSIONS.UTILIZADORES,
  ...PERMISSIONS.ALUNOS,
  ...PERMISSIONS.PROFESSORES,
  ...PERMISSIONS.DISCIPLINAS,
  ...PERMISSIONS.TURMAS,
  ...PERMISSIONS.HORARIOS,
  ...PERMISSIONS.ANO_LETIVO,
  ...PERMISSIONS.RELATORIOS,
  "Ver registos de atividade",
  "Ver histórico de alterações",
].filter((permission) => permission !== "Redefinir palavra-passe");

// The role matrix is a UI default only; APIs and RLS remain authoritative.
const PROFESSOR_PERMISSIONS = [
  "Ver alunos",
  "Ver professores",
  "Ver disciplinas",
  "Ver turmas",
  "Ver horários",
  "Ver relatórios",
];

const STAFF_PERMISSIONS = ALL_PERMISSIONS.filter((permission) => permission.startsWith("Ver "));

export function defaultPermissionsForRole(role: UserRole): string[] {
  if (role === "Administrador") return [...ALL_PERMISSIONS];
  if (role === "Administrador Adjunto") return [...ADJUNCT_PERMISSIONS];
  if (role === "Professor") return [...PROFESSOR_PERMISSIONS];
  if (role === "Funcionário") return [...STAFF_PERMISSIONS];
  return ["Ver horários"];
}

export function hasPermission(user: { role: UserRole; permissions?: string[] } | null | undefined, permission: string): boolean {
  if (!user) return false;
  if (user.role === "Administrador") return true;
  if (user.role === "Administrador Adjunto") {
    return ADJUNCT_PERMISSIONS.includes(permission as (typeof ADJUNCT_PERMISSIONS)[number]);
  }
  return user.permissions?.includes(permission) === true;
}
