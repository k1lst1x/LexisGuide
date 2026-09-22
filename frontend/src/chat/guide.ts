/* The built-in guide the chat popup answers from when the live agent is unavailable. */
// Mirrors the agent's explain_term and check_clause tools (packages/assistant_agent).
const GLOSSARY: Record<string, string> = {
  appeal: 'asking a higher authority to review and change a decision.',
  arbitration: 'settling a dispute with a private decision-maker instead of a court. It is usually binding and hard to appeal.',
  breach: 'failing to do what a contract requires.',
  'due process': 'your right to fair notice and a fair chance to respond before a decision that affects you is final.',
  indemnify: 'to promise to pay for the other party’s losses or legal costs.',
  jurisdiction: 'which place’s laws apply, and which courts can hear a dispute.',
  liability: 'legal responsibility, often to pay for harm or loss.',
  lien: 'a legal claim on property until a debt is paid.',
  'notice period': 'how far in advance one side must tell the other before acting, for example before ending a lease.',
  'statute of limitations': 'the deadline for starting a legal claim.',
  termination: 'ending an agreement.',
  waiver: 'giving up a right, sometimes without realising it.',
  warranty: 'a promise that something is true or will work as described.',
}

const RISKS: Array<[RegExp, string]> = [
  [/either party may terminate(?![^.]*\b\d+\s*days)/i, '**No notice period.** It can be ended without saying how much warning you get. Ask for a specific number of days in writing.'],
  [/may be adjusted|subject to change/i, '**The amount can change** without a stated method or cap. Ask how it is calculated and whether there is a limit.'],
  [/subject to deductions/i, '**Deductions aren’t defined.** Ask what qualifies, how it is proven, and when the rest is returned.'],
  [/within (?:the |a )?(?:standard|reasonable|prescribed) (?:filing )?(?:period|timeframe)/i, '**The deadline is vague.** Ask for the exact date in writing so you don’t miss it.'],
  [/(?:sole|absolute) discretion|at any time/i, '**One side has open-ended power.** Ask for clear conditions and notice.'],
  [/indemnif|hold harmless/i, '**You may have to cover their costs.** Check what losses you would be paying for and whether there is a cap.'],
  [/auto(?:matic(?:ally)?)?[- ]?renew/i, '**It renews automatically.** Check how and when you can cancel.'],
]

export function defaultGuide(question: string): string {
  const q = question.toLowerCase()
  const quoted = question.match(/[“"]([^”"]{12,})[”"]/)?.[1]
  if (quoted || /risky|unfair|is this ok/.test(q)) {
    const text = quoted ?? question
    const hits = RISKS.filter(([pattern]) => pattern.test(text)).map(([, why]) => `- ${why}`)
    if (hits.length) return `Here’s what stands out:\n${hits.join('\n')}\n\nThis is a quick pattern check, not legal advice. Add the full document in the workspace for a complete review.`
  }
  const term = Object.keys(GLOSSARY).find((key) => q.includes(key) || q.includes(key.replace(/y$/, 'ies')))
  if (term && /mean|what is|what's|define|explain/.test(q)) return `**${term[0].toUpperCase()}${term.slice(1)}** means ${GLOSSARY[term]}`
  if (/upload|add|pdf|word|file|paste/.test(q)) return 'Open the workspace and choose **Add document**. You can upload a PDF, Word, HTML, RTF or text file, or paste the text. LexisGuide highlights unclear or risky terms and opens the document in Review.'
  if (/score|rating|80/.test(q)) return 'Each document gets a 0–100 clarity and fairness score, and **80 is the pass line**. It reflects how many findings are high impact or need review. It is guidance, not a legal judgment.'
  if (/private|privacy|secure|safe|data/.test(q)) return 'Your documents stay tied to your signed-in account, the service only reads your own records, and scripts inside uploaded files never run. Only the readable text is used.'
  if (/free|cost|price|account|sign/.test(q)) return 'You can try the workspace with sample documents without an account. Sign in to save reviews, share them with others, and chat with the live AI agent.'
  if (/advice|lawyer|attorney/.test(q)) return 'LexisGuide gives general information, not legal advice. For decisions like an eviction, a benefits appeal, or a court date, talk to a qualified lawyer or a local legal aid organisation.'
  if (/deadline|appeal/.test(q)) return 'LexisGuide pulls deadlines and appeal windows out of your document and flags documents that do not state a clear date, so you can ask for one in writing before it is too late.'
  return 'I can explain how LexisGuide works, what a legal term means, or what to look for in a notice or agreement. Sign in to chat with the live AI agent about your own documents.'
}
