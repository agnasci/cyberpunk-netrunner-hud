# Estado e passagem de contexto

Atualizado em: 2026-11-11.

## Situação

- Módulo funcional e publicado: v0.3.1 no repositório público (D41), com HUD de sessão, várias
  invasões ao mesmo tempo, Netrunner NPC, Black ICE básicos (só na cópia local), editor de
  arquitetura (D42) e janela do cyberdeck (D43). Publicar versões: docs/DEVELOPMENT.md.
- Alvo: Foundry V12 (12.343) + Cyberpunk RED – CORE v0.92.4 (D09).
- `pacote-teste/` (fora do git) só é refeita a pedido do usuário.
- Histórico de entregas concluídas: `git log` e as decisões em docs/DECISIONS.md. Roadmap e
  registros de tarefas concluídas foram apagados a pedido do usuário (2026-11-11).

## Última entrega: revisão geral do código (2026-11-11, D44)

- Limpezas sem mudança de comportamento: `isId`/`MAX_ID_LENGTH` só em `session-state.ts`; leitores
  de caminho da ficha reusados de `character-adapter.ts`; `listNpcLinks` via `readLinkFlag`; helper
  do deck equipado em `foundry-roll.ts`; `MODULE_ID` no lugar do id literal; botão do editor na aba
  Items sem `innerHTML`.
- Comentários removidos de TS/JS/CSS (fica só `/// <reference types="vite/client" />`).
- Validação: `npm run check` exit 0 (350 testes). Sem teste manual no Foundry.

## Próximas tarefas

Estados: `TODO`, `BLOCKED`. Uma tarefa por vez; detalhar objetivo, arquivos e aceite ao começar.

| ID | Estado | Entrega | Condição |
|---|---|---|---|
| E6-13 | TODO | Netrunners NPC genéricas por dificuldade, prontas para vincular | Quando o usuário pedir |
| E6-11c | BLOCKED | Duas Netrunners aliadas na mesma rede (D36) | Conferir no Core se é permitido e como funciona |
| E3-03 | TODO | Ampliar ações, programas, Black ICE, Demons, danos e turnos ainda não cobertos (docs/RULES.md) | Revisão de escopo com o usuário |
| E3-04 | TODO | Vínculos explícitos com a cena (portas, dispositivos) | Revisão de escopo com o usuário |

Também aguardando o usuário: revisão da janela do cyberdeck e do editor de arquitetura.

## Pendências abertas

- `npm audit`: ReDoS moderado em `minimatch` (só lint, dev).
- Conferir no livro: tabela de ações NET, custos de Jack In/Out, regra de branches (D28), dano do
  Black ICE antiprograma (D31), rezzar antes do Jack In contra "uma vez por Netrun" (D43).
- Aprovação do usuário para a estética das animações e dos sons.
- `rollFromSheet` espera sem limite enquanto o diálogo nativo está aberto; diálogo perdido deixa o
  HUD em "Rolando na ficha…" até recarregar.
- Não conferido na tela: atualizar pelo manifesto num Foundry; layouts estreitos e textos pt-BR do
  editor e do deck; Firefox; mestre abrindo o deck de outra ficha; iniciar sessão com arquitetura
  criada no editor; destravar o editor ao encerrar a sessão; escolha do programa pelo mestre, Cloak e
  Virus resolvidos, modo automático ligado; Shield contra NPC, Superglue, antiprograma à espreita,
  destruição por Dragon/Killer/Sabertooth (estes cobertos por testes automatizados).
- Limitações conhecidas: id apagado na lista do deck ocupa slot sem aparecer (sistema); botão
  "Cyberdeck" da ficha só aparece se a ficha já tem cyberdeck ao abrir; o botão Virus pode aparecer
  num andar que a Netrunner acha ser o último.
