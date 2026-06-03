import DOMPurify from 'dompurify'

/**
 * Sanitize HTML produced by `marked` before binding it to v-html.
 *
 * `marked@18` is intentionally permissive: it does not strip <script>, inline
 * event handlers, or `javascript:` URLs. A crafted AI response, a tampered
 * world-book JSON, or a hostile draft can therefore inject script that runs in
 * the page context. `DOMPurify` is the standard defense: it parses the HTML,
 * walks the tree, and removes anything that can execute or exfiltrate.
 *
 * Keep the allow-list tight. If a future feature legitimately needs
 * `<iframe>` / `<object>` / `<style>`, opt in explicitly — do NOT flip
 * `ADD_TAGS` globally.
 */
const HTML_CONFIG = Object.freeze({
  ALLOWED_TAGS: [
    'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'figcaption',
    'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd',
    'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'small', 'span', 'strong', 'sub',
    'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul'
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'alt', 'src', 'class', 'id', 'lang', 'dir',
    'colspan', 'rowspan', 'start', 'type', 'rel', 'target'
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
})

/**
 * SVG produced by the world-map engine. We only need to render shapes — no
 * scripts, no external references, no `xlink:href` to JS URLs. The SVG profile
 * applies a matching allow-list and forbids `<foreignObject>` (which can
 * smuggle HTML/JS into SVG context).
 */
const SVG_CONFIG = Object.freeze({
  USE_PROFILES: { svg: true, svgFilters: true }
})

/**
 * @param {string} html - HTML string (e.g. from `marked.parse()`).
 * @returns {string} Sanitized HTML safe to assign to `v-html`.
 */
export function sanitizeHtml(html) {
  if (html == null || html === '') return ''
  return DOMPurify.sanitize(String(html), HTML_CONFIG)
}

/**
 * @param {string} svg - SVG markup (e.g. from geography engine output).
 * @returns {string} Sanitized SVG safe to assign to `v-html`.
 */
export function sanitizeSvg(svg) {
  if (svg == null || svg === '') return ''
  return DOMPurify.sanitize(String(svg), SVG_CONFIG)
}
