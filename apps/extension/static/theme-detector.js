const mq = matchMedia("(prefers-color-scheme: dark)");

function sendTheme(isDark) {
  chrome.runtime.sendMessage({ type: "RELAY_THEME_CHANGED", isDark });
}

sendTheme(mq.matches);
mq.addEventListener("change", function (e) {
  sendTheme(e.matches);
});
