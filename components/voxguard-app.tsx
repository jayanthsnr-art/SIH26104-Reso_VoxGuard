"use client"

import { useEffect, useRef, useState } from "react"

const API = "http://127.0.0.1:8000"

type Prediction = {
  label: string
  assessment?: string
  reason?: string
  inference_ms?: number
  audio_quality?: { rms?: number; peak?: number; clipped_fraction?: number }
}

function Mark({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark${small ? " brand-mark-small" : ""}`} aria-hidden="true"><span /><span /><span /><span /><span /></span>
}

function DownloadDialog({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation">
    <section className="download-dialog" role="dialog" aria-modal="true" aria-labelledby="download-title">
      <button className="modal-close" aria-label="Close download dialog" onClick={onClose}>×</button>
      <div className="modal-icon"><Mark /></div>
      <p className="eyebrow">GET STARTED WITH VOXGUARD</p>
      <h2 id="download-title">Bring voice analysis<br />to your machine.</h2>
      <p className="dialog-copy">Download the VOXGUARD starter project to run its experimental audio model and local analysis API on your computer.</p>
      <a className="button button-primary dialog-download" href="/voxguard-source.zip" download="VOXGUARD-main.zip">
        <DownloadIcon /> Download project <span className="file-size">SOURCE ZIP</span>
      </a>
      <button className="text-button" onClick={onClose}>Continue to dashboard</button>
      <p className="modal-footnote">Python setup required · Predictions are experimental, not proof of authenticity.</p>
    </section>
  </div>
}

function DownloadIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2v10m0 0 4-4m-4 4L6 8M3 14v3h14v-3" /></svg> }
function UploadIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 13V3m0 0L6 7m4-4 4 4M3 13v4h14v-4" /></svg> }
function MicIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="2" width="6" height="11" rx="3"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v3m-3 0h6"/></svg> }

function AppHeader({ connected, onDownload }: { connected: boolean; onDownload: () => void }) {
  return <header className="topbar"><a className="brand" href="#top" aria-label="VOXGUARD home"><Mark /><span>VOXGUARD</span><span className="brand-version">LAB</span></a>
    <nav className="top-nav" aria-label="Main navigation"><a className="nav-active" href="#overview">Overview</a><a href="#how-it-works">How it works</a></nav>
    <div className="top-actions"><span className={`connection ${connected ? "is-connected" : ""}`}><i />{connected ? "Local API connected" : "API offline"}</span><button className="header-download" onClick={onDownload}><DownloadIcon /> Get the app</button></div>
  </header>
}

function ResultCard({ result }: { result: Prediction | null }) {
  const isSpoof = result?.label.includes("SPOOF")
  return <section className="result-card" aria-live="polite">
    <div className="section-label"><span className="step-number">02</span><span>ANALYSIS RESULT</span><span className="result-live"><i /> LIVE</span></div>
    {result ? <div className="result-content"><div className={`result-symbol ${isSpoof ? "result-alert" : ""}`}>{isSpoof ? "!" : "✓"}</div><div><p className="result-title">{result.label}</p><p className="result-subtitle">{result.reason || result.assessment || "Experimental assessment"}</p></div><div className="result-time">{result.inference_ms ? `${result.inference_ms} ms` : "—"}<span>inference</span></div></div> : <div className="empty-result"><div className="empty-orbit"><span /><span /><span /></div><p>Your analysis will appear here</p><span>Upload an audio clip to begin</span></div>}
    {result?.audio_quality && <div className="quality-row"><span>RMS <b>{result.audio_quality.rms?.toFixed(4) ?? "—"}</b></span><span>Peak <b>{result.audio_quality.peak?.toFixed(3) ?? "—"}</b></span><span>Clipping <b>{((result.audio_quality.clipped_fraction ?? 0) * 100).toFixed(2)}%</b></span></div>}
    <div className="disclaimer"><span className="info-icon">i</span> Experimental indication only. This model is not validated for real-world call accuracy.</div>
  </section>
}

function UploadCard({ onFile, busy }: { onFile: (file: File) => void; busy: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  return <section className="upload-card">
    <div className="section-label"><span className="step-number">01</span><span>ANALYZE AN AUDIO CLIP</span></div>
    <button className={`drop-zone${dragging ? " is-dragging" : ""}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) onFile(file) }}>
      <span className="upload-icon"><UploadIcon /></span><strong>{busy ? "Analyzing audio…" : "Drop an audio file here"}</strong><span>or <em>browse files</em> to upload</span><small>WAV format · minimum 4.04 seconds · up to 30 MB</small>
    </button>
    <input ref={inputRef} className="sr-only" type="file" accept="audio/wav,.wav" aria-label="Choose a WAV audio file" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.currentTarget.value = "" }} />
    <p className="privacy-note"><span className="lock-icon">⌑</span> Audio is analyzed by your local API and never uploaded to a cloud service.</p>
  </section>
}

export default function VoxGuardApp() {
  const [showDownload, setShowDownload] = useState(true)
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<Prediction | null>(null)

  useEffect(() => {
    let active = true
    fetch(`${API}/api/health`, { signal: AbortSignal.timeout(1500) }).then((response) => {
      if (active && response.ok) setConnected(true)
    }).catch(() => { if (active) setConnected(false) })
    return () => { active = false }
  }, [])

  async function analyzeFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".wav")) { setError("Please choose a WAV audio file."); return }
    setBusy(true); setError(""); setResult(null)
    try {
      const response = await fetch(`${API}/api/predict`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: file, signal: AbortSignal.timeout(60000) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || data.reason || data.label || "Analysis failed. Check the audio and try again.")
      setResult(data)
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "TimeoutError" ? "Analysis timed out. Check that the local model is running." : "Could not reach the local VOXGUARD API. Download the project and start the local backend first.")
    } finally { setBusy(false) }
  }

  return <main id="top" className="app-shell">
    {showDownload && <DownloadDialog onClose={() => setShowDownload(false)} />}
    <AppHeader connected={connected} onDownload={() => setShowDownload(true)} />
    <div className="page-wrap" id="overview">
      <section className="hero"><div className="hero-copy"><div className="hero-kicker"><span className="pulse-dot" /> VOICE AUTHENTICITY · EXPERIMENTAL</div><h1>Trust the voice.<br /><span>Verify the signal.</span></h1><p>Analyze suspicious audio with an experimental AI voice spoof detector, running locally on your machine.</p><div className="hero-tags"><span><i /> LOCAL PROCESSING</span><span><i /> WAV AUDIO</span><span><i /> AASIST MODEL</span></div></div>
        <div className="signal-visual" aria-label="Decorative audio waveform"><div className="signal-ring ring-one"/><div className="signal-ring ring-two"/><div className="signal-ring ring-three"/><div className="signal-core"><Mark /></div><div className="waveform">{[14,23,38,28,51,34,72,43,90,56,40,75,31,61,43,84,35,58,22,39,16,30,12,20,8].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><div className="signal-caption">SIGNAL ANALYSIS <span>●</span></div></div>
      </section>
      {!connected && <div className="offline-banner" role="status"><span className="offline-icon">!</span><span><b>Local analysis is not connected.</b> Start the VOXGUARD Python API on this computer to analyze audio.</span><button onClick={() => setShowDownload(true)}>Get the project <span aria-hidden="true">→</span></button></div>}
      <div className="workbench"><div className="workbench-main"><UploadCard onFile={analyzeFile} busy={busy} />{error && <p className="error-message" role="alert">{error}</p>}<div className="microphone-card"><div className="mic-orb"><MicIcon /></div><div className="mic-copy"><strong>Test a live microphone</strong><span>Capture from your computer using the local API.</span></div><button className="button button-outline" onClick={() => setError("Live microphone capture is available from the downloaded local VOXGUARD backend. Start its API to continue.")}>Start live test <span aria-hidden="true">→</span></button></div></div><div className="workbench-side"><ResultCard result={result} /><div className="model-card"><div className="model-card-head"><span className="model-glyph">V</span><span>MODEL PROFILE</span><span className="model-status">EXPERIMENTAL</span></div><h3>AASIST <span>ONNX</span></h3><p>Anti-spoofing analysis for one audio window.</p><div className="model-stats"><div><span>WINDOW</span><b>4.04 sec</b></div><div><span>SAMPLE RATE</span><b>16 kHz</b></div></div></div></div></div>
      <section className="steps-section" id="how-it-works"><div className="steps-heading"><p className="eyebrow">A SIMPLE, LOCAL WORKFLOW</p><h2>From audio to insight.</h2><span>Three steps. Your audio stays on your machine.</span></div><div className="steps-grid"><article><span>01</span><h3>Choose your audio</h3><p>Upload a WAV recording of at least 4.04 seconds.</p></article><article><span>02</span><h3>Analyze the signal</h3><p>The local API prepares one window and runs the AASIST ONNX model.</p></article><article><span>03</span><h3>Review the result</h3><p>See the model&apos;s experimental indication and audio-quality readings.</p></article></div></section>
      <footer className="footer"><a className="brand footer-brand" href="#top"><Mark small /><span>VOXGUARD</span></a><span>Research prototype · Not a verified fraud verdict</span><a href="/voxguard-source.zip" download="VOXGUARD-main.zip">Download source <span aria-hidden="true">↗</span></a></footer>
    </div>
  </main>
}
