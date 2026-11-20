import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "VOXGUARD — Voice authenticity, at a glance",
  description: "An experimental voice deepfake detection workspace for audio uploads and live microphone analysis.",
}

export const viewport: Viewport = {
  themeColor: "#091521",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
