// Organization setup wizard (first run)
import { supabase, unwrap } from '../lib/supabase.js'
import { state, loadContext } from '../lib/state.js'
import { esc } from '../lib/format.js'
import { errMsg, toast } from '../lib/ui.js'
import { icon } from '../lib/icons.js'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'SGD', 'AED', 'JPY', 'CNY', 'BRL', 'ZAR']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const STEPS = ['Organization', 'Business defaults', 'Departments', 'Invite team']

export default function setup(el) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const data = { name: '', industry: '', country: '', timezone: tz, currency: 'USD', fiscal: 1, dateFormat: 'YYYY-MM-DD', tax: 0, depts: '', invites: [{ email: '', role: 'employee' }] }
  let step = 0

  const draw = () => {
    const body = [
      `<div class="grid gap-4"><div><label class="label" for="s_name">Organization name <span class="text-bad">*</span></label><input class="input" id="s_name" required value="${esc(data.name)}"/></div>
        <div class="grid sm:grid-cols-2 gap-4"><div><label class="label" for="s_ind">Industry</label><input class="input" id="s_ind" value="${esc(data.industry)}" placeholder="e.g. Retail"/></div>
        <div><label class="label" for="s_cty">Country</label><input class="input" id="s_cty" value="${esc(data.country)}"/></div></div>
        <div><label class="label" for="s_tz">Timezone</label><input class="input" id="s_tz" value="${esc(data.timezone)}"/></div></div>`,
      `<div class="grid sm:grid-cols-2 gap-4"><div><label class="label" for="s_cur">Currency</label><select class="select" id="s_cur">${CURRENCIES.map((c) => `<option ${c === data.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div><label class="label" for="s_fy">Fiscal year starts</label><select class="select" id="s_fy">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === +data.fiscal ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div><label class="label" for="s_df">Date format</label><select class="select" id="s_df">${['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'].map((f) => `<option ${f === data.dateFormat ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
        <div><label class="label" for="s_tax">Default tax rate (%)</label><input class="input" id="s_tax" type="number" min="0" step="0.01" value="${data.tax}"/></div></div>`,
      `<label class="label" for="s_dep">Departments <span class="text-muted font-normal">(optional, one per line)</span></label>
        <textarea class="textarea" id="s_dep" rows="6" placeholder="Sales&#10;Operations&#10;Finance">${esc(data.depts)}</textarea>`,
      `<p class="text-ink2 mb-3">Invite teammates now, or skip and do it later in Settings → Users. You'll get a link to share with each person.</p>
        <div id="inv-list" class="space-y-2">${data.invites.map((v, i) => `<div class="flex gap-2"><input class="input" data-ie="${i}" type="email" placeholder="name@company.com" value="${esc(v.email)}" aria-label="Email"/>
          <select class="select max-w-[140px]" data-ir="${i}" aria-label="Role"><option value="employee" ${v.role === 'employee' ? 'selected' : ''}>Employee</option><option value="manager" ${v.role === 'manager' ? 'selected' : ''}>Manager</option></select></div>`).join('')}</div>
        <button class="btn btn-sm mt-3" id="add-inv">${icon('plus', 'w-4 h-4')} Add another</button>`,
    ][step]

    el.innerHTML = `<div class="min-h-screen flex items-center justify-center p-4"><div class="w-full max-w-xl">
      <h1 class="text-2xl font-semibold tracking-tight mb-1">Set up your organization</h1>
      <p class="text-ink2 mb-6">A few quick steps and your workspace is ready.</p>
      <ol class="flex gap-2 mb-5" aria-label="Progress">${STEPS.map((s, i) => `<li class="flex-1"><div class="h-1.5 rounded-full ${i <= step ? 'bg-accent' : 'bg-line'}"></div><span class="text-xs ${i === step ? 'text-ink font-medium' : 'text-muted'}">${s}</span></li>`).join('')}</ol>
      <div class="card p-6">${body}<div class="field-error hidden mt-4" data-err role="alert"></div>
        <div class="flex justify-between mt-6"><button class="btn" id="back" ${step === 0 ? 'disabled' : ''}>Back</button>
        <button class="btn btn-primary" id="next">${step === STEPS.length - 1 ? 'Create workspace' : 'Continue'}</button></div></div>
      <p class="text-center mt-4"><button class="text-sm text-ink2 underline" id="so">Sign out</button></p></div></div>`

    const v = (id) => el.querySelector(id)?.value
    const read = () => {
      if (step === 0) Object.assign(data, { name: v('#s_name').trim(), industry: v('#s_ind'), country: v('#s_cty'), timezone: v('#s_tz') })
      if (step === 1) Object.assign(data, { currency: v('#s_cur'), fiscal: v('#s_fy'), dateFormat: v('#s_df'), tax: v('#s_tax') || 0 })
      if (step === 2) data.depts = v('#s_dep')
      if (step === 3) data.invites = [...el.querySelectorAll('[data-ie]')].map((e, i) => ({ email: e.value.trim(), role: el.querySelector(`[data-ir="${i}"]`).value }))
    }
    el.querySelector('#so').onclick = () => supabase.auth.signOut()
    el.querySelector('#back').onclick = () => { read(); step--; draw() }
    el.querySelector('#add-inv')?.addEventListener('click', () => { read(); data.invites.push({ email: '', role: 'employee' }); draw() })
    el.querySelector('#next').onclick = async (e) => {
      read()
      const err = el.querySelector('[data-err]')
      err.classList.add('hidden')
      if (step === 0 && !data.name) { err.textContent = 'Organization name is required'; err.classList.remove('hidden'); return }
      if (step < STEPS.length - 1) { step++; return draw() }
      e.target.disabled = true
      e.target.innerHTML = `${icon('loader', 'w-4 h-4 spin')} Creating…`
      try { await finish() } catch (ex) { err.textContent = errMsg(ex); err.classList.remove('hidden'); e.target.disabled = false; e.target.textContent = 'Create workspace' }
    }
  }

  async function finish() {
    const orgId = unwrap(await supabase.rpc('create_organization', {
      p_name: data.name, p_industry: data.industry || null, p_country: data.country || null, p_timezone: data.timezone || 'UTC',
      p_currency: data.currency, p_fiscal_start: +data.fiscal, p_date_format: data.dateFormat, p_tax_rate: +data.tax || 0,
    }))
    const depts = data.depts.split('\n').map((s) => s.trim()).filter(Boolean)
    if (depts.length) await supabase.from('departments').insert(depts.map((name) => ({ organization_id: orgId, name })))
    const invites = data.invites.filter((i) => i.email)
    let links = []
    if (invites.length) {
      const { data: roles } = await supabase.from('roles').select('id,name').eq('organization_id', orgId)
      const rows = invites.map((i) => ({ organization_id: orgId, email: i.email.toLowerCase(), role_id: roles.find((r) => r.name === i.role).id, invited_by: state.session.user.id }))
      const { data: made } = await supabase.from('invitations').insert(rows).select('email,token')
      links = made || []
    }
    await loadContext()
    window.dispatchEvent(new Event('ctx-changed'))
    if (links.length) {
      el.innerHTML = `<div class="min-h-screen flex items-center justify-center p-4"><div class="card p-6 max-w-xl w-full"><h1 class="text-xl font-semibold mb-1">Workspace ready 🎉</h1>
        <p class="text-ink2 mb-4">Share these invitation links (valid for 7 days). Each works only for the invited email.</p>
        <ul class="space-y-2 text-sm">${links.map((l) => `<li><span class="text-muted">${esc(l.email)}</span><input class="input mt-1" readonly value="${esc(location.origin + location.pathname)}#/accept/${l.token}" onclick="this.select()"/></li>`).join('')}</ul>
        <a class="btn btn-primary mt-5" href="#/">Open dashboard</a></div></div>`
    } else {
      toast('Workspace created')
      location.hash = '#/'
    }
  }
  draw()
}
