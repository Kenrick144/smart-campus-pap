# API de catálogos para pré-importação Untis

Endpoint: `GET /api/untis-import/catalogs`

Branch de implementação: `feature/untis-import-readonly-api`

## Segurança

- Exige sessão Supabase válida através dos cookies da aplicação Smart Campus.
- Exige conta com estado `Ativo`.
- Autoriza apenas os perfis `Administrador` e `Administrador Adjunto`.
- Consulta os dados com o cliente administrativo apenas depois da validação da sessão e do perfil no servidor.
- Não aceita parâmetros de escrita e não executa INSERT, UPDATE, DELETE, RPC de alteração ou migrações.
- Resposta marcada como `readOnly: true` e com `Cache-Control: private, no-store`.

## Dados devolvidos

- `academicYears`: anos letivos.
- `classes`: turmas ativas.
- `teachers`: professores com ficha profissional ativa e conta ativa; apenas ID, nome, número profissional e departamento.
- `disciplines`: disciplinas ativas.
- `rooms`: salas ativas.
- `classDisciplineLinks`: associações ativas entre turma e disciplina.
- `teacherClassLinks`: associações atuais de professor à turma.
- `teacherDisciplineClassLinks`: associações entre professor e disciplina/turma.

Os UUIDs são devolvidos para correspondência, não como autorização para importar. A validação final deve confirmar que cada horário aponta para uma associação válida de disciplina/turma e para um professor autorizado.

## Respostas esperadas

- `200`: catálogos devolvidos.
- `401`: sem sessão autenticada.
- `403`: conta inativa, perfil inválido ou perfil sem autorização.
- `500`: erro interno de leitura.

## Limite de integração entre aplicações

A rota usa os cookies de sessão do próprio domínio Smart Campus. A aplicação Untis, alojada noutro domínio, não deve chamar este endpoint com cookies de terceiros nem receber uma chave `service_role`. Para uma ligação entre domínios, falta definir e implementar um fluxo SSO/OAuth ou uma sessão partilhada segura e uma política CORS estrita. Até isso existir, o endpoint é utilizável dentro do domínio Smart Campus e não deve ser exposto como API pública.

## Estado

Endpoint criado em branch de funcionalidade. Não foi feita qualquer escrita na base de dados nem alteração de schema. Build e testes com sessão real ainda precisam de ser executados.
