// Intentionally idle. No browsing listeners, persistent scripts or data collection.
chrome.runtime.onInstalled.addListener(() => {
  /* The first visit belongs to the user. */
});
