// Tiny hash router. Routes: "/hr/:id" style patterns.
const routes = []

export function route(pattern, loader, opts = {}) {
  const keys = []
  const re = new RegExp(
    '^' + pattern.replace(/:([a-zA-Z_]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$',
  )
  routes.push({ pattern, re, keys, loader, ...opts })
}

export function currentPath() {
  return (location.hash.replace(/^#/, '').split('?')[0] || '/')
}

export function currentQuery() {
  return Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''))
}

export function navigate(path) {
  if (location.hash === '#' + path) window.dispatchEvent(new HashChangeEvent('hashchange'))
  else location.hash = path
}

export function resolve(path) {
  for (const r of routes) {
    const m = path.match(r.re)
    if (m) {
      const params = {}
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])))
      return { route: r, params }
    }
  }
  return null
}
