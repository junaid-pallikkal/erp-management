import { supabase, unwrap } from '../lib/supabase.js'
import { state, loadContext } from '../lib/state.js'
import { esc } from '../lib/format.js'
import { errMsg } from '../lib/ui.js'
import { icon } from '../lib/icons.js'

const shell = (el, title, subtitle, body, footer = '') => {
  el.innerHTML = `<div class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-[400px]">
      <div class="flex items-center gap-2 justify-center mb-6"><div class="w-9 h-9 rounded-lg bg-accent text-white dark:text-[#0b0f17] flex items-center justify-center font-bold">E</div><span class="font-semibold text-lg">ERP Management</span></div>
      <div class="card p-6 sm:p-8"><h1 class="text-xl font-semibold">${esc(title)}</h1><p class="text-ink2 mt-1 mb-5">${esc(subtitle)}</p>${body}</div>
      <p class="text-center text-ink2 mt-4">${footer}</p></div></div>`
}

const field = (id, label, type = 'text', extra = '') =>
  `<div><label class="label" for="${id}">${label}</label><input class="input" id="${id}" name="${id}" type="${type}" required ${extra}/></div>`

function wire(el, onSubmit, label) {
  const form = el.querySelector('form')
  const btn = form.querySelector('button[type=submit]')
  const err = form.querySelector('[data-err]')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!form.reportValidity()) return
    btn.disabled = true
    btn.innerHTML = `${icon('loader', 'w-4 h-4 spin')} Please wait…`
    err.classList.add('hidden')
    try {
      await onSubmit(Object.fromEntries(new FormData(form)))
    } catch (ex) {
      err.textContent = errMsg(ex)
      err.classList.remove('hidden')
      btn.disabled = false
      btn.textContent = label
    }
  })
}

const formWrap = (inner, label) =>
  `<form class="space-y-4" novalidate>${inner}<div class="field-error hidden" data-err role="alert"></div>
   <button class="btn btn-primary w-full" type="submit">${label}</button></form>`

async function afterAuth() {
  await loadContext()
  window.dispatchEvent(new Event('ctx-changed'))
  const invite = sessionStorage.getItem('invite')
  if (invite) return void (location.hash = `#/accept/${invite}`)
  location.hash = state.org || state.profile?.is_platform_admin ? '#/' : '#/setup'
  if (state.profile?.is_platform_admin && !state.org) location.hash = '#/platform'
}

export function login(el) {
  shell(el, 'Welcome back', 'Sign in to your workspace',
    formWrap(`${field('email', 'Email', 'email', 'autocomplete="email"')}
      <div><div class="flex justify-between"><label class="label" for="password">Password</label><a class="text-xs text-accent" href="#/forgot">Forgot password?</a></div>
      <input class="input" id="password" name="password" type="password" required autocomplete="current-password"/></div>`, 'Sign in'),
    `New here? <a class="text-accent font-medium" href="#/register">Create an account</a>`)
  wire(el, async ({ email, password }) => {
    unwrap(await supabase.auth.signInWithPassword({ email: email.trim(), password }))
    await afterAuth()
  }, 'Sign in')
}

export function register(el) {
  shell(el, 'Create your account', 'Start managing your organization in minutes',
    formWrap(`${field('full_name', 'Full name', 'text', 'autocomplete="name"')}${field('email', 'Work email', 'email', 'autocomplete="email"')}
      ${field('password', 'Password', 'password', 'minlength="8" autocomplete="new-password"')}
      <p class="text-xs text-muted -mt-2">At least 8 characters.</p>`, 'Create account'),
    `Already have an account? <a class="text-accent font-medium" href="#/login">Sign in</a>`)
  wire(el, async ({ full_name, email, password }) => {
    const data = unwrap(await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: full_name.trim() } } }))
    if (!data.session) {
      shell(el, 'Check your email', `We sent a confirmation link to ${email}. Open it, then sign in to continue.`,
        '<a class="btn btn-primary w-full" href="#/login">Go to sign in</a>')
      return
    }
    await afterAuth()
  }, 'Create account')
}

export function forgot(el) {
  shell(el, 'Reset your password', "Enter your email and we'll send you a reset link",
    formWrap(field('email', 'Email', 'email'), 'Send reset link'), '<a class="text-accent" href="#/login">Back to sign in</a>')
  wire(el, async ({ email }) => {
    unwrap(await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname + '#/reset' }))
    shell(el, 'Check your email', 'If an account exists for that address, a reset link is on its way.', '<a class="btn w-full" href="#/login">Back to sign in</a>')
  }, 'Send reset link')
}

export function reset(el) {
  shell(el, 'Choose a new password', 'Use at least 8 characters',
    formWrap(field('password', 'New password', 'password', 'minlength="8" autocomplete="new-password"'), 'Update password'))
  wire(el, async ({ password }) => {
    unwrap(await supabase.auth.updateUser({ password }))
    await loadContext()
    location.hash = '#/'
  }, 'Update password')
}

export async function accept(el, { params }) {
  const token = params.token
  shell(el, 'Invitation', 'Loading…', '<div class="skeleton h-10"></div>')
  const { data } = await supabase.rpc('get_invitation', { p_token: token })
  const inv = data?.[0]
  if (!inv || inv.status !== 'pending' || inv.expired) {
    sessionStorage.removeItem('invite')
    return shell(el, 'Invitation unavailable', 'This invitation is invalid, expired or has already been used.', '<a class="btn w-full" href="#/login">Go to sign in</a>')
  }
  const summary = `<div class="rounded-lg bg-bg border border-line p-3 mb-4 text-sm"><p><span class="text-muted">Organization:</span> <b>${esc(inv.organization_name)}</b></p>
    <p><span class="text-muted">Role:</span> ${esc(inv.role_label)}</p><p><span class="text-muted">Invited email:</span> ${esc(inv.email)}</p></div>`
  if (!state.session) {
    sessionStorage.setItem('invite', token)
    return shell(el, `Join ${inv.organization_name}`, 'Sign in or create an account with the invited email address.',
      `${summary}<a class="btn btn-primary w-full mb-2" href="#/register">Create account</a><a class="btn w-full" href="#/login">I already have an account</a>`)
  }
  shell(el, `Join ${inv.organization_name}`, 'Accept this invitation to get access.', `${summary}<div class="field-error hidden mb-3" data-err></div><button class="btn btn-primary w-full" id="acc">Accept invitation</button>`)
  el.querySelector('#acc').onclick = async (e) => {
    e.target.disabled = true
    const { error } = await supabase.rpc('accept_invitation', { p_token: token })
    if (error) {
      const box = el.querySelector('[data-err]')
      box.textContent = errMsg(error); box.classList.remove('hidden'); e.target.disabled = false
      return
    }
    sessionStorage.removeItem('invite')
    await loadContext()
    window.dispatchEvent(new Event('ctx-changed'))
    location.hash = '#/'
  }
}
