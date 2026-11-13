// Сайты со скрытием через content-скрипт: галочка → storage → скрипт на странице.
// Ключ mailru — enabled — исторический, чтобы не сбрасывать настройку у тех,
// у кого расширение уже стоит.
const SITES = [
    { key: "enabled", checkbox: "mailru", host: /^https:\/\/e\.mail\.ru\//, label: "Mail.ru" },
    { key: "yandexTranslate", checkbox: "yandex", host: /^https:\/\/translate\.yandex\.ru\//, label: "Яндекс.Переводчик" },
    { key: "yandexPogoda", checkbox: "pogoda", host: /^https:\/\/yandex\.ru\/pogoda\//, label: "Яндекс.Погода" },
]

// Новая вкладка Яндекса — особый случай: content-скрипты Chrome в NTP не пускает,
// поэтому баннер режется на сетевом уровне (блокировка запроса iframe), а галочка
// включает/выключает это правило declarativeNetRequest.
const NEWTAB_RULESET = "yandex_ntp"

const status = document.getElementById("status")

const defaults = {}
for (const site of SITES) defaults[site.key] = true

chrome.storage.sync.get(defaults, (state) => {
    for (const site of SITES) {
        document.getElementById(site.checkbox).checked = state[site.key]
    }
    refresh()
})

for (const site of SITES) {
    const box = document.getElementById(site.checkbox)
    box.addEventListener("change", () => {
        chrome.storage.sync.set({ [site.key]: box.checked }, refresh)
    })
}

// --- новая вкладка: состояние берём из самого правила, а не из storage ---
const newtabBox = document.getElementById("newtab")

chrome.declarativeNetRequest.getEnabledRulesets((ids) => {
    newtabBox.checked = ids.includes(NEWTAB_RULESET)
})

newtabBox.addEventListener("change", () => {
    const change = newtabBox.checked
        ? { enableRulesetIds: [NEWTAB_RULESET] }
        : { disableRulesetIds: [NEWTAB_RULESET] }
    chrome.declarativeNetRequest.updateEnabledRulesets(change)
})

function setStatus(text, kind) {
    status.textContent = text
    status.className = kind || ""
}

function refresh() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0]
        const url = (tab && tab.url) || ""
        const site = SITES.find((s) => s.host.test(url))
        if (!site) {
            // Новая вкладка Яндекса грузится как chrome://…, её URL сюда не
            // попадает — по баннеру статус не показываем, галочка выше рабочая.
            setStatus("Откройте Mail.ru или Яндекс.Переводчик")
            return
        }
        const box = document.getElementById(site.checkbox)
        chrome.tabs.sendMessage(tab.id, { type: "status" }, (response) => {
            if (chrome.runtime.lastError || !response) {
                setStatus("Скрипт не запущен — перезагрузите вкладку", "bad")
            } else if (response.count > 0) {
                const found = site.label + ": найдено блоков — " + response.count
                setStatus(box.checked ? found + ", скрыты" : found + ", скрытие выключено", "ok")
            } else {
                setStatus(site.label + ": реклама не найдена", "bad")
            }
        })
    })
}
