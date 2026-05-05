// content_script.js
const blockedNames = [
  "jeffrey epstein", "ghislaine maxwell", "donald trump", "bill clinton", "prince andrew",
  "bill gates", "elon musk", "peter thiel", "steve bannon", "les wexner", "leon black",
  "glenn dubin", "jes staley", "lawrence summers", "michael bloomberg", "rupert murdoch",
  "richard branson", "jean-luc brunel", "alan dershowitz", "jpmorgan chase", "deutsche bank",
  "goldman sachs", "hsbc"
];

// Single pre-compiled regex — one pass over textContent instead of N separate includes() calls.
const blockedPattern = new RegExp(
  blockedNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i"
);

async function checkAndBlock() {
  if (!document.body) return false;
  if (!blockedPattern.test(document.body.textContent)) return false;

  // Check whether the user has already allowed this site for this session.
  // We compare against the base domain (domain.tld) so that allowing
  // "www.example.com" also covers "example.com" and any other subdomain.
  const data = await chrome.storage.session.get("allowedHosts");
  const allowedHosts = data.allowedHosts || [];
  const host = location.hostname;
  const isAllowed = allowedHosts.some(
    allowed => host === allowed || host.endsWith("." + allowed)
  );
  if (isAllowed) return false;

  // Append the original URL as a hash so blockpage.html can offer an Allow button
  // that navigates back. replace() keeps the blocked page off the back-button stack.
  window.location.replace(
    chrome.runtime.getURL("blockpage.html") + "#" + location.href
  );
  return true;
}

// Re-check after dynamic content loads (SPAs, lazy-loaded articles).
function setupObserver() {
  let debounceTimer;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (await checkAndBlock()) observer.disconnect();
    }, 500);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", async () => {
    if (!(await checkAndBlock())) setupObserver();
  });
} else {
  checkAndBlock().then(blocked => { if (!blocked) setupObserver(); });
}
