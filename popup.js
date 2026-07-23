const MAIL_URL_RE = /^https:\/\/e\.mail\.ru\//

const toggle = document.getElementById("toggle")
const status = document.getElementById("status")

chrome.storage.sync.get({ enabled: true }, (state) => {
    toggle.checked = state.enabled
    refresh()
})

toggle.addEventListener("change", () => {
    chrome.storage.sync.set({ enabled: toggle.checked }, refresh)
})

function setStatus(text, kind) {
    status.textContent = text
    status.className = kind || ""
}

function refresh() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0]
        if (!tab || !MAIL_URL_RE.test(tab.url || "")) {
            setStatus("Откройте e.mail.ru")
            return
        }
        chrome.tabs.sendMessage(tab.id, { type: "status" }, (response) => {
            if (chrome.runtime.lastError || !response) {
                setStatus("Скрипт не запущен — перезагрузите вкладку", "bad")
            } else if (response.count > 0) {
                const found = "Найдено блоков: " + response.count
                setStatus(toggle.checked ? found + ", скрыты" : found + ", скрытие выключено", "ok")
            } else {
                setStatus("Реклама не найдена — её нет или изменилась вёрстка", "bad")
            }
        })
    })
}
