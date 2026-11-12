# Compatibilidade e investigação

Alvo homologável: **Foundry VTT 12.343 + Cyberpunk RED – CORE v0.92.4** (D09).
Pesquisa pública e inspeção do código local feitas em 2026-11-09 (E0-01).
"Verificado no código" ≠ "testado em execução": o teste real ocorre a partir da E0-03.

## Panorama de versões (2026-11-09)

- Foundry estável atual: V14 (14.368, 2026-09-16). V13 final: 13.351.
  Fonte: <https://foundryvtt.com/releases/>.
- CPR CORE mais recente: v0.92.4 (2026-04-03), `system.json` com
  `compatibility {minimum: 12, verified: 12, maximum: 12}`, licença GPL v3.
  Fonte: manifesto em `gitlab.com/api/v4/projects/22820629/packages/generic/fvtt-cyberpunk-red-core/v0.92.4/system.json`.
- Suporte V13 (milestone 0.93.0) e V14 (0.94.0) em desenvolvimento no
  [repositório oficial](https://gitlab.com/cyberpunk-red-team/fvtt-cyberpunk-red-core).
- O sistema prepara um "Netrunning App" oficial: issue #1174 (milestone 0.95.0) e
  MR !1553 (rascunho, 0.94.0). Ele remove os atores Black ICE/Demon (viram
  subclasses de Program), remove a aba NET Fight e cria o ator "Access Point".
  O autor indica possível reescrita após a 0.93. Impacto: o adaptador deverá migrar (D10).

## Matriz

| Item | Estado | Evidência / conclusão |
|---|---|---|
| Foundry instalado/alvo | Verificado no ambiente | `D:\Foundry Virtual Tabletop\resources\app\package.json`: `12.343.0` |
| Sistema instalado/alvo | Verificado no ambiente | `%LOCALAPPDATA%\FoundryVTT\Data\systems\cyberpunk-red-core\system.json`: `v0.92.4`, min/max 12 |
| Mundo de teste | Confirmado descartável pelo usuário (2026-11-09) | `worlds/cyberdeck-hud` (core 12.343, sistema v0.92.4) |
| Faixa de compatibilidade | Testado em execução (carga) | Módulo 0.0.1 carregou em 12.343 + v0.92.4 sem erros (E0-03); funcionalidades ainda não testadas |
| UI/Application API | Testado em execução (E1-00) | `ApplicationV2` + `HandlebarsApplicationMixin` (`PARTS`, `actions`, `_prepareContext`, `_onClose`); botão via hook `getSceneControlButtons` (V12: array de controles com `tools`; muda na V13) |
| Cyberdeck | Verificado no código (v0.92.4) | `cyberdeck-datamodel.js`: 7 slots, aceita `program`/`itemUpgrade`; getters `installedPrograms`, `rezzedPrograms` |
| Programa | Verificado no código (v0.92.4) | `program-datamodel.js`: `class`, `blackIceType`, `prototypeActor`, `interface`, `isRezzed`, `damage{standard,blackIce}`, `per`, `spd`, `atk`, `def`, `rez{value,max}` |
| NET Architecture | Verificado no código (v0.92.4) | Item `netarch`, `floors[]`: `floor` 1–18, `branch` a–h, `content` (password/file/controlnode/blackice), `blackice` (tipo), `dv` ("N/A" ou 4–20), `description`, `index` |
| Role de Netrunning | Verificado no código (v0.92.4) | `actor.system.roleInfo.activeNetRole` = id do item `role`; `role.system.rank` é o valor usado nas rolagens de Interface (`cpr-cyberdeck.js`, `_createCyberdeckRoll`); `mainRoleAbility` dá o nome |
| Cyberdeck equipado / programas instalados | Verificado no código (v0.92.4) | `getEquippedCyberdeck`: primeiro `cyberdeck` com `system.equipped === "equipped"` (valores: owned/carried/equipped); `getInstalledItems`: ids em `system.installedItems.list` resolvidos em itens do ator |
| Dados reais de programas | Testado em execução (E1-01) | Em `core_programs`, ataques têm `rez` 0/0 (sem trilha de REZ); defensores/boosters 7/7. Apagar um programa instalado deixa o id antigo em `installedItems.list` (o sistema não limpa) |
| Snapshot vs. ficha nativa | Testado em execução (E1-01) | `readCharacterSnapshot` igual a `getEquippedCyberdeck`/`installedPrograms`/role ativa em: completo, troca de deck, dois decks equipados, sem deck, sem role, programa apagado, REZ zerado; criar o item `role` define `activeNetRole` automaticamente (hook do sistema) |
| Setting de mundo como estado público | Testado em execução (E1-02) | Jogador recebe "lacks permission to create Setting" ao gravar; `onChange` chega a todos com o `userId` do GM; `_stats.lastModifiedBy` disponível na carga |
| ApplicationV2: instâncias com mesmo id | Testado em execução (E1-02) | `#close` remove `foundry.applications.instances[id]` após a transição; criar outra instância de mesmo id durante o fechamento deixa janela órfã. Reutilizar uma instância por cliente |
| NetArch em execução | Testado em execução (E2-01) | `Item.create` com `floors` (strings/chaves i18n como no modelo) aceito; chave de Black ICE localiza pelo i18n do sistema (ex.: "Hellhound"); `index` usado como chave; nenhuma NetArch pronta nos compêndios do sistema |
| Socket do módulo em execução | Testado em execução (E2-02) | `game.socket.emit("module.<id>", data, {recipients})` entrega só ao destinatário; o handler recebe `(data, senderId)` com o id real do remetente mesmo quando o payload declara outro `userId`; resposta do GM com `recipients: [senderId]` chega só ao solicitante |
| Persistência e reinício do mundo | Testado em execução (E2-03) | Setting de mundo da sessão sobrevive a encerrar/relançar o mundo; `Game#shutDown` pede confirmação (`Dialog.confirm`) quando há outros usuários ativos; `User#active` reflete entrada/saída de GMs a tempo de trocar a autoridade |
| Hook `userConnected` e container queries | Testado em execução (E4-02a) | `Hooks.callAll("userConnected", user, active)` (client/data/collections/users.js) chega aos demais clientes quando um GM sai/entra; `container-type: inline-size` em `.window-content` + `@container` reage ao `setPosition` da janela |
| Áudio de interface | Testado em execução (E4-02b) | `game.audio.locked` falso e `game.audio.interface` (AudioContext com `gainNode` do volume de interface) criados no primeiro gesto real; nós Web Audio ligados a esse `gainNode` |
| Ajuste de cliente | Testado em execução (E4-01) | `game.settings.register(..., {scope: "client"})` guarda em `localStorage` com a chave `<módulo>.<ajuste>`; `onChange` dispara no cliente que alterou |
| Dano do Black ICE na Netrunner | Verificado no código e testado em execução (E6-06) | Ator `blackIce` (`blackIce-datamodel.js`) não tem dano; a ficha tira a fórmula do item `program` `class: "blackice"` (`damage.blackIce` se o ator é antiprograma, senão `damage.standard`); compêndio `core_programs` não traz programas Black ICE. `_applyDamage(..., "brain")` ignora armadura, desconta `actor.bonuses.brainDamageReduction` e grava `system.derivedStats.hp.value` (HpSchema: mínimo 0). `Roll.validate(formula)` existe na V12; `new Roll("2D6 + 1").formula` = "2d6 + 1" |
| Rolagens do Black ICE e dano | Testado em execução (E3-02c) | `blackIce.sheet._onRoll` com `data-roll-type="stat"` e `data-roll-title` def/per/atk gera card com total e `speaker.actor` do Black ICE; `new Roll("1d6").toMessage({speaker})` grava `rolls[0].formula/total`; `actor.update({"system.stats.rez.value"})` pelo GM. ApplicationV2: durante a renderização `rendered` é falso (estado RENDERING); chamar `render()` sem `force` numa janela fechada não reabre (trata como primeira renderização) |
| Rolagem de Interface pelo módulo | Testado em execução (E3-02b) | `actor.sheet._onRoll` com evento sintético (`currentTarget` com `data-roll-type="interfaceAbility"`, `data-interface-ability`, `data-cyberdeck-id`; `type: "click"`) abre o diálogo nativo (Sorte, mods; Cancel não cria nada) e cria a `ChatMessage` depois do retorno. Mensagem: `author` do servidor, `speaker.actor`, total em `.d10-number-div span`, sem `rolls`. Matriz de regras: [RULES.md](RULES.md) |
| Transporte/origem | Verificado no código | Ver seção abaixo; teste com 3 clientes pendente (E2-02) |
| Persistência privada ao GM | Verificado no código: inexistente em documentos/settings | Ver seção abaixo |
| Runtime de desenvolvimento | Escolhido | Node 24.19.0 / npm 11.17.0 disponíveis na máquina (D02) |

## Transporte (V12, `dist/server/sockets.mjs` e `dist/packages/package.mjs`)

- Pacote com `"socket": true` registra o canal `module.<id>` (`registerCustomSocket`).
- O servidor repassa com `handleCustomSocket`: `s.emit(canal, data, this.user.id)`,
  em que `this.user` é o usuário **da sessão autenticada no socket**, não um campo do payload.
- Aceita `{recipients: [userId...]}` para entregar só aos usuários listados;
  sem isso, transmite a todos os outros clientes.
- `User#query`/`CONFIG.queries` só existem a partir da V13 e não estão disponíveis no alvo.
- Conclusão: a autoridade GM pode confiar no 2º argumento do handler (userId do servidor)
  e ignorar qualquer identidade dentro do payload. socketlib não é necessário.

## Visibilidade de dados (V12, `dist/packages/world.mjs`, função de envio do mundo)

- Ao conectar, cada usuário recebe `User`, `Actor`, `Item`, `JournalEntry`, `Scene`,
  `Setting`, `ChatMessage`, `Macro` etc. completos, **sem filtro de permissão**; dos
  compêndios ativos recebe só o índice.
- Consequência: flags e settings de mundo nunca são privados; o item NetArch do
  sistema já é legível pelo console de qualquer jogador. Isso é aceito (D11); o
  módulo só não pode acrescentar vazamentos.
- Leitura de documentos de compêndio com restrição de permissão: não comprovada.

## Referências não auditadas

- [Cyberpunk RED – Combat HUD](https://github.com/Vec97/cpr-combat-hud) (V12, CPR 0.92.x; tem painel de Netrunning)
- [Cyberpunk Red Agent Bridge](https://foundryvtt.com/packages/cpr-agent)

Examinar referências para aprender contratos; não copiar código/assets sem verificar
licença (sistema é GPL v3). Atualizar esta matriz antes de alterar versões suportadas.

## Rolagem nativa sem diálogo (E6-10, D35)

Verificado em 2026-11-10 no CPR v0.92.4 (`modules/rolls/cpr-rolls.js`, `handleRollDialog`):
`skipDialog = event.ctrlKey || event.metaKey`; só quando `event.type === "click"` o ajuste do
sistema `invertRollCtrlFunction` inverte. O módulo chama `sheet._onRoll` da ficha do Black ICE
com `type: "auto"` e `ctrlKey: true`: o card nativo sai sem diálogo, com qualquer valor do
ajuste. Teste real: DEF do Hellhound rolada sozinha no modo automático, sem janela.

## Netrunner NPC (E6-11b, D37)

Verificado em 2026-11-10 no CPR v0.92.4 e no Foundry V12:
- Iniciativa: `system.json` `"initiative": "1d10 + @stats.ref.value"`; `cpr-combatant.js` usa REF
  para `character` e `mook`; Black ICE e Demons ficam no topo (`cpr-combat.js`). O módulo rola
  `1d10 + REF` com o Roll do core (fórmula na mensagem, conferida pela autoridade).
- Flags de item: o item de NET Architecture (sem permissão para a jogadora, `permission 0`) chega ao
  cliente dela com `flags` e `system` completos (`game.items` e `fromUuidSync`). O vínculo da
  NPC na flag do item tem a mesma exposição da arquitetura (D11): fora da interface e do estado
  público, mas legível pelo console.
- Rolagens sem diálogo da ficha da Netrunner/NPC (`interfaceAbility` e `cyberdeckProgram`) usam o
  mesmo `ctrlKey` de `handleRollDialog` (E6-10). Teste real: Defense da NPC rolada sozinha.

## Criar documentos pelo módulo (E6-12)

Verificado em 2026-11-10 (Foundry V12, CPR v0.92.4):
- As classes de documento não ficam em `globalThis` (`globalThis.Actor` é `undefined`); o caminho é
  `CONFIG.<Tipo>.documentClass`.
- `CONFIG.Actor.documentClass.create(...)` do CPR devolve `undefined` e resolve antes de o ator entrar
  em `game.actors`. O módulo marca o ator com uma flag e espera ele aparecer na coleção (até ~3 s).
- Ator `blackIce`: `system.class`, `system.stats.{per,spd,atk,def,rez:{value,max}}`, `system.notes`,
  `system.cost`. Item `program` de Black ICE: `system.class = "blackice"`, `blackIceType`,
  `damage.{standard,blackIce}`, `atk/def/per/spd`, `rez`, `price.market`, `description.value`.

## Gravar NET Architecture pelo módulo (E7-01)

Testado em execução em 2026-11-11 (Foundry V12, CPR v0.92.4):
- `CONFIG.Item.documentClass.create({type: "netarch", system: {floors}, flags})` aceita os andares
  com os campos de texto do modelo (`floor` "1"–"18", `branch` a–h, `content` chave i18n,
  `blackice` chave ou "--", `dv` "N/A"/"4"–"20", `index` inteiro). O módulo marca o item com uma
  flag e espera ele aparecer em `game.items` (mesma cautela dos atores do CPR).
- `item.update({"system.floors": [...]})` substitui o array inteiro; flags de vínculo são
  atualizadas chave a chave (`-=` para remover). A ficha nativa abre o item gravado ("Floors: 4").
- Ferramenta de cena com `visible` (V12) some para jogadores.

## Cyberdeck pelo módulo (E7-02)

Verificado no código (CPR v0.92.4, `item/mixins/cpr-container.js`, `cpr-cyberdeck.js`) e testado
em execução em 2026-11-11 (usuário jogador dono do ator):
- `deck.installItems([program])` confere tipo e slots (`canInstallItems`), acrescenta o id em
  `installedItems.list` e soma `usedSlots`; `deck.uninstallItems([program])` tira da lista,
  recalcula `usedSlots` e derrezza o programa (`uninstallPrograms`).
- Slots totais = `deck.availableInstallSlots()` + `installedItems.usedSlots` (inclui upgrades).
- Equipar: `updateEmbeddedDocuments("Item", [{_id, "system.equipped"}])`; `getEquippedCyberdeck`
  passa a devolver o deck novo.
- Id de item apagado continua em `installedItems.list` e ocupa slot em `usedSlots` (o sistema não
  limpa); a janela não mostra o id, mas a contagem de slots é a do sistema.
- Ficha v1 do CPR: hook `getActorSheetHeaderButtons` (`client/apps/app.js`) acrescenta botão no
  cabeçalho; só aparece ao abrir a ficha (o cabeçalho não é redesenhado depois).
