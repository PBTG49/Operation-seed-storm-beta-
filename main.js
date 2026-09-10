const DATA_URL = 'data/data.json';

async function loadData() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error('Data file could not be loaded');
    return await response.json();
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function setYear() {
  document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
}

function initRegionMap(data) {
  const detail = document.getElementById('regionDetail');
  if (!detail || !data?.regions) return;
  document.querySelectorAll('.region-pin').forEach(pin => {
    pin.addEventListener('click', () => {
      const region = data.regions[pin.dataset.region];
      if (!region) return;
      document.querySelectorAll('.region-pin').forEach(p => p.classList.remove('selected'));
      pin.classList.add('selected');
      detail.className = 'region-detail';
      detail.innerHTML = `
        <span class="detail-number">${region.code}</span>
        <h2>${region.name}</h2>
        <p>${region.summary}</p>
        <div class="condition-list">${region.conditions.map(x => `<span>${x}</span>`).join('')}</div>
        <a class="text-link" href="guides.html#${pin.dataset.region}">View planting guide →</a>
      `;
    });
  });
}

function renderGuides(data) {
  const target = document.getElementById('guideContent');
  if (!target || !data?.regions) return;
  const tabs = document.querySelectorAll('.guide-tab');
  const render = key => {
    const region = data.regions[key];
    if (!region) return;
    target.innerHTML = `
      <div class="guide-head"><div><span class="detail-number">${region.code}</span><h2>${region.name}</h2><p>${region.summary}</p></div><div class="guide-meta"><span>REGION PROFILE</span><strong>V1 PLACEHOLDER</strong></div></div>
      <div class="guide-columns">
        <div class="guide-column"><span class="tile-label">CONDITIONS</span><div class="condition-list big">${region.conditions.map(x => `<span>${x}</span>`).join('')}</div></div>
        <div class="guide-column"><span class="tile-label">RECOMMENDED</span><ul>${region.recommended.map(x => `<li>${x}</li>`).join('')}</ul></div>
        <div class="guide-column"><span class="tile-label">AVOID</span><ul class="avoid-list">${region.avoid.map(x => `<li>${x}</li>`).join('')}</ul></div>
      </div>
      <div class="steps"><span class="tile-label">PLANTING FLOW</span><div class="steps-grid">${region.steps.map((x,i)=>`<div class="step"><span>0${i+1}</span><p>${x}</p></div>`).join('')}</div></div>
    `;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.guide === key));
  };
  tabs.forEach(tab => tab.addEventListener('click', () => render(tab.dataset.guide)));
  const hash = location.hash.replace('#', '');
  render(data.regions[hash] ? hash : 'lowland-tropics');
}

function renderProjects(data) {
  const grid = document.getElementById('projectGrid');
  if (!grid || !data?.projects) return;
  grid.innerHTML = data.projects.map((project, index) => `
    <article class="project-card"><div class="project-top"><span>0${index+1}</span><b>${project.status}</b></div><div class="project-map-mark"><i></i><i></i><i></i></div><div class="project-content"><span class="tile-label">${project.region}</span><h3>${project.name}</h3><p>${project.description}</p><div class="project-bottom"><strong>${project.plants}</strong><span>reported plants</span></div></div></article>
  `).join('');
}

function renderStats(data) {
  if (!data?.stats) return;
  Object.entries(data.stats).forEach(([key, value]) => {
    const el = document.querySelector(`[data-stat="${key}"]`);
    if (el) el.textContent = key === 'verified' ? `${value}%` : Number(value).toLocaleString();
  });
}

function initForm() {
  const form = document.getElementById('plantingForm');
  const message = document.getElementById('formMessage');
  if (!form || !message) return;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const formData = Object.fromEntries(new FormData(form).entries());
    localStorage.setItem('rootline-last-report', JSON.stringify({ ...formData, savedAt: new Date().toISOString() }));
    message.classList.add('show');
    message.innerHTML = `<strong>Saved locally.</strong> Your browser stored this V1 demo report. Nothing was sent to a server.`;
    form.reset();
  });
}

setYear();
loadData().then(data => {
  initRegionMap(data);
  renderGuides(data);
  renderProjects(data);
  renderStats(data);
});
initForm();
