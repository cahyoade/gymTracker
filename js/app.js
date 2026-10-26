import { id, now, createDraft, finishSession, lastPerformance, previousSet, sessionTotals, validateSet, validateRoutine } from './model.js';
import { readData, put, remove, snapshotFromData, markBackup, replaceData, addCatalogExercise } from './db.js';
import { validateBackup, downloadBackup, DriveBackup } from './backup.js';
import { GOOGLE_CLIENT_ID } from './config.js';
import { GoogleSignIn } from './google.js';
import { buildPersonalRecords } from './records.js';
import { recommendProgression, PROGRESSION_SOURCES } from './progression.js';
import { validateMeasurement } from './measurements.js';
import { progressView, bodyChart, measurementForm, bodyDate } from './body-progress-ui.js';
import { getThemePreference, setThemePreference, getColorPreferences, getBrightnessPreference, setColorPreferences, resetColorPreferences } from './theme.js';
import { loadCatalog } from './catalog.js';
import { catalogFilters, catalogResults, catalogDetails } from './catalog-ui.js';
import { strengthProgress } from './strength.js';
import { strengthView } from './strength-progress-ui.js';
import { createNutritionController } from './nutrition-controller.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const number = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
const date = (value, options = {}) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...options });
const dateTime = value => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not yet';
const main = $('#main');
const modal = $('#modal');
const views = ['routines', 'exercises', 'history', 'food', 'progress', 'settings'];
let data, draft = null, historyEdit = null, editor = null, pendingRestore = null;
let view = views.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'routines';
let workoutVisible = false, exerciseSearch = '', exerciseFilter = 'active', historyExercise = '';
let draftRevision = 0, savedDraftRevision = 0, autosaveTimer, toastTimer, saveError = null, saving = 0;
let installPrompt, swRegistration, updateReload = false, driveFiles = null, googleLoading = false, googleError = null;
const drive = new DriveBackup(GOOGLE_CLIENT_ID);
const googleSignIn = new GoogleSignIn(GOOGLE_CLIENT_ID, () => {
  drive.disconnect(); driveFiles = null;
  updateDriveControls();
  toast('Signed in. Enable Drive backup when you are ready.');
}, error => toast(error.message, true));
let actionBusy = false;
let googleButtonObserver;
let personalRecords = buildPersonalRecords([]);
let progressionContext = null;
let bodyMetric = 'weight', measurementLimit = 20;
let strengthState={};
const progressionIncrements = new Map();
let catalogItems=[],catalogDetailId=null;
const catalogState={query:'',bodyPart:'',equipment:'',limit:24};
const nutrition=createNutritionController({getData:()=>data,refresh,render,toast,showModal,closeModal,
  openFood:async()=>{view='food';workoutVisible=false;location.hash='food';render();window.scrollTo(0,0);}});

function toast(message, error = false) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.toggle('error', error);
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, error ? 9000 : 4500);
}
function setConnection() {
  $('#connection').textContent = navigator.onLine ? 'Local first. Ready offline.' : 'Offline · still logging';
  document.body.classList.toggle('is-offline', !navigator.onLine);
}
function savedLabel() {
  if (historyEdit) return 'Editing history · save when ready';
  if (saveError) return 'Not saved · retry before closing';
  if (saving || savedDraftRevision !== draftRevision) return 'Saving on this device…';
  return 'Saved on this device';
}
function updateSaveLabel() {
  const label = $('#save-status');
  if (label) { label.textContent = savedLabel(); label.classList.toggle('save-error', Boolean(saveError)); }
}
function touchDraft() {
  draftRevision++;
  updateSaveLabel();
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { persistDraft().catch(error => toast(error.message, true)); }, 250);
}
async function persistDraft() {
  if (!draft) return;
  const revision = draftRevision;
  if (savedDraftRevision === revision && !saveError) return;
  const snapshot = structuredClone({ ...draft, updatedAt: now() });
  saving++;
  updateSaveLabel();
  try {
    await put('sessions', snapshot);
    if (draft?.id === snapshot.id) {
      savedDraftRevision = Math.max(savedDraftRevision, revision);
      draft.updatedAt = snapshot.updatedAt;
      const index = data.sessions.findIndex(session => session.id === snapshot.id);
      if (index < 0) data.sessions.push(snapshot); else data.sessions[index] = snapshot;
      saveError = null;
    }
  } catch (error) {
    saveError = error;
    throw new Error('Your changes could not be saved. Keep this page open and retry; your inputs are still here.');
  } finally { saving--; updateSaveLabel(); }
}
async function flushDraft() {
  clearTimeout(autosaveTimer);
  await persistDraft();
  await nutrition.flush();
  // A user may have typed during the transaction. Persist the newer input too.
  if (draft && savedDraftRevision !== draftRevision) await flushDraft();
}
async function refresh() { data = await readData(); personalRecords = buildPersonalRecords(data.sessions); }
function currentSession() { return historyEdit || draft; }

function render() {
  if (!data) return;
  document.querySelectorAll('[data-view]').forEach(link => {
    const active = link.dataset.view === view;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  const resume = $('#resume-banner');
  resume.hidden = !draft || workoutVisible;
  if (!resume.hidden) resume.innerHTML = `<span><strong>${escape(draft.routineName)}</strong> is in progress.</span><button class="button small" data-action="resume">Resume workout</button>`;
  if (workoutVisible && currentSession()) renderWorkout();
  else if (view === 'routines') renderRoutines();
  else if (view === 'exercises') renderExercises();
  else if (view === 'history') renderHistory();
  else if (view === 'progress') renderProgress();
  else if (view === 'food') main.innerHTML=nutrition.render();
  else renderSettings();
  if (!modal.open) main.focus({ preventScroll: true });
}
function heading(_context, title, subtitle, action = '') {
  return `<div class="page-heading"><div><h1>${title}</h1><p class="muted">${subtitle}</p></div>${action}</div>`;
}
function empty(title, description, action = '') {
  return `<div class="empty"><h2>${title}</h2><p>${description}</p>${action}</div>`;
}
function completedSessions() { return data.sessions.filter(session => session.status === 'completed').sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt)); }

function renderRoutines() {
  const sessions = completedSessions();
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + 6) % 7);
  const thisWeek = sessions.filter(session => new Date(session.finishedAt) >= weekStart).length;
  main.innerHTML = heading('', 'Routines', 'Choose a routine to start your next workout.', '<button class="button" data-action="new-routine">+ New routine</button>') + `
    <section class="training-overview" aria-label="Training summary"><span><strong>${thisWeek}</strong> session${thisWeek === 1 ? '' : 's'} this week</span><span>Last workout: <strong>${sessions.length ? date(sessions[0].finishedAt) : 'Not recorded'}</strong></span><a href="#history">View history</a></section>
    ${data.routines.length ? `<div class="routine-grid">${data.routines.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((routine, index) => {
      const last = sessions.find(session => session.routineId === routine.id);
      return `<article class="routine-card"><div class="card-top"><span class="index-label">Routine ${index + 1}</span><button class="icon-button" data-action="edit-routine" data-id="${escape(routine.id)}" aria-label="Edit ${escape(routine.name)}">✎</button></div><h2>${escape(routine.name)}</h2><p class="card-meta">${routine.entries.length} exercises <span>·</span> ${routine.entries.reduce((sum, entry) => sum + entry.setCount, 0)} planned sets</p><div class="exercise-preview">${routine.entries.slice(0, 3).map(entry => `<span>${escape(data.exercises.find(exercise => exercise.id === entry.exerciseId)?.name || 'Archived exercise')}</span>`).join('')}${routine.entries.length > 3 ? `<span class="muted">+${routine.entries.length - 3} more</span>` : ''}</div><div class="card-bottom"><span class="small-text muted">${last ? `Last trained ${date(last.finishedAt)}` : 'Not trained yet'}</span><button class="button small" data-action="start" data-id="${escape(routine.id)}">Start workout</button></div><div class="card-tools"><button class="text-button" data-action="duplicate-routine" data-id="${escape(routine.id)}">Duplicate</button><button class="text-button" data-action="delete-routine" data-id="${escape(routine.id)}">Delete</button></div></article>`;
    }).join('')}</div>` : empty('Create your first routine', 'Use New routine to choose exercises, planned sets, and rep ranges. Your exercise history is shared across routines.')}
    <a class="collection-link" href="#exercises">View exercises</a>`;
}

function renderExercises() {
  main.innerHTML = heading('', 'Exercise collection', 'Previous sets and personal records across all routines.', '<div class="page-actions"><button class="button secondary" data-action="browse-catalog">Browse library</button><button class="button" data-action="new-exercise">+ Add exercise</button></div>') +
    `<div class="filter-bar"><label class="search-field"><span aria-hidden="true">⌕</span><input type="search" id="exercise-search" placeholder="Find an exercise…" aria-label="Search exercises" value="${escape(exerciseSearch)}"></label><div class="segmented" aria-label="Exercise status"><button data-action="exercise-filter" data-filter="active" aria-pressed="${exerciseFilter === 'active'}">Active</button><button data-action="exercise-filter" data-filter="archived" aria-pressed="${exerciseFilter === 'archived'}">Archived</button></div></div><div id="exercise-list"></div>`;
  renderExerciseList();
}
function renderExerciseList() {
  const exercises = data.exercises.filter(exercise => exercise.archived === (exerciseFilter === 'archived') && exercise.name.toLowerCase().includes(exerciseSearch.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  $('#exercise-list').innerHTML = exercises.length ? `<div class="exercise-grid">${exercises.map(exercise => {
    const previous = lastPerformance(data.sessions, exercise.id);
    const records = personalRecords.byExercise.get(exercise.id);
    return `<article class="exercise-card"><div class="exercise-card-title"><span class="category">${escape(exercise.category)}</span></div><h2>${escape(exercise.name)}</h2><p class="small-text muted">${previous ? `${previous.entry.sets.length} sets · last trained ${date(previous.session.finishedAt)}` : 'No sessions recorded yet'}</p><div class="exercise-record">${previous ? previous.entry.sets.map(set => `<span>${number(set.weight)} <small>kg</small> × ${set.reps}</span>`).join('') : '<span class="muted">No completed sets yet.</span>'}</div>${personalBest(records)}<div class="card-tools">${exercise.catalogId ? `<button class="text-button" data-action="catalog-details" data-id="${escape(exercise.catalogId)}">Instructions</button>` : ''}<button class="text-button" data-action="exercise-guidance" data-id="${escape(exercise.id)}">Next session</button><button class="text-button" data-action="exercise-records" data-id="${escape(exercise.id)}">Personal records</button><button class="text-button" data-action="exercise-history" data-id="${escape(exercise.id)}">View history</button><button class="text-button" data-action="edit-exercise" data-id="${escape(exercise.id)}">Edit</button><button class="text-button" data-action="archive-exercise" data-id="${escape(exercise.id)}">${exercise.archived ? 'Unarchive' : 'Archive'}</button></div></article>`;
  }).join('')}</div>` : empty('Nothing here yet.', exerciseSearch ? 'Try a different exercise name.' : 'Add an exercise or check the other collection.', '', '⌕');
}

function renderHistory() {
  const sessions = completedSessions().filter(session => !historyExercise || session.entries.some(entry => entry.exerciseId === historyExercise));
  main.innerHTML = heading('', 'Training history', 'Review completed sets and correct your records.') +
    `<div class="filter-bar"><label class="select-label">Filter by exercise <select id="history-exercise" aria-label="Filter by exercise"><option value="">All exercises</option>${[...data.exercises].sort((a, b) => a.name.localeCompare(b.name)).map(exercise => `<option value="${escape(exercise.id)}" ${historyExercise === exercise.id ? 'selected' : ''}>${escape(exercise.name)}${exercise.archived ? ' (archived)' : ''}</option>`).join('')}</select></label><span class="small-text muted">${sessions.length} session${sessions.length === 1 ? '' : 's'}</span></div>` +
    (sessions.length ? `<div class="history-list">${sessions.map(session => {
      const totals = sessionTotals(session);
      const achievements = (personalRecords.bySession.get(session.id) || []).filter(item => !historyExercise || item.exerciseId === historyExercise);
      return `<article class="history-card"><div class="history-date"><strong>${date(session.finishedAt, { day: '2-digit', month: undefined })}</strong><span>${date(session.finishedAt, { day: undefined, month: 'short', year: 'numeric' })}</span></div><div class="history-summary"><h2>${escape(session.routineName)}</h2><p class="muted small-text">${session.entries.length} exercises · ${totals.sets} sets · ${number(totals.volume)} kg total volume</p>${historyExercise ? `<div class="exercise-record">${session.entries.find(entry => entry.exerciseId === historyExercise).sets.map(set => `<span>Set ${set.position}: ${number(set.weight)} kg × ${set.reps}</span>`).join('')}</div>` : `<p class="history-exercises">${session.entries.map(entry => escape(entry.exerciseName)).join(' / ')}</p>`}${achievements.length ? `<div class="pr-badges"><span class="pr-badge">★ ${achievements.length} personal record${achievements.length === 1 ? '' : 's'}</span></div>` : ''}</div><button class="button secondary small" data-action="session-details" data-id="${escape(session.id)}">View session</button></article>`;
    }).join('')}</div>` : empty('No completed workouts', 'Finish a workout to see its sets here.', '<a class="button" href="#routines">View routines</a>'));
}

function renderProgress() {
  const progress=strengthProgress(data.sessions,data.exercises,strengthState);
  strengthState={exerciseId:progress.exerciseId,metric:progress.metric,load:progress.load};
  main.innerHTML = progressView(data.bodyMeasurements, bodyMetric, measurementLimit,strengthView(progress));
  $('#strength-progress').insertAdjacentHTML('afterend',nutrition.progress());
}
function updateStrength(focused) {
  const progress=strengthProgress(data.sessions,data.exercises,strengthState);
  strengthState={exerciseId:progress.exerciseId,metric:progress.metric,load:progress.load};
  $('#strength-progress').outerHTML=strengthView(progress);
  if(focused?.startsWith('strength-'))$(`#${focused}`)?.focus({preventScroll:true});
}
function openMeasurementEditor(measurementId) {
  const record = data.bodyMeasurements.find(item=>item.id===measurementId);
  showModal(modalHeader('YOUR BODY PROGRESS', record ? 'Edit measurement' : 'Add measurement') + measurementForm(record));
}
function renderWorkout() {
  const session = currentSession();
  const totals = sessionTotals(session);
  const workoutRecords = historyEdit ? buildPersonalRecords(data.sessions.filter(item => item.id !== session.id)).byExercise : personalRecords.byExercise;
  main.innerHTML = `<div class="workout-heading"><div><h1>${escape(session.routineName)}</h1><p class="muted">${date(session.startedAt, { year: 'numeric' })} <span>·</span> <span id="save-status" role="status">${savedLabel()}</span></p></div><button class="button secondary small" data-action="retry-save" ${historyEdit ? 'hidden' : ''}>Save now</button></div>
    <div class="workout-summary"><span><strong id="completed-count">${totals.sets}</strong> sets complete</span><span>${session.entries.length} exercises</span><span>Weights in kg</span></div>
    <fieldset id="workout-fields"><legend class="sr-only">Workout set records</legend>${session.entries.map((entry, entryIndex) => {
      const previous = lastPerformance(data.sessions, entry.exerciseId, session.id);
      return `<section class="workout-exercise" data-entry="${entryIndex}"><div class="workout-exercise-heading"><div><span class="index-label">${escape(data.exercises.find(exercise => exercise.id === entry.exerciseId)?.category || 'Strength')}</span><h2>${escape(entry.exerciseName)}</h2><p class="muted small-text">Target: ${entry.plannedSets} sets × ${entry.repMin}–${entry.repMax} reps${previous ? ` · Last session ${date(previous.session.finishedAt)}` : ' · No previous record'}</p></div></div>${personalBest(workoutRecords.get(entry.exerciseId))}${historyEdit ? '' : `<div data-progression-summary="${entryIndex}">${progressionSummary(entry, entryIndex)}</div>`}<div class="set-head"><span>Set</span><span>Last</span><span>kg</span><span>Reps</span><span>Done</span><span></span></div><div class="set-rows">${entry.sets.map((set, setIndex) => {
        const previousRecord = previousSet(previous, set.position);
        return `<div class="set-row ${set.completed ? 'is-complete' : ''}" data-set="${setIndex}"><span class="set-number">${set.position}</span><span class="previous-record">${previousRecord ? `<strong>${number(previousRecord.weight)} <small>kg</small></strong> <span>× ${previousRecord.reps}</span>` : 'None'}</span><input type="number" min="0" max="1000000" step="any" inputmode="decimal" data-field="weight" aria-label="${escape(entry.exerciseName)} set ${set.position} weight in kg" value="${escape(set.weight)}"><input type="number" min="1" max="999999" step="1" inputmode="numeric" data-field="reps" aria-label="${escape(entry.exerciseName)} set ${set.position} reps" value="${escape(set.reps)}"><input class="complete-checkbox" type="checkbox" data-field="completed" aria-label="${escape(entry.exerciseName)} set ${set.position} complete" ${set.completed ? 'checked' : ''}><button class="icon-button remove-set" data-action="remove-set" data-entry-index="${entryIndex}" data-set-index="${setIndex}" aria-label="Remove ${escape(entry.exerciseName)} set ${set.position}" ${entry.sets.length <= 1 ? 'disabled' : ''}>×</button></div>`;
      }).join('')}</div><button class="text-button add-set" data-action="add-set" data-entry-index="${entryIndex}" ${entry.sets.length >= 200 || Math.max(...entry.sets.map(set => set.position)) >= 200 ? 'disabled' : ''}>+ Add set</button></section>`;
    }).join('')}<section class="notes-panel"><label for="session-notes">Session notes <span class="muted">optional</span></label><textarea id="session-notes" maxlength="10000" rows="3" placeholder="How did it feel? Anything to remember next time?">${escape(session.notes)}</textarea></section></fieldset>
    <div class="workout-actions"><button class="text-button danger" data-action="${historyEdit ? 'cancel-history-edit' : 'discard-workout'}">${historyEdit ? 'Cancel changes' : 'Discard workout'}</button><button class="button" data-action="finish-workout">${historyEdit ? 'Save corrections' : 'Finish workout'} <span aria-hidden="true">✓</span></button></div><p class="small-text muted workout-footnote">Only sets marked complete become part of your performance history.</p>`;
  updateSaveLabel();
  main.focus({ preventScroll: true });
}

function renderSettings() {
  const state = data.state;
  main.innerHTML = heading('', 'Settings & backup', 'Back up your records and manage this device.') + `
    <div class="settings-grid">
      <section class="settings-card"><h2>File backup</h2>
        <p class="muted">Export routines, exercises, sessions, body measurements, foods, meals, targets and unfinished meal drafts. Import a backup to move your records to this device.</p>
        <p>Last file export: <strong>${escape(dateTime(state.lastExportAt))}</strong></p>
        <div class="button-row"><button class="button" data-action="export">Export backup</button><button class="button secondary" data-action="import">Import file</button><input type="file" accept=".json,application/json" id="import-file" hidden></div>
      </section>
      <section class="settings-card"><h2>Google Drive backup</h2>
        <p class="muted">Save a private backup for another device. Your five newest backups are kept. Uploads are always manual.</p>
        <p class="backup-state ${state.revision !== state.backedUpRevision ? 'pending' : ''}"><span class="status-dot"></span>${state.revision === state.backedUpRevision ? 'All current changes backed up to Drive' : 'Local changes are not backed up to Drive'}</p>
        <p>Last Drive backup: <strong>${escape(dateTime(state.lastDriveBackupAt))}</strong></p>
        <div id="drive-controls">${driveControls()}</div><div id="drive-files"></div>
      </section>
      <section class="settings-card"><h2>Recovery copy</h2>
        <p class="muted">Each restore keeps a recovery copy of the data it replaces on this device.</p>
        ${data.recovery ? `<p>Recovery copy: <strong>${escape(dateTime(data.recovery.restoredAt))}</strong></p><div class="button-row"><button class="button secondary" data-action="restore-recovery">Restore recovery copy</button><button class="text-button" data-action="export-recovery">Export recovery copy</button></div>` : '<p class="small-text muted">No recovery copy yet. One is created when you import or restore a backup.</p>'}
      </section>
      <section class="settings-card appearance-settings"><h2>Appearance</h2>
        <p class="muted">Choose a theme for this browser. System follows your device.</p>
        <div class="segmented theme-options" role="group" aria-label="Color theme">${['light', 'dark', 'system'].map(theme => `<button type="button" data-action="set-theme" data-theme-choice="${theme}" aria-pressed="${theme === getThemePreference()}">${theme[0].toUpperCase() + theme.slice(1)}</button>`).join('')}</div>
        <p id="theme-status" class="small-text muted" role="status"></p>
        <details id="custom-colors"><summary>Customize colors</summary>${colorControls()}</details>
      </section>
      <section class="settings-card"><h2>Offline storage</h2>
        <p class="muted">Open Form online once to cache the app. Workouts and measurements are stored on this device.</p>
        <p id="offline-status">${!('serviceWorker' in navigator) ? 'Offline installation needs HTTPS or localhost. This local network preview works while your computer is running.' : swRegistration?.active ? 'Offline app is ready on this device.' : 'Offline app cache is getting ready…'}</p>
        <p class="small-text muted">Clearing browser data removes local records. Keep a file or Drive backup.</p>
        <div class="button-row"><button class="button secondary" data-action="persistent-storage">Protect local storage</button><button class="button secondary" data-action="install" ${installPrompt ? '' : 'hidden'}>Install app</button></div><p id="storage-status" class="small-text muted"></p>
      </section>
      <section class="settings-card"><h2>Training guidance</h2>
        <p class="muted">Rep-first suggestions for muscle gain use your completed exercise history. Open Next session on an exercise to review its targets.</p>
        <button class="button secondary" data-action="progression-research">How recommendations work</button>
      </section>
    </div><div class="settings-bottom"><span class="small-text muted">Weights in kilograms · Manual backups</span></div>`;
  renderDriveFiles();
  updateThemeControls();
  mountGoogleButton();
  void prepareGoogleConnection();
}
function updateThemeControls() {
  document.querySelectorAll('[data-theme-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === getThemePreference())));
  const status = $('#theme-status');
  if (status) status.textContent = getThemePreference() === 'system' ? `Following your device · ${document.documentElement.dataset.theme} mode` : `${document.documentElement.dataset.theme === 'dark' ? 'Dark' : 'Light'} mode`;
  updateColorControls();
}
function colorControls() {
  const colors = getColorPreferences();
  const hueInputs = ['background', 'foreground'].map(key => `<div class="hue-control">
    <label for="${key}-hue">${key === 'background' ? 'Background hue' : 'Foreground hue'} <output id="${key}-hue-output" for="${key}-hue" aria-hidden="true">${colors[key]}°</output></label>
    <div class="hue-inputs"><input id="${key}-hue" type="range" min="0" max="359" step="1" value="${colors[key]}" data-color-hue="${key}" aria-valuetext="${colors[key]} degrees"><input type="number" min="0" max="359" step="1" value="${colors[key]}" data-color-hue="${key}" aria-label="${key === 'background' ? 'Background' : 'Foreground'} hue in degrees"></div>
  </div>`).join('');
  return `<div class="hue-controls">${hueInputs}
    <div class="hue-control brightness-control"><label for="background-brightness">Background brightness <output id="background-brightness-output" for="background-brightness" aria-hidden="true">${getBrightnessPreference()}%</output></label>
      <div class="hue-inputs"><input id="background-brightness" type="range" min="0" max="100" step="1" value="${getBrightnessPreference()}" data-background-brightness aria-valuetext="${getBrightnessPreference()} percent"><input type="number" min="0" max="100" step="1" value="${getBrightnessPreference()}" data-background-brightness aria-label="Background brightness in percent"></div>
    </div>
  </div><p class="small-text muted">Background tints the page and card surfaces. Foreground tints text, buttons, labels, borders, and highlights. Brightness stays within your theme’s readable range.</p>
  <div class="palette-preview" aria-label="Color preview"><span class="pr-label">Color preview</span><strong>Example set</strong><span class="muted">Sample colors, not a saved workout.</span><span class="palette-sample">42.5 kg × 8 reps</span></div>
  <button class="text-button" data-action="reset-colors">Reset colors</button>`;
}
function updateColorControls() {
  const brightness = String(getBrightnessPreference());
  document.querySelectorAll('[data-background-brightness]').forEach(input => {
    if (input.value !== brightness) input.value = brightness;
    if (input.type === 'range') input.setAttribute('aria-valuetext', `${brightness} percent`);
  });
  const brightnessOutput = $('#background-brightness-output');
  if (brightnessOutput) brightnessOutput.textContent = `${brightness}%`;
  const colors = getColorPreferences();
  document.querySelectorAll('[data-color-hue]').forEach(input => {
    const value = String(colors[input.dataset.colorHue]);
    if (input.value !== value) input.value = value;
    if (input.type === 'range') input.setAttribute('aria-valuetext', `${value} degrees`);
  });
  for (const key of ['background', 'foreground']) {
    const output = $(`#${key}-hue-output`); if (output) output.textContent = `${colors[key]}°`;
  }
}
function driveControls() {
  const profile = googleSignIn.profile;
  const account = profile ? `<div class="google-account"><span class="account-avatar" aria-hidden="true">${escape(profile.name.slice(0, 1).toUpperCase())}</span><span><strong>${escape(profile.name)}</strong><small>${escape(profile.email)}</small></span></div>` : '';
  const signOut = profile ? '<button class="text-button" data-action="google-signout">Sign out</button>' : '';
  if (!GOOGLE_CLIENT_ID) return '<button class="button secondary" disabled>Sign in with Google</button><p class="small-text muted">Google sign-in is not available yet. You can export and import backup files now.</p>';
  if (!navigator.onLine) return `${account}<p class="small-text muted">Go online to sign in, back up, or restore with Google Drive.</p>${signOut}`;
  if (googleLoading) return '<p class="small-text muted" role="status">Loading Google sign-in…</p>';
  if (googleError) return `<p class="small-text muted">${escape(googleError)}</p><button class="button secondary" data-action="google-retry">Retry Google sign-in</button>`;
  if (!profile) return '<div id="google-signin-button" class="google-signin-button"></div><p class="small-text muted">Sign in, then enable Drive backup. Uploads happen only when you choose.</p>';
  if (drive.connected) return `${account}<div class="button-row"><button class="button" data-action="drive-backup">Back up now ↥</button><button class="button secondary" data-action="drive-list">Find backups</button>${signOut}</div>`;
  return `${account}<p class="small-text muted">Allow Form to save private backups in Google Drive. Your workouts stay on this device until you back them up.</p><div class="button-row"><button class="button secondary" data-action="drive-connect">Enable Drive backup</button>${signOut}</div>`;
}
function mountGoogleButton() {
  googleButtonObserver?.disconnect();
  const container = $('#google-signin-button');
  if (!navigator.onLine || googleSignIn.profile || !googleSignIn.ready || !container) return;
  let width = container.clientWidth;
  googleSignIn.renderButton(container);
  googleButtonObserver = new ResizeObserver(() => {
    if (container.clientWidth !== width) { width = container.clientWidth; googleSignIn.renderButton(container); }
  });
  googleButtonObserver.observe(container);
}
function updateDriveControls() {
  if ($('#drive-controls')) { $('#drive-controls').innerHTML = driveControls(); mountGoogleButton(); }
  if (!googleSignIn.profile && $('#drive-files')) $('#drive-files').replaceChildren();
}
async function prepareGoogleConnection() {
  if (!GOOGLE_CLIENT_ID || !navigator.onLine || googleLoading || googleError || (googleSignIn.ready && drive.client)) return;
  googleLoading = true; updateDriveControls();
  try { await Promise.all([googleSignIn.prepare(), drive.prepare()]); }
  catch (error) { googleError = error.message; }
  finally { googleLoading = false; updateDriveControls(); }
}
function renderDriveFiles() {
  if (!$('#drive-files') || !driveFiles) return;
  $('#drive-files').innerHTML = `<div class="backup-list"><h3>Available backups</h3>${driveFiles.length ? driveFiles.map(file => `<div><span>${escape(dateTime(file.createdTime))}<small>${number(Number(file.size || 0) / 1024)} KB</small></span><button class="button secondary small" data-action="drive-restore" data-id="${escape(file.id)}">Restore</button></div>`).join('') : '<p class="small-text muted">No backups yet. Create one with “Back up now”.</p>'}</div>`;
}

function showModal(html, onClose = null) {
  $('#modal-content').innerHTML = html;
  modal.setAttribute('aria-labelledby','modal-title');
  if (!modal.open) modal.showModal();
  modal.onclose = onClose;
}
function closeModal() { modal.close(); editor = null; pendingRestore = null; }
async function openCatalog(detailId=null) {
  catalogItems=await loadCatalog();
  catalogDetailId=detailId;
  if(detailId) {
    const item=catalogItems.find(item=>item.id===detailId);
    if(!item)throw new Error('This exercise is not in the current library. Your saved records are unchanged.');
    showModal(modalHeader('',escape(item.name))+catalogDetails(item,data.exercises));
  } else {
    showModal(modalHeader('','Exercise library')+catalogFilters(catalogItems,catalogState));
    renderCatalogResults();
  }
  const title=$('#modal-title');title.tabIndex=-1;title.focus();
}
function renderCatalogResults() {
  const results=$('#catalog-results');
  if(results)results.innerHTML=catalogResults(catalogItems,data.exercises,catalogState);
}
function modalHeader(context, title, showContext = false) {
  return `<div class="modal-heading"><div><h2 id="modal-title">${title}</h2>${showContext ? `<p class="small-text muted">${escape(context)}</p>` : ''}</div><button class="icon-button" data-action="close-modal" aria-label="Close dialog">×</button></div>`;
}
function formError(error) {
  const node = modal.open ? $('#form-error') : $('#nut-error');
  if (node) { node.textContent = error.message; node.hidden = false; node.focus(); }
  else toast(error.message, true);
}
function openRoutineEditor(routineId) {
  const routine = data.routines.find(item => item.id === routineId);
  editor = routine ? structuredClone(routine) : { id: id(), name: '', entries: [], updatedAt: now() };
  showModal(modalHeader('MAKE IT YOUR OWN', routine ? 'Edit routine' : 'Build a routine') + `<form id="routine-form"><label class="field">Routine name<input id="routine-name" name="name" maxlength="120" required placeholder="e.g. Upper body A" value="${escape(editor.name)}"></label><div class="editor-section-heading"><h3>Exercises <span id="editor-count" class="count">${editor.entries.length}</span></h3><span class="muted small-text">In workout order</span></div><div id="routine-entries"></div><label class="field">Add an exercise<div class="button-row"><select id="routine-exercise" aria-label="Add an exercise"><option value="">Choose from your collection…</option></select><button type="button" class="button secondary" data-action="editor-add">+ Add</button></div></label><p class="small-text muted">Need something else? Add custom exercises from the Exercises view.</p><p id="form-error" class="form-error" role="alert" tabindex="-1" hidden></p><div class="modal-actions"><button class="button secondary" type="button" data-action="close-modal">Cancel</button><button class="button" type="submit">Save routine ✓</button></div></form>`);
  renderRoutineEntries();
}
function renderRoutineEntries() {
  $('#editor-count').textContent = editor.entries.length;
  $('#routine-entries').innerHTML = editor.entries.length ? editor.entries.map((entry, index) => `<div class="editor-entry" data-editor-index="${index}"><div class="editor-entry-title"><span class="set-number">${String(index + 1).padStart(2, '0')}</span><strong>${escape(data.exercises.find(exercise => exercise.id === entry.exerciseId)?.name || 'Archived exercise')}</strong><div><button class="icon-button" type="button" data-action="editor-up" data-index="${index}" aria-label="Move exercise up" ${index === 0 ? 'disabled' : ''}>↑</button><button class="icon-button" type="button" data-action="editor-down" data-index="${index}" aria-label="Move exercise down" ${index === editor.entries.length - 1 ? 'disabled' : ''}>↓</button><button class="icon-button" type="button" data-action="editor-remove" data-index="${index}" aria-label="Remove exercise">×</button></div></div><div class="target-fields"><label>Sets<input type="number" min="1" max="50" inputmode="numeric" required data-editor-field="setCount" value="${entry.setCount}"></label><label>Min reps<input type="number" min="1" max="999" inputmode="numeric" required data-editor-field="repMin" value="${entry.repMin}"></label><span aria-hidden="true">–</span><label>Max reps<input type="number" min="1" max="999" inputmode="numeric" required data-editor-field="repMax" value="${entry.repMax}"></label></div></div>`).join('') : '<div class="editor-empty">Add your first exercise below.</div>';
  const select = $('#routine-exercise');
  const selected = select.value;
  select.innerHTML = '<option value="">Choose an exercise…</option>' + data.exercises.filter(exercise => !exercise.archived && !editor.entries.some(entry => entry.exerciseId === exercise.id)).sort((a, b) => a.name.localeCompare(b.name)).map(exercise => `<option value="${escape(exercise.id)}">${escape(exercise.name)}</option>`).join('');
  select.value = selected;
}
function openExerciseEditor(exerciseId) {
  const exercise = data.exercises.find(item => item.id === exerciseId);
  const categories=[...new Set(['Chest','Back','Legs','Shoulders','Arms','Core','Neck','Cardio','Other',...(exercise ? [exercise.category] : [])])];
  showModal(modalHeader('', exercise ? 'Edit exercise' : 'Add an exercise') + `<form id="exercise-form" data-id="${escape(exercise?.id || '')}">
    <label class="field">Exercise name<input name="name" maxlength="120" required value="${escape(exercise?.name || '')}" placeholder="e.g. Incline dumbbell press"></label>
    <label class="field">Category<select name="category" aria-label="Category">${categories.map(category=>`<option ${exercise?.category===category?'selected':''}>${escape(category)}</option>`).join('')}</select></label>
    <p class="small-text muted">A rename updates your collection. Saved sessions keep their original exercise names.</p><p id="form-error" class="form-error" role="alert" tabindex="-1" hidden></p>
    <div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button type="submit" class="button">Save exercise ✓</button></div></form>`);
}
function sessionDetails(sessionId) {
  const session = data.sessions.find(item => item.id === sessionId);
  if (!session) return;
  const achievements = personalRecords.bySession.get(session.id) || [];
  showModal(modalHeader(dateTime(session.finishedAt), escape(session.routineName), true) + `<div class="session-detail">${session.entries.map(entry => `<section><h3>${escape(entry.exerciseName)}</h3><div class="detail-sets">${entry.sets.map(set => `<div><span>Set ${set.position}</span><div class="detail-performance"><strong>${number(set.weight)} kg × ${set.reps} reps</strong>${achievements.filter(item => item.exerciseId === entry.exerciseId && item.record.setId === set.id).map(prBadge).join('')}</div></div>`).join('')}</div></section>`).join('')}${session.notes ? `<section><h3>Session notes</h3><p class="session-note">${escape(session.notes)}</p></section>` : ''}</div><div class="modal-actions"><button class="text-button danger" data-action="delete-session" data-id="${escape(session.id)}">Delete session</button><button class="button" data-action="edit-session" data-id="${escape(session.id)}">Correct records ✎</button></div>`);
}
function prBadge(achievement) {
  return `<span class="pr-badge">★ ${achievement.kind === 'weight' ? 'Weight PR' : `Rep PR · ${number(achievement.record.weight)} kg`}</span>`;
}
function personalBest(records) {
  const best = records?.bestWeight;
  return best ? `<div class="personal-best"><span class="pr-label">PERSONAL BEST</span><strong>${number(best.weight)} kg × ${best.reps} reps</strong><small>${escape(date(best.finishedAt, { year: 'numeric' }))}</small></div>` : '';
}
function showPersonalRecords(exerciseId) {
  const exercise = data.exercises.find(item => item.id === exerciseId);
  if (!exercise) return;
  const records = personalRecords.byExercise.get(exerciseId);
  const rows = records ? [...records.repsByWeight.values()].sort((a, b) => b.weight - a.weight) : [];
  showModal(modalHeader('YOUR PERSONAL RECORDS', escape(exercise.name)) +
    `<p class="muted small-text">Your best completed sets across all routines. Heaviest weight wins; ties use more reps. Rep records compare sets at the same logged weight.</p>${personalBest(records)}${rows.length ? `<section class="pr-section"><h3>Most reps at each weight</h3><div class="pr-table"><div class="pr-table-heading"><span>Weight</span><span>Reps</span><span>Achieved</span></div>${rows.map(record => `<div><strong>${number(record.weight)} kg</strong><strong>${record.reps}</strong><span>${escape(date(record.finishedAt, { year: 'numeric' }))}</span></div>`).join('')}</div></section>` : '<div class="editor-empty">Finish a workout to establish your first records.</div>'}<p class="small-text muted pr-explanation">Only completed workouts count. Your first performance establishes a baseline; improvements earn PR badges. Log 0 kg for bodyweight rep records.</p><div class="modal-actions"><button class="button secondary" data-action="close-modal">Close</button><button class="button" data-action="exercise-history" data-id="${escape(exerciseId)}">View exercise history</button></div>`);
}
function loadIncrement(exerciseId) {
  if (progressionIncrements.has(exerciseId)) return progressionIncrements.get(exerciseId);
  let value = 2.5;
  try { const saved = Number(localStorage.getItem(`form.loadIncrement.${exerciseId}`)); if (saved >= .01 && saved <= 1000) value = saved; } catch { /* Use a session-only default. */ }
  progressionIncrements.set(exerciseId, value);
  return value;
}
const guidanceNumber = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
function progressionFor(entry) {
  return recommendProgression({ sessions: data.sessions, entry, excludeId: draft?.id, increment: loadIncrement(entry.exerciseId) });
}
function progressionSummary(entry, entryIndex) {
  const suggestion = progressionFor(entry);
  return `<aside class="progression-summary"><span class="index-label">Muscle-gain guidance</span><strong>${escape(suggestion.title)}</strong><button type="button" class="text-button" data-action="workout-guidance" data-id="${escape(entry.exerciseId)}" data-entry-index="${entryIndex}">Targets & explanation</button></aside>`;
}
function openProgression(exerciseId, entryIndex) {
  const exercise = data.exercises.find(item => item.id === exerciseId);
  if (!exercise) return;
  let entry, context;
  if (Number.isInteger(entryIndex) && draft && !historyEdit) {
    entry = draft.entries[entryIndex]; context = draft.routineName;
    if (entry?.exerciseId !== exerciseId) return;
  } else {
    const routine = data.routines.find(item => item.entries.some(item => item.exerciseId === exerciseId));
    const previous = lastPerformance(data.sessions, exerciseId);
    entry = routine?.entries.find(item => item.exerciseId === exerciseId) || previous?.entry;
    context = routine ? `Plan: ${routine.name}` : 'Plan: latest recorded session';
    if (!entry) {
      showModal(modalHeader('NEXT SESSION · MUSCLE GAIN', escape(exercise.name)) + '<p class="muted">Add this exercise to a routine to set its sets and rep range. Your first completed workout will establish a baseline.</p><div class="modal-actions"><button class="button secondary" data-action="close-modal">Close</button></div>');
      return;
    }
  }
  progressionContext = { entry };
  showModal(modalHeader('NEXT SESSION · MUSCLE GAIN', escape(exercise.name)) + `<p class="muted small-text">${escape(context)} · ${entry.plannedSets ?? entry.setCount} sets × ${entry.repMin}–${entry.repMax} reps</p><div id="progression-result" aria-live="polite"></div><label class="field progression-increment">Smallest load increase (kg)<input id="progression-increment" type="number" min="0.01" max="1000" step="any" inputmode="decimal" value="${loadIncrement(exerciseId)}"></label><p class="small-text muted">Default: 2.5 kg. Set the smallest increase your equipment supports, using the same basis as your log (per dumbbell or total bar weight). Saved for this exercise on this browser; workout backups do not include it.</p><p class="small-text muted progression-effort">Only progress with controlled technique and manageable effort. For muscle gain, leaving about 1–2 good reps in reserve is an option; you do not need to force failure. Form does not measure effort, pain, assistance, or recovery.</p><div class="modal-actions"><button class="text-button" data-action="progression-research">Research & rules</button><button class="button secondary" data-action="close-modal">Close</button></div>`, () => { progressionContext = null; });
  updateProgressionResult();
}
function updateProgressionResult() {
  if (!progressionContext || !$('#progression-result')) return;
  const suggestion = progressionFor(progressionContext.entry);
  $('#progression-result').innerHTML = `<section class="progression-detail" data-recommendation="${suggestion.kind}"><h3>${escape(suggestion.title)}</h3><p class="muted small-text">${escape(suggestion.reason)}</p>${suggestion.increasePercent ? `<p class="small-text">Available increase: <strong>${number(suggestion.increasePercent)}%</strong>. Start at the lower rep target and reassess.</p>` : ''}${suggestion.targets.length ? `<div class="progression-targets" aria-label="Suggested set targets"><div class="index-label"><span>SET</span><span>LOAD</span><span>REPS</span></div>${suggestion.targets.map(set => `<div><span>${set.position}</span><strong>${guidanceNumber(set.weight)} kg</strong><strong>${set.reps}</strong></div>`).join('')}</div><p class="small-text muted">Targets are optional. Your set inputs stay blank until you log what you actually do.</p>` : ''}${suggestion.evidence.length ? `<details class="progression-evidence"><summary>History used for this suggestion</summary>${suggestion.evidence.map(item => `<div><strong>${escape(dateTime(item.finishedAt))}</strong><span class="muted small-text">${escape(item.routineName)}</span><p class="small-text">${item.sets.map(set => `Set ${set.position}: ${guidanceNumber(set.weight)} kg × ${set.reps}`).join(' · ') || 'No valid completed sets'}</p></div>`).join('')}</details>` : ''}</section>`;
}
function showProgressionResearch() {
  progressionContext = null;
  showModal(modalHeader('EVIDENCE & APP RULES', 'Progress toward muscle gain.') + `<div class="progression-research"><p>Form uses a simple rep-first approach. It calculates suggestions on this device from completed exercise records across routines, with matching set positions, set counts and rep ranges.</p><h3>The app’s rules</h3><ol><li>With no comparable history, establish a baseline. Missing sets and changed plans do not qualify for a load increase.</li><li>Within your range, aim for one additional rep across the exercise at the same per-set loads.</li><li>At the ceiling, repeat it. After two consecutive comparable exposures with all planned sets at the ceiling and the same uniform load, consider your equipment’s smallest increase, capped at 10%, and return to the lower rep target.</li><li>Missed minimum reps prompt a review, rather than a forced increase. Mixed loading and logged 0 kg get no calculated weight increase.</li><li>After a gap over four weeks, re-establish current capacity. A gap over four weeks between confirmations also resets load-increase readiness.</li></ol><p class="small-text muted">These thresholds, the one-rep target, and the two-session rule are practical app choices, not a scientifically validated algorithm. No rule can guarantee muscle growth. Warm-up and working sets are not distinguished, so only compare consistent logging. Keep exercise variations and equipment separate in your collection.</p><h3>Research behind the approach</h3>${PROGRESSION_SOURCES.map(source => `<section><a href="${source.url}" target="_blank" rel="noopener noreferrer">${escape(source.title)} ↗</a><p class="small-text muted">${escape(source.summary)}</p></section>`).join('')}<p class="small-text muted">Reviewed 15 October 2026. Guidance is for general resistance training in healthy adults. The app does not prescribe weekly muscle-group volume, diagnose a plateau, or change your routine. Source summaries remain available offline; external papers require a connection.</p></div><div class="modal-actions"><button class="button secondary" data-action="close-modal">Close</button></div>`);
}
function previewRestore(snapshot, source) {
  pendingRestore = validateBackup(snapshot);
  const nutritionDetails=`<p>${pendingRestore.foods.length} saved foods · ${pendingRestore.foodMeals.length} logged meals · ${pendingRestore.foodDays.filter(day=>day.complete).length} complete food days${pendingRestore.foodDraft?' · includes an unfinished meal':''}</p>${snapshot.schemaVersion<3?'<p>This older backup contains no nutrition history. Restoring clears current meal history and loads the starter food collection and default targets.</p>':''}<p>Nutrition records and targets are replaced too; your current nutrition data is retained in the recovery copy.</p>`;
  const completed = snapshot.sessions.filter(session => session.status === 'completed').length;
  showModal(modalHeader('REVIEW BEFORE RESTORING', 'Bring your progress back.') + `<p class="muted">${escape(source)}</p><div class="restore-summary"><p>Exported <strong>${escape(dateTime(snapshot.exportedAt))}</strong></p><p><strong>${snapshot.exercises.length}</strong> exercises · <strong>${snapshot.routines.length}</strong> routines · <strong>${completed}</strong> completed sessions · <strong>${pendingRestore.bodyMeasurements.length}</strong> body measurements</p>${snapshot.sessions.some(session => session.status === 'draft') ? '<p>Includes an active workout draft.</p>' : ''}</div><p>This replaces the exercises, routines, history, active workout, and body measurements on this device. A backup with no body measurements clears the measurement list. Form will keep a recovery copy of your current data.</p><p id="form-error" class="form-error" role="alert" tabindex="-1" hidden></p><div class="modal-actions"><button class="button secondary" data-action="close-modal">Cancel</button><button class="button" data-action="confirm-restore">Replace & restore</button></div>`);
  $('#modal-content .restore-summary')?.insertAdjacentHTML('beforeend',nutritionDetails);
}

async function handleAction(action, button) {
  if(action.startsWith('nut-')) {await nutrition.action(action,button);return;}
  switch (action) {
    case 'new-measurement': openMeasurementEditor(); break;
    case 'edit-measurement': openMeasurementEditor(button.dataset.id); break;
    case 'more-measurements': measurementLimit += 20; renderProgress(); break;
    case 'delete-measurement': {
      const record = data.bodyMeasurements.find(item=>item.id===button.dataset.id);
      if (!record || !confirm(`Delete your body measurements for ${bodyDate(record.date)}?`)) return;
      await remove('bodyMeasurements',record.id); await refresh(); closeModal(); render(); toast('Measurement deleted.'); break;
    }
    case 'set-theme':
      if (!setThemePreference(button.dataset.themeChoice)) toast('Theme changed for this visit. Your browser could not remember the choice.', true);
      break;
    case 'reset-colors':
      if (!resetColorPreferences()) toast('Colors reset for this visit. Your browser could not remember the choice.', true);
      break;
    case 'new-routine': openRoutineEditor(); break;
    case 'edit-routine': openRoutineEditor(button.dataset.id); break;
    case 'duplicate-routine': {
      const routine = data.routines.find(item => item.id === button.dataset.id);
      await put('routines', { ...structuredClone(routine), id: id(), name: `${routine.name.slice(0, 113)} (copy)`, updatedAt: now() });
      await refresh(); render(); toast('Routine duplicated.'); break;
    }
    case 'delete-routine': {
      const routine = data.routines.find(item => item.id === button.dataset.id);
      if (!confirm(`Delete “${routine.name}”? Your workout history will be kept.`)) return;
      await remove('routines', routine.id); await refresh(); render(); toast('Routine deleted.'); break;
    }
    case 'editor-add': {
      const exerciseId = $('#routine-exercise').value;
      if (!exerciseId) throw new Error('Choose an exercise to add.');
      if (editor.entries.length >= 100) throw new Error('A routine can contain up to 100 exercises.');
      editor.entries.push({ exerciseId, setCount: 3, repMin: 8, repMax: 12 });
      renderRoutineEntries(); break;
    }
    case 'editor-remove': editor.entries.splice(Number(button.dataset.index), 1); renderRoutineEntries(); break;
    case 'editor-up': case 'editor-down': {
      const index = Number(button.dataset.index), other = index + (action === 'editor-up' ? -1 : 1);
      [editor.entries[index], editor.entries[other]] = [editor.entries[other], editor.entries[index]];
      renderRoutineEntries(); break;
    }
    case 'close-modal': closeModal(); break;
    case 'new-exercise': openExerciseEditor(); break;
    case 'browse-catalog': await openCatalog(); break;
    case 'catalog-details': await openCatalog(button.dataset.id); break;
    case 'catalog-more': {
      const previous=catalogState.limit;catalogState.limit+=24;renderCatalogResults();
      document.querySelectorAll('#catalog-results [data-action="catalog-details"]')[previous]?.focus();break;
    }
    case 'catalog-add': {
      const item=catalogItems.find(item=>item.id===button.dataset.id);
      if(!item)throw new Error('Choose an exercise from the library.');
      const result=await addCatalogExercise(item);
      await refresh();
      if(view==='exercises' && !workoutVisible)renderExercises();
      if(catalogDetailId)await openCatalog(catalogDetailId); else renderCatalogResults();
      if(!catalogDetailId)$(`#catalog-results [data-action="catalog-details"][data-id="${item.id}"]`)?.focus();
      toast(result.restored ? 'Exercise returned to your collection.' : result.added ? 'Exercise added to your collection.' : 'This exercise is already in your collection.');
      break;
    }
    case 'edit-exercise': openExerciseEditor(button.dataset.id); break;
    case 'archive-exercise': {
      const exercise = data.exercises.find(item => item.id === button.dataset.id);
      await put('exercises', { ...exercise, archived: !exercise.archived });
      await refresh(); render(); toast(exercise.archived ? 'Exercise returned to your collection.' : 'Exercise archived. History and existing routines are kept.'); break;
    }
    case 'exercise-filter': exerciseFilter = button.dataset.filter; renderExercises(); break;
    case 'exercise-history': if (modal.open) closeModal(); historyExercise = button.dataset.id; location.hash = 'history'; if (view === 'history') renderHistory(); break;
    case 'exercise-records': showPersonalRecords(button.dataset.id); break;
    case 'exercise-guidance': openProgression(button.dataset.id); break;
    case 'workout-guidance': openProgression(button.dataset.id, Number(button.dataset.entryIndex)); break;
    case 'progression-research': showProgressionResearch(); break;
    case 'start': {
      if (draft) { workoutVisible = true; render(); toast('Resume or finish your current workout before starting another.'); return; }
      const routine = data.routines.find(item => item.id === button.dataset.id);
      const newDraft = createDraft(routine, data.exercises);
      await put('sessions', newDraft);
      draft = newDraft; draftRevision = 0; savedDraftRevision = 0; saveError = null;
      workoutVisible = true; await refresh(); render(); window.scrollTo(0, 0);
      navigator.storage?.persist?.().catch(() => {}); break;
    }
    case 'resume': workoutVisible = true; render(); window.scrollTo(0, 0); break;
    case 'retry-save': await flushDraft(); toast('Workout draft saved on this device.'); break;
    case 'add-set': {
      const entry = currentSession().entries[Number(button.dataset.entryIndex)];
      const position = Math.max(...entry.sets.map(set => set.position), 0) + 1;
      if (position > 200) throw new Error('This exercise has reached the maximum number of sets.');
      entry.sets.push({ id: id(), position, weight: '', reps: '', completed: false });
      if (!historyEdit) { touchDraft(); try { await flushDraft(); } finally { renderWorkout(); } }
      else renderWorkout(); break;
    }
    case 'remove-set': {
      const entry = currentSession().entries[Number(button.dataset.entryIndex)];
      if (entry.sets.length <= 1) return;
      const index = Number(button.dataset.setIndex);
      if (entry.sets[index].completed && !confirm('Remove this completed set?')) return;
      entry.sets.splice(index, 1);
      if (!historyEdit) { touchDraft(); try { await flushDraft(); } finally { renderWorkout(); } }
      else renderWorkout(); break;
    }
    case 'finish-workout': {
      const correcting = Boolean(historyEdit);
      if (!historyEdit) await flushDraft();
      const completed = finishSession(currentSession());
      await put('sessions', completed);
      clearTimeout(autosaveTimer);
      if (!historyEdit) draft = null;
      historyEdit = null; workoutVisible = false; saveError = null;
      await refresh(); view = 'history'; location.hash = 'history'; render(); window.scrollTo(0, 0);
      const recordCount = personalRecords.bySession.get(completed.id)?.length || 0;
      toast(correcting ? 'Corrections saved. Personal records recalculated.' : recordCount ? `Session saved. ${recordCount} new personal record${recordCount === 1 ? '' : 's'}!` : 'Session saved. Keep showing up.'); break;
    }
    case 'discard-workout': {
      if (!confirm('Discard this active workout and its recorded sets?')) return;
      clearTimeout(autosaveTimer); await flushDraft(); await remove('sessions', draft.id);
      draft = null; workoutVisible = false; saveError = null; await refresh(); render(); toast('Workout discarded.'); break;
    }
    case 'session-details': sessionDetails(button.dataset.id); break;
    case 'edit-session': {
      await flushDraft();
      historyEdit = structuredClone(data.sessions.find(item => item.id === button.dataset.id));
      closeModal(); workoutVisible = true; render(); window.scrollTo(0, 0); break;
    }
    case 'cancel-history-edit': if (confirm('Discard your unsaved corrections?')) { historyEdit = null; workoutVisible = false; render(); } break;
    case 'delete-session': {
      if (!confirm('Delete this session? Previous-performance references will be recalculated.')) return;
      await remove('sessions', button.dataset.id); closeModal(); await refresh(); render(); toast('Session deleted.'); break;
    }
    case 'export': {
      await flushDraft(); await refresh();
      const snapshot = snapshotFromData(data); downloadBackup(snapshot);
      await markBackup(data.state.revision, snapshot.exportedAt, 'file'); await refresh(); renderSettings(); toast('Backup file prepared for download.'); break;
    }
    case 'import': $('#import-file').click(); break;
    case 'confirm-restore': {
      await flushDraft();
      await replaceData(validateBackup(pendingRestore));
      await refresh(); draft = data.sessions.find(session => session.status === 'draft') || null;
      nutrition.reset();
      draftRevision = savedDraftRevision = 0; historyEdit = null; saveError = null; workoutVisible = false;
      closeModal(); render(); toast('Backup restored. Your previous data is available in the recovery copy.'); break;
    }
    case 'restore-recovery': previewRestore(data.recovery.snapshot, 'Local recovery copy'); break;
    case 'export-recovery': downloadBackup(validateBackup(data.recovery.snapshot)); toast('Recovery file prepared for download.'); break;
    case 'google-retry': googleError = null; await prepareGoogleConnection(); break;
    case 'google-signout': googleSignIn.signOut(); drive.disconnect(); driveFiles = null; renderSettings(); toast('Signed out. Your local workouts are still here.'); break;
    case 'drive-connect':
      if (!googleSignIn.profile) throw new Error('Sign in with Google first.');
      await drive.connect({ accountId: googleSignIn.profile.id }); renderSettings(); toast('Drive backup enabled for this visit.'); break;
    case 'drive-backup': {
      await flushDraft(); await refresh();
      const revision = data.state.revision, snapshot = snapshotFromData(data);
      const result = await drive.upload(snapshot);
      await markBackup(revision, snapshot.exportedAt, 'drive');
      driveFiles = null; await refresh(); renderSettings();
      toast(result.cleanupWarning ? 'Backup saved and verified. Older backups could not be cleaned up this time.' : 'Google Drive backup saved and verified.'); break;
    }
    case 'drive-list': driveFiles = await drive.list(); renderDriveFiles(); break;
    case 'drive-restore': previewRestore(await drive.read(button.dataset.id,{raw:true}), 'Google Drive backup'); break;
    case 'persistent-storage': {
      const persisted = await navigator.storage?.persist?.();
      $('#storage-status').textContent = persisted ? 'Persistent storage is enabled. Backups are still recommended.' : 'The browser did not grant persistent storage. Your app still works; keep regular backups.'; break;
    }
    case 'install': {
      if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; renderSettings(); } break;
    }
  }
}

document.addEventListener('click', async event => {
  if (event.target.closest('.skip-link')) { event.preventDefault(); main.focus(); return; }
  const navigation = event.target.closest('[data-view], .brand');
  const destination = navigation?.dataset.view || 'routines';
  if (navigation && workoutVisible && location.hash === `#${destination}`) {
    event.preventDefault(); await changeView(destination); return;
  }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  event.preventDefault();
  if (actionBusy) return;
  actionBusy = true;
  button.disabled = true;
  const fields = $('#workout-fields');
  if (fields) fields.disabled = true;
  try { await handleAction(button.dataset.action, button); }
  catch (error) { formError(error); updateDriveControls(); }
  finally { actionBusy = false; if (button.isConnected) button.disabled = false; if (fields?.isConnected) fields.disabled = false; }
});

document.addEventListener('input', event => {
  const target = event.target;
  if(nutrition.input(target))return;
  if (target.hasAttribute('data-background-brightness')) {
    if (!Number.isFinite(target.valueAsNumber)) return;
    if (!setColorPreferences({ ...getColorPreferences(), brightness: target.valueAsNumber })) toast('Colors changed for this visit. Your browser could not remember the choice.', true);
    return;
  }
  if (target.dataset.colorHue) {
    if (!Number.isFinite(target.valueAsNumber)) return;
    if (!setColorPreferences({ ...getColorPreferences(), [target.dataset.colorHue]: target.valueAsNumber })) toast('Colors changed for this visit. Your browser could not remember the choice.', true);
    return;
  }
  if (target.id === 'exercise-search') { exerciseSearch = target.value; renderExerciseList(); return; }
  if (target.id === 'catalog-search') { catalogState.query=target.value; catalogState.limit=24; renderCatalogResults(); return; }
  if (target.id === 'routine-name' && editor) { editor.name = target.value; return; }
  if (target.dataset.editorField && editor) {
    editor.entries[Number(target.closest('[data-editor-index]').dataset.editorIndex)][target.dataset.editorField] = Number(target.value);
    return;
  }
  if (target.id === 'session-notes') { currentSession().notes = target.value; if (!historyEdit) touchDraft(); return; }
  if (!target.dataset.field || target.type === 'checkbox') return;
  const entry = currentSession().entries[Number(target.closest('[data-entry]').dataset.entry)];
  const set = entry.sets[Number(target.closest('[data-set]').dataset.set)];
  set[target.dataset.field] = target.value;
  // A changed set must be confirmed again, so incomplete input cannot corrupt history.
  if (set.completed) {
    set.completed = false;
    target.closest('.set-row').classList.remove('is-complete');
    target.closest('.set-row').querySelector('[data-field="completed"]').checked = false;
    $('#completed-count').textContent = sessionTotals(currentSession()).sets;
  }
  if (!historyEdit) touchDraft();
});

document.addEventListener('change', async event => {
  const target = event.target;
  if(await nutrition.change(target))return;
  if(target.id==='strength-exercise') {strengthState={exerciseId:target.value};updateStrength(target.id);return;}
  if(target.id==='strength-metric') {strengthState.metric=target.value;updateStrength(target.id);return;}
  if(target.id==='strength-load') {strengthState.load=Number(target.value);updateStrength(target.id);return;}
  if (target.id==='catalog-bodyPart' || target.id==='catalog-equipment') {
    catalogState[target.id.slice('catalog-'.length)]=target.value;catalogState.limit=24;renderCatalogResults();return;
  }
  if (target.id === 'body-metric') { bodyMetric = target.value; $('#body-chart').innerHTML = bodyChart(data.bodyMeasurements, bodyMetric); return; }
  if (target.id === 'history-exercise') { historyExercise = target.value; renderHistory(); return; }
  if (target.id === 'import-file') {
    const file = target.files[0];
    target.value = '';
    if (!file) return;
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Choose a backup smaller than 25 MB.');
      previewRestore(JSON.parse(await file.text()), `File: ${file.name}`);
    } catch (error) { toast(error.message, true); }
    return;
  }
  if (target.id === 'progression-increment') {
    if (!progressionContext) return;
    const value = target.valueAsNumber;
    if (!Number.isFinite(value) || value < .01 || value > 1000) { target.setCustomValidity('Use an available increase between 0.01 and 1000 kg.'); target.reportValidity(); return; }
    target.setCustomValidity('');
    progressionIncrements.set(progressionContext.entry.exerciseId, value);
    try { localStorage.setItem(`form.loadIncrement.${progressionContext.entry.exerciseId}`, String(value)); }
    catch { toast('Increment changed for this visit. Your browser could not remember it.', true); }
    updateProgressionResult();
    if (workoutVisible && draft && !historyEdit) draft.entries.forEach((entry, index) => {
      const summary = document.querySelector(`[data-progression-summary="${index}"]`);
      if (summary) summary.innerHTML = progressionSummary(entry, index);
    });
    return;
  }
  if (target.dataset.field !== 'completed') return;
  const set = currentSession().entries[Number(target.closest('[data-entry]').dataset.entry)].sets[Number(target.closest('[data-set]').dataset.set)];
  try {
    if (target.checked) Object.assign(set, validateSet(set));
    set.completed = target.checked;
    target.closest('.set-row').classList.toggle('is-complete', set.completed);
    $('#completed-count').textContent = sessionTotals(currentSession()).sets;
    if (!historyEdit) touchDraft();
  } catch (error) { target.checked = false; toast(error.message, true); }
});

document.addEventListener('submit', async event => {
  if (!['routine-form', 'exercise-form', 'measurement-form','nut-food-form','nut-target-form'].includes(event.target.id)) return;
  event.preventDefault();
  if (actionBusy) return;
  actionBusy = true;
  const button = event.target.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    if(event.target.id.startsWith('nut-')) {await nutrition.submit(event.target);return;}
    if (event.target.id === 'measurement-form') {
      const form = new FormData(event.target);
      const record = validateMeasurement({ id:event.target.dataset.id || id(), date:form.get('date'), weight:form.get('weight'), muscleMass:form.get('muscleMass'), bodyFat:form.get('bodyFat'), updatedAt:now() });
      if (data.bodyMeasurements.some(item=>item.id!==record.id && item.date===record.date)) throw new Error('A measurement already exists for this date. Edit that record instead.');
      await put('bodyMeasurements',record);
    } else if (event.target.id === 'routine-form') {
      const routine = validateRoutine({ ...editor, name: editor.name.trim(), updatedAt: now() }, data.exercises);
      await put('routines', routine);
    } else {
      const form = new FormData(event.target), name = form.get('name').trim();
      if (!name) throw new Error('Give your exercise a name.');
      const existing = data.exercises.find(exercise => exercise.id === event.target.dataset.id);
      await put('exercises', { ...existing, id: existing?.id || id(), name, category: form.get('category'), archived: existing?.archived || false });
    }
    await refresh(); closeModal(); render(); toast('Saved on this device.');
  } catch (error) { formError(error); }
  finally { actionBusy = false; if (button.isConnected) button.disabled = false; }
});

async function changeView(next) {
  if (historyEdit && !confirm('Discard your unsaved history corrections?')) { history.replaceState(null, '', `#${view}`); return; }
  try { await flushDraft(); await refresh(); }
  catch (error) { toast(error.message, true); history.replaceState(null, '', `#${view}`); return; }
  historyEdit = null; workoutVisible = false; view = next; render(); window.scrollTo(0, 0);
}
window.addEventListener('hashchange', async () => {
  const next = views.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'routines';
  await changeView(next);
});
window.addEventListener('online', () => { setConnection(); updateDriveControls(); if (view === 'settings' && !workoutVisible) void prepareGoogleConnection(); });
window.addEventListener('themechange', () => { updateThemeControls(); mountGoogleButton(); });
window.addEventListener('colorschange', updateColorControls);
window.addEventListener('offline', () => { setConnection(); updateDriveControls(); });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; if (view === 'settings' && !workoutVisible) renderSettings(); });
window.addEventListener('beforeunload', event => {
  if (historyEdit || saveError || saving || nutrition.dirty() || (draft && draftRevision !== savedDraftRevision)) {
    event.preventDefault(); event.returnValue = '';
  }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDraft().catch(() => {}); });

async function setupOffline() {
  if (!('serviceWorker' in navigator)) {
    if($('#offline-status'))$('#offline-status').textContent='Offline installation needs HTTPS or localhost. This local network preview works while your computer is running.';
    return;
  }
  try {
    swRegistration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    const showUpdate = () => { if (swRegistration.waiting) $('#update-banner').hidden = false; };
    showUpdate();
    swRegistration.addEventListener('updatefound', () => {
      const worker = swRegistration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(); });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateReload) location.reload(); });
    $('#apply-update').addEventListener('click', async () => {
      if (historyEdit) { toast('Save or cancel your history corrections before updating.', true); return; }
      $('#apply-update').disabled = true;
      const fields = $('#workout-fields'); if (fields) fields.disabled = true;
      try { await flushDraft(); updateReload = true; swRegistration.waiting?.postMessage({ type: 'APPLY_UPDATE' }); }
      catch (error) { toast(error.message, true); $('#apply-update').disabled = false; if (fields) fields.disabled = false; }
    });
    await navigator.serviceWorker.ready;
    if ($('#offline-status')) $('#offline-status').textContent = 'Offline app is ready on this device.';
  } catch { if ($('#offline-status')) $('#offline-status').textContent = 'Offline caching failed. Use HTTPS or localhost, then reload online.'; }
}

async function init() {
  $('#today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  setConnection();
  try {
    await refresh();
    draft = data.sessions.find(session => session.status === 'draft') || null;
    render();
    setupOffline();
    navigator.storage?.persist?.().catch(() => {});
  } catch (error) {
    main.innerHTML = empty('Your log could not open.', 'Browser storage may be unavailable. Use a normal browser window and allow storage for this site.', '<button class="button" onclick="location.reload()">Try again</button>');
    toast(error.message, true);
  }
}
init();
