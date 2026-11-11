# Arquitetura proposta

Status: desenho para implementação; contratos conceituais. Fatos de API verificados
estão em [COMPATIBILITY.md](COMPATIBILITY.md).

## Limites e responsabilidades

| Pasta futura | Responsabilidade | Restrições |
|---|---|---|
| `src/main.ts` | Inicialização e composição | Sem regras de jogo |
| `src/domain/` | Ações, elegibilidade, transições | Funções puras; sem Foundry/DOM/rede |
| `src/integrations/cpr/` | Ficha, cyberdeck, arquitetura, rolagens/efeitos | Único local com caminhos internos do sistema |
| `src/session/` | Autoridade, ciclo de vida, persistência | Coordena sem implementar UI |
| `src/transport/` | Solicitações e distribuição de projeções | Nunca transmite estado secreto por broadcast |
| `src/ui/` | HUD, controles, apresentação | Não calcula resultado autoritativo |
| `styles/`, `templates/`, `lang/` | Visual, templates e traduções | Textos de UI externalizados |
| `tests/unit/`, `tests/integration/`, `tests/fixtures/` | Verificação e dados sintéticos | Sem conteúdo comercial ou mundo real |

Extensão `.ts` é proposta (D02); criar diretórios/arquivos apenas quando necessários.
Artefatos de distribuição ficarão em `dist/`; manifesto só após confirmar versões.

## Contratos internos a detalhar na E0

| Contrato | Campos/responsabilidade mínima |
|---|---|
| CharacterSnapshot | UUID do ator/cyberdeck, Interface, programas normalizados, recursos e revisão/origem |
| NetSession | ID, versão do schema, revisão, estado, ator/controlador, autoridade GM, arquitetura e descoberta |
| ActionRequest | requestId, sessionId, expectedRevision, tipo da ação, parâmetros limitados |
| ActionResult | requestId, resultado/erro tipado, rolagens, efeitos propostos, revisão resultante |
| ViewerProjection | Apenas campos autorizados ao destinatário, revisão e eventos públicos |
| PendingEffect | ID estável, ação de origem, alvo, alteração proposta, estado de confirmação/aplicação |

Não colocar identidade confiável no `ActionRequest`: resolver pelo contexto
autenticado do transporte. Se a API escolhida não comprovar o emissor, não tratar
o campo `userId` como prova. No alvo V12 o canal `module.<id>` entrega ao handler
o userId da sessão autenticada no servidor (D06); usar só esse valor.

## Processamento e autoridade

Uma autoridade GM ativa por sessão. Solicitações passam por validação de schema,
origem, posse do ator, controlador designado, revisão e elegibilidade atual.
Serializar mutações por sessão; rejeitar solicitações obsoletas com opção de atualizar.
Usar requestId e registro persistido de processamento para identificar reenvios.

O resultado de uma rolagem é calculado uma vez e reutilizado na confirmação.
Persistência e alterações de documentos podem não ser atômicas: projetar estados
de aplicação e recuperação, inclusive interrupção entre gravar sessão e atualizar
ator. Não prometer exactly-once entre documentos sem provar o mecanismo.

Perda do mestre pausa comandos. Troca de autoridade exige reidratar estado e
invalidar a autoridade anterior; dois mestres não podem aplicar a mesma ação.

## Privacidade e persistência

Separar estado privado da sessão e projeções públicas. Na V12 todo documento e
setting do mundo chega a todos os clientes: flags nunca são privadas. Persistir
apenas o que não acrescenta segredo além do já exposto pelo sistema (D11, D16);
projeções privadas vão por `recipients`. Não publicar segredos para depois filtrar no cliente.

Entrada tardia/reconexão solicita snapshot autorizado na revisão atual. Eventos
de animação têm IDs e não causam mutações; eventos antigos não são reexecutados.
Versionar schema e planejar migração/backup antes de alterar persistência publicada.

## Integração e performance

Usar APIs nativas de rolagens/efeitos quando estáveis e verificadas; não assumir
que métodos privados são contratos públicos. Encapsular e testar qualquer acesso
inevitável. A fonte de verdade do ator é a ficha; cache apenas para apresentação,
com invalidação por eventos verificados.

Preferir UI nativa compatível, CSS/SVG e atualizações por evento. Evitar polling,
renderização completa para cada efeito e dependências de animação sem necessidade.
Remover listeners/timers ao fechar. Medir antes de definir budgets numéricos.
