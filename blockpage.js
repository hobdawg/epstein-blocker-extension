const blockedUrl = location.hash.slice(1);

if (blockedUrl) {
  try {
    document.getElementById("blockedHost").textContent = new URL(blockedUrl).hostname;
  } catch {
    // Malformed URL — leave the display empty.
  }
} else {
  // No URL available (e.g. user opened this page directly) — hide Allow button.
  document.getElementById("allowSite").style.display = "none";
}

document.getElementById("goBack").addEventListener("click", function () {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.close();
  }
});

document.getElementById("allowSite").addEventListener("click", async function () {
  if (!blockedUrl) return;

  this.disabled = true;
  this.textContent = "Allowing…";

  try {
    await chrome.runtime.sendMessage({ action: "allow", url: blockedUrl });
    window.location.href = blockedUrl;
  } catch {
    this.disabled = false;
    this.textContent = "Allow This Site";
  }
});
