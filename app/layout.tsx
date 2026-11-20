import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Reso VoxGuard — AI Voice Clone Detector",
  description: "Monitor a simulated call or upload a voice recording with Reso VoxGuard's experimental AI voice clone risk indicator."
}

export const viewport: Viewport = {
  themeColor: "#050506",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
