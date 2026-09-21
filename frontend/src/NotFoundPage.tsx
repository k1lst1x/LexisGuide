import { ArrowRight } from 'lucide-react'

export function NotFoundPage() {
  return (
    <main className="not-found-page">
      <div className="not-found-orb not-found-orb-one" />
      <div className="not-found-orb not-found-orb-two" />
      <section className="not-found-content" aria-labelledby="not-found-title">
        <div className="not-found-illustration" aria-hidden="true">
          <span className="not-found-spark not-found-spark-one" />
          <span className="not-found-spark not-found-spark-two" />
          <span className="not-found-spark not-found-spark-three" />
          <span className="not-found-four">4</span>
          <span className="not-found-zero"><i /><i /></span>
          <span className="not-found-four not-found-four-right">4</span>
          <span className="not-found-person not-found-person-left"><i /><b /></span>
          <span className="not-found-person not-found-person-top"><i /><b /></span>
          <span className="not-found-person not-found-person-right"><i /><b /></span>
        </div>
        <span className="not-found-eyebrow">404 · PAGE NOT FOUND</span>
        <h1 id="not-found-title">That page took a wrong turn.</h1>
        <p>The link may be out of date, or the page may not exist in LexisGuide yet.</p>
        <a className="not-found-home" href="/"><span>Back to home</span><ArrowRight aria-hidden="true" size={16} strokeWidth={2.25} /></a>
      </section>
    </main>
  )
}
