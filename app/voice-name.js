export function spokenVoiceName(label = '') {
  const name = label.trim()
    .replace(/^(?:Microsoft|Google|Apple|Samsung|Yandex)(?:\s+|$)/i, '')
    .split(/\s+[-–—]\s+|\s*[(\[]/, 1)[0]
    .replace(/(?:\s+(?:Online|Offline|Desktop|Natural|Neural|Enhanced|Premium|Compact|Russian|Русский))+$/i, '')
    .trim();
  if (/^(?:Russian|Русск(?:ий|ая|ое)|ru(?:[-_][a-z0-9]+)*|(?:Voice|Голос)(?:\s+\d+)?)$/i.test(name)) return '';
  return name;
}
