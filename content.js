const DEBUG = false

const HIDDEN_ATTR = "data-noads-hidden"
const BUTTON_SELECTOR = ".noads-button"
// Меню и панель, которые рекламная сеть рендерит внутри каждого креатива, —
// в том числе у видимой рекламы. Единственные неизменные текстовые маркеры:
// классы вокруг них хешированные и меняются между сборками.
const AD_MENU_TEXTS = ["О рекламодателе", "Скрыть рекламу", "О рекламе"]
const AD_PANEL_TEXTS = ["Объявление скрыто", "подходящую рекламу"]
const APP_SELECTOR = "svg, a, button, input, textarea, select"
// Нехешированные классы самой почты: список писем и тулбар над ним.
const LIST_SELECTOR = ".letter-list__react"
const TOOLBAR_SELECTOR = ".new-menu"
// Скругление верхних углов карточки, которое несла рекламная плашка.
const MASK_RADIUS = "16px"
// Ни один рекламный блок не занимает почти весь экран — страховка от того,
// чтобы подъём вверх не добрался до всего приложения.
const MAX_VIEWPORT_SHARE = 0.7

let enabled = true
let scheduled = false

function log() {
    if (DEBUG) console.log.apply(console, ["[hide-ads]"].concat(Array.from(arguments)))
}

function isBoundary(el) {
    return (
        el === document.body ||
        el === document.documentElement ||
        el.tagName === "MAIN" ||
        el.getAttribute("role") === "main"
    )
}

function isTooBig(el) {
    const rect = el.getBoundingClientRect()
    return (
        rect.width > window.innerWidth * MAX_VIEWPORT_SHARE &&
        rect.height > window.innerHeight * MAX_VIEWPORT_SHARE
    )
}

function findByExactText(text) {
    const result = document.evaluate(
        "//*[text()='" + text + "']",
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
    )
    const nodes = []
    for (let i = 0; i < result.snapshotLength; i++) nodes.push(result.snapshotItem(i))
    return nodes
}

// От листа с текстом поднимаемся до элемента, который содержит всю группу
// текстов целиком, — это и есть меню или панель креатива.
function enclosingGroup(leaf, texts) {
    let el = leaf
    while (el && !isBoundary(el)) {
        const content = el.textContent || ""
        if (texts.every((text) => content.includes(text))) return el
        el = el.parentElement
    }
    return null
}

function findMarkers() {
    const markers = new Set()
    for (const group of [AD_MENU_TEXTS, AD_PANEL_TEXTS]) {
        for (const leaf of findByExactText(group[0])) {
            const marker = enclosingGroup(leaf, group)
            if (marker) markers.add(marker)
        }
    }
    // Правая колонка узнаётся ещё и по кнопке «Убрать рекламу за 1 ₽»:
    // она переживёт смену разметки самих креативов.
    for (const button of document.querySelectorAll(BUTTON_SELECTOR)) markers.add(button)
    return Array.from(markers)
}

function isAdish(el, markers) {
    if (el.matches(BUTTON_SELECTOR) || el.querySelector(BUTTON_SELECTOR)) return true
    return markers.some((marker) => el === marker || el.contains(marker))
}

// Креативы свёрстаны голыми div'ами: ни иконок, ни ссылок, ни полей ввода.
// Интерфейс почты — наоборот, весь из них состоит.
function isAppContent(el) {
    return Boolean(el.matches(APP_SELECTOR) || el.querySelector(APP_SELECTOR))
}

// Можно ли подниматься на уровень выше. Пропускаем пустые элементы (скелетоны
// строки, разделители карусели), соседние креативы, кнопку «Убрать рекламу»
// и собственную вёрстку креатива. Останавливаемся на интерфейсе почты —
// тулбаре и соседних письмах.
function canAscend(parent, child, markers) {
    const foreign = []
    for (const sibling of parent.children) {
        if (sibling === child) continue
        if (!(sibling.textContent || "").trim()) continue
        if (isAdish(sibling, markers)) continue
        if (isAppContent(sibling)) return false
        foreign.push(sibling)
    }
    // Одинаково свёрстанные соседи — это список писем, а не части креатива:
    // у частей креатива классы всегда разные.
    const signatures = new Set()
    for (const el of foreign) {
        const signature = el.tagName + "|" + (el.getAttribute("class") || "")
        if (signatures.has(signature)) return false
        signatures.add(signature)
    }
    return true
}

function climbToAdRoot(marker, markers) {
    let root = marker
    while (root.parentElement && !isBoundary(root.parentElement) && !isTooBig(root.parentElement)) {
        if (!canAscend(root.parentElement, root, markers)) break
        root = root.parentElement
    }
    return root
}

function findAdRoots() {
    const markers = findMarkers()
    const roots = []
    for (const marker of markers) {
        const root = climbToAdRoot(marker, markers)
        if (!roots.includes(root)) roots.push(root)
    }
    // Несколько креативов одной карусели дают один корень, но если подъём
    // где-то остановился раньше, вложенные корни надо отбросить.
    return roots.filter((root) => !roots.some((other) => other !== root && other.contains(root)))
}

// fade — правая колонка: схлопывать нельзя, уедет вёрстка письма.
// collapse — строка списка: убираем из потока, место всё равно держит
// абсолютное позиционирование соседних строк.
// mask — блок в шапке: он несёт скругление верхних углов карточки и её
// высоту, поэтому остаётся на месте, прячется только содержимое.
function hidingMode(root) {
    if (root.querySelector(BUTTON_SELECTOR)) return "fade"
    if (root.closest(LIST_SELECTOR)) return "collapse"
    if (getComputedStyle(root).position === "absolute") return "collapse"
    return "mask"
}

function isOpaque(color) {
    return Boolean(color) && color !== "transparent" && !color.startsWith("rgba(0, 0, 0, 0)")
}

// Белый фон карточки нарисован не на контейнерах, а на конкретных элементах
// интерфейса, поэтому ищем сверху вниз. Вверх по предкам не идём совсем:
// там фон всего приложения, и плашка получается цветной.
function opaqueBackground(el, depth) {
    const color = getComputedStyle(el).backgroundColor
    if (isOpaque(color)) return color
    if (depth <= 0) return ""
    for (const child of el.children) {
        const found = opaqueBackground(child, depth - 1)
        if (found) return found
    }
    return ""
}

// Фон, которым закрывается рекламная плашка: берём его у соседей по карточке —
// тулбара и списка писем. Не нашли — оставляем прозрачным.
function backdropColor(root) {
    const card = root.parentElement
    if (!card) return ""
    for (const selector of [TOOLBAR_SELECTOR, LIST_SELECTOR]) {
        const neighbour = card.querySelector(selector)
        if (!neighbour) continue
        const color = opaqueBackground(neighbour, 4)
        if (color) return color
    }
    return ""
}

// Корень становится пустой плашкой: её носители — фон и скругление — прячутся
// вместе с остальным содержимым, поэтому проставляем их корню сами.
function mask(root) {
    root.setAttribute(HIDDEN_ATTR, "mask")
    root.style.backgroundColor = backdropColor(root)
    root.style.borderTopLeftRadius = MASK_RADIUS
    root.style.borderTopRightRadius = MASK_RADIUS
}

function apply() {
    if (!enabled) return []
    const roots = findAdRoots()
    for (const el of document.querySelectorAll("[" + HIDDEN_ATTR + "]")) {
        if (!roots.includes(el)) reveal(el)
    }
    for (const root of roots) {
        const mode = hidingMode(root)
        if (root.getAttribute(HIDDEN_ATTR) === mode) continue
        if (mode === "mask") mask(root)
        else {
            clearInlineStyles(root)
            root.setAttribute(HIDDEN_ATTR, mode)
        }
        log("скрыт", mode, root)
    }
    return roots
}

function clearInlineStyles(el) {
    el.style.backgroundColor = ""
    el.style.borderTopLeftRadius = ""
    el.style.borderTopRightRadius = ""
}

function reveal(el) {
    el.removeAttribute(HIDDEN_ATTR)
    clearInlineStyles(el)
}

function unhide() {
    for (const el of document.querySelectorAll("[" + HIDDEN_ATTR + "]")) reveal(el)
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

// SPA перерисовывает и правую колонку, и список писем при каждом переходе,
// а React затирает наш атрибут — поэтому следим за деревом постоянно.
new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
})

if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.sync.get({ enabled: true }, (state) => setEnabled(state.enabled))

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes.enabled) setEnabled(changes.enabled.newValue)
    })

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || message.type !== "status") return
        const count = findAdRoots().length
        if (count > 0) {
            sendResponse({ count, enabled })
            return
        }
        // Ответ «не нашёл» отдаём с задержкой: если блок живёт во фрейме,
        // пусть первым успеет ответить тот, кто его действительно нашёл.
        if (window.top !== window) return
        setTimeout(() => sendResponse({ count: 0, enabled }), 150)
        return true
    })
} else {
    schedule()
}

window.__hideMailAds = { findMarkers, findAdRoots, apply, unhide }
