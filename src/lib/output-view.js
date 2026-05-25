export function setStatus(statusEl, message, type = 'loading') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

export function clearAnalysisOutput(outputEl, addRuleBtn) {
  outputEl.innerHTML = '';
  addRuleBtn.style.display = 'none';
}

export function appendError(outputEl, message, location = null) {
  outputEl.appendChild(createErrorElement(outputEl.ownerDocument, message, location));
}

export function appendJsonResult(outputEl, title, data) {
  const documentRef = outputEl.ownerDocument;
  const titleEl = documentRef.createElement('h3');
  titleEl.textContent = title;
  titleEl.style.marginBottom = '10px';
  titleEl.style.color = '#2c3e50';

  const preEl = documentRef.createElement('pre');
  preEl.textContent = JSON.stringify(data, null, 2);

  outputEl.appendChild(titleEl);
  outputEl.appendChild(preEl);
}

export function createErrorElement(documentRef, message, location = null) {
  const errorDiv = documentRef.createElement('div');
  errorDiv.className = 'error';

  const locationText = formatErrorLocation(location);
  if (!locationText) {
    errorDiv.textContent = message;
    return errorDiv;
  }

  const locationSpan = documentRef.createElement('strong');
  locationSpan.textContent = locationText;
  errorDiv.appendChild(locationSpan);

  const messageSpan = documentRef.createElement('span');
  messageSpan.textContent = message;
  errorDiv.appendChild(messageSpan);
  return errorDiv;
}

export function formatErrorLocation(location = null) {
  if (!location || (location.line <= 0 && location.column <= 0)) {
    return '';
  }

  if (location.column > 0) {
    return `Line ${location.line}, Column ${location.column}: `;
  }

  return `Line ${location.line}: `;
}
