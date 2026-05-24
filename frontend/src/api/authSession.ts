let currentToken: string | null = null;
let sessionEpoch = 1;

export function setCurrentAuthToken(token: string | null) {
  currentToken = token;
}

export function replaceCurrentAuthToken(token: string | null) {
  currentToken = token;
  sessionEpoch += 1;
  return sessionEpoch;
}

export function getCurrentAuthToken() {
  return currentToken;
}

export function bumpAuthSessionEpoch() {
  sessionEpoch += 1;
  return sessionEpoch;
}

export function getAuthSessionEpoch() {
  return sessionEpoch;
}
