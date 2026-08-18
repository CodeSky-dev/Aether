// @aether/web · /realms/[id]/members 页面：成员管理与 Realm 邀请
// 成员与邀请读取失败时保留页面骨架，并展示可操作的中文提示。
import {
  listRealmInvitations,
  listRealmMembers,
} from '@/app/actions/membership'
import InviteRealmMemberForm from '@/components/invite-realm-member-form'
import RealmInvitationList from '@/components/realm-invitation-list'
import RealmMemberList from '@/components/realm-member-list'
import NavShell from '@/components/nav-shell'
import PageHeader from '@/components/page-header'
import { listRealms } from '@/lib/realms'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '读取成员管理数据失败'
}

function renderLoadError(error: unknown) {
  const message = errorMessage(error)
  if (message.includes('not bound to a Better-Auth organization')) {
    return 'Realm 尚未绑定真实 organization，请先运行回填脚本 backfill:realm-orgs。'
  }
  return message
}

export default async function MembersPage({ params }: PageProps) {
  const { id: realmId } = await params
  const realms = await listRealms()
  const realm = realms.find((candidate) => candidate.id === realmId)
  if (!realm) notFound()

  const [memberResult, invitationResult] = await Promise.allSettled([
    listRealmMembers({ realmId }),
    listRealmInvitations({ realmId }),
  ])
  const memberData =
    memberResult.status === 'fulfilled' ? memberResult.value : null
  const invitations =
    invitationResult.status === 'fulfilled' ? invitationResult.value : null

  return (
    <NavShell currentRealmName={realm.name} currentRealmId={realm.id}>
      <div className="mx-auto max-w-4xl px-6 py-12 md:px-8">
        <PageHeader
          eyebrow={realm.slug}
          title="成员管理"
          description={`${realm.name} 的 Aether membership 与待处理邀请。`}
        />
        {(memberResult.status === 'rejected' ||
          invitationResult.status === 'rejected') && (
          <div className="mb-6 space-y-2 rounded-md bg-warning/10 p-4 text-label-12 text-neutral-8">
            {memberResult.status === 'rejected' && (
              <p>成员列表：{renderLoadError(memberResult.reason)}</p>
            )}
            {invitationResult.status === 'rejected' && (
              <p>邀请列表：{renderLoadError(invitationResult.reason)}</p>
            )}
          </div>
        )}
        {memberData && (
          <>
            <InviteRealmMemberForm
              realmId={realmId}
              currentActorRole={memberData.currentActorRole}
            />
            <div className="mt-6">
              <RealmMemberList members={memberData.members} />
            </div>
          </>
        )}
        {invitations && (
          <div className="mt-6">
            <RealmInvitationList
              realmId={realmId}
              invitations={invitations}
            />
          </div>
        )}
      </div>
    </NavShell>
  )
}
