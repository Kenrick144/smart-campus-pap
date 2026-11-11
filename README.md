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

## Deploy no Vercel

Para gerar as páginas e executar a aplicação, o projeto Vercel precisa das variáveis públicas `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. No preview da branch `integracao-supabase-real`, estas variáveis devem estar configuradas no ambiente **Preview**, associadas a essa branch. Depois de alterar variáveis de ambiente, é necessário criar um novo deployment para que sejam aplicadas.

As rotas de servidor que usam o cliente administrativo também precisam de `SUPABASE_SECRET_KEY`, guardada como variável de ambiente do servidor (por exemplo, nos ambientes Preview/Production adequados). Não usar a chave secreta no browser nem num prefixo `NEXT_PUBLIC_`. Nunca guardar os valores das chaves no repositório.

## Dados e segurança

A aplicação usa Supabase Auth para iniciar/terminar sessão. O perfil é lido de `public.users`; não se infere o cargo a partir do email e não é permitido entrar com uma conta inativa. O servidor verifica de novo a identidade, o estado da conta e as permissões antes de ler ou alterar dados.

A integração foi alinhada com o esquema do projeto Supabase Smart Campus: `users`, `alunos`, `professores`, `funcionarios`, `anos_letivos`, `turmas`, `salas`, `disciplinas`, `alunos_turmas`, `professores_turmas`, `disciplinas_turmas`, `professores_disciplinas_turmas`, `horarios`, `presencas`, `equipamentos`, `notas`, `avaliacoes`, `logs`, `avisos` e `avisos_leituras`.

A aplicação não cria nem altera automaticamente o esquema da base de dados. Não executes SQL de criação de tabelas por cima da base existente sem rever a migração primeiro. **Atenção:** `supabase/schema.sql` ainda é o esquema legado do protótipo inicial (tabelas em inglês, como `profiles`, `students` e `classes`) e não corresponde à base de dados ativa. Não o executes no projeto atual. Os ficheiros em `supabase/migrations/` registam correções incrementais de segurança; ainda não constituem uma migração base completa para instalar o sistema numa base de dados vazia. A tabela `users` liga-se a Supabase Auth através do mesmo UUID. A gestão de utilizadores cria a conta Auth e os registos de perfil correspondentes através de uma rota de servidor.

## Perfis

- **Administrador:** gestão administrativa e acesso às áreas autorizadas.
- **Administrador Adjunto:** gestão de utilizadores e dados de acordo com as permissões do servidor.
- **Professor:** turmas atribuídas, alunos, horários e presenças autorizadas.
- **Aluno:** os seus próprios dados, horários e presenças.
- **Funcionário:** áreas operacionais autorizadas, incluindo salas e equipamentos.

A interface oculta as opções que não pertencem ao perfil, mas a autorização efetiva é validada no servidor.

## Funcionalidades ainda limitadas

- O acesso temporário aos computadores usa `codigos_temporarios`, `sessoes_computador` e `pc_device_credentials` no Supabase. Os códigos são de 6 algarismos, válidos durante 10 minutos, de utilização única e associados ao computador identificado pelo QR. O limite é de 5 emissões por utilizador em 15 minutos; o PC Agent bloqueia o posto durante 10 minutos após 5 tentativas inválidas. O PC Agent autentica cada equipamento por token; a validação reforçada de tentativas inválidas bloqueia o equipamento após 5 falhas durante 10 minutos. As migrações `202611050001_pc_qr_user_code.sql` e `20261111130000_guard_pc_agent_qr_sessions.sql` têm de ser revistas e aplicadas manualmente, por esta ordem, antes de ativar o fluxo QR/PC Agent. A migração `20261109140000_guard_pc_temporary_code_attempts.sql` contém também a proteção do fluxo legado; não executar migrações sem comparar com o schema ativo. O funcionamento num PC Windows 11 Pro e a integração com o agente instalado têm de ser testados no equipamento real.
- Algumas preferências gerais da página de configurações continuam guardadas localmente no navegador.
- O funcionamento final depende das variáveis de ambiente corretas e das políticas/tabelas existentes no projeto Supabase. É necessário testar com contas reais de cada perfil antes da utilização institucional.
