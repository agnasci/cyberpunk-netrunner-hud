# Desenvolvimento e padrões

## Ambiente

Node 24 LTS (`.nvmrc`), npm com `package-lock.json` e dependências fixadas (D02).
Foundry local de teste: `D:Foundry Virtual Tabletop` (12.343), dados em
`%LOCALAPPDATA%FoundryVTTData`. Use caminhos relativos na configuração do projeto.

| Comando | Responsabilidade |
|---|---|
| `npm ci` | Instalar exatamente o lockfile versionado |
| `npm run typecheck` | Verificar tipos (código e `vite.config.ts`) sem emitir |
| `npm run lint` | ESLint + verificação de formatação (Prettier) |
| `npm run format` | Aplicar formatação |
| `npm test` | Testes Vitest em `tests/**/*.test.ts`, sem Foundry |
| `npm run build` | Gerar o módulo instalável em `dist/` (script, manifesto, `lang/`) |
| `npm run check` | Todos os anteriores, em sequência |

## Instalação local para teste

`dist/` é ligado ao Foundry por junção (já criada em 2026-11-09):

```powershell
New-Item -ItemType Junction -Path "$env:LOCALAPPDATAFoundryVTTDatamodulescyberpunk-netrunner-hud" -Target "<repo>dist"
```

CSS: escopar seletores com `.cnh-app` quando competirem com o núcleo ou o sistema
(ex.: `.application h2` do Foundry e `.application .window-content button` do CPR
vencem seletores de uma classe). O reset de botões `.cnh-app .cnh-hud button` usa
`all: unset`; componentes em `<button>` precisam de seletor com 3 classes. Templates `.hbs` ficam fora do Prettier.

Após `npm run build`, recarregue o navegador (F5). Módulo novo ou `module.json`
alterado exige voltar à tela de setup e relançar o mundo. Ative o módulo apenas
no mundo de teste. Tipos do Foundry: declarações mínimas em `src/types/foundry.d.ts` (D15).

## Implementação

- Um propósito por arquivo; nomes claros; evitar arquivos genéricos `utils` gigantes.
- Exportar contratos pequenos. Validar dados na entrada das fronteiras.
- Erros com código, mensagem útil e contexto sem segredos.
- Não ler caminhos `actor.system.*` fora do adaptador; não duplicar regras na UI.
- Não usar `any` amplo para ocultar incertezas do sistema; tipar o mínimo verificado.
- Internacionalizar texto de interface; inicialmente pt-BR, fallback a decidir.
- Testar transições e efeitos observáveis; injetar rolagem/tempo para determinismo.
- Não executar scripts arbitrários vindos de payloads, fichas ou arquiteturas.

## Fluxo Git e entrega

Verifique se existe repositório antes de usar Git. Se ainda não existir, a IA que
iniciar implementação pode inicializá-lo localmente. Não criar remoto nem publicar
por inferência. Antes de editar use `git status --short` quando disponível.
Prefira commits pequenos (`docs:`, `feat:`, `fix:`, `test:`) e paths explícitos.
Não apagar alterações alheias para conseguir testes verdes.

Quando houver runtime: testar em mundo descartável e com backup, nunca apontar
comandos de instalação para o mundo real por suposição. Documentar instalação
local e empacotamento após definir o manifesto.

## Publicar uma versão (E5-02, D41)

O repositório público (`agnasci/cyberpunk-netrunner-hud`) recebe **instantâneos** do branch local
`main`, sem o histórico antigo (que contém os dados dos Black ICE básicos). Os arquivos
`*.local.ts` ficam fora do git; sem eles o módulo não oferece Black ICE básicos.

1. Atualize `version` e `download` (`.../releases/download/vX.Y.Z/module.zip`) em `module.json`
   e `version` em `package.json`; rode `npm run check` e faça o commit no `main`.
2. Instantâneo no branch `public` (autor noreply do GitHub):
   `git commit-tree main^{tree} -p public -m "vX.Y.Z"` e `git branch -f public <sha>`;
   `git push origin public:main`.
3. Build limpo, sem os arquivos locais: `git worktree add <pasta-temporária> public`, nela
   `npm ci && npm run check`, e compacte o conteúdo de `dist/` (`module.json` na raiz do zip)
   como `module.zip`.
4. `gh release create vX.Y.Z module.zip dist/module.json --title "vX.Y.Z (beta)"` (release normal,
   não "pre-release": o link `releases/latest` do manifesto ignora pre-releases).
5. Página do Foundry: `POST https://foundryvtt.com/_api/packages/release_version/` com o
   header `Authorization` = token de release do pacote (pedir ao usuário; nunca gravar em arquivo,
   commit, log ou repositório) e o corpo `{id, release: {version, manifest, notes, compatibility}}`,
   com o `manifest` da release específica (`.../download/vX.Y.Z/module.json`), não o `latest`.
   Rodar antes com `"dry-run": true`. Duas releases do mesmo pacote em menos de 60 s dão 429.
