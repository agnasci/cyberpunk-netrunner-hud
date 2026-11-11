# Estratégia de validação

Evidências por entrega ficam em STATUS.md (atual) e no relatório abaixo (E5-01).

## Camadas

- Unitários: elegibilidade, custos, transições, projeções, revisões e idempotência.
- Integração: adaptador com fixtures sintéticas; confirmar contratos também no sistema real.
- Multiplayer manual: mestre, Netrunner e espectador em sessões de usuário distintas.
- Distribuição: instalar pacote limpo no par de versões declarado, não apenas no workspace.

## Matriz mínima e responsabilidade

| Cenário | Resultado esperado | Tarefa |
|---|---|---|
| Sem cyberdeck/ator removido/programa destruído | Erro útil, sem custo/rolagem indevida | E1-01/E3-01 |
| Ficha alterada após abrir o HUD | Revalidar estado real antes de executar | E3-01 |
| Espectador envia comando diretamente | Rejeição na autoridade, mesmo sem usar UI | E2-02 |
| Cliente forja userId ou ator | Não obtém privilégio de outro usuário | E2-02 |
| Segredo em arquitetura/rolagem | Ausente de payload, DOM, logs, chat e documento acessível | E2-01 |
| Duplo clique/reenvio/reordenação | Um resultado por requestId; revisão antiga rejeitada | E2-02 |
| Dois mestres/perda do mestre | Uma autoridade; pausa segura e recuperação explícita | E2-03 (feito) |
| Refresh/entrada tardia | Snapshot autorizado atual; sem reaplicar efeitos | E2-03 |
| Falha entre persistir e aplicar dano | Recuperação sem duplicar aplicação ou omitir silenciosamente | E3-02 (D20) |
| Confirmar/rejeitar efeito assistido | Mesma rolagem; rejeição não altera ficha | E3-02 |
| Ação sem recurso/fora da etapa | Bloqueio com motivo; nenhuma mutação | E3-01 |
| Redução de movimento/áudio desligado | Todas as informações e ações continuam acessíveis | E4-01/E4-02 |
| Fechar/reabrir HUD repetidamente | Sem listeners duplicados ou consumo crescente | E1-02/E4-02 (feito, E5-01) |

Para regras, registrar fonte/edição/página ou referência oficial na matriz criada
em E3-01; não copiar extensos textos do livro. Usar casos de fronteira para as
fórmulas efetivamente verificadas. Comparar rolagens e efeitos com operação nativa.

## Roteiro de aceite do MVP

1. Iniciar mundo de teste na combinação registrada, com módulos mínimos necessários.
2. Conectar GM, Netrunner e espectador; atribuir ator e arquitetura sintética.
3. Abrir HUD; comparar dados com ficha e visibilidade de cada papel.
4. Percorrer Password, Black ICE e Control Node no modo assistido.
5. Confirmar/rejeitar efeitos; conferir chat e ficha sem duplicação.
6. Atualizar página e reconectar; conferir recuperação e segredos ausentes.
7. Testar comando não autorizado, ação repetida e queda do mestre.
8. Registrar resultado, versões, passos e evidências sem dados privados da mesa.

## Método de teste multiusuário local

Abas do navegador embutido podem ser clientes distintos: entrar em `/join` com um
usuário por aba, em sequência. O socket de cada aba mantém o usuário com que conectou,
mas o cookie de sessão é compartilhado: recarregar uma aba a reconecta como o último
usuário que entrou. Para refresh/entrada tardia, recarregue apenas a última aba que fez
login, ou refaça o login. Limitação: mesmo navegador e máquina, não clientes de rede distintos.

Outros efeitos de abas no mesmo navegador (vistos na E3-02c/E4-01):
- Ajustes `scope: "client"` (ex.: "Movimento das animações") ficam no localStorage da origem
  e valem para todas as abas; testar o modo de cada cliente um de cada vez.
- Aba em segundo plano ou painel do navegador oculto não pinta quadros: animações não avançam
  na tela e os diálogos do CPR não terminam a animação de fechamento (ficam no DOM). Medir
  animações pelo relógio delas (`element.getAnimations()`), não pela opacidade calculada.

## Relatório de validação

Registrar por entrega: data, commit/estado, versões, comandos e exit codes,
cenários manuais e resultado, limitações e regressões. Testes com mocks não
comprovam compatibilidade Foundry. Performance deve comparar cenário com/sem HUD,
incluindo tamanho da arquitetura, número de clientes e máquina usada.

### E5-01 — matriz multiplayer e instalação limpa (2026-11-10)

Versões: Foundry 12.343 (app desktop, Windows 11), Cyberpunk RED – CORE v0.92.4, módulo
0.0.1; mundo `cyberdeck-hud` só com este módulo ativo (nenhum outro instalado). Automatizado:
`npm run check` exit 0, 177 testes. Clientes: abas do navegador embutido (GM, Runner,
Espectador), mesma máquina.

| Cenário | Resultado |
|---|---|
| Iniciar sessão pela UI (encerrar → `>_` → diálogo) | Ator, controlador (dono da ficha) e NetArch sugeridos; sessão criada, revisão 1 |
| Visibilidade por papel | Espectador: sem controles, turno sem ações NET, programas sem detalhes (Interface visível, decisão E1-02); Netrunner: controles e ações NET |
| Segredos (DV, descrições "SEGREDO…", "Câmeras…") | Ausentes do DOM do espectador e da Netrunner, do setting da sessão e das 29 mensagens do chat |
| Espectador envia comandos direto (com `userId` da Netrunner no payload) | `jackOut`, `reveal`, `end` → `not-authorized` |
| Password: Backdoor 2 vs DV 6 → GM rejeita; nova 9 → GM confirma | Rejeição sem efeito nem nova mensagem; "Vencida" para todos |
| Black ICE: vínculo, Zap 11 × DEF 6, dano 5 → GM descarta | REZ do ator continua 8 (rejeição não altera ficha) |
| Novo dano 6 → GM aplica | REZ 8 → 2, uma vez |
| Ataque do Black ICE 10 × Defense 11 | Sugestão "erra"; resultado animado para todos |
| Slide 13 × PER −5 (falha crítica, total negativo) | "Driblado"; movimento liberado |
| Sem ações → Control desabilitado com motivo; novo turno; Control 6 vs DV 10, GM confirma sucesso | GM decide contra a sugestão (modo assistido); "Controlado" |
| Espectador acompanha | Faixas e painéis de cada passo, sem DV |
| Entrada tardia/refresh do espectador | HUD reabre no estado atual (posição, estados), sem animação de abertura |
| Fechar/reabrir HUD 5× | Callbacks de hooks alternam 9 ⇄ 4, sem acumular |
| Queda do mestre | Netrunner e espectador veem a pausa; controles da Netrunner desabilitados; GM volta → HUD do GM reabre (revisão 29), controles reativam |
| Instalação limpa | `dist/` em zip (8 arquivos, 98 KB) extraído em `Data/modules` no lugar da junção; mundo novo `cnh-instalacao-limpa` (só CPR + módulo ativado): "pronto" no console, 3 ajustes registrados, botão `>_`, sem erros; sem personagem → aviso "No character available for Netrunning" |
| Restauração | Junção recriada; `cyberdeck-hud` relançado com a sessão intacta |

Limitações: clientes no mesmo navegador (cookie e ajustes de cliente compartilhados); sem
rede real nem máquinas distintas; navegação só por teclado e leitor de tela não exercitados;
animações e sons não observados por uma pessoa. O mundo `cnh-instalacao-limpa` ficou no
Foundry para inspeção (pode ser apagado).

## Custo do HUD (E4-02b)

Procedimento (console do GM, mundo de teste): fechar o HUD e anotar
`document.getAnimations().length` e `Hooks.events[nome].length` para `updateActor`,
`createItem`, `updateItem`, `deleteItem`, `userConnected`; abrir pelo botão `>_`, repetir e
cronometrar 20 `await app.render()`; fechar e conferir a volta à linha de base.

Medido em 2026-11-10 (Foundry 12.343, GM, NetArch de 4 nós, painel do navegador oculto):

| Situação | Animações do HUD | Callbacks do módulo | Renderização |
|---|---|---|---|
| Fechado | 0 | 0 | — |
| Aberto, movimento completo | 5 contínuas (varredura, título ×2, LED, pulso do nó atual) | 6 | mediana 3,5 ms; p90 6,5 ms; máx. 7,9 ms |
| Aberto, movimento reduzido | 0 | 6 | — |
| Fechado de novo | 0 | 0 (sem vazamento) | — |

Não houve medição de quadros/CPU com o painel visível; repetir na E5-01 em máquina real.
