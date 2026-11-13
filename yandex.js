const DEBUG = false

const HIDDEN_ATTR = "data-noads-hidden"
// Контейнер рекламной врезки в правой колонке переводчика.
const AD_CONTAINER = ".side-block"
// Рекламные блоки Яндекс.Директа несут в id устойчивый префикс R-I-/R-A-.
// Класс-обёртка и внешний id врезки хешируются и меняются, а этот префикс — нет.
const AD_MARKER = '[id*="R-I-"], [id*="R-A-"]'

let enabled = true
let scheduled = false

function log() {
    if (DEBUG) console.log.apply(console, ["[hide-ads:yandex]"].concat(Array.from(arguments)))
}

function findAdRoots() {
    const roots = []
    for (const marker of document.querySelectorAll(AD_MARKER)) {
        // Скрываем всю врезку целиком (с крестиком закрытия), а не только
        // рендер объявления. Нет .side-block — прячем сам маркер.
        const root = marker.closest(AD_CONTAINER) || marker
        if (!roots.includes(root)) roots.push(root)
    }
    return roots
}

function apply() {
    if (!enabled) return []
    const roots = findAdRoots()
    for (const el of document.querySelectorAll("[" + HIDDEN_ATTR + "]")) {
        if (!roots.includes(el)) el.removeAttribute(HIDDEN_ATTR)
    }
    for (const root of roots) {
        // fade, а не collapse: у переводчика центрированный layout, и если
        // убрать врезку из потока (display:none), основной контент съезжает.
        // opacity:0 держит габариты блока — контент остаётся на месте.
        if (root.getAttribute(HIDDEN_ATTR) !== "fade") {
            root.setAttribute(HIDDEN_ATTR, "fade")
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

// Директ дорисовывает и перерисовывает врезку после загрузки страницы —
// следим за деревом постоянно.
new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
})

if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.sync.get({ yandexTranslate: true }, (state) => setEnabled(state.yandexTranslate))

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes.yandexTranslate) setEnabled(changes.yandexTranslate.newValue)
    })

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || message.type !== "status") return
        sendResponse({ count: findAdRoots().length, enabled })
    })
} else {
    schedule()
}

window.__hideYandexAds = { findAdRoots, apply, unhide }
