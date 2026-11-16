import { supabase, unwrap } from '../lib/supabase.js'
import { state, loadContext, applyTheme } from '../lib/state.js'
import { esc } from '../lib/format.js'
import { pageHeader, toast, errMsg } from '../lib/ui.js'

export default function profile(el) {
  const p = state.profile
  el.innerHTML = `${pageHeader({ title: 'Your profile', subtitle: p.email })}
    <div class="grid lg:grid-cols-2 gap-5 items-start">
      <form class="card p-5 space-y-4" id="pf" novalidate><h2 class="font-semibold">Personal information</h2>
        <div><label class="label" for="fn">Full name</label><input class="input" id="fn" required value="${esc(p.full_name || '')}"/></div>
        <div><label class="label" for="ph">Phone</label><input class="input" id="ph" type="tel" value="${esc(p.phone || '')}"/></div>
        <div><label class="label" for="th">Theme</label><select class="select" id="th">${['system', 'light', 'dark'].map((t) => `<option value="${t}" ${t === p.theme_preference ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></div>
        <div class="field-error hidden" data-err></div><button class="btn btn-primary" type="submit">Save changes</button></form>
      <form class="card p-5 space-y-4" id="pw" novalidate><h2 class="font-semibold">Change password</h2>
        <div><label class="label" for="np">New password</label><input class="input" id="np" type="password" minlength="8" autocomplete="new-password" required/></div>
        <div><label class="label" for="np2">Confirm new password</label><input class="input" id="np2" type="password" minlength="8" autocomplete="new-password" required/></div>
        <div class="field-error hidden" data-err></div><button class="btn btn-primary" type="submit">Update password</button>
        ${state.role ? `<p class="text-sm text-ink2 pt-3 border-t border-line">Role in <b>${esc(state.org.name)}</b>: ${esc(state.role.label)}</p>` : ''}</form></div>`

  const show = (form, msg) => { const e = form.querySelector('[data-err]'); e.textContent = msg || ''; e.classList.toggle('hidden', !msg) }
  el.querySelector('#pf').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; show(f)
    try {
      unwrap(await supabase.from('profiles').update({ full_name: f.fn.value.trim(), phone: f.ph.value.trim() || null, theme_preference: f.th.value }).eq('id', p.id))
      applyTheme(f.th.value); await loadContext(); toast('Profile updated')
    } catch (ex) { show(f, errMsg(ex)) }
  })
  el.querySelector('#pw').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; show(f)
    if (f.np.value.length < 8) return show(f, 'Password must be at least 8 characters')
    if (f.np.value !== f.np2.value) return show(f, 'Passwords do not match')
    try { unwrap(await supabase.auth.updateUser({ password: f.np.value })); f.reset(); toast('Password updated') } catch (ex) { show(f, errMsg(ex)) }
  })
}
