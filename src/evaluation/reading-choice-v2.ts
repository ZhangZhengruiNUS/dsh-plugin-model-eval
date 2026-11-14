import {extractReadingAnswer} from './reading-answer.ts';

type Choice = 'A' | 'B' | 'C' | 'D';
type ReadingChoice = {
  answer?: Choice;
  reason: 'parsed' | 'no-final-choice' | 'ambiguous-choice' | 'invalid-response-type';
  formatConforming: boolean;
};

const prefix = /^(?:the correct answer is\s+|(?:final answer|answer)\s*:\s*|答案(?:\s*[:：]|是)\s*)/i;

function parseChoice(text: string): Choice | undefined {
  const match = /^(?:([A-D])|\(\s*([A-D])\s*\)|（\s*([A-D])\s*）)\s*[.。!！]?$/i.exec(text);
  return (match?.[1] ?? match?.[2] ?? match?.[3])?.toUpperCase() as Choice | undefined;
}

export function extractReadingChoiceV2(text: string): ReadingChoice {
  if (typeof text !== 'string') return {reason:'invalid-response-type', formatConforming:false};
  const formatConforming = extractReadingAnswer(text).answer !== undefined;
  let fence: string | undefined;
  let thinkDepth = 0;
  let final = '';
  const explicitChoices = new Set<Choice>();
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    const boundary = /^(`{3,}|~{3,})(.*)$/.exec(trimmed);
    if (fence) {
      const marker = boundary?.[1];
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && !boundary?.[2]?.trim()) fence = undefined;
      continue;
    }
    if (!thinkDepth && trimmed.startsWith('>')) continue;
    if (!thinkDepth && boundary && !(boundary[1]![0] === '`' && boundary[2]!.includes('`'))) {
      fence = boundary[1];
      continue;
    }
    let visible = '';
    let offset = 0;
    for (const tag of raw.matchAll(/<think\b[^>]*>|<\/think\s*>/gi)) {
      if (!thinkDepth) visible += raw.slice(offset, tag.index) + ' ';
      if (tag[0].startsWith('</')) thinkDepth = Math.max(0, thinkDepth - 1);
      else thinkDepth++;
      offset = tag.index + tag[0].length;
    }
    if (!thinkDepth) visible += raw.slice(offset);
    let line = visible.trim();
    if (!line || line.startsWith('>')) continue;
    if (line.startsWith('**') && line.endsWith('**')) line = line.slice(2, -2).trim();
    final = line;
    if (prefix.test(line)) {
      const answer = parseChoice(line.replace(prefix, ''));
      if (answer) explicitChoices.add(answer);
    }
  }
  const answer = parseChoice(final.replace(prefix, ''));
  if (fence || thinkDepth || !answer) return {reason:'no-final-choice', formatConforming};
  explicitChoices.add(answer);
  if (explicitChoices.size > 1) return {reason:'ambiguous-choice', formatConforming};
  return {answer, reason:'parsed', formatConforming};
}
