# Estado e passagem de contexto

Atualizado em: 2026-11-11.

## Situação

- Módulo funcional e publicado: v0.4.1 no repositório público (D41), com HUD de sessão, várias
  invasões ao mesmo tempo, Netrunner NPC, Black ICE básicos (só na cópia local), editor de
  arquitetura (D42) e janela do cyberdeck (D43). Publicar versões: docs/DEVELOPMENT.md.
- Alvo: Foundry V12 (12.343) + Cyberpunk RED – CORE v0.92.4 (D09).
- `pacote-teste/` (fora do git) só é refeita a pedido do usuário. Última: 0.3.2 completa, com os
  Black ICE básicos, sem `manifest`/`download` no `module.json` (atualizar pelo Foundry trocaria
  pela versão pública sem os básicos), sem o source map, zip com a pasta do módulo e `LEIA-ME.txt`.
- Histórico de entregas concluídas: `git log` e as decisões em docs/DECISIONS.md. Roadmap e
  registros de tarefas concluídas foram apagados a pedido do usuário (2026-11-11).

## Última entrega: UI dos programas (2026-11-12), publicada como v0.4.1

- Cartões de programa com LED e borda por estado (ligado, desligado, atacante pronto, usado,
  neutralizado, destruído), nenhum apagado por opacidade; espectadores recebem a classe do programa
  (sem atributos); ações com ícone na mesma linha. Ícone de editar arquitetura centralizado (margem
  do Foundry no `<i>`); Descartar com lixeira. Varredura de comentários: nenhum restante.

## Entrega anterior: pedido de 9 itens (2026-11-12, D45, D46), publicada como v0.4.0

- Publicado como v0.4.0 (2026-11-12, pedido do usuário): commit abb886b no `main`; instantâneo
  4ec4337 (autor noreply) em `origin/main`; release v0.4.0 (não pre-release). Build limpo no
  worktree de `public`: 359 testes, sem dados dos básicos. Conferido: manifesto `releases/latest` e
  zip respondem 200, versão 0.4.0, `download` certo, 16 entradas no zip.

- Programas: Armor −4 no cérebro, Flak zera ATK de atacantes inimigos, atacantes "pronto"/"usado",
  programa repetido na lista do deck conta uma vez (`net-rules.ts`, `checks.ts`,
  `character-adapter.ts`, `session-hud-app.ts`).
- Editor: Lobby só na branch A; "Branch sai de" no primeiro nó de cada branch (`net-architecture.ts`,
  `arch-draft.ts`, `foundry-netarch.ts`, `requests.ts` `withBottom`).
- Dados liberados (`node-secrets.ts`, `notes.ts`, `request-channel.ts` `showJournal`, `main.ts`
  `showReleasedFiles`, painel "Dados liberados" no HUD, ação `controlOption`).
- Validação: `npm run check` exit 0 (362 testes). Manual real (2026-11-12, Foundry 12.343, mundo
  `cyberdeck-hud`, abas GM e Runner Teste): editor recusou 2B com aviso de Lobby; "Branch sai de"
  trocou 4C de B para A e redesenhou a ligação; gravação e regravação da flag `forks` e `secrets`
  (senha trocada, opções apagadas e restauradas) conferidas no item; Password liberada mostrou a senha
  no painel do mestre e da Netrunner (socket); File liberado abriu para a Netrunner o diário sem
  permissão (`Journal.show` force) e a imagem; "Abrir arquivo"/"Ver imagem" reabriram; Control Node:
  2 botões, "Abrir a porta" gastou 1 ação, entrou em `controlChoices` e no registro; Sword como
  "Atacante pronto"; Armor rezzado: Hellhound à espreita venceu (20 × 3), dano 2d6 = 6, HP 35 → 33.
  Sem erros do módulo no console. Mundo restaurado (sessão de teste encerrada, HP/Armor de volta,
  arquitetura e diário de teste apagados). Não conferido na tela: Flak (exige combate com NPC; coberto
  por teste automatizado), FilePicker do editor, layout estreito.
- Pergunta aberta ao usuário: as duas Swords da ficha do amigo eram itens diferentes? Se sim, o
  desligamento das duas tem outra causa.

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
