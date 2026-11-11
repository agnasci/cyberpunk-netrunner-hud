# Estado e passagem de contexto

Atualizado em: 2026-11-10.

## Situação

- E0–E5-01 concluídas. Teste em outra mesa gerou o backlog **E6** (11 itens, ROADMAP) e as
  decisões D27–D30. **E6-01 a E6-11b concluídas**; E6-11c bloqueada (conferir no Core).
- E5-02 (licença/pacote final) adiada pelo usuário; pasta `pacote-teste/` serve para testes.
- Alvo: Foundry V12 (12.343) + Cyberpunk RED – CORE v0.92.4 (D09).

## Última entrega: E5-02 (publicação beta 0.1.0, D41)

- Repositório público `agnasci/cyberpunk-netrunner-hud`, licença MIT (LICENSE), README de usuário
  com instalação por manifesto e o aviso da política de conteúdo de fã da R. Talsorian; título
  "Netrunner HUD — for Cyberpunk RED" (id mantido); manifesto com `url`, `manifest`
  (`releases/latest/download/module.json`), `download` (`v0.1.0/module.zip`), `bugs`, versão 0.1.0.
- Black ICE básicos só na cópia local: dados em `src/domain/builtin-ice.local.ts` e testes da tabela
  em `tests/unit/builtin-ice.local.test.ts`, ambos fora do git; sem eles a lista é vazia e o ajuste
  "Criar os Black ICE básicos" some. Conferido: `npm run check` sem os arquivos locais (322 testes) e
  com eles (325); bundle público sem os dados.
- Envio: instantâneo sem o histórico local (que contém os dados), autor noreply; passos em
  docs/DEVELOPMENT.md ("Publicar uma versão").
- Publicado em 2026-11-10: https://github.com/agnasci/cyberpunk-netrunner-hud (1 commit, autor noreply)
  e release v0.1.0 com `module.zip` (caminhos com barra normal) e `module.json`. Conferido: URL do
  manifesto e do zip respondem 200; manifesto baixado traz versão 0.1.0 e o `download` certo; zip com
  `module.json` na raiz; build feito num worktree do branch `public`, sem os arquivos locais (322
  testes). Não conferido: instalar pelo manifesto num Foundry (a pasta do módulo aqui é um link para
  `dist/` do desenvolvimento).
- Rodapé do HUD: "Encerrar sessão" abaixo dos controles de vez, à direita (conferido no Foundry).

## Última entrega: E6-14 (ajustes do teste da mesa, D39)

Lista de 15 itens do teste com o amigo, todos tratados:
1. Sword: atacante ativa uma vez por rodada (Core); botão recusa com aviso até a próxima rodada.
2. Pathfinder: revela os nós abaixo até o total, parando em Password de DV maior.
3. Cloak: rolagem com total no registro. 5. Virus: só no andar mais fundo, DV do mestre.
4. Arrastar NPC: por ponteiro (não pelo arrastar do HTML; botões não arrastam no Firefox) e sem
   abrir o diálogo de vínculo ao soltar.
6. Revelar só no mapa: ferramenta do GM; o jogador vê "Desconhecido" até entrar.
7/8. Ações do inimigo acessíveis: ataque automático do Black ICE (modo automático) e botão
   "Resolver" em 1 clique (modo manual) que faz o que a regra decide sem diálogo.
9. Som: liga/desliga no cabeçalho do HUD (ajuste do cliente).
10. Jack In custa 1 ação NET (Jack Out já custava).
11. Scroll das áreas do HUD mantido entre renderizações.
12. Card de inimigo flutuante sobre o HUD, minimizável; alerta pulsando para o mestre com ação
    pendente; ícone discreto para jogadores; a decisão do encontro fica dentro do card.
13. Antiprograma com mais de um programa rezzado: o mestre escolhe o alvo antes do dano.
14. NPC desvinculada sai do estado público (não pede mais iniciativa).
15. Black ICE à espreita: ao chegar no nó, SPD do ICE contra a velocidade (Speed) da Netrunner;
    efeito imediato se o ICE vencer; a vez só passa depois.

- Arquivos: `domain/net-rules.ts`, `domain/pathfinder.ts` (novo), `session/ambush.ts` (novo),
  `session/checks.ts`, `requests.ts`, `session-state.ts` (`mapped`, `ambush`, `ambushed`,
  `programsUsed`, `iceHit.pickProgram`), `autopilot.ts`, `combat-turn.ts`, `npc.ts`,
  `architecture-view.ts`, `encounter-view.ts`, `event-log.ts`, `hud-fx.ts`, `main.ts`
  (`executeStep`, `resolveNow`), `ui/session-hud-app.ts`, `ui/log-text.ts`, template, CSS, i18n.
- Automatizado: `npm run check` exit 0; 313 testes (16 novos em `e6-14.test.ts`; NPC desvinculada e
  vez durante o encontro vistos falhando sem a correção). Testes antigos ajustados: Jack In custa 1;
  antiprograma com dois programas pede a escolha do mestre.
- Manual real (2026-11-10, Foundry V12 + CPR 0.92.4, abas GM e Runner): arrastar NPC com mouse real
  (3b → 3a → 3b, sem diálogo); desvincular NPC tira NPC e iniciativa; Jack Out e Jack In gastam 1
  ação cada; Pathfinder (total 9) revelou 3 nós via "Resolver"; nó só no mapa aparece "Desconhecido"
  para a Netrunner; encontro à espreita ao entrar no Black ICE: SPD do ICE rolado sem diálogo
  ("Resolver"), Speed da Netrunner pela ficha, sugestão certa; o mesmo "Resolver" rolou o ataque do
  Black ICE na vez dele, aplicou o acerto e o dano (HP 29 → 22) e devolveu a vez; Sword recusado no
  segundo ataque da rodada; scroll da arquitetura mantido (84 → 84) numa atualização; som liga/desliga;
  card flutuante com a decisão dentro e alerta para o mestre. Achados no teste e corrigidos: card
  minimizado cobria o cabeçalho (foi para dentro do corpo); vez passava ao Black ICE com o encontro
  pendente; botões cortados no card.
- Não conferido na tela: escolha do programa pelo mestre (exige dois programas rezzados e Black ICE
  antiprograma), Cloak e Virus resolvidos, modo automático ligado (usa os mesmos passos do
  "Resolver"), Firefox.
- Limitação: o botão Virus pode aparecer num andar que a Netrunner acha ser o último; a autoridade
  recusa depois da rolagem (RULES.md).
- Mundo de teste: NPC desvinculada do nó 3b; Black ICE 2a liberado pelo GM; Netrunner no 3a com
  HP 22; arquivo 3a restaurado (não identificado).

### Quarta revisão do usuário na E6-14 (2026-11-10): regras de programas (D40)

- Cabeçalho: todas as leituras centralizadas (título e valor), menos o Controller.
- Programas conforme o documento do usuário: estados neutralizado e destruído (marca do módulo no
  item); rezzar volta com o REZ cheio; cada cópia ativa uma vez por rodada; Armor/Flak/Shield uma
  cópia por vez e uma vez por Netrun; Superglue uma vez por Netrun; Shield absorve o primeiro acerto
  de programa da NPC; antiprograma à espreita só com programa em execução; Dragon/Killer/Sabertooth
  destroem. Efeito novo `setProgramState` (absoluto, com desfazer); tooltips explicam os limites.
- Automatizado: `npm run check` exit 0; 324 testes (9 novos em `programs-d40.test.ts`; 8 antigos
  ajustados: REZ 0 não destrói mais, efeito novo).
- Manual real: centros de título e valor iguais em todas as leituras menos o Controller; Armor
  rezzado voltou de REZ 3 para 7, entrou em `netrunUsed`; depois de derrezzar, rezzar de novo foi
  recusado na rodada ("já ativada nesta rodada") e na seguinte ("uma vez por Netrun").
- Não conferido na tela: Shield contra NPC, Superglue, antiprograma à espreita, destruição por
  Dragon/Killer/Sabertooth (cobertos por testes automatizados).

### Terceira revisão do usuário na E6-14 (2026-11-10)

- Cabeçalho: a diferença vinha do Foundry, que dá margem (16 px) e recuo (5 px) a todo `<dd>` de
  janela; isso empurrava os quadrados para a direita do título. Zerado com regra mais específica;
  título espaçado compensado. Os três quadrados ganharam a mesma borda e o mesmo fundo (estado só
  pela cor) e o som virou sino/sino cortado, simétrico (o alto-falante parecia descentralizado).
- Manual real, nas abas GM e Runner: quadrados 22×22, mesma altura, centro do quadrado igual ao
  centro do título, ícone com deslocamento 0.

### Segunda revisão do usuário na E6-14 (2026-11-10)

- Cabeçalho: Inimigo, Som e Log com quadrados de 22×22, mesma altura e ícone no centro (a margem do
  ícone vinha do Foundry). Leituras de texto com a mesma altura mínima.
- Black ICE básicos: o arquivo do usuário tem exatamente os 12 já incluídos (os Demons aparecem só
  como classe, sem atributos). Novo ajuste de mundo "Criar os Black ICE básicos no mundo" (padrão
  ligado): o GM autoridade cria ao entrar as fichas que faltam (ator e programa na pasta "Black ICE
  (CNH)"); ficha Black ICE com o mesmo nome é reaproveitada (sem duplicar) e some da lista "cria a
  ficha".
- Manual real: ao entrar, o GM criou os 7 que faltavam (Asp, Liche, Scorpion, Skunk, Dragon, Killer,
  Sabertooth, com o dano nos programas); o Hellhound do mundo foi reaproveitado; ícones do
  cabeçalho medidos com deslocamento 0. `npm run check` exit 0 (315 testes).

### Revisão do usuário na E6-14 (2026-11-10)

- Inimigo: ícone discreto no cabeçalho ("Inimigo"), com tooltip (nome, REZ/HP, pendência); ponto
  âmbar pulsando para o mestre com ação pendente, ponto cinza para jogadores. A visão completa abre
  como painel ao clicar e fecha no X. Padrão: fechado.
- Ícone "só no mapa" passou para dentro da borda do nó: não encosta mais no cadeado do nó vizinho.
- Branches: o CPR aceita a–h (até 8); o HUD já trata todas (teste com 4 colunas).
- Virus: `run.atBottom` calculado pela autoridade; botão e aviso só no andar mais fundo.
- Tooltips em todas as ações (habilidades, Jack In/Out, rezzar, atacar, vez, iniciativa, ataques do
  inimigo), com o motivo do bloqueio junto quando desabilitada. Textos próprios.
- Automatizado: `npm run check` exit 0; 315 testes (Virus pela marca e grade com 4 branches).
- Manual real: ícone no cabeçalho abre e fecha o painel; 21 px entre mapa e cadeado na linha 3;
  Virus ausente no 2a e presente no 3a com o aviso; tooltips conferidos no DOM.

## Última entrega: E6-12 (Black ICE básicos, D38) e ícone único da NPC

- Ícone da NPC no HUD do mestre: um só, no canto inferior esquerdo do nó (sem cobrir o DV): vazio
  (+) vincula; com NPC, clique troca o vínculo e arrastar move. O chip separado saiu.
- `domain/builtin-ice.ts`: 12 Black ICE da tabela do livro enviada pelo usuário (9 antipessoal, 3
  antiprograma) com nome, classe, PER/SPD/ATK/DEF/REZ, dano em dados, custo e resumo próprio e
  curto do efeito (inglês). Sem o texto do livro nem a aparência (limite de direitos autorais; o
  usuário pediu o arquivo inteiro).
- Vínculo no HUD e diálogo de início listam os básicos ainda não criados ("(básico, cria a
  ficha)"); ao escolher, o GM cria ator `blackIce` (flag do módulo) e item de programa `blackice`
  com o dano na pasta "Black ICE (CNH)" e vincula; reusa o que já existe. Sem dano em dados (Asp,
  Liche, Scorpion, Skunk): acerto vira efeito especial do GM. O card do Black ICE mostra ao GM o
  resumo do efeito (notas da ficha).
- Automatizado: `npm run check` exit 0; 297 testes (4 novos em `builtin-ice.test.ts`; o de efeito
  especial visto falhando sem a correção).
- Manual real (2026-11-10): ícone único conferido no HUD do mestre; diálogo de início com 16
  opções (3 do mundo + 12 básicos); Kraken, Wisp, Raven e Giant criados na pasta (com o dano) e o
  Giant entrou vinculado na sessão nova; sem erros do módulo. Defeitos achados e
  corrigidos no teste: classes de documento fora de `globalThis`; `Actor.create` do CPR não
  devolve o ator (sessões ficavam sem vínculo). Não conferido na tela: resumo do efeito no card
  (exige a Netrunner no nó do Black ICE).
- Mundo de teste: atores/itens criados Kraken, Wisp, Raven, Giant; sessões extras encerradas.
- Próxima entrega sugerida pelo usuário: E6-13 (Netrunners NPC genéricas por dificuldade).

## Última entrega: E6-11b (Netrunner NPC inimiga, D37)

- Vínculo nó↔NPC na flag do item da arquitetura (`integrations/cpr/foundry-npc.ts`), pela
  ferramenta nova do nó no HUD do mestre (ícone de ninja; não em nó de Black ICE). A autoridade
  só publica a NPC (`run.npcs`) quando a jogadora chega ao nó (`session/npc.ts`); vincular com
  ela já no nó revela na hora (`npcSync`).
- Combate (`run.fight`): cada lado rola `1d10 + REF` (Roll do core, conferido); antes disso as
  ações de nó esperam (mover e Jack Out livres: não prende). A maior começa (empate: jogadora);
  a vez da NPC termina ao gastar as ações NET da Interface dela (`combat-turn.ts`).
- Jogadora → NPC: Zap e atacantes antipessoal contra a Defense da NPC; dano no HP dela com a
  redução cerebral; HP 0 = derrotada (fim do combate). NPC → jogadora (GM): Zap da NPC ou
  programa antipessoal dela contra a Defense da jogadora; acerto aguarda o dano (1d6 ou card) e
  aplica no HP dela (reusa o acerto do Black ICE com `byNpc`).
- Modo automático: iniciativa e Defense da NPC, resultado e dano dela saem sozinhos. Registro,
  faixas ("Netrunner inimiga", "Vez da Netrunner inimiga", acertou/errou/derrubada), sons e
  desfazer.
- Automatizado: `npm run check` exit 0; 289 testes (14 novos em `npc.test.ts`; os de combate vistos
  falhando sem a revelação; o da faixa de vez visto falhando antes da correção).
- Manual real (2026-11-10, GM + Runner; NPC de teste "Netrunner NPC (CNH)", cópia fictícia, REF 6,
  HP 40): vínculo ao 3b gravado só na flag (sessão pública sem a NPC); ao chegar, painel "Enemy
  Netrunner" com HP 35/40 e pedido de iniciativa; jogadora 9 × NPC 16 → vez da NPC (3 ações);
  Zap da NPC 19 × Defense 7, acerto, dano 1d6 = 6 (HP da jogadora 35 → 29); modo automático: Zap
  da jogadora 9 × Defense da NPC 8 rolada sozinha, acerto e dano 6 aplicados sozinhos (HP da NPC
  35 → 29); desfazer → HP 35, sem refazer; sem erros do módulo.
- Defeitos achados no teste e corrigidos: textos de vez/registro/faixas diziam "Black ICE" no
  combate com a NPC (agora "Netrunner inimiga"; entradas antigas do registro ficam como estavam);
  faixa de vez não aparecia contra a NPC (usava só o engajamento de Black ICE).
- Sigilo: o Foundry envia o item da arquitetura a todos os clientes; a flag da NPC é legível
  pelo console como o resto da arquitetura (D11). Usuário confirmou manter no item (2026-11-10).
- Ambiente: no teste, um seletor pegou um botão de card do CPR no chat e abriu duas janelas de dano
  nativas; fechadas sem rolar.

## Ajustes da E6-11b a pedido do usuário (2026-11-10)

- "Sinal não mapeado" sai logo abaixo do mapa (antes saía do painel da NPC).
- Jogadores veem um marcador de NPC (ninja magenta) só no nó onde a Netrunner está.
- GM arrasta a NPC (chip no nó) para qualquer nó, menos Black ICE e nó com outra NPC (um inimigo
  por nó). Ação `moveNpc` pela autoridade; efeito `moveNpcLink` move a flag. Visível só se
  entra/sai do nó da Netrunner (revela e abre combate com iniciativa / some, encerra o combate,
  registro "saiu do nó"); movimento oculto não entra no registro nem no histórico de desfazer
  (o histórico é público e entregaria a NPC; achado pelo teste automatizado).
- Painéis de Black ICE e de NPC num card recolhível ("Inimigo no nó: nome · REZ/HP"), só com
  inimigo ativo no nó da Netrunner (Black ICE derrotado ou driblado some); preferência por
  navegador.
- Automatizado: `npm run check` exit 0; 293 testes (movimento, sigilo e entrada/saída do nó).
- Manual real: marcador e conector na tela da jogadora; card recolhe/expande; arrastar do GM
  testado com eventos de arrastar pelo DOM (o mouse do navegador automatizado não dispara
  arrastar-e-soltar do HTML5): destinos válidos 0 e 2, NPC foi ao 0 (sumiu para a jogadora,
  combate encerrado, flag movida, nada público vazado) e voltou ao 3 (reapareceu, combate novo
  pedindo iniciativa); sem erros do módulo. Arrastar com o mouse real: conferir na mesa.

## E6-11a (53260b3): várias invasões ao mesmo tempo (D36)

- Até 4 sessões independentes, HUD com abas, migração da sessão única. Testado real.

## E6-10 (c8aefb2): modo sem confirmação do mestre (D35)

- Resultado com sugestão aplicado sozinho e rolagens do Black ICE sem diálogo pelo cliente do
  mestre; desfazer não é refeito. Testado real.

## Ajustes visuais após a E6-10 (pedido do usuário, 2026-11-10)

- Cartões: sem o registro, a grade deixava uma coluna vazia de 10px que estreitava a arquitetura
  e ativava o layout compacto, cuja coluna do ícone (32px) era menor que o hexágono (40px): o
  texto encostava no ícone. Agora sem coluna vazia e a coluna do ícone tem sempre 40px; conferido
  com o HUD em 825px, mesma distância (10px) com e sem registro. As regras de 1100px e sem
  registro ficaram limitadas a janelas acima de 760px (antes venciam o empilhamento de tela
  pequena por especificidade).
- Caixa "Log": quadrada no tema do HUD, ✓ ciano ligada e ✕ cinza desligada (o `::before` que o
  Foundry V12 põe nas caixas de marcar é anulado).
- "Não explorado" virou "Sinal não mapeado": conector tracejado saindo do mapa, cartão
  tracejado com ruído animado, hexágono "?" piscando devagar e a frase "O que existe além do que
  foi revelado é desconhecido." Continua aparecendo sempre para jogadores (não indica se há mais
  andares). Movimento reduzido para as animações.

## Entregas anteriores do E6

- E6-09 (913414a, bba414a, d63d97e): registro de eventos em estilo terminal (D34).
- E6-08 (efa8d1d): vez no combate Netrunner × Black ICE (D33).
- E6-07 (88ec8a4): GM desfaz até 10 passos e ajusta o contador de ações NET.
- E6-06 (3a145ff): acerto do Black ICE na Netrunner (HP/REZ de programa).
- E6-05 (cd5a296): rezzar programas e atacar com antiprograma.
- E6-04 (744fe7e): Eye-Dee e descrição revelada só à Netrunner.
- E6-03 (cff59a0): diálogo de início com PJs e Black ICE vinculados.
- E6-02 (33b7548): faixas distintas, nota do mestre, painel de decisão, ícones centralizados.
- E6-01 (e188029): movimento livre (D27) e caminhos por branch (D28).

## Próxima ação concreta

Beta 0.1.0 publicada (ver E5-02). Próximas: E6-13 (Netrunners NPC genéricas por dificuldade) quando
o usuário pedir; E6-11c bloqueada (conferir no Core). Novas versões seguem docs/DEVELOPMENT.md.
`pacote-teste/` só a pedido.

## Pendências abertas

- `npm audit`: ReDoS moderado em `minimatch` (só lint, dev). Licença: E5-02.
- Conferir no livro: tabela de ações NET, custos de Jack In/Out, regra de branches (D28),
  dano do Black ICE antiprograma (D31).
- Aprovação do usuário para a estética das animações e dos sons.
- `rollFromSheet` espera sem limite enquanto o diálogo nativo está aberto; diálogo perdido
  deixa o HUD em "Rolando na ficha…" até recarregar.
