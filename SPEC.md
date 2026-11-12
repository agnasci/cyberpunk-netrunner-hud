# Especificação do produto

## Intenção

Tornar o Netrunning um acontecimento visual para a mesa inteira, preservando
as escolhas da Netrunner e o controle do mestre. Complementar Cyberpunk RED – CORE
no Foundry; não substituir fichas nem criar outro sistema de RPG.

Origem e distinção entre pedidos e sugestões:
[docs/context/CONVERSATION.md](docs/context/CONVERSATION.md).

## Requisitos derivados do pedido do usuário

| ID | Requisito | Resultado observável |
|---|---|---|
| R01 | Módulo integrado ao Foundry/Cyberpunk RED | Funciona no mundo com o sistema-alvo, sem alterar seu código |
| R02 | HUD compartilhado | Mestre, Netrunner e espectadores acompanham a mesma sessão |
| R03 | Controle restrito | Somente mestre e jogador designado podem solicitar ações permitidas |
| R04 | Escolhas por etapa do Netrunning | Ações disponíveis refletem contexto e estado atual da invasão |
| R05 | Integração com ficha/cyberdeck | Interface, programas e recursos vêm de documentos nativos, sem cadastro duplicado |
| R06 | Automação de rolagens | NPCs/sistemas/oposição usam rolagens integradas quando a regra implementada exigir |
| R07 | Animações | Eventos da invasão têm feedback visual compartilhado |
| R08 | Continuidade entre IAs | Instruções, etapas e estado permitem retomar o desenvolvimento sem o chat |

## Comportamento proposto para a primeira versão

Modo assistido, Netrunner única, fluxo pequeno, alvo V12 + CPR v0.92.4, nível de
sigilo e regras do Core foram confirmados pelo usuário em 2026-11-09 (D04, D05,
D09, D11, D14). Os demais itens seguem como proposta.

- Uma Netrunner designada por sessão; mestre online obrigatório para mutações.
- Modo assistido: validar ação, rolar/calcular e apresentar efeito ao mestre;
  aplicar apenas após confirmação. Correções do mestre ficam registradas.
- Pequena arquitetura com Password, Black ICE e Control Node, usando dados nativos
  quando suportados. O significado de cada ação e fórmula deve ser verificado.
- Mestre vê arquitetura completa; jogadores só recebem conteúdo descoberto e
  autorizado. Espectadores não recebem controles nem campos secretos.
- Sessão persiste e pode ser retomada após atualização da página/entrada tardia.
- Ações de Interface não dependem apenas de programas: considerar habilidade,
  recursos, turno, obstáculo, estado do programa e demais condições pertinentes.
- Alterações legítimas na ficha durante a sessão invalidam ações que ficaram obsoletas.
- Sem mestre ativo, pausar alterações e comunicar a indisponibilidade.

## Fluxo de referência

1. Mestre escolhe personagem, controlador e arquitetura, inicia sessão.
2. Cada participante recebe sua visualização autorizada.
3. Netrunner escolhe uma ação; mestre revalida identidade, permissão e estado.
4. Motor determina resultado usando integração nativa de rolagens onde disponível.
5. Mestre confirma efeitos no modo assistido; alterações são registradas/persistidas.
6. Projeções públicas são atualizadas; animação representa resultado já decidido.
7. Mestre encerra ou retoma a sessão com estado consistente.

## Evolução prevista

Ampliar ações de Interface, programas, Black ICE, Demons, danos/efeitos e turnos;
adicionar modos manual e automático; polir animações e áudio; permitir vínculos
explícitos com portas/dispositivos da cena. Ações no mundo físico nunca devem ser
inferidas por nome: dependem de vínculo configurado e permissão validada.

## Fora do MVP

Backend externo, conta própria, banco paralelo de personagens, IA generativa no
produto, 3D pesado, suporte universal a versões, múltiplas Netrunners concorrentes,
automação completa de todas as regras. (O editor de NET Architectures entrou a pedido
do usuário: E7-01, D42.)
Esses limites são propostas de escopo, não cancelamento da visão de longo prazo.

## Qualidade e sucesso

- O módulo não envia nem persiste dados ocultos acessíveis a espectadores (tráfego,
  chat, flags); o que o sistema já expõe está fora desse critério (D11).
- Repetição/reenvio da mesma solicitação não duplica rolagens, custos ou efeitos.
- Reconexão não repete efeitos já aplicados; conflito de revisão é explícito.
- Interface utilizável sem animações, por teclado e com feedback de erro claro.
- Não manter renderização contínua quando o HUD estiver fechado/inativo.
- Primeira demonstração: três clientes reais completam a arquitetura pequena,
  com ficha integrada, ação/oposição assistida, segredo preservado e retomada.

Critérios por etapa: [docs/ROADMAP.md](docs/ROADMAP.md).
