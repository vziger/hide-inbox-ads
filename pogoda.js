const DEBUG = false

const HIDDEN_ATTR = "data-noads-hidden"
// Рекламные компоненты Яндекс.Погоды. Хеш-суффиксы CSS-модулей меняются между
// сборками (AppMoney_wrap__6erRK), а префиксы остаются, поэтому цепляемся за них
// подстрокой. AppMoney_wrap - сам рекламный слот (правый баннер и карточки),
// MainPage_topBlockWithMoney - обёртка правого баннера.
const AD_SELECTOR = '[class*="MainPage_topBlockWithMoney"], [class*="AppMoney_wrap"]'

let enabled = true
let scheduled = false

function log() {
    if (DEBUG) console.log.apply(console, ["[hide-ads:pogoda]"].concat(Array.from(arguments)))
}

function findAdRoots() {
    const all = Array.from(document.querySelectorAll(AD_SELECTOR))
    // Если слот вложен в обёртку, которую мы и так скрываем, оставляем только
    // внешнюю, чтобы не плодить отметки на вложенных.
    return all.filter((el) => !all.some((other) => other !== el && other.contains(el)))
}

function apply() {
    if (!enabled) return []
    const roots = findAdRoots()
    for (const el of document.querySelectorAll("[" + HIDDEN_ATTR + "]")) {
        if (!roots.includes(el)) el.removeAttribute(HIDDEN_ATTR)
    }
    for (const root of roots) {
        if (root.getAttribute(HIDDEN_ATTR) !== "collapse") {
            root.setAttribute(HIDDEN_ATTR, "collapse")
            log("скрыт", root)
        }
    }
    return roots
}

function unhide() {
    for (const el of document.querySelectorAll("[" + HIDDEN_ATTR + "]")) {
        el.removeAttribute(HIDDEN_ATTR)
    }
}

// Таймер, а не requestAnimationFrame: rAF не выполняется в фоновой вкладке,
// и блок оставался бы видимым до возврата фокуса.
function schedule() {
    if (scheduled) return
    scheduled = true
    setTimeout(() => {
        scheduled = false
        apply()
    }, 0)
}

function setEnabled(value) {
    enabled = value
    if (enabled) apply()
    else unhide()
}

// Директ дорисовывает слоты уже после загрузки страницы, поэтому следим за
// деревом постоянно.
new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
})

if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.sync.get({ yandexPogoda: true }, (state) => setEnabled(state.yandexPogoda))

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes.yandexPogoda) setEnabled(changes.yandexPogoda.newValue)
    })

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || message.type !== "status") return
        sendResponse({ count: findAdRoots().length, enabled })
    })
} else {
    schedule()
}

window.__hidePogodaAds = { findAdRoots, apply, unhide }
