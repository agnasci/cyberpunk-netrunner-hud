# Netrunner HUD — for Cyberpunk RED

Painel de Netrunning compartilhado para o Foundry VTT, para uso com o sistema
**Cyberpunk RED – CORE**. Mestre e Netrunner controlam a invasão; os demais jogadores
acompanham. A ficha e o cyberdeck nativos continuam sendo a fonte de verdade.

> **Beta.** Funciona no Foundry V12 (12.343) com o sistema Cyberpunk RED – CORE v0.92.4.
> Outras versões não foram testadas.

*English: shared Netrunning HUD for Foundry VTT, for use with the Cyberpunk RED – CORE
system (Foundry V12, system v0.92.4). Beta. UI in English and Brazilian Portuguese.*

## Instalação

No Foundry, em **Add-on Modules → Install Module**, cole no campo *Manifest URL*:

```
https://github.com/agnasci/cyberpunk-netrunner-hud/releases/latest/download/module.json
```

Ative o módulo no mundo. O botão do terminal na barra de ferramentas de tokens abre o HUD
(o mestre escolhe a Netrunner e a arquitetura NET ao iniciar).

## O que faz

- Arquitetura NET em grade, com revelação pelo mestre (completa ou só no mapa) e caminhos
  entre branches (a–h).
- Ações NET com o limite por Interface: Jack In/Out, Backdoor, Control, Eye-Dee, Zap, Slide,
  Pathfinder, Cloak, Virus (só no andar mais fundo), rezzar e atacar com programas.
- Rolagens nativas do sistema; o mestre confirma o resultado ou usa o modo sem confirmação.
- Black ICE vinculado a atores do mundo: encontro à espreita, vez alternada, ataque, dano no
  cérebro ou no REZ dos programas (o mestre escolhe o programa atingido).
- Netrunner NPC inimiga em qualquer nó, com iniciativa e ataques.
- Regras de programas: uma ativação por cópia por rodada, neutralizado a REZ 0, Armor/Flak/
  Shield/Superglue uma vez por Netrun.
- Várias invasões ao mesmo tempo (abas), registro de eventos, desfazer do mestre, som opcional.

O módulo **não traz atributos de Black ICE do livro**: o mestre cria os atores Black ICE (e
os itens de programa com o dano) no próprio mundo, pelo livro.

## Desenvolvimento

Código em TypeScript, testes com Vitest. Comandos em [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md);
para agentes de IA, comece por [AGENTS.md](AGENTS.md) e [STATUS.md](STATUS.md).

```
npm ci
npm run check
```

## Licença e aviso

Código sob a [licença MIT](LICENSE).

Netrunner HUD is unofficial content provided under the Homebrew Content Policy of R. Talsorian
Games and is not approved or endorsed by RTG. This content references materials that are the
property of R. Talsorian Games and its licensees.
