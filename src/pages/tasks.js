// Kanban board for tasks
import { supabase, unwrap } from '../lib/supabase.js'
import { state, can } from '../lib/state.js'
import { esc, fullName, date, badge } from '../lib/format.js'
import { icon } from '../lib/icons.js'
import { pageHeader, openForm, attempt, toast, loadRefOptions, skeletonRows } from '../lib/ui.js'
import { registry } from '../modules/registry.js'

const COLS = [['todo', 'To do'], ['in_progress', 'In progress'], ['review', 'Review'], ['done', 'Done']]

export default async function board(el, { query }) {
  el.innerHTML = pageHeader({ title: 'Tasks' }) + skeletonRows(3)
  const projects = await loadRefOptions({ table: 'projects', label: 'name', soft: true })
  let project = query.project || ''
  let mine = false

  async function draw() {
    let q = supabase.from('tasks').select('*, assignee:employees!assignee_employee_id(first_name,last_name), project:projects!project_id(name)')
      .eq('organization_id', state.org.id).is('deleted_at', null).neq('status', 'cancelled').order('position').order('created_at', { ascending: false }).limit(500)
    if (project) q = q.eq('project_id', project)
    if (mine && state.employeeId) q = q.eq('assignee_employee_id', state.employeeId)
    const { data, error } = await q
    if (error) { el.innerHTML = `<div class="card p-6 text-bad">${esc(error.message)}</div>`; return }
    const tasks = data || []
    const canEdit = can('tasks', 'edit')

    el.innerHTML = `${pageHeader({ title: 'Tasks', subtitle: 'Drag cards between columns to update progress', actions: `
      <select class="select max-w-[220px]" id="proj" aria-label="Project"><option value="">All projects</option>${projects.map((p) => `<option value="${p.value}" ${p.value === project ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>
      ${state.employeeId ? `<label class="flex items-center gap-2 text-sm"><input type="checkbox" id="mine" ${mine ? 'checked' : ''} class="accent-[var(--accent)]"/> Mine</label>` : ''}
      <a class="btn" href="#/m/tasks">${icon('list', 'w-4 h-4')} List view</a>
      ${can('tasks', 'create') ? `<button class="btn btn-primary" id="new">${icon('plus', 'w-4 h-4')} New task</button>` : ''}` })}
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4 items-start">
      ${COLS.map(([k, label]) => {
        const items = tasks.filter((t) => t.status === k)
        return `<section class="kanban-col rounded-xl bg-bg border border-line p-3 min-h-[160px]" data-col="${k}" aria-label="${label}">
          <h2 class="flex justify-between px-1 mb-3 text-sm font-semibold">${label}<span class="text-muted font-normal">${items.length}</span></h2>
          <div class="space-y-2">${items.map((t) => `
            <article class="card p-3 ${canEdit ? 'cursor-grab' : ''}" draggable="${canEdit}" data-id="${t.id}" tabindex="0">
              <p class="font-medium leading-snug">${esc(t.title)}</p>
              ${t.project ? `<p class="text-xs text-muted mt-1 truncate">${esc(t.project.name)}</p>` : ''}
              <div class="flex items-center justify-between mt-2.5 text-xs"><span class="flex gap-1.5 items-center">${badge(t.priority)}${t.due_date ? `<span class="${t.due_date < new Date().toISOString().slice(0, 10) && t.status !== 'done' ? 'text-bad' : 'text-muted'}">${date(t.due_date)}</span>` : ''}</span>
              <span class="text-ink2 truncate max-w-[90px]">${t.assignee ? esc(fullName(t.assignee)) : ''}</span></div>
            </article>`).join('') || '<p class="text-xs text-muted text-center py-4">No tasks</p>'}</div></section>`
      }).join('')}</div>`

    el.querySelector('#proj').onchange = (e) => { project = e.target.value; draw() }
    el.querySelector('#mine')?.addEventListener('change', (e) => { mine = e.target.checked; draw() })
    el.querySelector('#new')?.addEventListener('click', () => {
      const cfg = registry.tasks
      openForm({
        title: 'New task', fields: cfg.fields, values: { status: 'todo', priority: 'medium', project_id: project || null },
        onSubmit: async (p) => { unwrap(await supabase.from('tasks').insert({ ...p, organization_id: state.org.id })); toast('Task created'); draw() },
      })
    })
    el.querySelectorAll('article[data-id]').forEach((c) => c.addEventListener('dblclick', () => (location.hash = `#/m/tasks/${c.dataset.id}`)))
    el.querySelectorAll('article[data-id]').forEach((c) => c.addEventListener('keydown', (e) => e.key === 'Enter' && (location.hash = `#/m/tasks/${c.dataset.id}`)))

    if (canEdit) {
      let dragId = null
      el.querySelectorAll('article[draggable=true]').forEach((c) => {
        c.addEventListener('dragstart', (e) => { dragId = c.dataset.id; e.dataTransfer.effectAllowed = 'move' })
      })
      el.querySelectorAll('.kanban-col').forEach((col) => {
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over') })
        col.addEventListener('dragleave', () => col.classList.remove('drag-over'))
        col.addEventListener('drop', async (e) => {
          e.preventDefault(); col.classList.remove('drag-over')
          if (!dragId) return
          const ok = await attempt(async () => unwrap(await supabase.from('tasks').update({ status: col.dataset.col }).eq('id', dragId)))
          dragId = null
          if (ok) draw()
        })
      })
    }
  }
  await draw()

  const ch = supabase.channel('tasks-board')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `organization_id=eq.${state.org.id}` }, () => draw())
    .subscribe()
  return () => supabase.removeChannel(ch)
}
