// @aether/web · Audit Vault 导出端点：GET /api/realms/:realmId/audit/export
// 流式输出：审计台账可能远大于单次响应内存预算，按键集游标边查边写。
import { randomUUID } from 'node:crypto'
import { realms } from '@aether/db'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { requireEntitlement, resolveCurrentActor } from '@/lib/auth-guard'
import { recordAuditExport } from '@/lib/audit-write'
import {
  auditCsvHeader,
  auditCsvLine,
  auditExportFilename,
  auditJsonlLine,
  AuditExportQueryError,
  iterateAuditExportRows,
  parseAuditExportQuery,
  type AuditExportQuery,
} from '@/lib/audit-export'
import { getDb } from '@/lib/db'
import { READ_MEMBER_ROLES, requireRealmRole } from '@/lib/membership-guard'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ realmId: string }>
}

export async function GET(
  request: NextRequest,
  context: RouteParams,
): Promise<Response> {
  const { realmId } = await context.params

  const actor = await resolveCurrentActor()
  if (actor === null) {
    return Response.json(
      { error: 'Audit export requires an authenticated session' },
      { status: 401 },
    )
  }

  let query: AuditExportQuery
  try {
    query = parseAuditExportQuery(new URL(request.url).searchParams)
  } catch (error) {
    if (error instanceof AuditExportQueryError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    throw error
  }

  try {
    await requireEntitlement(realmId, { resource: 'audit', action: 'read' })
    await requireRealmRole(realmId, actor, READ_MEMBER_ROLES)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Audit export denied' },
      { status: 403 },
    )
  }

  const db = getDb()
  const [realm] = await db
    .select({ slug: realms.slug })
    .from(realms)
    .where(eq(realms.id, realmId))
    .limit(1)
  if (!realm) {
    return Response.json({ error: 'Realm not found' }, { status: 404 })
  }

  await recordAuditExport(db, {
    realmId,
    actor,
    target: {
      kind: 'audit_export',
      format: query.format,
      ...(query.actorType ? { actor_type: query.actorType } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.from ? { from: query.from.toISOString() } : {}),
      ...(query.to ? { to: query.to.toISOString() } : {}),
    },
    idempotencyKey: `audit-export:${randomUUID()}`,
  })

  const encoder = new TextEncoder()
  const serialize = query.format === 'csv' ? auditCsvLine : auditJsonlLine
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (query.format === 'csv') {
          controller.enqueue(encoder.encode(auditCsvHeader()))
        }
        for await (const row of iterateAuditExportRows(realmId, query)) {
          controller.enqueue(encoder.encode(serialize(row)))
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })

  const filename = auditExportFilename(realm.slug, query.format, new Date())
  return new Response(stream, {
    headers: {
      'Content-Type':
        query.format === 'csv'
          ? 'text/csv; charset=utf-8'
          : 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
