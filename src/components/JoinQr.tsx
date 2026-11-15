import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

/** A QR code for the join link, so students on phones can scan instead of typing. */
export function JoinQr({ url, size = 180 }: { url: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!ref.current) return
    QRCode.toCanvas(ref.current, url, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0e14', light: '#ffffff' },
    }).catch(() => {
      /* nothing to draw */
    })
  }, [url, size])
  return (
    <div className="inline-block rounded-2xl bg-white p-3" style={{ lineHeight: 0 }}>
      <canvas ref={ref} width={size} height={size} role="img" aria-label={`QR code for ${url}`} />
    </div>
  )
}
