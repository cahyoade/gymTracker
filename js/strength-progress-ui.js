const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=value=>new Intl.NumberFormat(undefined,{maximumSignificantDigits:15}).format(value);
const date=value=>new Date(value).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
const dateTime=value=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
const loggedSet=set=>`${number(set.weight)} kg × ${number(set.reps)} reps`;

export function strengthView(progress) {
  const {choices,exerciseId,metric,load,loads,series}=progress;
  const title='<h2 id="strength-title">Strength trend</h2><p class="small-text muted">Completed exercise performance across all routines.</p>';
  if(!choices.length)return `<section id="strength-progress" class="body-trend strength-progress" aria-labelledby="strength-title">${title}
    <p class="strength-empty muted">Complete a set in a workout to start a strength trend. Drafts and unperformed sets do not count.</p>
    <a class="button secondary" href="#routines">View routines</a></section>`;
  const recent=series.slice(-30),latest=series.at(-1),previous=series.at(-2);
  const value=record=>metric==='weight' ? record.set.weight : record.set.reps;
  const change=latest && previous ? value(latest)-value(previous) : null;
  const unit=metric==='weight'?'kg':'reps';
  const explanation=metric==='weight'
    ? 'One heaviest completed set per session; ties use more reps. A heavier set with fewer reps does not on its own show an increase in strength.'
    : `Most reps in one completed set at ${number(load)} kg per session. Sessions without that logged weight are left out.`;
  return `<section id="strength-progress" class="body-trend strength-progress" aria-labelledby="strength-title">${title}
    <div class="strength-controls"><label class="field">Exercise<select id="strength-exercise">${choices.map(item=>`<option value="${escape(item.id)}" ${item.id===exerciseId?'selected':''}>${escape(item.name)}${item.archived?' (archived)':''}</option>`).join('')}</select></label>
    <label class="field">Show<select id="strength-metric"><option value="weight" ${metric==='weight'?'selected':''}>Heaviest set (kg)</option><option value="reps" ${metric==='reps'?'selected':''}>Reps at a fixed weight</option></select></label>
    ${metric==='reps'?`<label class="field">Logged weight<select id="strength-load">${loads.map(weight=>`<option value="${weight}" ${weight===load?'selected':''}>${number(weight)} kg${weight===0?' (bodyweight / no added load)':''}</option>`).join('')}</select></label>`:''}</div>
    <div class="strength-result" aria-live="polite"><div class="strength-latest"><span class="muted">Latest charted set</span><strong>${escape(loggedSet(latest.set))}</strong><span class="muted">${escape(dateTime(latest.finishedAt))} · ${escape(latest.routineName)}</span></div>
    <p class="small-text muted">${change===null?'Log another matching session to compare.':`${change>0?'+':''}${number(change)} ${unit} since ${escape(date(previous.finishedAt))}.${metric==='weight'?` Reps: ${number(previous.set.reps)} → ${number(latest.set.reps)}.`:''}`}</p>
    ${strengthChart(recent,metric,load)}
    <p class="small-text muted">${explanation}</p>
    ${loads.includes(0)?'<p class="small-text muted">0 kg is the logged load; body weight is not added. Use the same load convention each time.</p>':''}
    <details class="strength-records"><summary>Charted sessions (${recent.length})</summary><table><caption class="sr-only">Exact completed sets shown in the strength chart, newest first</caption><thead><tr><th scope="col">Session</th><th scope="col">${metric==='weight'?'Heaviest set':'Most reps at this weight'}</th></tr></thead><tbody>${[...recent].reverse().map(record=>`<tr><td><time datetime="${escape(record.finishedAt)}">${escape(dateTime(record.finishedAt))}</time><span class="muted">${escape(record.routineName)}</span></td><td>${escape(loggedSet(record.set))}</td></tr>`).join('')}</tbody></table></details></div></section>`;
}

export function strengthChart(series,metric,load) {
  if(!series.length)return '';
  const values=series.map(record=>metric==='weight'?record.set.weight:record.set.reps),min=Math.min(...values),max=Math.max(...values);
  const padding=Math.max((max-min)*.15,metric==='weight'?.5:1);
  const low=Math.max(0,metric==='reps'?Math.floor(min-padding):min-padding),high=Math.min(Number.MAX_VALUE,metric==='reps'?Math.ceil(max+padding):max+padding);
  const first=Date.parse(series[0].finishedAt),last=Date.parse(series.at(-1).finishedAt);
  const points=series.map((record,index)=>({record,x:last===first?320:60+(Date.parse(record.finishedAt)-first)/(last-first)*520,
    y:high===low?105:180-(values[index]-low)/(high-low)*150}));
  const label=metric==='weight'?'Heaviest completed set (kg)':`Most reps at ${number(load)} kg`;
  return `<div class="strength-chart-block"><p class="small-text muted">${label} · Scale: ${number(low)} to ${number(high)} ${metric==='weight'?'kg':'reps'}</p>
    <svg class="strength-chart" viewBox="0 0 620 190" role="img" aria-label="${escape(label)} across ${series.length} completed session${series.length===1?'':'s'}, from ${number(values[0])} to ${number(values.at(-1))}. Exact sets are in Charted sessions below."><line x1="60" y1="180" x2="580" y2="180" class="chart-axis"/><line x1="60" y1="30" x2="60" y2="180" class="chart-axis"/>${series.length>1?`<polyline points="${points.map(point=>`${point.x},${point.y}`).join(' ')}" class="chart-line"/>`:''}${points.map(point=>`<circle cx="${point.x}" cy="${point.y}" r="4" class="chart-point"><title>${escape(dateTime(point.record.finishedAt))}: ${escape(loggedSet(point.record.set))}</title></circle>`).join('')}</svg>
    <div class="chart-dates"><span>${escape(date(series[0].finishedAt))}</span><span>${escape(date(series.at(-1).finishedAt))}</span></div>
    <p class="small-text muted">${series.length===1?'One session recorded; a second matching session will show a trend.':`Latest ${series.length} matching sessions · Horizontal axis: completion date/time. Vertical axis is scaled to these records.`}</p></div>`;
}
