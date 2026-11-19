import { AccountLink, TypeBadge } from "../components/widgets.tsx"
import { useI18n } from "../lib/i18n.tsx"
import { proposalOpen, type ProposalRow } from "../lib/proposals.ts"

export function ProposalStatus({ row, live }: { row: ProposalRow; live?: boolean }) {
  const { t } = useI18n()
  const open = proposalOpen(row)
  if (row.fail_reason) {
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-800" title={row.fail_reason}>
        {t("Failed: {reason}", { reason: String(row.fail_reason).slice(0, 60) })}
      </span>
    )
  }
  if (open && live !== false) {
    return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">{t("Pending approval")}</span>
  }
  if (open) return <span className="text-xs text-muted">{t("Executed or removed")}</span>
  return <span className="text-xs text-muted">{t(live === false ? "Closed (executed or expired)" : "Closed")}</span>
}

export function ProposalTypes({ types }: { types: number[] }) {
  const unique = [...new Set(types)]
  const shown = unique.slice(0, 3)
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((type) => (
        <TypeBadge key={type} type={type} />
      ))}
      {unique.length > shown.length ? <span className="text-xs text-muted">+{unique.length - shown.length}</span> : null}
      {types.length > 1 ? <span className="text-xs text-muted">×{types.length}</span> : null}
    </div>
  )
}

export function AccountList({ ids }: { ids?: string[] }) {
  if (!ids?.length) return <span className="text-muted">—</span>
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {ids.map((id) => (
        <AccountLink key={id} id={id} />
      ))}
    </div>
  )
}
