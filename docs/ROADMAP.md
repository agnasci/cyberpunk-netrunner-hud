# Roadmap e controle de execução

Fonte de requisitos: [SPEC.md](../SPEC.md). Estado detalhado atual: [STATUS.md](../STATUS.md).

Estados: `TODO`, `DOING`, `BLOCKED`, `DONE`. No máximo uma tarefa `DOING` por
implementador. Uma tarefa bloqueada deve indicar motivo e condição para retomar.
Ao executar cada tarefa de código: definir teste comportamental, observar falha,
implementar o mínimo, verificar e registrar evidência. Não criar testes artificiais
para a existência de arquivos documentais. Detalhar o plano da etapa ao iniciá-la;
não congelar assinaturas de APIs ainda desconhecidas.

## E0 — Preparação e validação técnica

| ID | Estado | Entrega e aceite | Depende de |
|---|---|---|---|
| E0-00 | DONE | Contexto, instruções, especificação, roadmap e retomada disponíveis localmente (R08) | — |
| E0-01 | DONE | Matriz de versões, APIs de ficha/arquitetura/rolagens, permissões e transporte com fontes e data | E0-00 |
| E0-02 | DONE | Registrar stack e fronteiras escolhidas; fechar MVP e contratos sem tratar propostas como aprovação do usuário | E0-01 |
| E0-03 | DONE | Criar manifesto/build/checks e módulo mínimo; carregar no mundo de teste sem erro (R01) | E0-02 |

## E1 — HUD e ficha integrados

| ID | Estado | Entrega e aceite | Depende de |
|---|---|---|---|
| E1-00 | DONE | Protótipo visual do HUD com dados sintéticos, sem regras nem rede; aprovação visual do usuário (D13, R07) | E0-03 |
| E1-01 | DONE | Adaptador normaliza ator/cyberdeck/programas; testa ausência, troca e programa indisponível (R05) | E0-03 |
| E1-02 | DONE | Mestre inicia/encerra painel; 3 clientes veem sessão; controles por papel; abrir/fechar não duplica listeners (R02/R03) | E1-01 |

## E2 — Arquitetura, autoridade e recuperação

| ID | Estado | Entrega e aceite | Depende de |
|---|---|---|---|
| E2-01 | DONE | Arquitetura nativa normalizada; descoberta progressiva e projeções sem dados ocultos (R04/R05) | E1-02 |
| E2-02 | DONE | Processamento GM, idempotência e revisão; rejeita espectador, forja de identidade e duplo clique (R03) | E2-01 |
| E2-03 | DONE | Persistir/restaurar; testar entrada tardia, refresh, dois GMs, queda de autoridade e falha parcial de efeitos | E2-02 |

### E2-03 em passos

Objetivo: estado consistente com vários GMs, queda/retorno da autoridade, refresh e
reinício do mundo.
Arquivos: `src/session/requests.ts`, `src/transport/request-channel.ts`, `src/main.ts`,
`src/ui/session-hud-app.ts`, `lang/`.

Problema encontrado na análise: o GM não autoridade grava revelar/ocultar/encerrar por
conta própria, em paralelo à fila da autoridade (dois escritores → atualização perdida; um
encerramento podia ser desfeito por uma requisição em processamento). Solução (D20): toda
mutação, inclusive do GM, vira requisição processada só pela autoridade.

- [x] Ações de GM (`reveal`, `conceal`, `end`) no processador, só para GM; idempotentes
      e sem exigir revisão atual; testes.
- [x] HUD envia tudo pela autoridade; remover gravação direta pelo GM.
- [x] Sessão armazenada incompatível: aviso ao GM e limpeza.
- [x] Teste real com 2 GMs + Netrunner: uma única aplicação; mutações simultâneas sem perda;
      autoridade sai → próximo GM assume; GM volta → estado preservado.
- [x] Teste real de persistência: relançar o mundo e restaurar sessão, posição e descobertas.

Aceite: os cenários acima com evidência. Falha parcial de efeitos na ficha passa para a
E3-02, onde surge o primeiro efeito (D20); hoje não há efeito a falhar.

## E3 — MVP assistido e expansão de regras

| ID | Estado | Entrega e aceite | Depende de |
|---|---|---|---|
| E3-01 | DONE | Matriz ação/requisitos/custo/rolagem/efeito/fonte; motor testa elegibilidade e limites (R04/R05) | E2-03 |
| E3-02 | DONE | Fluxo Password → Black ICE → Control Node com rolagens nativas e confirmação GM; não rerrolar ao confirmar; falha parcial entre sessão e ficha sem duplicar nem omitir (R06, D20). Dividida em E3-02a/b/c | E3-01 |
| E3-03 | TODO | Expandir ações/programas/Black ICE/Demons/danos/turnos conforme matriz de cobertura; ficha atualizada uma vez | E3-02 |
| E3-04 | TODO | Modos manual/automático e vínculos explícitos com cena, após revisão de escopo | E3-03 |

### Plano da E3-01

Objetivo: matriz de regras com fonte ([RULES.md](RULES.md)) e motor puro de elegibilidade
e limites, sem ligar à sessão nem rolar (isso é E3-02). Decisões do usuário: D21–D24.

Arquivos: `docs/RULES.md`, `src/domain/net-rules.ts`, `tests/unit/net-rules.test.ts`,
`docs/DECISIONS.md`.

- [x] Matriz: ação, requisitos, custo, rolagem nativa, efeito, fonte e cobertura (MVP/E3-03).
- [x] Motor: ações NET por turno pela Interface; elegibilidade de Jack In/Out, mover,
      Backdoor, Control, Zap e Slide pelo nó atual, recursos da ficha e limite do turno.
- [x] Bloqueios: Password não vencida impede descer; Black ICE ativo engaja e impede mover.
- [x] Comparações: DV exige superar; disputa exige superar a defesa (D24).

Aceite: testes unitários para cada regra da matriz marcada como MVP, vistos falhando antes;
regras fora do MVP aparecem na matriz como não cobertas, sem ação no motor.

### Plano da E3-02

Dividida em três entregas pequenas, cada uma com teste real:

| Sub | Estado | Entrega e aceite |
|---|---|---|
| E3-02a | DONE | Turno e bloqueios: sessão v4 com ações usadas, turno e nós resolvidos/driblados; processador aplica `net-rules` (D21/D22); GM tem "Novo turno" e "Liberar/Restaurar nó"; HUD mostra ações restantes e estado dos nós e só oferece movimento permitido |
| E3-02b | DONE | Backdoor e Control: rolagem nativa no cliente da Netrunner (D23), checagem pendente com total, GM compara com o DV e confirma sem rerrolar; Password vencida / nó controlado |
| E3-02c | DONE | Black ICE: ator vinculado pelo GM (D25); Zap/Slide em disputa contra DEF/PER rolados pelo GM na ficha do Black ICE; dano do Zap no REZ do ator; ataque do Black ICE (ATK × Defense da Netrunner, efeito aplicado pelo GM); falha parcial entre sessão e ficha (D20/D26) |

E3-02a — arquivos: `src/session/session-state.ts`, `src/session/requests.ts`,
`src/session/architecture-view.ts`, `src/transport/request-channel.ts`, `src/main.ts`,
`src/ui/session-hud-app.ts`, `templates/session-hud.hbs`, `styles/`, `lang/`, testes.
Aceite: testes do processador para custo, limite, bloqueio, novo turno e liberar nó (vistos
falhando antes); sessão v3 armazenada é migrada sem perda; teste real com GM + Netrunner
esgotando ações, sendo barrada por Password e Black ICE e liberada pelo GM.

E3-02b — fato verificado (2026-11-10, Foundry 12.343): chamar `actor.sheet._onRoll` com um
evento sintético (`currentTarget` com `data-roll-type="interfaceAbility"`,
`data-interface-ability`, `data-cyberdeck-id`) executa o fluxo nativo inteiro: diálogo, Sorte,
modificadores e card no chat. A `ChatMessage` tem autor (servidor), `speaker.actor` e o total
em `.d10-number-div span`; não tem `rolls`. Desenho:
- Netrunner clica Backdoor/Control → rolagem nativa no próprio cliente (D23); diálogo cancelado
  não envia nada nem gasta ação.
- Pedido `check {ability, messageId}` → autoridade revalida a elegibilidade, lê a mensagem
  (autor = remetente, speaker = ator da sessão, total do card), recusa mensagem já usada, gasta
  1 ação e grava `run.pending` com o total. Dispensa a revisão atual (a rolagem já ocorreu).
- Com checagem pendente, mover e nova checagem ficam bloqueados (Jack Out continua).
- GM vê total × DV (local) com sugestão (D24) e confirma sucesso ou falha (`resolveCheck`);
  sucesso marca o nó como resolvido. Nada é rerrolado.
Arquivos: `session-state.ts`, `requests.ts`, `request-channel.ts`, novo
`integrations/cpr/foundry-roll.ts`, `session-hud-app.ts`, template, CSS, lang, testes.
Aceite: testes do processador (checagem, mensagem inválida/reusada/alheia, pendente bloqueia,
resolver sucesso/falha) vistos falhando antes; teste real com Backdoor e Control.

E3-02c — fatos verificados (2026-11-10): `blackIceActor.sheet._onRoll` com
`data-roll-type="stat"` e `data-roll-title="def|per|atk"` gera o card com total em
`.d10-number-div span` e `speaker.actor` do Black ICE; `Roll("1d6").toMessage({speaker})` grava
`rolls[0].formula/total`. O ator "Black ICE" do mundo é o modelo do sistema: não alterar.
Desenho:
- GM vincula um ator `blackIce` ao nó (`linkIce`), sugerido pelo nome; vínculo fica em `run.ice`.
- Zap/Slide: Netrunner rola (custa 1 ação) → pendência de disputa; GM rola DEF/PER na ficha do
  Black ICE (`oppose`); GM confirma pela sugestão `winsContest`. Slide vencido → driblado.
  Zap vencido → Netrunner rola o dano 1d6 → pendência com `REZ antes → depois` → GM aplica.
- Ataque do Black ICE: GM rola ATK (`iceAttack`) → Netrunner rola Defense (`oppose`) → GM
  confirma acerto/erro; o efeito do acerto é aplicado à mão pelo GM (notas do ator).
- Efeitos na ficha (D26): valor absoluto calculado ao criar a pendência; a autoridade executa
  o efeito antes de gravar a sessão; se o efeito falha, nada é gravado nem memorizado; se a
  sessão falha depois, o reenvio reaplica o mesmo valor absoluto (sem dano em dobro).
Arquivos: `session-state.ts`, `requests.ts`, `request-channel.ts`, `foundry-roll.ts`, novo
`integrations/cpr/foundry-ice.ts`, `main.ts`, HUD, template, CSS, lang, testes.
Aceite: testes do processador (vínculo, disputas, dano, ataque, bloqueios) e do executor de
efeitos (falha do efeito, falha da gravação, reenvio sem duplicar) vistos falhando antes;
teste real do encontro completo e das duas falhas parciais.

O MVP funcional termina em E3-02. E3-03/E3-04 preservam a visão futura e não
precisam atrasar a validação do fluxo pequeno. Não marcar regras não implementadas
como suportadas: apresentar indisponibilidade ou resolução assistida explícita.

## E4 — Experiência visual

| ID | Estado | Entrega e aceite | Depende de |
|---|---|---|---|
| E4-01 | DONE | Animações de exploração, invasão, ameaça e resultado; movimento reduzido; sem impacto na autoridade (R07) | E3-02 |
| E4-02 | DONE | Áudio opcional, teclado, layout responsivo, feedback de espera/erro; medir HUD ligado/desligado (dividida em E4-02a/b) | E4-01 |

### Plano da E4-02

| Sub | Estado | Entrega e aceite |
|---|---|---|
| E4-02a | DONE | Espera e erro: indicador distingue "rolando" de "aguardando o mestre"; último erro fica visível no HUD (`role="alert"`). Sem mestre ativo: aviso e controles pausados para jogadores, atualizado ao conectar/desconectar (`userConnected`, SPEC). Teclado: foco preservado entre renderizações. Layout responsivo por container query (janela estreita empilha painéis) |
| E4-02b | DONE | Áudio opcional (ajuste do cliente, volume da interface do Foundry) e medição do HUD aberto × fechado (animações ativas, hooks, tempo de renderização) |

E4-02a — arquivos: `session-hud-app.ts`, `main.ts`, template, CSS, lang, `foundry.d.ts`.
Aceite: teste real com GM e Netrunner (mestre sai → aviso e botões desabilitados; volta →
reativa; erro forçado aparece no HUD; foco continua no botão após ação; janela estreita
empilha sem rolagem horizontal da página).

E4-02b — fato verificado (Foundry 12.343, `client-esm/audio/helper.mjs`): após o primeiro
gesto, `game.audio.interface` é um `AudioContext` com `gainNode` ligado ao ajuste
`core.globalInterfaceVolume`; antes disso `game.audio.locked` é verdadeiro. Desenho:
- Sons sintetizados (osciladores e ruído curto), sem arquivos nem licenças de áudio; um som
  por atualização, escolhido pela faixa do `diffFx` (E4-01). Ligados a `interface.gainNode`.
- Ajuste do cliente "Sons do HUD", desligado por padrão; nada toca com o áudio bloqueado.
- Medição do HUD aberto × fechado: animações ativas, callbacks de hooks, tempo de
  renderização; procedimento em TESTING.md.
Arquivos: novo `ui/sound-cues.ts` (dados puros) e `ui/hud-sound.ts` (Web Audio),
`session-hud-app.ts`, `main.ts`, `constants.ts`, lang, `foundry.d.ts`, testes, TESTING.md.
Aceite: testes das pistas (toda faixa tem som; volumes e durações limitados) vistos falhando
antes; teste real: som desligado não cria osciladores, ligado cria ao ocorrer um evento;
números da medição registrados.

### Plano da E4-01

Objetivo: cada cliente anima, a partir do estado público, o que já foi decidido pela
autoridade (SPEC, fluxo 6). Nada de animação envia pedido ou muda estado.
- Resultado decidido no estado: `run.lastOutcome {seq, ability, key, outcome}` gravado por
  `resolveCheck`, para todos os clientes animarem acerto/erro (inclusive ataque do Black ICE,
  que não muda outro campo).
- Função pura `diffFx(anterior, novo)` → efeitos por nó (`scan`, `jack-in`, `move`,
  `ice-alert`, `breach`, `control`, `hit`, `derez`, `fail`), faixa (uma por atualização,
  por prioridade) e vinheta (`ice-alert`/`fail`). Reusa o vocabulário visual do protótipo.
- HUD consome os efeitos na renderização seguinte à mudança; primeira abertura não anima.
- Movimento reduzido: `prefers-reduced-motion` ou ajuste do cliente "Movimento" (completo /
  reduzido); no reduzido, só esmaecimento, sem deslocamento, tremor ou piscar.
Arquivos: `session-state.ts`, `checks.ts`, novo `session/hud-fx.ts`, `session-hud-app.ts`,
template, CSS, lang, `main.ts` (ajuste), testes.
Aceite: testes de `lastOutcome` e `diffFx` vistos falhando antes; teste real com 2 clientes
vendo os mesmos efeitos (classes/animação aplicadas) e o modo reduzido sem deslocamento.

## E5 — Estabilidade e distribuição

| ID | Estado | Entrega e aceite | Depende de |
|---|---|---|---|
| E5-01 | DONE | Matriz multiplayer executada em versões declaradas; instalação limpa e regressão sem outros módulos | E4-02 |
| E5-02 | DONE | Guia de usuário, licença decidida, créditos/licenças dos assets, manifesto e pacote reprodutível (beta 0.1.0, D41) | E5-01 |

### Plano da E5-01

Versões declaradas: Foundry 12.343 + CPR v0.92.4 (únicas instaladas; verificado em 2026-11-10).
1. Instalação limpa: `dist/` empacotado em zip, extraído em `Data/modules` no lugar da junção
   (que volta ao fim), mundo novo só com o sistema e este módulo: carrega sem erro, registra
   ajustes, botão `>_`, diálogo de início com mundo vazio.
2. Regressão sem outros módulos: mundo `cyberdeck-hud` tem apenas este módulo ativo.
3. Matriz multiplayer com GM, Netrunner e espectador (roteiro de aceite do MVP em TESTING.md):
   visibilidade por papel, Password → Black ICE → Control Node, confirmar/rejeitar, segredos
   ausentes do DOM/estado/chat, comando direto do espectador, refresh/entrada tardia, queda do
   mestre, fechar/reabrir sem listeners duplicados, modo reduzido/som desligado.
Aceite: relatório em TESTING.md com versões, passos e evidências; falhas corrigidas ou
registradas.

E5-01/E5-02 distribuem apenas funcionalidades concluídas; E3-03/E3-04 podem ficar
para versões futuras. Publicação externa é uma ação separada da preparação do pacote.

## E6 — Feedback do teste em outra mesa (2026-11-10)

Itens do teste do usuário com um amigo, na ordem proposta. "A decidir" = perguntar antes.

| ID | Estado | Entrega e aceite | Origem no feedback |
|---|---|---|---|
| E6-01 | DONE | Mover não custa ação (D27); caminhos por branch em árvore (D28), no motor, na autoridade e nas dicas do HUD; ligações visíveis na grade | "Não gasta ação pra andar", "Não consigo acessar branch B", "Trabalhar os caminhos entre branches" |
| E6-02 | DONE | Interface: faixa própria para Zap acertou × dano aplicado; "Black ICE ataca" em vez de "detectado"; ícones do GM centralizados; nota do nó (folha amarela) explicada/visível; confirmação do GM em painel próprio e destacado | "Impact" duplicado, mensagem "detected", ícones, folha amarela, posição da confirmação |
| E6-03 | DONE | Início de sessão: lista só personagens de jogadores (opção de mostrar todos); vincular os Black ICE de todos os nós no diálogo de início, com sugestão por nome e escolha mais clara | Escolha de PJs, vincular antes de iniciar, escolha de ator mais intuitiva |
| E6-04 | DONE | Revelação ao resolver (D29): descrição de Password/arquivo para a Netrunner; Eye-Dee no nó File | "Senha não é revelada", Eye-Dee |
| E6-05 | DONE | Programas: rezzar/derrezzar pelo HUD (gasta ação, ficha nativa) e ataque com programa (Sword, Vrizzbolt…) com ATK e dano do programa | Programas sempre "derezzed" e fora do dano |
| E6-06 | DONE | Black ICE afeta a Netrunner (D31): acerto confirmado → GM rola o dano do programa Black ICE de mesmo nome e o HUD aplica direto: antipessoal no HP (cérebro), antiprograma no REZ de um programa rezzado ao acaso (REZ 0 = destruído) | Dano automático, ações do Black ICE afetam o usuário |
| E6-07 | DONE | GM volta ação (D32): desfazer as últimas ações em sequência (estado da sessão e efeitos na ficha) e devolver/tirar ação NET no contador | "GM deve poder voltar ação" |
| E6-08 | DONE | Turnos mais claros no combate Netrunner × Black ICE (indicador de vez/iniciativa) | Divisão de turnos |
| E6-09 | DONE | Log de eventos no HUD, ajuste ativo por padrão | "Adicionar de volta o chat de log" |
| E6-10 | DONE | Modo sem confirmação do mestre (ajuste de mundo): sugestão aplicada automaticamente e rolagens do Black ICE sem diálogo | "Não precisar da confirmação do mestre" |
| E6-11a | DONE | Várias invasões ao mesmo tempo em sistemas diferentes (D30, D36): sessões independentes, um HUD com uma aba por sessão, todos veem todas | "Múltiplos HUDs de uma vez" |
| E6-11b | DONE | Netrunner NPC inimiga na arquitetura (D36): vinculada a um nó, com tudo que o Black ICE tem (vez automática, modo sem confirmação, dano, desfazer, registro); vínculo e iniciativa conforme o livro (pesquisar antes) | "Netrunner NPC no meio da arquitetura" |
| E6-12 | DONE | Black ICE básicos sempre disponíveis no vínculo (D38): lista no módulo com dados de jogo e resumo próprio do efeito; ao escolher, cria ator + programa numa pasta do mundo | Arquivo "black ices.docx" do usuário |
| E6-13 | TODO | Netrunners NPC genéricas por dificuldade, prontas para vincular | Pedido do usuário (outra entrega) |
| E6-14 | DONE | Ajustes do teste da mesa (D39): Pathfinder, Cloak e Virus; Black ICE à espreita; atacante 1x por rodada; Jack In custa ação; mestre escolhe o programa atingido; revelar só no mapa; card de inimigo flutuante com alerta; "Resolver" em 1 clique; ataque automático do Black ICE; som no HUD; scroll mantido; arrastar NPC por ponteiro; NPC desvinculada some | Lista de 15 itens do teste com o amigo (2026-11-10) |
| E6-11c | BLOCKED | Duas Netrunners aliadas na mesma rede (D36): só depois de conferir no Core se é permitido e como funciona | Pergunta do usuário |

### Plano da E6-12

Fonte: arquivo do usuário com a tabela de Black ICE do livro (12: 9 antipessoal, 3 antiprograma).
O CPR v0.92.4 não traz Black ICE prontos (só nomes nas tabelas de sorteio). Decisão D38: lista no
módulo (`domain/builtin-ice.ts`) com nome, classe, PER/SPD/ATK/DEF/REZ, dano em dados e custo, e
um resumo curto do efeito escrito por nós (inglês). Sem copiar o texto do livro nem a aparência.
- Vínculo no HUD e diálogo de início listam também os básicos ainda não criados; ao escolher, o
  GM cria o ator Black ICE e o item de programa (classe `blackice`, dano) na pasta "Black ICE
  (CNH)" e vincula. Reusa o que já existe (flag do módulo no ator; programa de mesmo nome).
- Sem dano em dados (Asp, Liche, Scorpion, Skunk): acerto vira efeito especial aplicado pelo GM.
- HUD do GM mostra o resumo do efeito no card do Black ICE.
Aceite: testes da lista (dados, nomes únicos, fórmulas válidas); teste real criando e vinculando.

### Plano da E6-11b

Fatos: CPR v0.92.4 `system.json` `"initiative": "1d10 + @stats.ref.value"` (personagens e mooks;
Black ICE/Demons no topo, `cpr-combat.js`). Fontes secundárias: Netrunning acontece na rodada
normal; um andar pode ter outra Netrunner; Zap contra Netrunner = Interface + 1d10 dela, 1d6 no
cérebro; programas atacantes antipessoal miram Netrunners. Sem regra encontrada sobre prender.
Decisão D37 (usuário): vinculada a um nó; não prende; Zap e programas atacantes pelo HUD nos
dois sentidos; cada lado rola a própria iniciativa (1d10 + REF; empate a favor da jogadora).
- Segredo: o vínculo NPC↔nó fica numa flag do item de NET Architecture (só o mestre lê/grava,
  pela ferramenta do nó no HUD do mestre). Só entra no estado público (`run.npcs`) quando a
  Netrunner chega ao nó. Uma NPC por nó, fora de nós de Black ICE.
- Combate (`run.fight`): ao chegar, as duas rolam iniciativa (Roll do core `1d10 + REF`,
  conferida pela autoridade); antes disso, ações de nó ficam bloqueadas (mover e Jack Out
  liberados). Depois, a vez alterna e passa sozinha (a da NPC termina quando ela gasta as ações
  NET da Interface dela); "Encerrar/Passar a vez" e desfazer como no Black ICE.
- Netrunner → NPC: Zap e programas atacantes antipessoal contra a Defense da NPC (mestre rola, ou
  sozinho no modo sem confirmação); dano no HP da NPC (redução cerebral dela), HP 0 = derrotada.
- NPC → Netrunner: mestre usa Zap ou um programa atacante da NPC (gasta ação dela) contra a
  Defense da jogadora; acerto aguarda o dano (1d6 do Zap ou card do programa) e aplica no HP
  dela, como o acerto do Black ICE (desfazível, registro, faixas).
- Modo sem confirmação: Defense e iniciativa da NPC, resultado com sugestão e dano saem sozinhos.
Arquivos: domínio (`net-rules`), sessão (`session-state`, `requests`, `checks`, `combat-turn`,
`event-log`, `encounter-view`, `autopilot`), integrações (flag da arquitetura, rolagens), canal,
HUD (ferramenta de vínculo, painel do encontro, botões), lang, DECISIONS, RULES, testes.
Aceite: testes de revelação ao chegar (sem vazar antes), iniciativa, vez da NPC por ações,
ataques e dano nos dois sentidos, derrota, desfazer, piloto; teste real com GM e Netrunner.

### Plano da E6-11a

Pesquisa (2026-11-10, fontes secundárias; Core não acessível online): Netrunner inimiga dentro
da arquitetura é encontro previsto; Zap contra Netrunner é contra Interface + 1d10, dano 1d6
no cérebro; nada encontrado sobre duas Netrunners aliadas na mesma rede (E6-11c bloqueada).
- Armazenamento: novo setting de mundo `sessions` (lista, até 4 sessões, ids únicos); o
  `session` antigo é migrado pela autoridade na carga. Uma sessão por ator Netrunner.
- Cada sessão é independente (progresso, vez, desfazer, registro, modo automático). A
  requisição já leva `sessionId`: a autoridade processa a sessão certa e grava a lista com ela
  trocada (ou removida ao encerrar). Notas reveladas por sessão.
- HUD: uma janela com abas (nome da Netrunner); a aba marca quando algo muda numa sessão fora
  de vista; a Netrunner abre na própria sessão; mestre tem "+" para iniciar outra invasão.
  Todos veem todas; cada Netrunner só controla a dela.
Arquivos: novo `session/session-list.ts`, `session-store.ts`, `request-channel.ts`, `main.ts`,
HUD (app, template, CSS), início de sessão, lang, DECISIONS, testes.
Aceite: testes da lista (parser, troca, remoção, limite, mais nova por id, seleção padrão) e do
canal por sessão, vistos falhando antes; teste real com GM e duas Netrunners em sistemas
diferentes (ações de uma não afetam a outra; abas; encerrar uma mantém a outra).

### Plano da E6-10

Fato do CPR v0.92.4 (`rolls/cpr-rolls.js`, `handleRollDialog`): evento com `ctrlKey` pula o
diálogo de rolagem (em clique, o ajuste `invertRollCtrlFunction` inverte; fora de clique, não).
Decisão D35: ajuste do mundo "Modo sem confirmação do mestre" (padrão desligado).
- Resultado: quando a regra sugere (DV conhecido, disputa com as duas rolagens, dano), aplica
  sozinho; sem sugestão, o mestre confirma como hoje. O mestre continua podendo desfazer.
- Rolagens do Black ICE sozinhas e sem diálogo, pela ficha nativa: DEF/PER contra Zap, Slide e
  ataque com programa, e o dano do acerto. O ataque do Black ICE continua iniciado pelo mestre.
- Decisão pura em `session/autopilot.ts` (próximo passo automático a partir do estado público
  e do DV lido pela autoridade); sugestão extraída para `suggestOutcome` (mesma do HUD).
- Execução só no cliente da autoridade (GM ativo de menor id), pelo mesmo canal de requisições
  (histórico, registro e efeitos iguais). Reage só a transições: não age no primeiro estado
  visto nem num estado vindo de um desfazer (o desfazer não é refeito sozinho); cada passo
  uma vez (chave por rolagem/revisão). Rolagem cancelada ou recusada: botões manuais ficam.
- HUD: aviso "Modo automático" no painel de decisão.
Arquivos: novo `session/autopilot.ts`, `checks.ts`, `encounter-view.ts`, `foundry-roll.ts`,
`main.ts`, `constants.ts`, HUD, lang, DECISIONS, COMPATIBILITY, testes.
Aceite: testes do próximo passo (cada caso, sem sugestão, sem vínculo, Defense da Netrunner não
automática), vistos falhando antes; teste real com GM e Netrunner (Zap e acerto do Black ICE
sem cliques do mestre além do ataque; desfazer não refeito).

### Plano da E6-09

Decisão D34: painel "Registro" de volta na coluna direita do HUD de sessão, com tudo que é
público, guardado na sessão (últimas 30 entradas) e escondível por usuário (ajuste do cliente,
ligado por padrão).
- `session.log` (fora do `run`): entradas estruturadas (evento, turno, dados numéricos/ids),
  sem texto; cada cliente traduz. Fora do histórico de desfazer: desfazer acrescenta "ação
  desfeita" em vez de apagar entradas.
- A autoridade gera as entradas de forma pura a partir da ação aplicada e dos estados público
  anterior e seguinte (`session/event-log.ts`): só usa o que já é público (sem DV, fórmula ou nó
  oculto). Eventos: Jack In/Out, movimento, nó revelado, resultado confirmado com os totais
  (e REZ antes/depois no dano), dano dispensado, dano do Black ICE na Netrunner, nó liberado ou
  restaurado à mão, rez de programa, troca de vez, novo turno, ajuste de ações, desfazer.
- HUD: painel em estilo terminal (mais antigas em cima, cursor piscando na linha de comando
  ao fim); diagnósticos continuam no mesmo painel, acima. Ajuste do mundo `logEnabled`
  (mestre libera, padrão ligado) e ajuste do cliente `log` (cada um mostra, padrão desligado),
  também pela caixa "Log" no cabeçalho. Em janela estreita o registro desce para baixo
  da arquitetura e os cartões de nó empilham DV e olho (revisão do usuário).
Arquivos: novo `session/event-log.ts`, `session-state.ts`, `requests.ts`, `constants.ts`,
`main.ts`, HUD (template, app, CSS), lang, DECISIONS, testes.
Aceite: testes das entradas por evento, limite, desfazer, parser e ausência de dados do GM,
vistos falhando antes; teste real com GM e Netrunner (inclusive após recarregar).

### Plano da E6-08

Fato do CPR v0.92.4 (`modules/combat/cpr-combat.js`): Black ICE e Demons não rolam iniciativa,
entram no topo (1 acima da melhor). Decisão D33: alternância no HUD, sem depender do Combat
Tracker, e sem o GM ter de passar cada vez.
- Combate = Netrunner engajada (nó Black ICE não derrotado nem driblado). Fora dele, nada muda.
- Rodada: Black ICE primeiro, depois a Netrunner. `run.iceTurn` (padrão falso) diz de quem é.
- Fim da vez da Netrunner, sozinho: última ação NET gasta sem nada pendente, ou "Encerrar vez"
  (Netrunner ou GM). Rodada + 1, vez do Black ICE.
- Fim da vez do Black ICE, sozinho: ataque dele resolvido (errou, dano aplicado ou dispensado),
  ou GM "Passar a vez". Ações NET recarregam e a vez é da Netrunner.
- Entrar no nó com ações sobrando: ela continua a vez. Combate encerrado na vez do Black ICE
  (derrotado, driblado, GM liberou): ações recarregam. "Novo turno" do GM em combate abre a
  rodada pela vez do Black ICE. Desfazer restaura o estado exato.
- Na vez do Black ICE as ações da Netrunner são recusadas (`ice-turn`) pelo motor de regras,
  então o HUD desativa os botões com a dica; a rolagem de Defense contra o ataque continua.
- HUD: indicador de vez no cabeçalho, botão "Encerrar vez"/"Passar a vez", faixas "Vez do Black
  ICE" e "Sua vez".
Arquivos: novo `session/combat-turn.ts`, `domain/net-rules.ts`, `session-state.ts`,
`requests.ts`, `hud-fx.ts`, HUD, sons, lang, DECISIONS, RULES, testes.
Aceite: testes de passagem automática, encerrar/passar, bloqueio, saída do combate, novo turno e
desfazer, vistos falhando antes; teste real com GM e Netrunner.

### Plano da E6-07

- Histórico de desfazer dentro da própria sessão (`session.history`, até 10 entradas): cada ação
  que muda o estado guarda a posição e o `run` anteriores e os efeitos inversos na ficha.
  Gravado junto com a sessão (atômico); sobrevive a refresh e troca de autoridade.
- Fora do histórico: revelar/ocultar nós (o GM alterna direto), encerrar e o próprio desfazer.
  Desfazer não mexe nos nós descobertos.
- Efeitos inversos com o valor anterior fixado no próprio efeito (`before`), sem reler a ficha:
  reenvio após falha ao gravar reaplica o mesmo valor (D26).
- Desfazer (GM): aplica os inversos em ordem reversa e restaura posição e `run`; rolagens já
  usadas continuam usadas (não podem ser reenviadas); sem reanimar resultados antigos; faixa
  "Ação desfeita". Recusa se a posição antiga foi ocultada.
- Contador: GM devolve ou tira uma ação NET (`adjustActions`, entre 0 e o máximo), também
  desfazível.
Arquivos: novo `session/undo.ts`, `session-state.ts`, `requests.ts`, `checks.ts`, `hud-fx.ts`,
HUD (botão Desfazer com a última ação na dica, +/− no contador), lang, DECISIONS, testes.
Aceite: testes de desfazer movimento, checagem, dano no HP/REZ/programa, vários passos, limite,
reenvio e contador, vistos falhando antes; teste real com GM e Netrunner.

### Plano da E6-06

Fatos do CPR v0.92.4 (lidos em 2026-11-10): o ator `blackIce` não tem dano; a ficha dele tira
a fórmula de um item `program` da classe `blackice` (antiprograma → `damage.blackIce` "Dano em
programas"; senão `damage.standard` "Dano na Netrunner"). O compêndio não traz esses itens.
Dano no cérebro (`_applyDamage` com `location: "brain"`): ignora armadura, desconta
`bonuses.brainDamageReduction` (efeitos ativos) e grava `derivedStats.hp.value` (mínimo 0).
Regras (fontes secundárias, Core não conferido): antiprograma tira REZ de um programa rezzado
escolhido ao acaso; com REZ 0 é destruído; sem programa rezzado não há efeito.
- Fórmula: item de programa Black ICE do mundo com o mesmo nome do ator vinculado (D31).
- Ao confirmar o acerto, a autoridade fixa o alvo e o valor base (HP ou REZ do programa
  sorteado) no estado (D26); "outro" ou antiprograma sem programa rezzado: sem efeito automático.
- GM rola o dano pelo HUD (Roll do core, fórmula conferida pela autoridade) e o efeito vai
  direto para a ficha, sem nova confirmação; GM pode dispensar. Efeitos especiais: à mão.
- Programa destruído: REZ 0 e derrezzado (o item fica na ficha); não pode ser rezzado de novo.
Arquivos: `net-rules.ts`, `session-state.ts`, `checks.ts`, `requests.ts`, `foundry-ice.ts`,
`foundry-program.ts`, novo leitor de HP em `foundry-actor.ts`, `foundry-roll.ts`, canal, `main.ts`,
`encounter-view`, `hud-fx`, HUD, lang, RULES/DECISIONS, testes.
Aceite: testes do dano no HP, no programa, sem alvo, fórmula errada e reenvio sem dobrar,
vistos falhando antes; teste real com GM e Netrunner.

### Plano da E6-05

Fatos do CPR v0.92.4 (lidos em 2026-11-10): só Booster, Defender e Black ICE se rezzam
(`_cyberdeckProgramExecution`, `cyberdeck.rezProgram/derezProgram`); atacantes não têm rez e
rolam ataque (`cyberdeckProgram` + `atk`, card com total em `.d10-number-div span`) e dano
(`damage`, card com `data-total-damage`; o diálogo nativo escolhe dano contra Black ICE ou não).
- HUD: atacantes deixam de aparecer como "derezzed" (mostram a classe e o ATK).
- Rezzar/derrezzar Booster e Defender pelo HUD: 1 ação NET, conectada; efeito na ficha pela
  autoridade (D26, estado absoluto, sem repetir).
- Ataque com programa antiprograma contra o Black ICE do nó (1 ação): disputa contra DEF rolada
  pelo GM, como o Zap; sucesso → dano do programa pelo card nativo → GM aplica no REZ.
  Atacante antipessoal não vale contra Black ICE (alvo é Netrunner; sem alvo no MVP).
Custo de rezzar e o alcance do antipessoal: Core citado de memória, a conferir.
Arquivos: `net-rules.ts`, `character`/`runnerResources`, `session-state.ts`, `checks.ts`,
`requests.ts`, `foundry-roll.ts`, novo efeito em `foundry-program.ts`, `main.ts`, HUD, lang,
RULES.md, testes.
Aceite: testes de rez/derez e do ataque com programa vistos falhando antes; teste real.

### Plano da E6-04

- Eye-Dee: habilidade no nó File, rolagem nativa contra o DV como Backdoor (custa 1 ação);
  sucesso marca o arquivo como "Identificado". GM também pode liberar/restaurar arquivos.
- Revelação (D29): a descrição de Password vencida ou arquivo identificado vai só para a
  Netrunner. Nunca entra no setting público: o cliente da Netrunner consulta a autoridade
  (`{kind: "query"}` no canal) e recebe as notas com `recipients: [remetente]`. A autoridade
  confere o remetente pelo servidor (só controlador ou GM) e a sessão. Refresh refaz a consulta.
- HUD da Netrunner mostra a nota revelada no cartão; faixa "Arquivo identificado".
Arquivos: `net-rules.ts`, `session-state.ts`, `checks.ts`, `requests.ts`, novo `session/notes.ts`,
`request-channel.ts`, `main.ts`, `hud-fx.ts`, `sound-cues.ts`, `architecture-view.ts`, HUD, lang,
RULES.md, testes.
Aceite: testes (Eye-Dee, notas só para o controlador e só de nós resolvidos) vistos falhando
antes; teste real com 3 clientes: Netrunner vê a senha após Backdoor e o conteúdo após Eye-Dee,
espectador não recebe (DOM e tráfego), refresh mantém.

### Plano da E6-03

- Lista do diálogo: só personagens (`character`) com dono jogador; caixa "Mostrar todos" inclui
  NPCs e mooks. Sem PJs, abre já com todos. Controlador sugerido acompanha o personagem escolhido.
- Black ICE: ao escolher a NetArch, uma linha por nó Black ICE com seletor de atores `blackIce`
  (sugestão pelo nome, atributos PER/SPD/ATK/DEF/REZ visíveis, aviso de ator repetido).
  "Iniciar" fica desabilitado até todos os nós terem ator; os vínculos entram em `run.ice`.
- Lógica pura em `session/start-options.ts` (candidatos, controlador, sugestão, validação).
Arquivos: `start-options.ts`, `start-session-dialog.ts`, `session-state.ts` (createSession),
`main.ts`, `foundry-ice.ts`, lang, testes.
Aceite: testes da lógica pura vistos falhando antes; teste real do diálogo (filtro, mostrar
todos, controlador, Black ICE obrigatório) e sessão criada com os vínculos.

### Plano da E6-02

- Faixas: `zap-hit` ("Zap acertou") e `damage` ("Dano aplicado") no lugar de `hit` para os dois;
  `ice-attack` ("Black ICE ataca") ao iniciar o ataque, no lugar de `ice-alert`. Sons para as novas.
- Ícones do botão do GM centralizados; nota do nó vira trecho visível da descrição no cartão
  do GM ("Nota do mestre"), com o texto completo no tooltip.
- Decisão pendente (checagem/dano) sai da arquitetura para uma faixa própria acima do rodapé,
  destacada quando o GM precisa agir.
Arquivos: `hud-fx.ts`, `sound-cues.ts`, `session-hud-app.ts`, template, CSS, lang, testes.
Aceite: testes de `diffFx` para as novas faixas vistos falhando antes; screenshot do GM com
ícones centralizados, nota visível e painel de decisão separado.

### Plano da E6-01

- Motor: `net-architecture` ganha a função de vizinhança (D28) sobre os nós conhecidos;
  `checkMove` usa a vizinhança e custo 0 (D27); Password não vencida impede ir a andar maior.
- A autoridade usa os nós completos da arquitetura para decidir a ligação; o cliente usa os
  revelados (dica). Grade do HUD mostra conectores entre nós ligados.
Arquivos: `domain/net-architecture.ts`, `domain/net-rules.ts`, `session/requests.ts`,
`session/architecture-view.ts`, template, CSS, RULES.md, testes.
Aceite: testes de vizinhança (linear, bifurcação, branch c, troca de branch exige voltar) e
movimento sem custo, vistos falhando antes; teste real numa NetArch com branch B.

## Definição de concluído por tarefa

Aceite satisfeito; checks pertinentes executados; integração real distinguida de
mocks; limitações registradas; requisito rastreável; documentação e STATUS coerentes.
Commit local, quando usado, deve conter uma entrega revisável e não arquivos alheios.
