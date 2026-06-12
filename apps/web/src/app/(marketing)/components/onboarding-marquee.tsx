"use client"

import styles from "./onboarding-marquee.module.css"
import type { MarqueeIconModule } from "../marketing-agent-icons"
import { MARQUEE_ROWS } from "../marketing-agent-icons"

const ICON_SIZE_DEFAULT = 60
const ICON_SIZE_WIDE = 80
const WIDE_REPEATS = 8

function MarqueeRow({
  icons,
  reverse,
  wide,
}: {
  icons: readonly MarqueeIconModule[]
  reverse?: boolean
  wide?: boolean
}) {
  const repeats = wide ? WIDE_REPEATS : 3
  const loop = Array.from({ length: repeats }, () => icons).flat()
  const iconSize = wide ? ICON_SIZE_WIDE : ICON_SIZE_DEFAULT

  return (
    <div className={wide ? styles.marqueeRowWide : styles.marqueeRow}>
      <div
        className={`${wide ? styles.marqueeTrackWide : styles.marqueeTrack} ${
          reverse ? (wide ? styles.marqueeReverseWide : styles.marqueeReverse) : ""
        }`}
      >
        {loop.map((Icon, i) => (
          <div key={i} className={styles.bgIconCell}>
            <Icon.Avatar size={iconSize} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function OnboardingMarquee({ fullBleed = false }: { fullBleed?: boolean }) {
  const rows = MARQUEE_ROWS

  return (
    <div className={fullBleed ? styles.iconTheaterFullBleed : styles.iconTheater}>
      <div className={styles.marqueeWrap}>
        {rows.map((icons, index) => (
          <MarqueeRow key={index} icons={icons} reverse={index === 1} wide={fullBleed} />
        ))}
      </div>
      {fullBleed ? <div className={styles.theaterGlow} aria-hidden /> : null}
    </div>
  )
}