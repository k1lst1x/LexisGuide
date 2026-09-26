/* Mentions in messages: @someone, #channel, and a document. A message keeps
   the mentions it was sent with, so they stay links for everyone however
   the names are spelled, and "Mentions" can find the ones about you. */
import type { MessageMention } from './data'

export const MENTION_PREFIX: Record<MessageMention['type'], string> = { user: '@', channel: '#', document: '📄 ' }

export const mentionToken = (mention: MessageMention) => `${MENTION_PREFIX[mention.type]}${mention.label}`

export type MentionTrigger = { char: '@' | '#' | '/'; query: string; start: number }

/** The mention being typed just before the caret, if any. */
export function findTrigger(text: string, caret: number): MentionTrigger | null {
  const before = text.slice(0, caret)
  const match = /(^|\s)([@#/])([^\s@#/]{0,40}(?: [^\s@#/]{1,40})?)$/.exec(before)
  if (!match) return null
  return { char: match[2] as MentionTrigger['char'], query: match[3], start: before.length - match[3].length - 1 }
}

/** The mentions still present in the text as sent, one of each. */
export function mentionsInText(text: string, mentions: MessageMention[]) {
  const seen = new Set<string>()
  return mentions.filter((mention) => {
    const key = `${mention.type}:${mention.id}`
    if (seen.has(key) || !text.includes(mentionToken(mention))) return false
    seen.add(key)
    return true
  })
}

export type TextPart = string | MessageMention

/** Split a message into plain text and its mentions, longest names first. */
export function splitMentions(text: string, mentions: MessageMention[]): TextPart[] {
  const tokens = [...mentions].sort((a, b) => mentionToken(b).length - mentionToken(a).length)
  let parts: TextPart[] = [text]
  for (const mention of tokens) {
    const token = mentionToken(mention)
    parts = parts.flatMap((part) => {
      if (typeof part !== 'string' || !part.includes(token)) return [part]
      return part.split(token).flatMap((piece, index) => (index === 0 ? [piece] : [mention, piece]))
    })
  }
  return parts.filter((part) => part !== '')
}
