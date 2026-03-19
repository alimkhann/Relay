import Image from "next/image"

export default function GetStartedLoading() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a]">
      <div className="absolute inset-0">
        <Image
          src="/images/hero-bg.jpg"
          alt=""
          fill
          priority
          quality={90}
          className="object-cover object-center"
          sizes="100vw"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(10,10,10,0.34) 0%, rgba(10,10,10,0.82) 70%, rgba(10,10,10,1) 100%)",
          }}
        />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="flex flex-col items-center gap-5 text-center">
          <Image
            src="/images/relay_logo_white.png"
            alt="Relay"
            width={72}
            height={72}
            priority
          />
          <div className="space-y-2">
            <p className="text-sm font-medium text-white/70">Opening Relay</p>
            <p className="text-sm text-white/40">
              Getting your workspace ready.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
