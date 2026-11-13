# Estado e passagem de contexto

Atualizado em: 2026-11-12.

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

## Última entrega: pedido de 3 itens (2026-11-12, D47), v0.5.0

- Varredura antes da v0.5.0: nenhum comentário; removidos tipos sem uso (`DvCheck`, `ContestCheck`,
  `FreeCheck`) e o estilo `.cnh-note`.
- Ícones centralizados: o Foundry põe `margin-right: 3px` em todo `button > i`; zerado para todos os
  botões do módulo (`styles/netrunner-hud.css`), inclusive o de desinstalar do deck. Os botões com
  texto já usam `gap`.
- Pathfinder pode parar em qualquer nó com DV maior que o total, não só Password (`pathfinder.ts`). Opção de
  mundo do mestre "Pathfinder para em" (`pathfinderGate`: só Password, padrão, ou qualquer DV),
  registrada no `main.ts` e passada pela autoridade no `ProcessContext` (`request-channel.ts`).
- Conector do rodapé do deck: anel e plugue desenhados num único SVG (`deck.hbs`, CSS
  `.cnh-dk-jack*`). Causa: com a janela em meia coordenada (Foundry centraliza), o círculo em CSS
  acompanha o meio pixel e o glifo da fonte (ou um SVG à parte) é encaixado no pixel inteiro, ~1px
  à esquerda. Conferido em captura 1:1 (viewport 800px), janela em x inteiro e x + 0,5: concêntricos.
- Programa destruído: "Remover programa" (lixeira, com confirmação) no lugar de Rezzar/Instalar/
  Desinstalar; desinstala do deck e apaga o item da ficha (`checkRemove` em `deck-config.ts`,
  `removeProgram` em `foundry-deck.ts`, `deck-app.ts`, `deck.hbs`, textos pt-BR/en). Bloqueado
  durante a invasão, como o resto do deck.
- Causa de "destruído não desinstala" não confirmada: o código não recusava a desinstalação; a
  hipótese é a trava do deck enquanto conectada. Conferir com o usuário.
- Validação: `npm run check` exit 0 (365 testes, antes da opção). Manual real (2026-11-12, Foundry 12.343, mundo
  `cyberdeck-hud`, só aba GM): ícones dos botões só de ícone medidos no centro (deslocamento 0 px,
  `margin-right` 0), desinstalar do deck conferido na tela; programa temporário destruído e instalado
  mostrou só "Remover programa", confirmação, item apagado da ficha, id fora de `installedItems.list`
  e slots 4/7 → 3/7; sessão nova com NetArch temporária, Pathfinder total 10 do andar 1 revelou File e
  Control Node de DV 14 no andar 3 e escondeu os nós abaixo deles, revelando o 4C. Sem erros do módulo.
  Restaurado: sessão de teste encerrada, NetArch e programa temporários apagados; a sessão
  "Batatinha" já aberta não foi tocada. Não conferido: remoção feita pelo jogador dono (só GM).
- Opção e conector, manual real (mesmo dia e mundo, GM): opção aparece nas configurações do mundo
  (padrão trocado depois para só Password, a pedido do usuário); com "só Password", Pathfinder total 9 revelou o 4A sob File de DV 14 e
  escondeu o 4B sob Password de DV 14. Conector: tinta do glifo a 6px/5px da borda interna (antes
  5,63px). Restaurado: sessão e NetArch temporárias apagadas, opção de volta ao padrão.
  `npm run check` exit 0 (367 testes).

## Entrega anterior: UI dos programas (2026-11-12), publicada como v0.4.1

- Cartões de programa com LED e borda por estado (ligado, desligado, atacante pronto, usado,
  neutralizado, destruído), nenhum apagado por opacidade; espectadores recebem a classe do programa
  (sem atributos); ações com ícone na mesma linha. Ícone de editar arquitetura centralizado (margem
  do Foundry no `<i>`); Descartar com lixeira. Varredura de comentários: nenhum restante.
- Publicado como v0.4.1 (2026-11-12, pedido do usuário): commit 23cfd41 no `main`; instantâneo
  eb3ec2f em `origin/main`; release v0.4.1 (não pre-release). Build limpo de `public`: 359 testes,
  sem dados dos básicos. Conferido: manifesto e zip respondem 200, versão 0.4.1, 16 entradas.
- v0.4.1 enviada à página do Foundry pela API de release (2026-11-12, pedido do usuário): dry-run
  e envio com 200; a página pública mostra 0.4.1 com o manifesto da release. Token fora do projeto.


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
