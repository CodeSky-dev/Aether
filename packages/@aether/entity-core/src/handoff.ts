// @aether/entity-core · Handoff Gate 状态机
// 破坏性或权限敏感操作触发 Entity 暂停，等待人类确认。
// 定义人机责任边界：Entity 处理可逆操作，人类独占裁决权。
//
// 状态机：
//   idle/suspended --start--> active
//   active         --stop---> idle
//   active         --request_handoff--> waiting (持有一个 pending request)
//   waiting        --approve-->  active  (人类批准)
//   waiting        --reject-->  suspended (人类拒绝，需 Realm Admin resume)
//   waiting        --timeout--> suspended (超时自动拒绝)
//   any non-suspended --suspend--> suspended (外部干预)
//   suspended      --resume--> active
//
// 设计要点：
// - 纯状态机，不直接读写 db。状态变更产生事件，由 caller 持久化到 entities.status。
// - 同一时刻只允许一个 pending handoff（避免并发破坏性操作）。
// - 超时由 caller 定时驱动 checkTimeout()，状态机本身不持有时钟。
import type { EntityStatus } from '@aether/types'

export type HandoffGateState = EntityStatus

export interface HandoffRequest {
  readonly id: string
  readonly entityId: string
  /** 操作描述（人类可读，用于审计） */
  readonly operation: string
  /** 载荷摘要，防篡改（与 audit_log.payload_hash 对齐） */
  readonly payloadHash: string
  readonly requestedAt: number
  /** 超时时间戳；超过则 checkTimeout 触发 auto-reject */
  readonly expiresAt: number
}

export interface HandoffDecision {
  readonly requestId: string
  readonly decision: 'approve' | 'reject'
  /** 裁决者的 actorId（必须是人类） */
  readonly decidedBy: string
  readonly decidedAt: number
  readonly reason?: string
}

export type HandoffEvent =
  | { readonly type: 'start' }
  | { readonly type: 'stop' }
  | { readonly type: 'request_handoff'; readonly request: HandoffRequest }
  | { readonly type: 'approve'; readonly decision: HandoffDecision }
  | { readonly type: 'reject'; readonly decision: HandoffDecision }
  | {
      readonly type: 'timeout'
      readonly requestId: string
      readonly at: number
    }
  | { readonly type: 'suspend'; readonly reason?: string }
  | { readonly type: 'resume' }

export type HandoffListener = (
  state: HandoffGateState,
  event: HandoffEvent,
) => void

export class HandoffGateError extends Error {
  public readonly code: string
  public constructor(message: string, code: string) {
    super(message)
    this.name = 'HandoffGateError'
    this.code = code
  }
}

export interface HandoffGateOptions {
  readonly entityId: string
  readonly initialState?: HandoffGateState
  /** 默认 handoff 超时（ms）；缺省 5 分钟 */
  readonly defaultTimeoutMs?: number
  readonly now?: () => number
  /** 请求 ID 生成器（测试可注入） */
  readonly generateRequestId?: () => string
}

const DEFAULT_TIMEOUT_MS = 5 * 60_000

export class HandoffGate {
  private state: HandoffGateState
  private readonly entityId: string
  private readonly defaultTimeoutMs: number
  private readonly now: () => number
  private readonly generateRequestId: () => string
  private pending: HandoffRequest | null = null
  private readonly listeners = new Set<HandoffListener>()

  public constructor(options: HandoffGateOptions) {
    this.entityId = options.entityId
    this.state = options.initialState ?? 'idle'
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS
    this.now = options.now ?? Date.now
    this.generateRequestId = options.generateRequestId ?? defaultGenerateRequestId
  }

  public getState(): HandoffGateState {
    return this.state
  }

  public getEntityId(): string {
    return this.entityId
  }

  public getPendingRequest(): HandoffRequest | null {
    return this.pending
  }

  public isWaiting(): boolean {
    return this.state === 'waiting'
  }

  public canAct(): boolean {
    return this.state === 'active'
  }

  public subscribe(listener: HandoffListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** 启动 Entity：idle/suspended → active */
  public start(): void {
    this.transition({ type: 'start' })
  }

  /** 停止 Entity：active → idle */
  public stop(): void {
    this.transition({ type: 'stop' })
  }

  /**
   * 请求 handoff：active → waiting
   * 在执行破坏性/权限敏感操作前调用。同一时刻只允许一个 pending request。
   */
  public requestHandoff(input: {
    operation: string
    payloadHash: string
    timeoutMs?: number
  }): HandoffRequest {
    const request: HandoffRequest = {
      id: this.generateRequestId(),
      entityId: this.entityId,
      operation: input.operation,
      payloadHash: input.payloadHash,
      requestedAt: this.now(),
      expiresAt: this.now() + (input.timeoutMs ?? this.defaultTimeoutMs),
    }
    this.transition({ type: 'request_handoff', request })
    return request
  }

  /** 人类批准 handoff：waiting → active。requestId 必须与 pending 匹配。 */
  public approve(decision: Omit<HandoffDecision, 'decision'>): void {
    this.transition({
      type: 'approve',
      decision: { ...decision, decision: 'approve' },
    })
  }

  /**
   * 人类拒绝 handoff：waiting → suspended。
   * Entity 被挂起，需 Realm Admin resume 才能恢复。
   */
  public reject(decision: Omit<HandoffDecision, 'decision'>): void {
    this.transition({
      type: 'reject',
      decision: { ...decision, decision: 'reject' },
    })
  }

  /**
   * 检查超时：waiting 且超过 expiresAt → suspended。
   * 返回 true 表示触发了超时拒绝。由 caller 定时驱动。
   */
  public checkTimeout(): boolean {
    if (this.state !== 'waiting' || this.pending === null) {
      return false
    }
    if (this.now() < this.pending.expiresAt) {
      return false
    }
    const requestId = this.pending.id
    this.transition({ type: 'timeout', requestId, at: this.now() })
    return true
  }

  /** 外部挂起：任意非 suspended 状态 → suspended。用于安全事件干预。 */
  public suspend(reason?: string): void {
    this.transition(
      reason !== undefined ? { type: 'suspend', reason } : { type: 'suspend' },
    )
  }

  /** Realm Admin 恢复：suspended → active。会清空 pending request。 */
  public resume(): void {
    this.transition({ type: 'resume' })
  }

  // ---- 状态转移核心 ----

  private transition(event: HandoffEvent): void {
    const nextState = this.computeNextState(event)
    if (nextState === null) {
      throw new HandoffGateError(
        `Invalid transition from "${this.state}" on event "${event.type}"`,
        'INVALID_TRANSITION',
      )
    }

    // 副作用：管理 pending request
    this.applySideEffects(event)

    this.state = nextState
    for (const listener of this.listeners) {
      listener(nextState, event)
    }
  }

  private applySideEffects(event: HandoffEvent): void {
    switch (event.type) {
      case 'request_handoff':
        this.pending = event.request
        break
      case 'approve':
      case 'reject':
        if (this.pending?.id === event.decision.requestId) {
          this.pending = null
        }
        break
      case 'timeout':
        if (this.pending?.id === event.requestId) {
          this.pending = null
        }
        break
      case 'resume':
        // resume 清空 pending（即使原本 suspended 时残留）
        this.pending = null
        break
      case 'start':
      case 'stop':
      case 'suspend':
        // 不动 pending：suspend 保留 pending 供审计回溯，resume 会清空
        break
    }
  }

  private computeNextState(event: HandoffEvent): HandoffGateState | null {
    switch (event.type) {
      case 'start':
        return this.state === 'idle' || this.state === 'suspended'
          ? 'active'
          : null

      case 'stop':
        return this.state === 'active' ? 'idle' : null

      case 'request_handoff':
        if (this.state !== 'active') return null
        if (this.pending !== null) return null
        return 'waiting'

      case 'approve':
        if (this.state !== 'waiting') return null
        if (this.pending?.id !== event.decision.requestId) return null
        return 'active'

      case 'reject':
        if (this.state !== 'waiting') return null
        if (this.pending?.id !== event.decision.requestId) return null
        return 'suspended'

      case 'timeout':
        if (this.state !== 'waiting') return null
        if (this.pending?.id !== event.requestId) return null
        return 'suspended'

      case 'suspend':
        return this.state === 'suspended' ? null : 'suspended'

      case 'resume':
        return this.state === 'suspended' ? 'active' : null

      default: {
        // exhaustiveness check
        const _exhaustive: never = event
        return _exhaustive
      }
    }
  }
}

function defaultGenerateRequestId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  return `hreq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
