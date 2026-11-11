import { MODULE_ID } from "../constants";
import type { RunnerVitals } from "../domain/ice-hit";
import type { NetArchitecture } from "../domain/net-architecture";
import type { RunnerResources } from "../domain/net-rules";
import { commitOutcome } from "../session/commit";
import { revealedNotes } from "../session/notes";
import {
  type ActionResult,
  type IceStats,
  type NetAction,
  processRequest,
  type RollEvidence,
  type SheetEffect,
} from "../session/requests";
import { newestSessions, replaceSession } from "../session/session-list";
import type { PublicSession } from "../session/session-state";

/**
 * Canal de requisições (D19) sobre `module.<id>`. O servidor do Foundry anexa o
 * userId autenticado como 2º argumento do handler (verificado no V12); é a única
 * identidade aceita. Mensagens só vão aos destinatários listados em `recipients`.
 */
const CHANNEL = `module.${MODULE_ID}`;
const TIMEOUT_MS = 8000;
const PROCESSED_LIMIT = 200;

type Notes = Record<number, string>;

type Message =
  | { kind: "request"; request: unknown }
  | { kind: "result"; result: ActionResult }
  /** Consulta privada de notas reveladas (D29); a resposta vai só ao remetente. */
  | { kind: "notesQuery"; requestId: string; sessionId: string }
  | { kind: "notes"; requestId: string; notes: Notes };

export interface RequestChannelDeps {
  /** Sessões públicas confiáveis (E6-11a: várias, independentes). */
  getSessions(): PublicSession[];
  /** Grava a lista inteira (só a autoridade). */
  write(sessions: PublicSession[]): Promise<void>;
  readArchitecture(itemUuid: string): NetArchitecture | null;
  /** Recursos atuais da ficha (Interface, cyberdeck), lidos pela autoridade. */
  readRunner(actorUuid: string): RunnerResources;
  /** Evidência do card de rolagem no chat (E3-02b). */
  readRoll(messageId: string): RollEvidence | null;
  /** Atributos de um ator Black ICE (E3-02c, D25). */
  readIce(actorUuid: string): IceStats | null;
  /** HP e redução cerebral da Netrunner (E6-06). */
  readVitals(actorUuid: string): RunnerVitals | null;
  /** Executa um efeito em documento antes de gravar a sessão (D26). */
  applyEffect(effect: SheetEffect): Promise<void>;
  /** REF do ator (iniciativa 1d10 + REF, E6-11b). */
  readRef(actorUuid: string): number | null;
  /** NPC vinculada ao nó na flag do item da arquitetura (E6-11b, D37). */
  readNpcLink(itemUuid: string, key: number): string | null;
}

/** GM autoridade: o GM ativo de menor id (todos os clientes calculam igual). */
export function authorityGmId(): string | null {
  const gms = game.users.contents.filter((u) => u.isGM && u.active).map((u) => u.id);
  return gms.sort()[0] ?? null;
}

export class RequestChannel {
  readonly #deps: RequestChannelDeps;
  readonly #pending = new Map<string, (result: ActionResult) => void>();
  readonly #processed = new Map<string, ActionResult>();
  readonly #pendingNotes = new Map<string, (notes: Notes) => void>();
  #queue: Promise<unknown> = Promise.resolve();
  /** O que esta autoridade gravou e o servidor talvez ainda não devolveu (`null` = encerrada). */
  readonly #written = new Map<string, PublicSession | null>();

  constructor(deps: RequestChannelDeps) {
    this.#deps = deps;
  }

  activate(): void {
    game.socket.on(CHANNEL, (data: unknown, senderId: string) => this.#onMessage(data, senderId));
  }

  /** Executa tarefas em série com o processamento de requisições. */
  serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(task, task);
    this.#queue = run.catch(() => undefined);
    return run;
  }

  /** Envia uma ação da sessão `sessionId` ao GM autoridade e aguarda o resultado. */
  async send(sessionId: string, action: NetAction): Promise<ActionResult> {
    const session = this.#deps.getSessions().find((s) => s.id === sessionId) ?? null;
    const requestId = foundry.utils.randomID(16);
    const request = {
      requestId,
      sessionId,
      expectedRevision: session?.revision ?? 0,
      action,
    };
    const me = game.user;
    if (me && authorityGmId() === me.id) return this.#process(request, me.id);
    const gmId = authorityGmId();
    if (!gmId) return { requestId, ok: false, error: "no-authority", revision: null };

    return new Promise<ActionResult>((resolve) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        resolve({ requestId, ok: false, error: "timeout", revision: null });
      }, TIMEOUT_MS);
      this.#pending.set(requestId, (result) => {
        clearTimeout(timer);
        this.#pending.delete(requestId);
        resolve(result);
      });
      const message: Message = { kind: "request", request };
      game.socket.emit(CHANNEL, message, { recipients: [gmId] });
    });
  }

  /**
   * Notas reveladas à Netrunner (D29). Nunca vão ao setting público: a autoridade calcula
   * com o remetente do servidor e responde só a ele. Sem resposta, devolve vazio.
   */
  async queryNotes(sessionId: string): Promise<Notes> {
    const session = this.#deps.getSessions().find((s) => s.id === sessionId) ?? null;
    const me = game.user;
    if (!session || !me) return {};
    if (authorityGmId() === me.id) return this.#notesFor(session.id, me.id) ?? {};
    const gmId = authorityGmId();
    if (!gmId) return {};
    const requestId = foundry.utils.randomID(16);
    return new Promise<Notes>((resolve) => {
      const timer = setTimeout(() => {
        this.#pendingNotes.delete(requestId);
        resolve({});
      }, TIMEOUT_MS);
      this.#pendingNotes.set(requestId, (notes) => {
        clearTimeout(timer);
        this.#pendingNotes.delete(requestId);
        resolve(notes);
      });
      const message: Message = { kind: "notesQuery", requestId, sessionId: session.id };
      game.socket.emit(CHANNEL, message, { recipients: [gmId] });
    });
  }

  #notesFor(sessionId: string, senderId: string): Notes | null {
    const session = this.#current(sessionId);
    if (!session?.netArch) return null;
    const sender = { id: senderId, isGM: game.users.get(senderId)?.isGM === true };
    return revealedNotes(session, this.#deps.readArchitecture(session.netArch.itemUuid), sender);
  }

  #onMessage(data: unknown, senderId: string): void {
    if (typeof data !== "object" || data === null) return;
    const message = data as Partial<Message>;
    if (message.kind === "result") {
      // Só um GM pode responder; evita resultados forjados por outros jogadores.
      if (game.users.get(senderId)?.isGM !== true) return;
      const result = message.result;
      if (result && typeof result.requestId === "string")
        this.#pending.get(result.requestId)?.(result);
      return;
    }
    if (message.kind === "notes") {
      if (game.users.get(senderId)?.isGM !== true) return;
      const { requestId, notes } = message as { requestId?: unknown; notes?: unknown };
      if (typeof requestId === "string" && typeof notes === "object" && notes !== null) {
        this.#pendingNotes.get(requestId)?.(sanitizeNotes(notes));
      }
      return;
    }
    if (message.kind === "notesQuery") {
      if (!game.user || authorityGmId() !== game.user.id) return;
      const { requestId, sessionId } = message as { requestId?: unknown; sessionId?: unknown };
      if (typeof requestId !== "string" || typeof sessionId !== "string") return;
      // Espectador ou sessão errada: resposta vazia, sem conteúdo.
      const reply: Message = {
        kind: "notes",
        requestId,
        notes: this.#notesFor(sessionId, senderId) ?? {},
      };
      game.socket.emit(CHANNEL, reply, { recipients: [senderId] });
      return;
    }
    if (message.kind === "request") {
      if (!game.user || authorityGmId() !== game.user.id) return;
      void this.#process(message.request, senderId).then((result) => {
        const reply: Message = { kind: "result", result };
        game.socket.emit(CHANNEL, reply, { recipients: [senderId] });
      });
    }
  }

  #process(raw: unknown, senderId: string): Promise<ActionResult> {
    return this.serialize(async () => {
      const user = game.users.get(senderId);
      const rawId = (raw as { sessionId?: unknown } | null)?.sessionId;
      const sessionId = typeof rawId === "string" ? rawId : "";
      // Sessão pedida; sem ela, a primeira (o processador responde "wrong-session").
      const session = this.#current(sessionId) ?? this.#currentList()[0] ?? null;
      const outcome = processRequest(raw, {
        session,
        sender: { id: senderId, isGM: user?.isGM === true },
        architecture: session?.netArch
          ? this.#deps.readArchitecture(session.netArch.itemUuid)
          : null,
        processed: this.#processed,
        runner: session
          ? this.#deps.readRunner(session.actorUuid)
          : { interfaceRank: 0, hasCyberdeck: false },
        readRoll: (id) => this.#deps.readRoll(id),
        readIce: (uuid) => this.#deps.readIce(uuid),
        readVitals: (uuid) => this.#deps.readVitals(uuid),
        pick: (count) => Math.floor(Math.random() * count),
        readResources: (uuid) => this.#deps.readRunner(uuid),
        readRef: (uuid) => this.#deps.readRef(uuid),
        npcLinkAt: (key) =>
          session?.netArch ? this.#deps.readNpcLink(session.netArch.itemUuid, key) : null,
      });
      const committed = await commitOutcome(outcome, {
        applyEffect: (effect) => this.#deps.applyEffect(effect),
        write: (next) => {
          if (!session) return Promise.resolve();
          return this.#deps.write(replaceSession(this.#currentList(), session.id, next));
        },
      });
      if (committed.written !== undefined && session) {
        this.#written.set(session.id, committed.written);
      }
      if (committed.remember && outcome.processedKey) {
        this.#remember(outcome.processedKey, committed.result);
      }
      return committed.result;
    });
  }

  /** Lista mais recente: a do setting com o que esta autoridade gravou e ainda não voltou. */
  #currentList(): PublicSession[] {
    const stored = this.#deps.getSessions();
    // Esquece gravações já refletidas (ou superadas) no setting.
    for (const [id, w] of this.#written) {
      const s = stored.find((x) => x.id === id);
      if ((w === null && !s) || (w && s && s.revision >= w.revision)) this.#written.delete(id);
    }
    return newestSessions(stored, this.#written);
  }

  #current(sessionId: string): PublicSession | null {
    return this.#currentList().find((s) => s.id === sessionId) ?? null;
  }

  /** Inicia uma sessão nova pela autoridade, em série com as requisições. */
  start(session: PublicSession): Promise<void> {
    return this.serialize(async () => {
      const list = replaceSession(this.#currentList(), session.id, session);
      await this.#deps.write(list);
      this.#written.set(session.id, session);
    });
  }

  #remember(key: string, result: ActionResult): void {
    this.#processed.set(key, result);
    if (this.#processed.size > PROCESSED_LIMIT) {
      const oldest = this.#processed.keys().next().value;
      if (oldest !== undefined) this.#processed.delete(oldest);
    }
  }
}

function sanitizeNotes(value: object): Notes {
  const notes: Notes = {};
  for (const [key, text] of Object.entries(value)) {
    const k = Number(key);
    if (Number.isInteger(k) && k >= 0 && typeof text === "string") notes[k] = text;
  }
  return notes;
}
