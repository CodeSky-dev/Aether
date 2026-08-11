// @aether/editor-host · Yjs Serverless 持久化与连接管理本地探测。
import { cpus, platform, release, arch } from 'node:os'
import { performance } from 'node:perf_hooks'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  appendPartitionText,
  applyDocUpdate,
  createDoc,
  createLoopbackTransportPair,
  destroyDoc,
  diffDocUpdate,
  encodeDocStateVector,
  encodeDocUpdate,
  readPartitionText,
  subscribeDocUpdates,
  YjsProvider,
} from '@aether/current-sync'

const PROBE_ORIGIN = Symbol('serverless-probe')
const SAMPLE_COUNT = 7
const DEFAULT_EDIT_COUNTS = [100, 1_000, 10_000]
const COMPACTION_INTERVALS = [10, 50, 200]

export interface StoreMetrics {
  reads: number
  readBytes: number
  writes: number
  writeBytes: number
  appendedUpdates: number
  compactedSnapshots: number
}

export class SnapshotStore {
  private snapshot = new Uint8Array()
  private readonly pendingUpdates: Uint8Array[] = []
  public readonly metrics: StoreMetrics = {
    reads: 0,
    readBytes: 0,
    writes: 0,
    writeBytes: 0,
    appendedUpdates: 0,
    compactedSnapshots: 0,
  }

  public read(): { snapshot: Uint8Array; updates: Uint8Array[] } {
    this.metrics.reads += 1
    this.metrics.readBytes +=
      this.snapshot.byteLength +
      this.pendingUpdates.reduce((total, update) => total + update.byteLength, 0)
    return {
      snapshot: this.snapshot.slice(),
      updates: this.pendingUpdates.map((update) => update.slice()),
    }
  }

  public writeSnapshot(snapshot: Uint8Array): void {
    this.snapshot = snapshot.slice()
    this.pendingUpdates.length = 0
    this.metrics.writes += 1
    this.metrics.writeBytes += snapshot.byteLength
    this.metrics.compactedSnapshots += 1
  }

  public appendUpdate(update: Uint8Array): void {
    this.pendingUpdates.push(update.slice())
    this.metrics.writes += 1
    this.metrics.writeBytes += update.byteLength
    this.metrics.appendedUpdates += 1
  }

  public pendingCount(): number {
    return this.pendingUpdates.length
  }
}

interface GeneratedEdits {
  updates: Uint8Array[]
  totalBytes: number
}

interface RequestResult {
  durationMs: number
  doc: ReturnType<typeof createDoc>
}

export function generateEdits(count: number): GeneratedEdits {
  const clientDoc = createDoc()
  const updates: Uint8Array[] = []
  let totalBytes = 0
  try {
    for (let index = 0; index < count; index += 1) {
      let update: Uint8Array | undefined
      const stop = subscribeDocUpdates(clientDoc, (nextUpdate) => {
        update = nextUpdate
      })
      appendPartitionText(clientDoc, 'code', 'content', `编辑-${index};`)
      stop()
      if (!update) {
        throw new Error(`未捕获到第 ${index} 条客户端 update`)
      }
      updates.push(update)
      totalBytes += update.byteLength
    }
    return { updates, totalBytes }
  } finally {
    destroyDoc(clientDoc)
  }
}

function loadStore(store: SnapshotStore) {
  const doc = createDoc()
  const persisted = store.read()
  if (persisted.snapshot.byteLength > 0) {
    applyDocUpdate(doc, persisted.snapshot, PROBE_ORIGIN)
  }
  for (const update of persisted.updates) {
    applyDocUpdate(doc, update, PROBE_ORIGIN)
  }
  return doc
}

function requestWithFullSnapshot(
  store: SnapshotStore,
  update: Uint8Array,
): RequestResult {
  const startedAt = performance.now()
  const doc = loadStore(store)
  applyDocUpdate(doc, update, PROBE_ORIGIN)
  store.writeSnapshot(encodeDocUpdate(doc))
  return { durationMs: performance.now() - startedAt, doc }
}

function requestWithAppendAndCompaction(
  store: SnapshotStore,
  update: Uint8Array,
  compactionInterval: number,
  requestNumber: number,
): RequestResult {
  const startedAt = performance.now()
  const doc = loadStore(store)
  applyDocUpdate(doc, update, PROBE_ORIGIN)
  store.appendUpdate(update)
  if (requestNumber % compactionInterval === 0) {
    store.writeSnapshot(encodeDocUpdate(doc))
  }
  return { durationMs: performance.now() - startedAt, doc }
}

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  const position = (sorted.length - 1) * percentileValue
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) {
    return sorted[lower] ?? 0
  }
  return (
    (sorted[lower] ?? 0) +
    ((sorted[upper] ?? 0) - (sorted[lower] ?? 0)) * (position - lower)
  )
}

function summary(values: number[]) {
  return {
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
  }
}

function runPersistenceComparison(updates: Uint8Array[]) {
  const fullStore = new SnapshotStore()
  const fullDurations: number[] = []
  let fullDoc: ReturnType<typeof createDoc> | undefined
  for (const [index, update] of updates.entries()) {
    const result = requestWithFullSnapshot(fullStore, update)
    fullDurations.push(result.durationMs)
    fullDoc = result.doc
    if (index < updates.length - 1) {
      destroyDoc(result.doc)
    }
  }

  const appendResults = COMPACTION_INTERVALS.map((interval) => {
    const store = new SnapshotStore()
    const durations: number[] = []
    for (const [index, update] of updates.entries()) {
      const result = requestWithAppendAndCompaction(
        store,
        update,
        interval,
        index + 1,
      )
      durations.push(result.durationMs)
      destroyDoc(result.doc)
    }
    const finalDoc = loadStore(store)
    const finalSnapshotBytes = encodeDocUpdate(finalDoc).byteLength
    destroyDoc(finalDoc)
    return {
      compactionEvery: interval,
      finalSnapshotBytes,
      pendingUpdates: store.pendingCount(),
      requestDuration: summary(durations),
      store: store.metrics,
    }
  })

  if (fullDoc) {
    destroyDoc(fullDoc)
  }
  return {
    fullSnapshot: {
      requestDuration: summary(fullDurations),
      store: fullStore.metrics,
    },
    appendUpdates: appendResults,
  }
}

function runSizeAndLatency(generated: GeneratedEdits, count: number) {
  const serverDoc = createDoc()
  const encodeDurations: number[] = []
  const applyDurations: number[] = []
  try {
    for (const update of generated.updates) {
      applyDocUpdate(serverDoc, update, PROBE_ORIGIN)
    }
    const fullSnapshot = encodeDocUpdate(serverDoc)
    for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
      const encodeStartedAt = performance.now()
      const encoded = encodeDocUpdate(serverDoc)
      encodeDurations.push(performance.now() - encodeStartedAt)
      const targetDoc = createDoc()
      const applyStartedAt = performance.now()
      applyDocUpdate(targetDoc, encoded, PROBE_ORIGIN)
      applyDurations.push(performance.now() - applyStartedAt)
      destroyDoc(targetDoc)
    }
    return {
      updateCount: count,
      fullSnapshotBytes: fullSnapshot.byteLength,
      incrementalUpdateBytes: generated.totalBytes,
      encodeStateAsUpdate: summary(encodeDurations),
      applyUpdate: summary(applyDurations),
    }
  } finally {
    destroyDoc(serverDoc)
  }
}

export function runReconnectProbe(updates: Uint8Array[]) {
  const serverDoc = createDoc()
  const staleClientDoc = createDoc()
  try {
    const staleCount = Math.floor(updates.length / 2)
    for (const update of updates) {
      applyDocUpdate(serverDoc, update, PROBE_ORIGIN)
    }
    for (const update of updates.slice(0, staleCount)) {
      applyDocUpdate(staleClientDoc, update, PROBE_ORIGIN)
    }
    const snapshot = encodeDocUpdate(serverDoc)
    const stateVector = encodeDocStateVector(staleClientDoc)
    const diff = diffDocUpdate(snapshot, stateVector)
    applyDocUpdate(staleClientDoc, diff, PROBE_ORIGIN)
    return {
      staleUpdateCount: staleCount,
      fullSnapshotBytes: snapshot.byteLength,
      diffUpdateBytes: diff.byteLength,
      savedBytes: snapshot.byteLength - diff.byteLength,
      convergedContentLength: readPartitionText(
        staleClientDoc,
        'code',
        'content',
      ).length,
      convergedContentSuffix: readPartitionText(
        staleClientDoc,
        'code',
        'content',
      ).slice(-12),
    }
  } finally {
    destroyDoc(serverDoc)
    destroyDoc(staleClientDoc)
  }
}

export async function runPresenceProbe() {
  const [clientTransport, serverTransport] = createLoopbackTransportPair()
  const client = new YjsProvider({
    actorId: 'probe-client',
    transport: clientTransport,
  })
  const server = new YjsProvider({
    actorId: 'probe-server',
    transport: serverTransport,
  })
  await Promise.all([client.connect(), server.connect()])
  client.setLocalPresence({ cursor: null, selection: null })
  const seenBeforeDisconnect = server.presence.getSnapshots().map(
    (snapshot) => snapshot.actorId,
  )
  server.destroy()
  client.destroy()

  const [reconnectedClientTransport, freshServerTransport] =
    createLoopbackTransportPair()
  const reconnectedClient = new YjsProvider({
    actorId: 'probe-client',
    transport: reconnectedClientTransport,
  })
  const freshServer = new YjsProvider({
    actorId: 'probe-server',
    transport: freshServerTransport,
  })
  await Promise.all([reconnectedClient.connect(), freshServer.connect()])
  const withoutReplay = freshServer.presence.getSnapshots().map(
    (snapshot) => snapshot.actorId,
  )
  reconnectedClient.setLocalPresence({ cursor: null, selection: null })
  const afterReplay = freshServer.presence.getSnapshots().map(
    (snapshot) => snapshot.actorId,
  )
  reconnectedClient.destroy()
  freshServer.destroy()
  return {
    seenBeforeDisconnect,
    withoutReplay,
    afterClientReplay: afterReplay,
    requiresClientReplay: withoutReplay.length === 0 && afterReplay.length === 1,
  }
}

function runColdStartProbe(updates: Uint8Array[]) {
  const store = new SnapshotStore()
  const durations: number[] = []
  for (const update of updates) {
    const result = requestWithFullSnapshot(store, update)
    durations.push(result.durationMs)
    destroyDoc(result.doc)
  }
  return {
    requestCount: updates.length,
    duration: summary(durations),
    store: store.metrics,
  }
}

interface ProbeOptions {
  persistenceEditCount?: number
  latencyEditCounts?: number[]
  coldStartRequestCount?: number
}

export async function runServerlessProbe(options: ProbeOptions = {}) {
  const persistenceEditCount = options.persistenceEditCount ?? 1_000
  const latencyEditCounts =
    options.latencyEditCounts ?? DEFAULT_EDIT_COUNTS
  const coldStartRequestCount = options.coldStartRequestCount ?? 100
  const persistence = generateEdits(persistenceEditCount)
  const latency = latencyEditCounts.map((count) => ({
    count,
    generated: generateEdits(count),
  }))
  return {
    generatedAt: new Date().toISOString(),
    machine: {
      node: process.version,
      platform: platform(),
      arch: arch(),
      kernel: release(),
      cpu: cpus()[0]?.model ?? 'unknown',
      cpuCount: cpus().length,
    },
    methodology: {
      sampleCount: SAMPLE_COUNT,
      editValue: 'Y.Text code.content 逐次追加编辑-N;',
      latencyClock: 'node:perf_hooks performance.now()',
      p95: '线性插值百分位数',
      networkIncluded: false,
      databaseIncluded: false,
    },
    persistence: runPersistenceComparison(persistence.updates),
    sizeAndLatency: latency.map(({ count, generated }) =>
      runSizeAndLatency(generated, count),
    ),
    reconnect: runReconnectProbe(persistence.updates),
    presence: await runPresenceProbe(),
    coldStart: runColdStartProbe(
      persistence.updates.slice(0, coldStartRequestCount),
    ),
  }
}

async function main() {
  const result = await runServerlessProbe()
  const outputPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../results/yjs-serverless.json',
  )
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main()
}
