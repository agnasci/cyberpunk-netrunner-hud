/**
 * Declarações mínimas do Foundry V12 usadas pelo módulo (D15).
 * Acrescente apenas o que for verificado em docs/COMPATIBILITY.md ou no código
 * local do Foundry 12.343.
 */

/** client-esm/applications/api/application.mjs (V12). */
declare class FoundryApplicationV2 {
  constructor(options?: Record<string, unknown>);
  static DEFAULT_OPTIONS: Record<string, unknown>;
  readonly element: HTMLElement;
  readonly rendered: boolean;
  render(options?: boolean | Record<string, unknown>): Promise<this>;
  close(options?: Record<string, unknown>): Promise<this>;
  bringToFront(): void;
  protected _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>>;
  protected _onRender(context: Record<string, unknown>, options: Record<string, unknown>): void;
  protected _onFirstRender(
    context: Record<string, unknown>,
    options: Record<string, unknown>,
  ): void;
  protected _onClose(options: Record<string, unknown>): void;
}

type FoundryApplicationClass = abstract new (
  options?: Record<string, unknown>,
) => FoundryApplicationV2;

/** Ferramenta de controle de cena (V12: array de controles com `tools`). */
interface FoundrySceneControlTool {
  name: string;
  title: string;
  icon: string;
  button?: boolean;
  visible?: boolean;
  onClick?: () => void;
}

interface FoundrySceneControl {
  name: string;
  tools: FoundrySceneControlTool[];
}

/** Documento Actor (V12); apenas campos lidos pelo adaptador. */
interface FoundryItemDocument {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly system: unknown;
}

interface FoundryActorDocument {
  readonly documentName: "Actor";
  readonly uuid: string;
  readonly name: string;
  readonly type: string;
  readonly system: unknown;
  /** Collection do Foundry: iterar produz os valores. */
  readonly items: Iterable<FoundryItemDocument>;
  testUserPermission(user: FoundryUserDocument, level: "OWNER" | "OBSERVER"): boolean;
}

interface FoundryUserDocument {
  readonly id: string;
  readonly name: string;
  readonly isGM: boolean;
  readonly active: boolean;
  /** Personagem atribuído ao usuário (V12). */
  readonly character?: FoundryActorDocument | null;
}

interface FoundryItemWithParent extends FoundryItemDocument {
  readonly uuid: string;
  readonly parent: { readonly uuid: string } | null;
}

/** Item do mundo (V12), ex.: NetArch. */
interface FoundryWorldItemDocument extends FoundryItemDocument {
  readonly documentName: "Item";
  readonly uuid: string;
}

/** Documento Setting (V12); `_stats.lastModifiedBy` é gerenciado pelo servidor. */
interface FoundrySettingDocument {
  readonly _stats?: { readonly lastModifiedBy?: string | null };
}

/** ChatMessage (V12); `author` é atribuído pelo servidor ao criar. */
interface FoundryChatMessageDocument {
  readonly id: string;
  readonly author: FoundryUserDocument | null;
  readonly speaker: { readonly actor?: string | null };
  readonly content: string;
  /** Rolagens do core (ex.: `Roll#toMessage`); cards do CPR não têm. */
  readonly rolls: ReadonlyArray<{ readonly formula: string; readonly total: number }>;
}

interface FoundryDialogV2 {
  prompt(options: Record<string, unknown>): Promise<unknown>;
  confirm(options: Record<string, unknown>): Promise<unknown>;
}

declare global {
  type FoundryActor = FoundryActorDocument;
  type FoundryWorldItem = FoundryWorldItemDocument;
  type FoundryChatMessage = FoundryChatMessageDocument;

  /** Roll do core (V12): `toMessage` avalia a rolagem se preciso e cria a mensagem. */
  class Roll {
    constructor(formula: string);
    /** Fórmula sintaticamente válida (V12). */
    static validate(formula: string): boolean;
    toMessage(data?: Record<string, unknown>): Promise<FoundryChatMessageDocument>;
  }

  const ChatMessage: {
    getSpeaker(options: { actor: unknown }): Record<string, unknown>;
  };

  /** foundry.js (V12): resolve um UUID de forma síncrona. */
  function fromUuidSync(uuid: string): unknown;

  const Hooks: {
    once(hook: "init" | "ready", fn: () => void): number;
    on(hook: "getSceneControlButtons", fn: (controls: FoundrySceneControl[]) => void): number;
    on(hook: "updateActor", fn: (actor: FoundryActorDocument) => void): number;
    /** client/apps/app.js (V12): `get<Classe>HeaderButtons` para cada classe da janela v1. */
    on(
      hook: "getActorSheetHeaderButtons",
      fn: (
        app: { readonly actor?: FoundryActorDocument },
        buttons: Array<{ label: string; class: string; icon: string; onclick: () => void }>,
      ) => void,
    ): number;
    on(
      hook: "createItem" | "updateItem" | "deleteItem",
      fn: (item: FoundryItemWithParent) => void,
    ): number;
    /** Aba Items (Application v1, V12): `html` é um jQuery do elemento. */
    on(hook: "renderItemDirectory", fn: (app: unknown, html: unknown) => void): number;
    on(hook: "createChatMessage", fn: (message: FoundryChatMessageDocument) => void): number;
    /** client/data/collections/users.js (V12): usuário entrou ou saiu. */
    on(hook: "userConnected", fn: (user: FoundryUserDocument, connected: boolean) => void): number;
    off(hook: string, id: number): void;
    readonly events: Record<string, readonly unknown[]>;
  };

  const game: {
    system: { id: string; version: string };
    user: FoundryUserDocument | null;
    users: { get(id: string): FoundryUserDocument | undefined; contents: FoundryUserDocument[] };
    actors: { contents: FoundryActorDocument[] };
    items: { contents: FoundryWorldItemDocument[] };
    messages: { get(id: string): FoundryChatMessageDocument | undefined };
    modules: { get(id: string): { api?: unknown } | undefined };
    /** socket.io do V12; módulos com `socket: true` usam o canal `module.<id>`. */
    socket: {
      emit(channel: string, data: unknown, options?: { recipients?: string[] }): void;
      on(channel: string, handler: (data: unknown, senderId: string) => void): void;
    };
    settings: {
      register(namespace: string, key: string, data: Record<string, unknown>): void;
      get(namespace: string, key: string): unknown;
      set(namespace: string, key: string, value: unknown): Promise<unknown>;
      storage: {
        get(scope: "world"): { getSetting(key: string): FoundrySettingDocument | undefined };
      };
    };
    audio: FoundryAudioHelper;
    i18n: {
      localize(key: string): string;
      format(key: string, data?: Record<string, string>): string;
    };
  };

  /** client-esm/audio/helper.mjs (V12): contextos criados no primeiro gesto. */
  interface FoundryAudioHelper {
    readonly locked: boolean;
    readonly interface?: AudioContext & { gainNode?: GainNode };
  }

  const ui: {
    notifications: {
      info(message: string): void;
      warn(message: string, options?: { permanent?: boolean }): void;
      error(message: string, options?: { permanent?: boolean }): void;
    };
  };

  const foundry: {
    utils: {
      randomID(length?: number): string;
      debounce<T extends (...args: never[]) => void>(fn: T, delay: number): T;
    };
    applications: {
      api: {
        ApplicationV2: typeof FoundryApplicationV2;
        DialogV2: FoundryDialogV2;
        HandlebarsApplicationMixin<T extends FoundryApplicationClass>(base: T): T;
      };
    };
  };

  type ApplicationV2 = FoundryApplicationV2;
  type SceneControl = FoundrySceneControl;
}

export {};
