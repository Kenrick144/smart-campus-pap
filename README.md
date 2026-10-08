# Smart Campus

Aplicação web responsiva para gestão escolar, assiduidade, QR Codes e equipamentos do campus.

## Executar

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. A página inicial encaminha para o formulário de entrada.

## Perfis e ecrãs

No ecrã de entrada, escolha um perfil de demonstração: Administrador, Professor, Aluno ou Funcionário. Introduza um email e uma palavra-passe não vazios para abrir esse espaço. Os perfis restringem a navegação entre áreas. A seleção de perfil no cabeçalho existe apenas para explorar as interfaces.

- **Administrador:** utilizadores, alunos, professores, turmas, disciplinas, presenças, horários, salas, computadores, QR Codes, relatórios, registos e configurações.
- **Professor:** turmas, alunos, horários, marcação de presenças e relatórios.
- **Aluno:** horário, leitura de QR, presenças pessoais e início de sessão num PC.
- **Funcionário:** salas, horários e estado dos computadores.
- **Estação de trabalho:** `/pc`; um professor ou funcionário pode gerar um código de seis dígitos em *Computadores*. O código expira ao fim de 15 minutos e liberta o equipamento quando a sessão termina.

Os dados de demonstração são guardados no `localStorage` do navegador: não são partilhados entre dispositivos nem constituem uma base de dados segura. Os emails e palavras-passe introduzidos não são autenticados nem guardados como credenciais. Esta versão **não está ligada ao Supabase** e não deve guardar dados pessoais reais. Antes de utilização institucional, é necessário configurar Supabase Auth, a base de dados relacional, políticas RLS por perfil e os segredos de ambiente; a seleção de perfil no cliente não substitui controlos de acesso no servidor.

Os códigos QR de exemplo são gerados na aplicação e podem ser lidos pela câmara do dispositivo. A leitura requer permissão do navegador e HTTPS (ou `localhost`); também é possível introduzir o código manualmente. A aplicação inclui um manifest e registo de service worker para instalação como PWA; este guarda apenas recursos estáticos e não torna os dados partilhados nem a aplicação totalmente disponível offline.
