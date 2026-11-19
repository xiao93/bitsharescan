import { useParams } from "react-router-dom"
import { AccountLink, Crumbs, ErrorBox, KeyValue, LoadingBlock, Panel } from "../components/widgets.tsx"
import { TimeAgo } from "../components/Now.tsx"
import { fetchTicket, lockInfo } from "../lib/defi.ts"
import { peekAsset } from "../lib/directory.ts"
import { formatRaw, formatTime } from "../lib/format.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"

export default function TicketDetail() {
  const { id = "" } = useParams()
  const ticketId = decodeURIComponent(id)
  useTitle(ticketId)
  const query = useQuery(async () => {
    const ticket = await fetchTicket(ticketId)
    if (!ticket) throw new Error(`Ticket ${ticketId} was not found.`)
    return ticket
  }, [ticketId])
  const ticket = query.data
  const current = lockInfo(ticket?.current_type)
  const target = lockInfo(ticket?.target_type)
  const asset = peekAsset(ticket?.amount?.asset_id)

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Locking", to: "/locking" }, { label: ticketId }]} />
      <h1 className="mb-4 font-mono text-2xl font-semibold">{ticketId}</h1>
      {query.loading ? <LoadingBlock /> : null}
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      {ticket ? (
        <Panel title="Ticket">
          <KeyValue rows={[
            { label: "Account", value: <AccountLink id={ticket.account} /> },
            { label: "Amount", value: `${formatRaw(ticket.amount?.amount, asset?.precision ?? 5)} ${asset?.symbol ?? "BTS"}` },
            { label: "Current lock", value: `${current.label} · ${current.power} voting power` },
            { label: "Target lock", value: target.label },
            { label: "Voting power", value: `${formatRaw(ticket.value, 5)} BTS` },
            { label: "Status", value: ticket.status },
            { label: "Next auto update", value: <>{formatTime(ticket.next_auto_update_time)} · <TimeAgo time={ticket.next_auto_update_time} /></> },
            { label: "Next downgrade", value: formatTime(ticket.next_type_downgrade_time) },
          ]} />
        </Panel>
      ) : null}
    </div>
  )
}
