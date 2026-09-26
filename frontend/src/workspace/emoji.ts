/* The emoji offered for reactions and in the composer, by group, each with
   the words people search for it by. */

export type EmojiGroup = { name: string; emoji: Array<[string, string]> }

export const QUICK_REACTIONS = ['👍', '✅', '👀', '🙏', '🎉', '❤️']

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    name: 'Reactions',
    emoji: [
      ['👍', 'thumbs up yes agree like'], ['👎', 'thumbs down no disagree'], ['✅', 'check done yes complete'],
      ['❌', 'cross no wrong'], ['👀', 'eyes looking seen'], ['🙏', 'thanks please pray'], ['🎉', 'party celebrate tada'],
      ['❤️', 'heart love'], ['🔥', 'fire hot great'], ['💯', 'hundred perfect'], ['👏', 'clap applause'], ['🙌', 'hands raised hooray'],
      ['👌', 'ok okay'], ['🤝', 'handshake deal agree'], ['💪', 'strong muscle'], ['⭐', 'star favourite'],
      ['⚠️', 'warning caution'], ['❗', 'exclamation important'], ['❓', 'question'], ['🚀', 'rocket ship launch'],
    ],
  },
  {
    name: 'Smileys',
    emoji: [
      ['😀', 'grin happy smile'], ['😃', 'smile happy'], ['😄', 'laugh smile'], ['😁', 'beam grin'], ['😆', 'laughing'],
      ['😅', 'sweat smile relief'], ['😂', 'joy tears laugh'], ['🙂', 'slight smile'], ['😉', 'wink'], ['😊', 'blush smile'],
      ['😍', 'heart eyes love'], ['🤩', 'star struck wow'], ['😎', 'cool sunglasses'], ['🤔', 'thinking hmm'], ['🤨', 'raised eyebrow doubt'],
      ['😐', 'neutral'], ['😬', 'grimace awkward'], ['🙄', 'eye roll'], ['😴', 'sleep tired'], ['😮', 'surprised wow'],
      ['😢', 'cry sad'], ['😭', 'sob sad'], ['😤', 'triumph huff'], ['😡', 'angry mad'], ['🤯', 'mind blown'],
      ['🥳', 'party celebrate'], ['🤗', 'hug'], ['🤫', 'shush quiet'], ['😇', 'angel innocent'], ['🫡', 'salute'],
    ],
  },
  {
    name: 'People',
    emoji: [
      ['👋', 'wave hello bye'], ['✋', 'raised hand stop'], ['🤞', 'fingers crossed luck'], ['✌️', 'peace victory'], ['🤙', 'call me'],
      ['👉', 'point right'], ['👈', 'point left'], ['👆', 'point up'], ['👇', 'point down'], ['☝️', 'index up'],
      ['✍️', 'writing sign'], ['🧑‍⚖️', 'judge law court'], ['🧑‍💼', 'office worker'], ['🕵️', 'detective investigate'], ['🙋', 'raise hand question'],
      ['🤷', 'shrug unsure'], ['🤦', 'facepalm'], ['👥', 'people team'], ['🧠', 'brain think'], ['👁️', 'eye'],
    ],
  },
  {
    name: 'Work',
    emoji: [
      ['📄', 'document page file'], ['📑', 'tabs documents'], ['📝', 'memo note write'], ['📋', 'clipboard'], ['📌', 'pin'],
      ['📎', 'paperclip attach'], ['🔗', 'link'], ['📅', 'calendar date'], ['⏰', 'alarm deadline time'], ['⏳', 'hourglass waiting'],
      ['⚖️', 'scales law justice'], ['🏛️', 'government court building'], ['🔒', 'lock private secure'], ['🔑', 'key access'], ['🔍', 'search magnify'],
      ['💡', 'idea bulb'], ['📈', 'chart up growth'], ['📉', 'chart down'], ['💰', 'money'], ['🏠', 'house home lease'],
      ['✉️', 'envelope mail letter'], ['📞', 'phone call'], ['💬', 'speech chat comment'], ['🗂️', 'folders'], ['🖊️', 'pen sign'],
    ],
  },
  {
    name: 'Symbols',
    emoji: [
      ['✔️', 'check mark'], ['➕', 'plus add'], ['➖', 'minus'], ['🔴', 'red circle'], ['🟠', 'orange circle'],
      ['🟡', 'yellow circle'], ['🟢', 'green circle'], ['🔵', 'blue circle'], ['⬆️', 'up arrow'], ['⬇️', 'down arrow'],
      ['➡️', 'right arrow'], ['🔁', 'repeat again'], ['🆕', 'new'], ['🆗', 'ok'], ['🚩', 'flag red'],
      ['🏁', 'finish chequered'], ['✨', 'sparkles new'], ['💥', 'boom'], ['🎯', 'target goal'], ['🏆', 'trophy win'],
    ],
  },
]

export function searchEmoji(query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  return EMOJI_GROUPS.flatMap((group) => group.emoji).filter(([, words]) => words.includes(needle)).map(([emoji]) => emoji)
}
