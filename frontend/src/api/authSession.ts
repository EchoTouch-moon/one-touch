let currentToken: string | null = null;
let currentUserId: number | null = null;
let sessionEpoch = 1;

export function setCurrentAuthToken(token: string | null) {
  currentToken = token;
  if (!token) currentUserId = null;
}
export function setCurrentUserId(userId: number | null) { currentUserId = userId; }
export function getCurrentUserId() { return currentUserId; }
export function replaceCurrentAuthToken(token: string | null, userId: number | null = null) {
  currentToken = token;
  currentUserId = userId;
  return bumpAuthSessionEpoch();
}
export function getCurrentAuthToken() { return currentToken; }
export function bumpAuthSessionEpoch() {
  sessionEpoch += 1;
  window.dispatchEvent(new Event('onetouch-session-changed'));
  return sessionEpoch;
}
export function getAuthSessionEpoch() { return sessionEpoch; }
export function sessionIsCurrent(epoch: number, userId: number) {
  return epoch === sessionEpoch && userId === currentUserId && currentToken !== null;
}
