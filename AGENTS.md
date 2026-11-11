# Cyberpunk Netrunner HUD — instruções para agentes

## Comece aqui

1. Leia este arquivo e [STATUS.md](STATUS.md) em toda sessão.
2. Leia [SPEC.md](SPEC.md) antes de alterar comportamento.
3. Escolha a próxima tarefa disponível em [docs/ROADMAP.md](docs/ROADMAP.md).
4. Abra somente os documentos e arquivos necessários à tarefa. Consulte o mapa abaixo.
5. Verifique o estado do diretório/Git antes de editar; preserve alterações alheias.

O projeto é um módulo de Foundry VTT para Cyberpunk RED – CORE. O HUD de
Netrunning é compartilhado; apenas mestre e Netrunner autorizada controlam a
sessão. A ficha e o cyberdeck nativos são a fonte de verdade do personagem.

## Regras de trabalho

- Esta base contém documentação de preparação, não um módulo funcional.
- Separe requisito do usuário, proposta técnica e fato verificado. Não invente
  APIs, campos de ficha, fórmulas, compatibilidade, testes ou resultados.
- Execute uma tarefa pequena por vez; não implemente etapas futuras por antecipação.
- Antes de programar, registre objetivo, arquivos afetados e critérios de aceite.
- Reuse o sistema nativo. Isole acesso ao Foundry/sistema no adaptador.
- O domínio não acessa `game`, `Hooks`, DOM, sockets ou documentos Foundry.
- UI solicita ações; autoridade do mestre valida permissões e estado novamente.
- Nunca envie segredos para clientes não autorizados, nem em flags, logs,
  mensagens de chat, snapshots ou payloads. Ocultar com CSS não é proteção.
- Identidade declarada em payload não comprova autoria. Valide a origem conforme
  capacidades reais do transporte antes de habilitar execução privilegiada.
- Não modifique o código do Foundry ou do sistema instalado. Não versione mundos,
  livros, compêndios comerciais, credenciais ou dados pessoais da mesa.
- Use português nos documentos e comunicação; identificadores de código em inglês.
- Evite dependências, abstrações genéricas, arquivos enormes e duplicação de estado.
- Não exija um plugin de IA específico: estes documentos devem bastar a qualquer IA.
- Registre decisões duráveis em `docs/DECISIONS.md`; progresso somente em `STATUS.md`.
- Só marque concluído com evidência. Diferencie testes automatizados, inspeção
  documental e teste manual real no Foundry. Bloqueio não significa conclusão.

## Leitura sob demanda

| Necessidade | Fonte canônica |
|---|---|
| Objetivo e comportamento | [SPEC.md](SPEC.md) |
| Tarefa, dependências e aceite | [docs/ROADMAP.md](docs/ROADMAP.md) |
| Camadas, contratos e fluxo de dados | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Ambiente e comandos | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| Compatibilidade e APIs reais | [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) |
| Permissões, reconexão e validação | [docs/TESTING.md](docs/TESTING.md) |
| Decisões e propostas | [docs/DECISIONS.md](docs/DECISIONS.md) |
| Origem e discussão anterior | [docs/context/CONVERSATION.md](docs/context/CONVERSATION.md) |

## Economia de contexto

Mantenha este arquivo curto (meta: até 100 linhas). Não copie o histórico em
prompts, comentários ou novos arquivos de instruções. Use IDs de requisito e
tarefa. Pesquise por símbolo/caminho antes de ler diretórios inteiros. Não leia
dependências ou arquivos gerados salvo investigação direcionada. Crie instruções
locais apenas quando uma pasta realmente exigir regras diferentes.

## Encerramento de sessão

Atualize `STATUS.md` com tarefa, arquivos relevantes, validação executada, pendências
e próximo passo concreto. Atualize o estado da tarefa no roadmap. Se houver código,
execute os checks disponíveis pertinentes e registre falhas sem mascará-las.
Não faça push, publicação ou alteração na mesa real sem solicitação correspondente.
