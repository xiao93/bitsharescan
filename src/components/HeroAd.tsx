import { heroAd, type AdCreative } from "../ads.config.ts"
import { useI18n } from "../lib/i18n.tsx"

const frame = "h-[81px] w-[321px] max-w-full shrink-0 overflow-hidden rounded-md"

export function HeroAd({ creative = heroAd }: { creative?: AdCreative }) {
  const { t } = useI18n()
  const image = creative.image?.trim() ?? ""
  const html = creative.html?.trim() ?? ""
  const href = creative.href?.trim() ?? ""
  const alt = creative.alt?.trim() || t("Advertisement")

  if (!image && !html) {
    return (
      <div className={`${frame} flex items-center justify-center border border-dashed border-[#c5d0dc] bg-card/50 px-3 text-center text-xs text-muted dim:border-[#46556c] dim:bg-card/30 black:border-[#2f3336] black:bg-black`}>
        {t("Advertise here")}
      </div>
    )
  }

  const body = html ? (
    <div className={`${frame} bg-card [&_img]:h-full [&_img]:w-full [&_img]:object-cover`} dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <img src={image} alt={alt} className={`${frame} bg-card object-cover`} />
  )

  if (!href) return body
  return (
    <a href={href} target="_blank" rel="noreferrer sponsored" className="block w-[321px] max-w-full shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-link">
      {body}
    </a>
  )
}

/** True when no banner is configured, so the placeholder can be hidden on small screens. */
export function heroAdEmpty(creative: AdCreative = heroAd) {
  return !creative.image?.trim() && !creative.html?.trim()
}
