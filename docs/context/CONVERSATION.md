# Contexto de origem — 2026-11-09

Fonte: [Viabilidade do módulo de hacking](https://chatgpt.com/share/6af2540f-753c-83e9-a1c0-15d0fbb753ef).
Leitura direta da conversa compartilhada realizada em 2026-11-09. Este documento
é uma consolidação do contexto relevante, não transcrição literal nem validação
independente das alegações técnicas do assistente. As duas perguntas e as duas
respostas foram lidas. Imagens/widgets eram referências conceituais, não assets licenciados.

## Pedido original do usuário

Investigar a viabilidade de addon Foundry VTT para Cyberpunk RED: painel HUD/UI
de hacking com animações e rolagens automáticas de NPCs/sistemas, enquanto o
jogador escolhe ações em cada etapa. Todos assistem; somente jogador e mestre
controlam. Opções devem corresponder à ficha e equipamento, integradas ao sistema.
O usuário chamou o equipamento de “holo deck”; o assistente esclareceu “cyberdeck”.

## Avaliação apresentada pelo assistente

Viabilidade muito alta e complexidade média-alta. O desafio central seria regras,
estado e sincronização sem revelar segredos, mais que desenhar a interface.
O assistente afirmou que RED – CORE já oferece fichas/rolagens, cyberdecks,
programas/Black ICE/Demons e NET Architectures; isso deve ser verificado por versão.

Referências citadas: Cyberpunk RED – Combat HUD (Vec97/cpr-combat-hud) e Cyberpunk
Red Agent Bridge (pacote cpr-agent). São referências de integração, não o HUD
cinematográfico completo. socketlib foi sugerido como facilitador de comunicação.

## Experiência discutida

Mestre inicia invasão num ponto de acesso. Todos veem painel de arquitetura,
Netrunner, recursos/NET Actions e ações como Backdoor, Pathfinder, ataque de programa
e Control. O exemplo visual usava “ARASAKA NODE”, “GHOST_07” e níveis ilustrativos;
não são nomes, limites nem conteúdo obrigatório do produto.

Mestre pode ver sete níveis enquanto jogadores veem três descobertos. Netrunner
recebe ações, programas e resultados autorizados; espectadores só progresso,
resultados públicos e animações. Ações de Interface e ações de programas têm
requisitos diferentes; não basta filtrar por programa instalado.

O fluxo sugerido lê ficha/cyberdeck, avalia obstáculo e recursos, valida ação,
rola oposição quando necessária, atualiza efeitos/ficha e compartilha o resultado.
Programa destruído pode ser refletido na ficha. Control pode futuramente afetar
porta/dispositivo vinculado à cena, preparado pelo mestre.

## Arquitetura e proteção sugeridas

Módulo independente `cyberpunk-netrunner-hud` com UI, adaptador Cyberpunk RED,
motor de regras, sincronização e gerenciador de sessões. Mestre online coordena
operações privilegiadas. Persistir no mundo para refresh e entrada tardia.
Nunca transmitir segredos a espectadores para apenas escondê-los por CSS.
Separar adaptador permite acompanhar mudanças do sistema sem reescrever o domínio.

## Animações e performance

Exploração de nós/conexões, firewall/invasão, alerta e aparição de Black ICE,
ataques e feedback de dados/sucesso/falha. CSS, SVG e JavaScript foram considerados
suficientes no início; PixiJS somente se efeitos complexos justificarem. Evitar
animações pesadas porque os participantes já executam o Foundry.
As imagens externas eram referências estéticas, não capturas de módulo pronto.

## Etapas e esforço sugeridos

1. Protótipo funcional: HUD compartilhado e ficha/cyberdeck, sem automação complexa.
2. Arquitetura navegável: níveis, obstáculos, descoberta e permissões.
3. Automação: Interface, oposição, Black ICE, programas, danos e ficha.
4. Experiência cinematográfica: animações, áudio, alertas e transições.
5. Estabilidade/distribuição: multiplayer, reconexão, exceções, docs e instalação.

Estimativas originais (cumulativas, especulativas, não compromissos): protótipo
15–35 h; MVP 50–100 h; automação ampla 120–250 h; refinado/distribuível 200–400+ h.
O planejamento atual usa critérios de aceite, não essas faixas como prazo.

## Compatibilidade e automação sugeridas

O assistente citou RED – CORE v0.92.4 / Foundry V12, contrapondo documentação V14.
Recomendou mirar a combinação efetivamente suportada, não simplesmente a mais nova.
Essas versões não foram verificadas nesta preparação.

Três modos propostos: manual (HUD/rolagens assistidas), assistido (calcular e
confirmar efeitos com mestre) e automático (aplicar sem confirmação rotineira).
O assistente recomendou assistido e arquitetura pequena com Password, Black ICE
e Control Node. O widget mostrava assistido selecionado; isso não comprova uma
decisão explícita do usuário.

## Segunda pergunta e resposta

O usuário perguntou como mencionar o chat no Codex. O assistente explicou que um
link não garante acesso ao histórico e recomendou consolidar requisitos num
`SPEC.md` no projeto. O pedido atual executa essa preparação e acrescenta
`AGENTS.md`, controle de etapas e organização eficiente para outras IAs.

Não houve, na conversa original, escolha explícita de stack, aprovação de design
técnico, licença, versões instaladas, regras detalhadas ou início de implementação.
