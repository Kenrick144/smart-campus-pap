# Smart Campus

Aplicação Next.js para gestão escolar, autenticação por perfil, assiduidade, salas e equipamentos, usando o Supabase real.

## Preparação

1. Instala Node.js LTS.
2. Copia `.env.example` para `.env.local`.
3. Preenche as variáveis com os dados do projeto Supabase correto:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ou a chave antiga `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - `SUPABASE_SECRET_KEY` — chave secreta usada **apenas no servidor**; nunca a publiques no GitHub nem a coloques numa variável `NEXT_PUBLIC_*`.
4. Confirma no Supabase que o utilizador existe em **Authentication** e que tem uma linha associada em `public.users`, com o mesmo `id`, `role` válido e `status = 'Ativo'`.
5. Executa:

```bash
npm ci
npm run dev
```

Abre `http://localhost:3000`.

## Dados e segurança

A aplicação usa Supabase Auth para iniciar/terminar sessão. O perfil é lido de `public.users`; não se infere o cargo a partir do email e não é permitido entrar com uma conta inativa. O servidor verifica de novo a identidade, o estado da conta e as permissões antes de ler ou alterar dados.

A integração foi alinhada com o esquema do projeto Supabase Smart Campus: `users`, `alunos`, `professores`, `funcionarios`, `anos_letivos`, `turmas`, `salas`, `disciplinas`, `alunos_turmas`, `professores_turmas`, `disciplinas_turmas`, `professores_disciplinas_turmas`, `horarios`, `presencas`, `equipamentos`, `notas`, `avaliacoes`, `logs`, `avisos` e `avisos_leituras`.

A aplicação não cria nem altera automaticamente o esquema da base de dados. Não executes SQL de criação de tabelas por cima da base existente sem rever a migração primeiro. A tabela `users` liga-se a Supabase Auth através do mesmo UUID. A gestão de utilizadores cria a conta Auth e os registos de perfil correspondentes através de uma rota de servidor.

## Perfis

- **Administrador:** gestão administrativa e acesso às áreas autorizadas.
- **Administrador Adjunto:** gestão de utilizadores e dados de acordo com as permissões do servidor.
- **Professor:** turmas atribuídas, alunos, horários e presenças autorizadas.
- **Aluno:** os seus próprios dados, horários e presenças.
- **Funcionário:** áreas operacionais autorizadas, incluindo salas e equipamentos.

A interface oculta as opções que não pertencem ao perfil, mas a autorização efetiva é validada no servidor.

## Funcionalidades ainda limitadas

- A sessão temporária de utilização de um computador ainda não está ligada a uma tabela de sessões no Supabase; a aplicação informa-o e não altera o estado do equipamento através de dados de demonstração.
- Algumas preferências gerais da página de configurações continuam guardadas localmente no navegador.
- O funcionamento final depende das variáveis de ambiente corretas e das políticas/tabelas existentes no projeto Supabase. É necessário testar com contas reais de cada perfil antes da utilização institucional.
