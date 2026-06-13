// Shown at the points where the app offers procedural/probate guidance (mainly
// AI-generated suggestions), so it's relevant rather than constant noise.
export default function LegalDisclaimer({ className = '' }) {
  return (
    <p className={`text-xs text-gray-400 dark:text-gray-500 leading-relaxed ${className}`}>
      ⚖️ SettleWell helps you organize and stay ahead of the work — it is <span className="font-medium">not a law firm and does not provide legal advice</span>.
      Probate rules vary by state and situation; confirm anything legal or tax-related with the estate&apos;s attorney or a qualified professional before acting.
    </p>
  )
}
