/**
 * Home-page hero banner, the slot to the right of the search bar.
 *
 * Leave `image` and `html` empty to show the "Advertise here" placeholder.
 * Set one of them to publish a banner. `image` wins when both are set.
 *
 * - image: URL of a banner, ideally 321×81. Site-relative paths work too.
 * - href: click-through URL. Omit it to show the image without a link.
 * - alt: accessible name for the image.
 * - html: trusted HTML fragment drawn inside the 321×81 frame instead of an image.
 *   Scripts in this string do not run.
 */
export type AdCreative = {
  image?: string
  href?: string
  alt?: string
  html?: string
}

export const heroAd: AdCreative = {
  image: "",
  href: "",
  alt: "",
  html: "",
}
