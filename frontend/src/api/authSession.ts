let currentToken: string | null = null;
let sessionEpoch = 0;

export function setCurrentAuthToken(token: string | null) {
  currentToken = token;
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
