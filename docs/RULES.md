# Matriz de regras de Netrunning

Escopo: Core Rulebook, só como referência, sem copiar o texto (D14). Alvo: CPR v0.92.4.
Motor de elegibilidade: [`src/domain/net-rules.ts`](../src/domain/net-rules.ts).

Fontes:
- **Sistema**: código do CPR v0.92.4 instalado, lido em 2026-11-09.
- **Core**: regra do livro, citada de memória e ainda não conferida página a página.
  O GM confirma todo efeito no modo assistido (D04), e qualquer divergência vira
  correção registrada aqui.
- **Dn**: decisão do usuário (ver [DECISIONS.md](DECISIONS.md)).

## O que o sistema implementa (fato verificado)

- **Habilidades de Interface**: `CPR.interfaceAbilities` (config.js) define scanner, backdoor,
  cloak, control, eyedee, pathfinder, slide, virus e zap. A ficha também oferece
  `defense` e `speed`.
- **Rolagem de habilidade**: `cyberdeck.createRoll("interfaceAbility", actor,
  {interfaceAbility, cyberdeck, netRoleItem})` cria um `CPRInterfaceRoll`.
  - Total: 1d10 + rank da função NET + mods (efeitos da habilidade, da função, de todas
    as ações e penalidade de ferimento) + Sorte.
  - Zap vira rolagem de ataque. Com `executionType: "damage"`, o dano do Zap é um
    `CPRDamageRoll` de 1d6.
- **Rolagem de programa**: `createRoll("cyberdeckProgram", actor, {programId, executionType,
  netRoleItem})`.
  - `atk` e `def` geram um `CPRInterfaceRoll` com o atributo do programa somado.
  - `damage` usa `program.system.damage.standard`.
- **Black ICE**: ator `blackIce` com `stats.{per,spd,atk,def,rez}` e `class`
  (antipersonnel/antiprogram/other).
  - `createStatRoll(stat)` faz `CPRProgramStatRoll`: 1d10 + atributo.
  - `createDamageRoll` usa o dano do programa de origem.
- **Fluxo nativo da ficha**: `handleRollDialog(event, actor, item)` abre o diálogo
  (Ctrl pula), depois vêm `item.confirmRoll` e `roll()`. A ficha desconta a Sorte e chama
  `CPRChat.RenderRollCard`, que cria a `ChatMessage`.
  - `CPRChat` e as classes de rolagem não são exportados (`game.cpr` só tem `apps`,
    `macro` e `api.actor`). O módulo aciona o próprio `actor.sheet._onRoll` com um evento
    sintético (verificado em 2026-11-10; ver `integrations/cpr/foundry-roll.ts`): o card fica no
    chat com o total em `.d10-number-div span` e sem `rolls`.
- **Programas no cyberdeck**: `rezProgram`, `derezProgram`, `reduceRezProgram` e
  `resetRezProgram`. Rezzar um Black ICE da própria Netrunner cria um token na cena.
- **NetArch**: cada `floors[]` tem conteúdo, DV e nome do Black ICE (chave i18n). Não há
  atributos de Black ICE no andar.
- **O sistema não implementa**:
  - ações NET por turno da Netrunner (só o Demon tem `stats.actions`);
  - comparação com DV;
  - bloqueio de movimento;
  - estado de Password, Control Node e Black ICE durante uma invasão.

## Matriz

As linhas MVP entram na E3-02. As linhas E3-03 ficam fora do motor: o HUD não as oferece.

| Ação | Requisitos | Custo | Rolagem nativa | Efeito | Fonte | Cobertura |
|---|---|---|---|---|---|---|
| Jack In | Função NET (Interface ≥ 1), cyberdeck equipado, NetArch com nó 1a, desconectada | 1 NET (D39) | — | Posição = 1a, revelado | Core (fontes secundárias); D39 | MVP |
| Black ICE à espreita | Chegar num nó com Black ICE ativo ainda não encontrado | — | GM (ou "Resolver"/modo automático): `CPRProgramStatRoll` spd do ICE; Netrunner: `CPRInterfaceRoll` speed | ICE supera a velocidade (empate a favor dela) → efeito imediato, como um acerto; até resolver, tudo espera e a vez não passa; GM pode dispensar | Core (fontes secundárias); D39 | E6-14 |
| Mover 1 andar | Conectada; alvo revelado e ligado pelo caminho (D28); não engajada; para descer, a Password atual precisa estar vencida | 0 (D27) | — | Nova posição | RTG (Jumpstart); D22/D27/D28 | MVP |
| Backdoor | No nó Password não vencida | 1 NET | `CPRInterfaceRoll` backdoor | Supera o DV do andar → Password vencida (GM confirma) | Sistema (rolagem); Core; D24 | MVP |
| Control | No Control Node não controlado | 1 NET | `CPRInterfaceRoll` control | Supera o DV → nó controlado; efeito no mundo narrado pelo GM | Sistema; Core; D24 | MVP |
| Zap | No nó com Black ICE não derrotado | 1 NET | Ataque `CPRInterfaceRoll` zap contra DEF do Black ICE (`CPRProgramStatRoll` def); dano 1d6 (`Roll` do core: a rota nativa usa `CPRChat`, não exportado) | Supera a defesa → dano no REZ do ator vinculado (D25/D26); REZ 0 → derrotado | Sistema; Core; D24 | MVP (E3-02c) |
| Slide | Engajada por Black ICE | 1 NET | `CPRInterfaceRoll` slide contra PER do Black ICE (`CPRProgramStatRoll` per) | Supera → deixa de estar engajada e pode se mover | Sistema; Core; D22/D24 | MVP (E3-02c) |
| Ataque do Black ICE | Netrunner engajada; turno do Black ICE | — (GM) | `CPRProgramStatRoll` atk contra `CPRInterfaceRoll` defense da Netrunner | Supera (GM confirma) → GM rola o dano do item de programa Black ICE de mesmo nome (D31) e o HUD aplica: antipessoal no HP (cérebro, sem armadura, menos `bonuses.brainDamageReduction`); antiprograma no REZ de um programa rezzado ao acaso (REZ 0 = destruído); "outro" e efeitos especiais: GM à mão | Sistema; Core (não conferido); fontes secundárias; D24/D25/D31 | MVP (E6-06); Defense não gasta ação NET |
| Jack Out | Conectada | 1 NET | — | Posição = nula; consequências de Black ICE ficam com o GM | Core | MVP |
| Novo turno (GM) | Sessão ativa | — | — | Ações NET da Netrunner recarregam; em combate, a rodada abre pela vez do Black ICE | D21; D33 | MVP |
| Netrunner NPC inimiga (GM) | Vinculada a um nó (não Black ICE) na flag do item da arquitetura; revelada quando a Netrunner chega | — | Iniciativa: Roll do core `1d10 + REF` de cada lado (empate a favor da jogadora); Zap da NPC: `CPRInterfaceRoll` zap dela contra a Defense da jogadora, dano 1d6 (Roll do core); programa antipessoal da NPC: ATK pela ficha, dano pelo card | Não prende (mover e Jack Out livres); vez alternada e automática; a da NPC termina ao gastar as ações NET da Interface dela; HP 0 = derrotada | Sistema (iniciativa `system.json`); fontes secundárias (Zap contra Interface + 1d10, 1d6 no cérebro); D37 | E6-11b |
| Zap / programa contra a NPC | Netrunner diante da NPC, iniciativas roladas, na vez dela | 1 NET | Zap ou atacante antipessoal contra a Defense da NPC (`CPRInterfaceRoll` defense, rolada pelo GM ou sozinha no modo automático) | Supera → dano 1d6 (Zap) ou do programa no HP da NPC, menos a redução cerebral dela | Fontes secundárias; D37 | E6-11b |
| Encerrar/passar vez | Em combate (engajada); nada pendente | — | — | Vez da Netrunner → rodada + 1 e vez do Black ICE (também sozinho ao gastar a última ação); vez do Black ICE (só GM, ou sozinho ao resolver o ataque) → ações recarregam e vez da Netrunner. Na vez do Black ICE as ações dela são recusadas, menos a Defense | Sistema (Black ICE no topo da iniciativa, `cpr-combat.js`); D33 | E6-08 |
| Liberar nó (GM) | Nó revelado | — | — | Marca o nó como vencido, controlado ou derrotado | D22 | MVP |
| Revelar/ocultar (GM) | NetArch na sessão | — | — | Descoberta pública (D18) | E2-01 | Feito |
| Pathfinder | Conectada, não engajada | 1 NET | `CPRInterfaceRoll` pathfinder | Revela os nós abaixo (pelos caminhos) até o total em andares, parando numa Password de DV maior que o total (ela aparece); conteúdo geral, sem DV | Core (fontes secundárias); D39 | E6-14 |
| Revelar só no mapa (GM) | Nó que não é o da Netrunner | — | — | Posição pública, conteúdo oculto ("Desconhecido"); ao entrar, o conteúdo aparece | D39 | E6-14 |
| Eye-Dee | No nó File não identificado | 1 NET | `CPRInterfaceRoll` eyedee | Supera o DV → arquivo identificado; descrição revelada só à Netrunner (D29) | Sistema; Core; D24/D29 | MVP (E6-04) |
| Cloak | Conectada, não engajada | 1 NET | `CPRInterfaceRoll` cloak | O total fica no registro (DV de quem procurar os rastros) | Core (fontes secundárias); D39 | E6-14 |
| Virus | No andar mais fundo, não engajada | 1 NET | `CPRInterfaceRoll` virus | DV do mestre (sem sugestão); efeito narrado | Core (fontes secundárias); D39 | E6-14 |
| Scanner / Speed | Mundo físico / iniciativa | — | `CPRInterfaceRoll` | Fora da arquitetura | Sistema | E3-03 |
| Rezzar/Derrezzar programa | Booster ou Defender instalado; conectada | 1 NET (Core, a conferir) | — | `system.isRezzed` gravado pela autoridade (D26) | Sistema; Core | MVP (E6-05) |
| Ataque com programa | Atacante antiprograma; no nó com Black ICE não derrotado (antipessoal mira Netrunners: fora); cada atacante uma vez por rodada (D39) | 1 NET | `cyberdeckProgram` atk contra DEF do Black ICE; dano pelo card nativo (diálogo escolhe dano contra Black ICE) | Supera → dano no REZ do ator vinculado | Sistema; Core; D24 | MVP (E6-05) |
| Demons, dano ao cérebro, Defender | Conforme a regra | — | Vários | — | Sistema; Core | E3-03 |

## Limites e comparações

- **Ações NET por turno pela Interface** (Core; D21):

  | Interface | Ações NET |
  |---|---|
  | 0 | 0 (sem ação) |
  | 1–3 | 2 |
  | 4–6 | 3 |
  | 7–9 | 4 |
  | 10 ou mais | 5 |

- **DV**: a rolagem precisa superar o DV; empate falha. Em disputa, o atacante precisa
  superar o defensor (D24).
- **Engajamento**: estar num nó Black ICE não derrotado e não driblado com Slide. Engajada,
  a Netrunner não se move; pode usar Zap, Slide ou Jack Out (D22).
- **Ficha**: a elegibilidade é recalculada a partir do snapshot atual. Perder a função NET
  ou o cyberdeck durante a sessão invalida as ações (SPEC).

## Black ICE (D25)

- A NetArch só traz o nome. O GM vincula ao nó um ator `blackIce` do mundo (sugerido pelo
  nome); DEF/PER/ATK vêm da ficha dele e o dano reduz o `system.stats.rez.value` dele.
- Acerto (E6-06, D31): a fórmula vem de um item `program` da classe `blackice` do mundo com o
  mesmo nome do ator (antiprograma: `damage.blackIce`; demais: `damage.standard`), como a ficha do
  Black ICE no CPR faz. Sem o item, o GM só pode dispensar. Alvo e valor base são fixados quando o
  GM confirma o acerto (D26). Programa destruído fica na ficha com REZ 0 e não pode ser rezzado.
- Lacunas: Shield (bloqueia o primeiro dano cerebral) e efeitos por tipo (fogo do Hellhound, Jack
  Out forçado do Giant…) não são automáticos; a regra do antiprograma (alvo ao acaso, destruído
  em REZ 0, sem efeito sem programa rezzado) vem de fontes secundárias; Core não conferido.

## Ajustes da E6-14 (D39)

- Fontes: páginas que citam o Core (pp. 195-210); o livro não foi conferido página a página.
- Antiprograma: com mais de um programa rezzado, o mestre escolhe o atingido antes do dano (o
  modo automático espera a escolha). Com um só, ele é o alvo.
- Vez do Black ICE: no modo automático, o ataque rola sozinho (uma vez por rodada); no manual, o
  botão "Resolver" faz os passos que a regra decide (rolagens do inimigo sem diálogo, resultado
  sugerido, dano) até chegar a algo que exige uma pessoa.
- Virus: a autoridade (que lê a arquitetura completa) marca `run.atBottom` quando a Netrunner chega
  ao andar mais fundo; só então o botão aparece, com o aviso "andar mais fundo". É público de
  propósito: ela sabe que chegou ao fundo, como na ficção. A autoridade ainda confere pela
  arquitetura ao receber a rolagem.
- Branches: o CPR v0.92.4 aceita de a até h (modelo de dados e gerador aleatório limitam a 8); o
  HUD mostra uma coluna por branch.

## Programas (D40)

Fonte: documento do usuário com o resumo das regras (Core pp. 197-206, errata v1.25, manual do
Netrunning Deck, FAQ v1.3). Paráfrase própria.

| Regra | No módulo |
|---|---|
| Rezzar, derrezzar, atacar: 1 ação NET cada | Motor (`checkProgramRez`, `checkProgramAttack`) |
| Cada cópia ativa uma vez por rodada (rezzar ou atacar) | `run.programsUsed`, zerado quando a vez volta à Netrunner ou no novo turno |
| Atacante desliga sozinho depois do uso | Atacantes não se rezzam no HUD |
| REZ 0 neutraliza; derrezzar + rezzar volta com o REZ cheio | Marca `programState: "neutralized"` no item; rezzar grava REZ = máximo |
| Destruído só por efeito que manda | Marca `"destroyed"`; Dragon, Killer e Sabertooth básicos destroem |
| Armor, Flak, Shield: uma cópia ligada por vez, uma vez por Netrun | `one-copy` e `once-per-run` (`run.netrunUsed`, zerado no Jack In) |
| Superglue: uma vez por Netrun | `once-per-run` no ataque |
| Shield absorve o 1º acerto de programa ofensivo comum | Acerto de programa da NPC: sem dano, Shield neutralizado (Zap não conta) |
| Antiprograma à espreita só com programa em execução | Encontro não dispara sem programa rezzado com REZ |

Fora do módulo: efeito de Flak (ATK 0 dos atacantes contra ela) e redução do Armor ficam com a
ficha/o mestre; Black ICE instalado pela própria Netrunner não é tratado pelo HUD.
