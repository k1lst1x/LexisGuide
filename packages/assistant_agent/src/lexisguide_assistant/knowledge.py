"""What the assistant team knows without calling out: every part of the
LexisGuide site, how to fix common problems, and a primer on US law.

Everything here is general and deliberately careful. Law varies by state and
changes; the law agent says so and points to how to verify.
"""

from __future__ import annotations

SITE_GUIDE: dict[str, str] = {
    "overview": (
        "LexisGuide helps people understand legal and government documents. Add a document, "
        "and LexisGuide reviews it, highlights unclear or risky wording, explains each "
        "finding in plain language, and suggests a next step. The workspace sidebar has Home, "
        "AI Assistant, Documents, Review, Messages, Activity, and Settings."
    ),
    "home": (
        "Home shows your documents' scores, upcoming deadlines found in them, documents that "
        "do not state a clear deadline, and the document to work on next."
    ),
    "add_document": (
        "Choose Add document in the sidebar or on Home. Upload a PDF, Word (.docx), HTML, RTF "
        "or text file, drag one onto the Documents page, or paste the text. Scanned PDFs with "
        "no selectable text need the text pasted in. The document then opens in Review."
    ),
    "documents": (
        "Documents lists everything you added, with its score and open findings. Select "
        "documents to delete them, or open one in Review."
    ),
    "review": (
        "Review has three columns: the findings queue (most serious first), the document with "
        "highlighted passages, and the finding's explanation, evidence, the rule it was checked "
        "against, and a next step. The reader switches between Read, Edit and History. AI "
        "actions re-check the document, suggest negotiation points, or draft clearer wording. "
        "Set your jurisdiction at the top so the review uses the right rules."
    ),
    "resolve": (
        "When you have dealt with a finding, choose Mark resolved; Review moves to the next "
        "open one and progress updates on Home. Reopen undoes it."
    ),
    "history": (
        "History (in Review, and in the document panel in Messages) lists every version of a "
        "document. Each change is fingerprinted and written to the Base blockchain; the text "
        "itself is stored privately. Open a version to see it verified against its block, "
        "compare it with the current text, and restore it. Restoring is recorded as a new "
        "change, so nothing is lost."
    ),
    "blockchain": (
        "Every change to a document you add (added, reviewed, edited, rewrite applied, "
        "renamed) is recorded on the Base blockchain as a SHA-256 fingerprint in its own "
        "block. Only the fingerprint is public, never the text or the file name. Activity "
        "shows the on-chain history with links to the block explorer. Sample documents are "
        "not recorded."
    ),
    "messages": (
        "Messages is a Slack-style space for your team. Create or join a workspace with an "
        "invite code, create channels, and chat. Type @ to mention someone, # for a channel, "
        "and / for a document. React with any emoji, save messages, reply, and search. "
        "Clicking a shared document opens it beside the chat, where you can read its text, "
        "findings and history, edit it, and open it in Review."
    ),
    "workspaces": (
        "A workspace is a shared space with its own channels and members. Use the + beside "
        "Workspaces to create one, join with an invite code, or create an invite code. The "
        "owner can make members admins; admins can remove people and delete channels. Only "
        "admins can delete the workspace."
    ),
    "channels": (
        "Channels organise conversations. Browse channels to join one, open a channel's info "
        "for its description, members and linked document, and leave or delete it from its "
        "settings (deleting needs an admin)."
    ),
    "tasks": (
        "Tasks live in Messages, Tasks. Create one from a finding (Create task), from the "
        "assistant, or by typing it in. Tick a task when it is done."
    ),
    "assistant": (
        "The AI Assistant (its own page, or the button at the bottom right) answers questions "
        "in plain language, explains legal terms, reviews attached files, drafts clearer "
        "wording, summarises and prioritises your messages, creates tasks, and applies fixes "
        "when you tell it to. Attach files with the paperclip or by dropping them in."
    ),
    "search": (
        "Press Ctrl+K (Cmd+K on a Mac) to search documents and flagged language, or switch to "
        "AI Search to ask a question across all your documents."
    ),
    "scores": (
        "Each document gets a 0 to 100 clarity and fairness score; 80 is the pass line. It "
        "reflects how many findings are high impact or need review. It is guidance, not a "
        "legal judgment."
    ),
    "settings": (
        "Settings shows your account and sign-in method, review preferences (default rule "
        "pack, suggested rewrites), and notification choices."
    ),
    "account": (
        "Sign in with email and password or with Google. Your documents, conversations and "
        "where you left off are saved to your account, so another device opens the workspace "
        "as you left it."
    ),
    "privacy": (
        "Every request is checked against your signed-in account and reads only your records. "
        "The browser never holds cloud credentials. Scripts inside uploaded files never run; "
        "only readable text is extracted. On the blockchain only fingerprints are published."
    ),
    "admin": (
        "Admins sign in at /admin to manage accounts (enable, disable, sign out everywhere, "
        "grant admin, delete), shared workspaces, and to read the audit log and integration "
        "status."
    ),
}

SUPPORT: dict[str, str] = {
    "sign_in": (
        "Check the email address and password, or use Forgot password. If Google sign-in "
        "fails with a redirect error, the site's Google setup is incomplete: tell the "
        "LexisGuide team. Clearing the site's cookies and signing in again often helps."
    ),
    "not_saved": (
        "'Not saved yet, retrying' means your latest changes have not reached your account. "
        "Keep the tab open while it retries; check your connection; sign in again if your "
        "session expired. Your work stays in the browser until it is saved."
    ),
    "upload_failed": (
        "Use PDF, Word (.docx), HTML, RTF or text. Scanned PDFs have no text to read: paste "
        "the text instead. Very large files may need to be split. Password-protected files "
        "cannot be read."
    ),
    "review_slow_or_failed": (
        "An AI review can take up to a minute. If it fails, try Re-check this document from AI "
        "actions. 'Limit reached' means too many requests in a short time: wait a minute."
    ),
    "blockchain_pending": (
        "A pending change is waiting for its block, usually a few seconds. It confirms on the "
        "next check. 'Not recorded' after several tries means the network was unavailable; "
        "the next change will still be recorded. Sample documents are never recorded."
    ),
    "messages_not_updating": (
        "Messages refresh every few seconds. If they stop, check your connection and reload "
        "the page. You only see channels you have joined: Browse channels to join one."
    ),
    "cannot_delete": (
        "Deleting a channel or a workspace needs admin rights. Ask the workspace owner or an "
        "admin, or leave it instead."
    ),
    "invite_code": (
        "Invite codes are single-use and expire. Ask for a new one, and make sure you are "
        "signed in before joining."
    ),
    "page_error": (
        "If a page shows an error after an update, reload it: a newer version of the site is "
        "available. If it persists, sign out and back in."
    ),
    "contact": (
        "For anything the assistant cannot solve, email support@lexisguide.app with what you "
        "were doing and any message shown. Never send passwords."
    ),
}

US_LAW: dict[str, str] = {
    "legal_system": (
        "The US has federal law (the Constitution, statutes in the US Code, regulations in the "
        "Code of Federal Regulations) and separate law in each state, plus local ordinances. "
        "Many everyday matters (leases, family law, most contracts, traffic, small claims) are "
        "mostly state law, so the answer often depends on the state. Court decisions interpret "
        "statutes and bind lower courts in the same jurisdiction."
    ),
    "deadlines": (
        "Legal deadlines are strict and vary: appeal windows for benefits decisions, response "
        "times for lawsuits (often 20 to 30 days after service, set by court rules), and "
        "statutes of limitations for claims (often 1 to 6 years depending on the claim and "
        "state). Always read the date on the notice itself, count from the date it states, and "
        "act early. When in doubt, file or ask for an extension before the deadline."
    ),
    "landlord_tenant": (
        "Leases are governed mainly by state and local law. Common protections: a warranty of "
        "habitability (the home must be livable), limits and return deadlines for security "
        "deposits (often 14 to 60 days, with an itemised list of deductions), required written "
        "notice before ending a tenancy or raising rent, and a court process before eviction; "
        "self-help evictions such as lockouts or cutting utilities are generally illegal. Fair "
        "housing law bars discrimination. Many cities add rent-control or just-cause rules."
    ),
    "public_benefits": (
        "Denials, reductions and terminations of benefits usually come with appeal rights. "
        "Social Security (SSI/SSDI): request reconsideration generally within 60 days of "
        "receiving the notice. SNAP: federal rules allow up to 90 days to request a fair "
        "hearing. Medicaid: the state must allow a reasonable time, up to 90 days. "
        "Unemployment appeal windows are set by each state and can be short. Asking for a "
        "hearing before the effective date can keep benefits going while you appeal. Always "
        "follow the deadline printed on your notice."
    ),
    "contracts": (
        "A contract needs an offer, acceptance and consideration. Watch for automatic renewal, "
        "binding arbitration and class-action waivers, one-sided termination or change rights, "
        "indemnification, liquidated damages and late fees. Unclear terms are often read "
        "against the party that wrote them. Some contracts must be in writing (for example "
        "real estate and long-term agreements)."
    ),
    "consumer_debt": (
        "The Fair Debt Collection Practices Act limits how third-party collectors act; you can "
        "request validation of a debt, typically within 30 days of the first notice. The Fair "
        "Credit Reporting Act lets you dispute errors with credit bureaus. Old debts may be "
        "past the statute of limitations for a lawsuit; making a payment can restart it in "
        "some states. Never ignore a court summons."
    ),
    "employment": (
        "Most employment is at-will, but firing for discriminatory or retaliatory reasons is "
        "illegal. Federal law sets minimum wage and overtime (Fair Labor Standards Act); many "
        "states set higher minimums. Discrimination charges with the EEOC generally must be "
        "filed within 180 days, or 300 days where a state agency also covers it."
    ),
    "immigration": (
        "Immigration law is federal. Notices from USCIS or the immigration courts have strict "
        "deadlines, and missing a hearing can lead to a removal order. Get help from an "
        "accredited representative or immigration attorney; avoid 'notarios', who cannot give "
        "legal advice."
    ),
    "courts": (
        "Small claims courts handle smaller money disputes without lawyers; limits vary by "
        "state. Civil cases start with a complaint and a summons; you must respond in writing "
        "by the deadline or risk a default judgment. Courts often have free self-help centers "
        "and fee waivers."
    ),
    "government_records": (
        "The Freedom of Information Act gives access to federal agency records; states have "
        "their own public-records laws. You can usually request your own case file from an "
        "agency before a hearing."
    ),
    "legal_help": (
        "Free or low-cost help: local legal aid organisations (find them at lawhelp.org or "
        "through the Legal Services Corporation at lsc.gov), law school clinics, court "
        "self-help centers, state bar lawyer-referral services, and 211 for local services. "
        "For deadlines that matter, such as eviction, benefits or a court date, contact help "
        "quickly."
    ),
}

LAW_TOPIC_HINTS: dict[str, tuple[str, ...]] = {
    "landlord_tenant": ("lease", "landlord", "tenant", "rent", "evict", "deposit", "housing"),
    "public_benefits": (
        "snap",
        "ssi",
        "ssdi",
        "medicaid",
        "benefit",
        "unemployment",
        "social security",
    ),
    "consumer_debt": ("debt", "collector", "credit", "loan"),
    "employment": ("job", "employer", "fired", "wage", "overtime", "discrimination"),
    "immigration": ("immigration", "visa", "uscis", "green card", "deport"),
    "courts": ("court", "summons", "judge", "small claims", "lawsuit", "sue"),
    "contracts": ("contract", "agreement", "clause", "terms"),
    "deadlines": ("deadline", "days", "appeal", "limitation"),
    "government_records": ("foia", "records", "public record"),
    "legal_help": ("lawyer", "attorney", "legal aid", "free help"),
}


def best_law_topics(question: str, limit: int = 2) -> list[str]:
    text = question.lower()
    scored = [
        (sum(hint in text for hint in hints), topic) for topic, hints in LAW_TOPIC_HINTS.items()
    ]
    return [topic for score, topic in sorted(scored, reverse=True) if score][:limit]
