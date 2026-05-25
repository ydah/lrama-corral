const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeTypeTag(type) {
  const trimmed = type.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed : `<${trimmed}>`;
}

export function formatTokenDeclaration(name, type = '', tokenId = '') {
  const parts = ['%token'];
  const typeTag = normalizeTypeTag(type);
  if (typeTag) parts.push(typeTag);
  parts.push(name);
  if (tokenId) parts.push(tokenId);
  return parts.join(' ');
}

export function formatTypeDeclaration(name, type) {
  return `%type ${normalizeTypeTag(type)} ${name}`;
}

export function replaceSymbolInText(text, oldName, newName) {
  if (!oldName || oldName === newName) return text;

  const escaped = escapeRegExp(oldName);
  if (!IDENTIFIER_RE.test(oldName)) {
    return text.replace(new RegExp(escaped, 'g'), newName);
  }

  const pattern = new RegExp(`(^|[^A-Za-z0-9_])(${escaped})(?=$|[^A-Za-z0-9_])`, 'g');
  return text.replace(pattern, (_match, prefix) => `${prefix}${newName}`);
}

export function removeSymbolFromDeclarationLine(line, name) {
  const escaped = escapeRegExp(name);
  const pattern = IDENTIFIER_RE.test(name)
    ? new RegExp(`(^|\\s)${escaped}(?:\\s+\\d+)?(?=\\s|$)`, 'g')
    : new RegExp(`(^|\\s)${escaped}(?:\\s+\\d+)?(?=\\s|$)`, 'g');

  return line
    .replace(pattern, (match, prefix) => (prefix ? ' ' : ''))
    .replace(/\s+/g, ' ')
    .trimEnd();
}

export function findRulesSectionStart(lines) {
  return lines.findIndex(line => line.trim() === '%%');
}

export function findRulesSectionEnd(lines) {
  const start = findRulesSectionStart(lines);
  if (start === -1) return -1;

  const next = lines.findIndex((line, index) => index > start && line.trim() === '%%');
  return next === -1 ? lines.length : next;
}

export function insertBeforeRulesSection(lines, text) {
  const insertIndex = findRulesSectionStart(lines);
  lines.splice(insertIndex === -1 ? 0 : insertIndex, 0, text);
}

export function isSimpleTokenLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('%token')) return false;

  return trimmed
    .split(/\s+/)
    .slice(1)
    .every(part => IDENTIFIER_RE.test(part));
}

export function upsertTypeDeclaration(lines, name, type, oldName = null) {
  const typePattern = normalizeTypeTag(type);
  if (!typePattern) return;

  if (oldName) {
    removeTypeDeclaration(lines, oldName);
  }

  let typeLineIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith('%type') && lines[i].includes(typePattern)) {
      typeLineIndex = i;
      break;
    }
  }

  if (typeLineIndex !== -1) {
    if (!containsDeclarationSymbol(lines[typeLineIndex], name)) {
      lines[typeLineIndex] += ` ${name}`;
    }
    return;
  }

  insertBeforeRulesSection(lines, formatTypeDeclaration(name, typePattern));
}

export function removeTypeDeclaration(lines, name) {
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].trim().startsWith('%type') || !containsDeclarationSymbol(lines[i], name)) {
      continue;
    }

    lines[i] = removeSymbolFromDeclarationLine(lines[i], name);
    if (lines[i].trim() === '%type' || /^%type\s+<[^>]+>\s*$/.test(lines[i].trim())) {
      lines.splice(i, 1);
    }
    return;
  }
}

export function upsertTokenDeclaration(lines, name, type = '', tokenId = '', oldName = null) {
  const shouldUseStandaloneLine = Boolean(type || tokenId);
  const declaration = formatTokenDeclaration(name, type, tokenId);

  if (oldName) {
    const tokenLineIndex = lines.findIndex(
      line => line.trim().startsWith('%token') && containsDeclarationSymbol(line, oldName)
    );

    if (tokenLineIndex !== -1) {
      if (shouldUseStandaloneLine || !isSimpleTokenLine(lines[tokenLineIndex])) {
        lines[tokenLineIndex] = removeSymbolFromDeclarationLine(lines[tokenLineIndex], oldName);
        if (lines[tokenLineIndex].trim() === '%token') {
          lines.splice(tokenLineIndex, 1);
        }
        insertBeforeRulesSection(lines, declaration);
      } else {
        lines[tokenLineIndex] = replaceSymbolInText(lines[tokenLineIndex], oldName, name);
      }
      return;
    }
  }

  if (!shouldUseStandaloneLine) {
    const lastSimpleTokenLine = lines.reduce(
      (lastIndex, line, index) => (isSimpleTokenLine(line) ? index : lastIndex),
      -1
    );

    if (lastSimpleTokenLine !== -1) {
      if (!containsDeclarationSymbol(lines[lastSimpleTokenLine], name)) {
        lines[lastSimpleTokenLine] += ` ${name}`;
      }
      return;
    }
  }

  insertBeforeRulesSection(lines, declaration);
}

export function ensureNonterminalRuleStub(lines, name) {
  const rulesStart = findRulesSectionStart(lines);
  if (rulesStart === -1) {
    lines.push('', '%%', '', `${name}: /* empty */`, '    ;');
    return;
  }

  const rulesEnd = findRulesSectionEnd(lines);
  const rulePattern = new RegExp(`^\\s*${escapeRegExp(name)}\\s*:`);
  const hasRule = lines
    .slice(rulesStart + 1, rulesEnd)
    .some(line => rulePattern.test(line));

  if (hasRule) return;

  const insertIndex = rulesEnd === lines.length ? lines.length : rulesEnd;
  const prefix = insertIndex > 0 && lines[insertIndex - 1].trim() === '' ? [] : [''];
  lines.splice(insertIndex, 0, ...prefix, `${name}: /* empty */`, '    ;', '');
}

export function upsertNonterminalDeclaration(lines, name, type = '', oldName = null) {
  if (oldName && oldName !== name) {
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].trim().startsWith('%type')) {
        lines[i] = replaceSymbolInText(lines[i], oldName, name);
      }
    }
  }

  if (type) {
    upsertTypeDeclaration(lines, name, type, oldName);
    ensureNonterminalRuleStub(lines, name);
    return;
  }

  if (oldName && !type) {
    removeTypeDeclaration(lines, oldName);
  }

  ensureNonterminalRuleStub(lines, name);
}

export function findRuleEndLine(lines, startIndex) {
  const state = {
    blockComment: false,
    lineComment: false,
    singleQuote: false,
    doubleQuote: false,
    actionDepth: 0,
    escaped: false,
  };

  for (let lineIndex = startIndex; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    state.lineComment = false;

    for (let column = 0; column < line.length; column += 1) {
      const char = line[column];
      const next = line[column + 1];

      if (state.lineComment) break;

      if (state.blockComment) {
        if (char === '*' && next === '/') {
          state.blockComment = false;
          column += 1;
        }
        continue;
      }

      if (state.singleQuote || state.doubleQuote) {
        if (state.escaped) {
          state.escaped = false;
          continue;
        }

        if (char === '\\') {
          state.escaped = true;
          continue;
        }

        if (state.singleQuote && char === "'") {
          state.singleQuote = false;
        } else if (state.doubleQuote && char === '"') {
          state.doubleQuote = false;
        }
        continue;
      }

      if (char === '/' && next === '*') {
        state.blockComment = true;
        column += 1;
        continue;
      }

      if (char === '/' && next === '/') {
        state.lineComment = true;
        break;
      }

      if (char === "'") {
        state.singleQuote = true;
        continue;
      }

      if (char === '"') {
        state.doubleQuote = true;
        continue;
      }

      if (char === '{') {
        state.actionDepth += 1;
        continue;
      }

      if (char === '}' && state.actionDepth > 0) {
        state.actionDepth -= 1;
        continue;
      }

      if (char === ';' && state.actionDepth === 0) {
        return lineIndex;
      }
    }
  }

  return startIndex;
}

export function containsDeclarationSymbol(line, name) {
  if (!name) return false;
  const escaped = escapeRegExp(name);
  const pattern = IDENTIFIER_RE.test(name)
    ? new RegExp(`(^|\\s|<[^>]*>\\s*)${escaped}(?=\\s|$)`)
    : new RegExp(`(^|\\s)${escaped}(?=\\s|$)`);
  return pattern.test(line);
}
