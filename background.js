// background.js
const blockPageUrl = chrome.runtime.getURL("/blockpage.html");

const blockedDomains = [
  "theterramarproject.org", "trump.com", "clintonfoundation.org", "royal.uk",
  "microsoft.com", "tesla.com", "palantir.com", "warroom.org", "bbwinc.com",
  "apollo.com", "highbridge.com", "barclays.com", "harvard.edu", "bloomberg.com",
  "newscorp.com", "virgin.com", "jpmorganchase.com", "db.com", "goldmansachs.com", "hsbc.com"
];

const blockedNameKeywords = [
  "jeffrey epstein", "ghislaine maxwell", "donald trump", "bill clinton", "prince andrew",
  "bill gates", "elon musk", "peter thiel", "steve bannon", "les wexner", "leon black",
  "glenn dubin", "jes staley", "lawrence summers", "michael bloomberg", "rupert murdoch",
  "richard branson", "jean-luc brunel", "alan dershowitz", "jpmorgan chase", "deutsche bank",
  "goldman sachs", "hsbc"
];

let ruleId = 1;
const blockRules = [];

// regexFilter + regexSubstitution lets us embed the original URL in the redirect hash
// so blockpage.html knows where to send the user if they click Allow.
// Capture group \1 = the entire matched URL.
// (?:[^/]*\.)? optionally matches subdomains without matching unrelated domains
// (e.g. "notmicrosoft.com" is rejected because after stripping "notmicrosoft."
//  the remaining string does not start with "microsoft.com").
blockedDomains.forEach(domain => {
  const escaped = domain.replace(/\./g, "\\.");
  blockRules.push({
    id: ruleId++,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { regexSubstitution: blockPageUrl + "#\\1" }
    },
    condition: {
      regexFilter: "(https?://(?:[^/]*\\.)?(" + escaped + ").*)$",
      isUrlFilterCaseSensitive: false,
      resourceTypes: ["main_frame"]
    }
  });
});

// Match URLs whose path/query contains a name with any separator between words
// (hyphen, underscore, %20, +, etc.) so "jeffrey epstein" catches
// "jeffrey-epstein", "jeffrey%20epstein", "jeffrey+epstein", etc.
blockedNameKeywords.forEach(name => {
  const words = name
    .split(" ")
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  blockRules.push({
    id: ruleId++,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { regexSubstitution: blockPageUrl + "#\\1" }
    },
    condition: {
      regexFilter: "(https?://.*" + words.join("[^a-zA-Z]+") + ".*)",
      isUrlFilterCaseSensitive: false,
      resourceTypes: ["main_frame"]
    }
  });
});

// ── Allow logic ───────────────────────────────────────────────────────────────

// Extract domain.tld from a full hostname so that allowing "www.microsoft.com"
// also covers "microsoft.com" and vice-versa.
function baseDomain(hostname) {
  const parts = hostname.split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
}

async function allowHost(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return;
  }

  const domain = baseDomain(hostname);

  // Persist so the content script can check it synchronously on the next page load.
  const data = await chrome.storage.session.get("allowedHosts");
  const allowedHosts = data.allowedHosts || [];
  if (!allowedHosts.includes(domain)) {
    allowedHosts.push(domain);
    await chrome.storage.session.set({ allowedHosts });
  }

  // Add a higher-priority allow rule so declarativeNetRequest stops redirecting.
  // Priority 2 beats the block rules at priority 1.
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const maxId = existing.reduce((m, r) => Math.max(m, r.id), 0);
  const escaped = domain.replace(/\./g, "\\.");

  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [{
      id: maxId + 1,
      priority: 2,
      action: { type: "allow" },
      condition: {
        regexFilter: "https?://(?:[^/]*\\.)?" + escaped + ".*",
        isUrlFilterCaseSensitive: false,
        resourceTypes: ["main_frame"]
      }
    }]
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "allow" && message.url) {
    allowHost(message.url)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true; // keep the message channel open for the async response
  }
});

// ── Rule registration ─────────────────────────────────────────────────────────

async function resetRules() {
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: old.map(r => r.id),
    addRules: blockRules
  });
}

// onInstalled: first run and updates.
// onStartup: clears any allow rules granted in the previous session
//            (chrome.storage.session is already empty after a browser restart).
chrome.runtime.onInstalled.addListener(resetRules);
chrome.runtime.onStartup.addListener(resetRules);
