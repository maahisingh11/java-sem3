let state = null;
let settings = {station: '1067', pollutant: 'BOD', until: '', algorithm: 'BFS'};
let active_view = 'overview';
let request_number = 0;
let trace_count = 0;
let editing = null;
let deleting = null;
let saving = false;

const find = id => document.getElementById(id);
const names = {overview: 'Overview', stations: 'Stations', events: 'Pollution & analysis', history: 'Reading history'};
const titles = {overview: 'A closer look at your rivers.', stations: 'Every station, one place.', events: 'Follow up on what matters.', history: 'A record of every reading.'};
const descriptions = {
    overview: 'Review conditions, investigate events and keep your records up to date.',
    stations: 'Search, filter and select a station to review its available evidence.',
    events: 'Inspect pollution events, repeated exceedances and priority locations.',
    history: 'Review past samples, correct a reading or export the records you need.'
};

function escape_text(value) {
    return String(value ?? '').replace(/[&<>"']/g, letter => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[letter]));
}

function badge(reading) {
    const status = reading ? reading.severity : 'NO DATA';
    return '<span class="badge ' + (reading ? reading.severity : '') + '">' + status + '</span>';
}

function type_badge(reading) {
    if (!reading) return '';
    return reading.is_annual ? '<span class="badge" style="background:#e0f2fe;color:#0369a1;border-color:#bae6fd">ANNUAL</span>' : '<span class="badge" style="background:#f3e8ff;color:#6b21a8;border-color:#e9d5ff">SAMPLE</span>';
}

function date_text(time) {
    if (!time) return 'No sample';
    const s = String(time);
    if (s.length === 4 && !isNaN(Number(s))) return 'Year ' + s;
    return s.replace('T', ' ').slice(0, 16);
}

function format_value(reading) {
    if (!reading) return '—';
    if (reading.is_annual && reading.min !== undefined && reading.max !== undefined) {
        if (reading.min === reading.max) return reading.min + ' ' + (reading.unit || '');
        return reading.min + ' – ' + reading.max + ' ' + (reading.unit || '');
    }
    return reading.value + ' ' + (reading.unit || '');
}

function empty(text) {
    return '<div class="empty">' + escape_text(text) + '</div>';
}

function local_now() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

function message(text, error = false) {
    find('message').textContent = text;
    find('message').className = error ? 'error' : '';
    find('message').hidden = !text;
}

function show_view(view) {
    if (!names[view]) return;
    active_view = view;
    document.querySelectorAll('.view').forEach(section => section.hidden = section.id !== view);
    document.querySelectorAll('nav [data-view]').forEach(button => {
        button.classList.toggle('active', button.dataset.view === view);
        if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });
    find('breadcrumb').textContent = names[view];
    find('page_title').textContent = titles[view];
    find('page_description').textContent = descriptions[view];
}

async function load(changes = {}) {
    const candidate = {...settings, ...changes};
    const number = ++request_number;
    document.querySelector('main').setAttribute('aria-busy', 'true');
    try {
        const response = await fetch('/api/state?' + new URLSearchParams(candidate));
        const data = await response.json();
        if (number !== request_number) return false;
        if (!response.ok) throw new Error(data.error);
        settings = candidate;
        state = data;
        if (!find('station').options.length) {
            const options = state.stations.map(station => '<option value="' + escape_text(station.id) + '">' + escape_text(station.name) + ' (' + escape_text(station.id) + ')</option>').join('');
            find('station').innerHTML = options;
            find('new_station').innerHTML = options;
            const regions = [...new Set(state.stations.map(station => station.region))].sort();
            find('region').innerHTML = '<option value="">All regions</option>' + regions.map(region => '<option>' + escape_text(region) + '</option>').join('');
        }
        find('station').value = settings.station;
        find('pollutant').value = settings.pollutant;
        find('until').value = settings.until;
        find('algorithm').value = settings.algorithm;
        trace_count = 0;
        render();
        return true;
    } catch (error) {
        if (number === request_number) {
            find('station').value = settings.station;
            find('pollutant').value = settings.pollutant;
            find('until').value = settings.until;
            find('algorithm').value = settings.algorithm;
            message(error.message || 'Cannot reach the Java server. Keep the run window open.', true);
        }
        return false;
    } finally {
        if (number === request_number) document.querySelector('main').setAttribute('aria-busy', 'false');
    }
}

function render() {
    find('station_count').textContent = state.stations.length;
    find('abnormal').textContent = state.abnormal;
    find('event_count').textContent = state.events.length;
    find('limit').textContent = state.limit + ' ' + (state.unit || '');
    find('threshold_rule').textContent = state.rule || 'CPCB Standard';
    find('view_badge').textContent = settings.until ? 'Cutoff: ' + date_text(settings.until) : 'Latest available records';
    render_focus();
    render_overview();
    render_stations();
    render_events();
    render_history();
    render_trace();
}

function focus_station() {
    const found = state.stations.find(station => station.id === settings.station);
    return found || state.stations[0];
}

function render_focus() {
    const station = focus_station();
    find('focus_id').textContent = station.id;
    find('focus_name').textContent = station.name;
    find('focus_region').textContent = station.region + ' · Monitoring station';
    find('focus_status').innerHTML = badge(station.reading);
    find('focus_sample').textContent = settings.pollutant + ' (' + (state.rule || '') + '): ' + (station.reading ? date_text(station.reading.time) + ' · ' + format_value(station.reading) : 'No record');
    find('metrics').innerHTML = state.metrics.map(metric => '<div class="metric"><div><span>' + metric.pollutant + '</span><small>' + escape_text(metric.rule) + '</small></div><div><strong>' + format_value(metric.reading) + '</strong>' + badge(metric.reading) + '</div></div>').join('');
    let explanation = 'No record is available for ' + settings.pollutant + ' at the selected period/cutoff. Try another period or add a sample.';
    if (station.reading) {
        const is_flagged = station.reading.severity !== 'NORMAL';
        const type_str = station.reading.is_annual ? 'annual summary' : 'sample reading';
        explanation = is_flagged
            ? 'The latest available ' + settings.pollutant + ' ' + type_str + ' (' + format_value(station.reading) + ') exceeds the standard (' + state.rule + '). Trace upstream for candidate contributing reaches or downstream for potentially exposed areas.'
            : 'The latest available ' + settings.pollutant + ' ' + type_str + ' (' + format_value(station.reading) + ') is within standard limits (' + state.rule + '). Earlier pollution events may still be present in its history.';
    }
    find('focus_explanation').textContent = explanation;
}

function render_overview() {
    const stations = state.stations.filter(station => station.reading && station.reading.severity !== 'NORMAL');
    stations.sort((first, second) => second.reading.value - first.reading.value);
    find('attention').innerHTML = stations.slice(0, 4).map(station => '<button class="station_card ' + (station.id === settings.station ? 'selected' : '') + '" data-focus="' + escape_text(station.id) + '"><b>' + escape_text(station.name) + '</b><small>' + escape_text(station.region) + ' · ' + date_text(station.reading.time) + '</small><span class="card_bottom"><span class="card_value">' + format_value(station.reading) + '</span>' + badge(station.reading) + '</span></button>').join('') || empty('No station is above the selected threshold in this period.');
    find('overview_events').innerHTML = state.events.slice(0, 4).map(event_row).join('') || empty('No pollution events for this selection.');
}

function event_row(event) {
    const index = state.events.indexOf(event);
    return '<div class="event_row"><div class="event_info"><b>' + escape_text(event.station) + '</b><small>' + settings.pollutant + ' · ' + date_text(event.reading.time) + ' · ' + type_badge(event.reading) + '</small></div><div class="event_value">' + format_value(event.reading) + '<br>' + badge(event.reading) + '</div><button class="button ghost" data-event="' + index + '">Inspect</button></div>';
}

function render_stations() {
    const search = find('station_search').value.toLowerCase().trim();
    const region = find('region').value;
    const status = find('station_status').value;
    const rows = state.stations.filter(station => {
        if (search && !(station.name + ' ' + station.id + ' ' + station.region).toLowerCase().includes(search)) return false;
        if (region && station.region !== region) return false;
        if (status === 'none') return !station.reading;
        if (status === 'abnormal') return station.reading && station.reading.severity !== 'NORMAL';
        return !status || station.reading?.severity === status;
    });
    rows.sort((first, second) => {
        if (find('station_sort').value === 'risk') return (second.reading?.value ?? -1) - (first.reading?.value ?? -1);
        if (find('station_sort').value === 'date') return String(second.reading?.time || '').localeCompare(String(first.reading?.time || ''));
        return first.name.localeCompare(second.name);
    });
    find('station_matches').textContent = rows.length + ' of ' + state.stations.length;
    find('station_rows').innerHTML = rows.map(station => '<tr class="' + (station.id === settings.station ? 'selected_row' : '') + '"><td><b>' + escape_text(station.name) + '</b><small>' + escape_text(station.id + ' · ' + station.region) + '</small></td><td>' + format_value(station.reading) + ' ' + type_badge(station.reading) + '</td><td>' + badge(station.reading) + '</td><td>' + date_text(station.reading?.time) + '</td><td><button class="button ghost table_action" data-focus="' + escape_text(station.id) + '">Select</button></td></tr>').join('') || '<tr><td colspan="5">No matching stations. Try clearing the filters.</td></tr>';
}

function render_events() {
    const rows = state.events.filter(event => (find('event_scope').value === 'all' || event.id === settings.station) && (!find('event_severity').value || event.reading.severity === find('event_severity').value));
    if (find('event_sort').value === 'newest') rows.sort((a, b) => String(b.reading.time).localeCompare(String(a.reading.time)));
    if (find('event_sort').value === 'oldest') rows.sort((a, b) => String(a.reading.time).localeCompare(String(b.reading.time)));
    find('event_matches').textContent = rows.length + ' events';
    find('event_rows').innerHTML = rows.map(event_row).join('') || empty('No events match these filters.');
    find('recurring').innerHTML = state.recurring.map(row => '<div class="event_row"><div class="event_info"><b>' + escape_text(row.name) + '</b><small>' + settings.pollutant + ' exceeded across multiple reporting periods</small></div><span class="count_label">' + row.days + ' periods</span><button class="button ghost" data-focus="' + escape_text(row.id) + '" data-history="yes">Review</button></div>').join('') || empty('No repeated exceedances across reporting periods in this cutoff.');
    find('critical').innerHTML = state.critical.map(row => '<div class="event_row"><div class="event_info"><b>' + escape_text(row.name) + '</b><small>' + escape_text(row.type) + '</small></div><span class="count_label">Score ' + row.score.toFixed(2) + '</span>' + (state.stations.some(station => station.id === row.id) ? '<button class="button ghost" data-focus="' + escape_text(row.id) + '">Select</button>' : '') + '</div>').join('') || empty('No location has a priority score above 1.0.');
}

function history_rows() {
    const search = find('history_search').value.toLowerCase().trim();
    const status = find('history_status').value;
    return state.history.filter(reading => {
        if (search && !String(reading.time).toLowerCase().includes(search) && !(reading.source || '').toLowerCase().includes(search)) return false;
        if (status && reading.severity !== status) return false;
        return true;
    }).slice().reverse();
}

function render_history() {
    const rows = history_rows();
    find('history_title').textContent = focus_station().name + ' · ' + settings.pollutant;
    find('replay_label').textContent = settings.until ? 'Cutoff: ' + date_text(settings.until) : 'Latest available records';
    find('history_rows').innerHTML = rows.map(reading => '<tr><td>' + date_text(reading.time) + '</td><td>' + format_value(reading) + '</td><td>' + type_badge(reading) + '</td><td>' + badge(reading) + '</td><td><button class="button ghost table_action" data-edit="' + state.history.indexOf(reading) + '">Edit</button><button class="text_button table_action delete_action" data-delete="' + state.history.indexOf(reading) + '">Delete</button></td></tr>').join('') || '<tr><td colspan="5">No records match this time and these filters.</td></tr>';
    find('history_count').textContent = rows.length + ' of ' + state.history.length + ' available records shown.';
    find('previous').disabled = !state.times.length || (settings.until && !state.times.some(time => time < settings.until));
    find('next').disabled = !state.times.length || (settings.until && !state.times.some(time => time > settings.until));
}

function render_trace() {
    const direction = find('trace_direction').value;
    const rows = state[direction];
    trace_count = Math.min(trace_count, rows.length);
    find('trace_title').textContent = 'Trace from ' + focus_station().name;
    find('trace_summary').textContent = rows.length + ' connected locations · ' + direction + ' · ' + settings.algorithm;
    find('algorithm_explanation').textContent = settings.algorithm === 'BFS' ? 'Breadth-first search visits nearer connections before moving farther away.' : 'Depth-first search follows one branch before returning to explore another.';
    find('trace_progress').textContent = trace_count + ' of ' + rows.length + ' shown';
    find('trace_next').disabled = trace_count >= rows.length;
    find('trace_all').disabled = trace_count >= rows.length;
    find('trace_list').innerHTML = rows.slice(0, trace_count).map((node, index) => '<li><b>' + (index + 1) + '. ' + escape_text(node.name) + '</b>' + (node.type === 'Monitoring station' ? badge(node.reading) : '') + '<small>' + escape_text(node.type + ' · ' + node.region) + (node.reading ? ' · ' + format_value(node.reading) + ' · ' + date_text(node.reading.time) : '') + '</small></li>').join('');
    find('trace_note').textContent = !rows.length ? 'There are no connected locations in this direction.' : trace_count === 0 ? 'Select Show next step to inspect the Java traversal order, or Show all for the complete list.' : 'The starting station is excluded. Reading evidence respects the current historical cutoff.';
}

function open_trace() {
    if (!state) return;
    trace_count = 0;
    render_trace();
    find('trace_dialog').showModal();
}

async function step(direction) {
    if (!state || !state.times.length) return;
    let index = -1;
    if (!settings.until) index = direction > 0 ? 0 : state.times.length - 1;
    else if (direction > 0) index = state.times.findIndex(time => time > settings.until);
    else for (let i = 0; i < state.times.length; i++) if (state.times[i] < settings.until) index = i;
    if (index < 0) return;
    await load({until: state.times[index]});
}

function open_reading(index = null) {
    if (!state) return;
    editing = index === null ? null : {...state.history[index], station: settings.station};
    find('reading_form').reset();
    find('new_station').value = editing ? editing.station : settings.station;
    find('new_pollutant').value = editing ? editing.pollutant : settings.pollutant;
    find('new_station').disabled = !!editing;
    find('new_pollutant').disabled = !!editing;
    find('new_value').value = editing ? editing.value : '';
    find('new_time').value = editing ? editing.time : local_now();
    find('reading_title').textContent = editing ? 'Edit a reading' : 'Add a reading';
    find('form_message').textContent = '';
    update_unit_hint();
    find('reading_dialog').showModal();
}

function update_unit_hint() {
    const pol = find('new_pollutant').value;
    const units = {BOD: 'mg/L', DO: 'mg/L', PH: 'pH', FC: 'MPN/100 mL'};
    find('new_value_label').childNodes[0].textContent = 'Value (' + (units[pol] || '') + ') ';
}

async function post(path, values) {
    const response = await fetch(path, {method: 'POST', body: new URLSearchParams(values)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
}

async function save_reading(event) {
    event.preventDefault();
    if (saving) return;
    saving = true;
    find('save_reading').disabled = true;
    find('form_message').textContent = '';
    const values = {station: find('new_station').value, pollutant: find('new_pollutant').value, value: find('new_value').value, time: find('new_time').value};
    if (editing) {
        values.old_time = editing.time;
        values.old_value = editing.value;
    }
    try {
        const data = await post(editing ? '/api/update' : '/api/readings', values);
        find('reading_dialog').close();
        message(data.message);
        await load({station: values.station, pollutant: values.pollutant, until: ''});
        show_view('history');
    } catch (error) {
        find('form_message').textContent = error.message;
    } finally {
        saving = false;
        find('save_reading').disabled = false;
    }
}

function open_delete(index) {
    if (!state) return;
    deleting = {...state.history[index], station: settings.station};
    find('delete_summary').textContent = focus_station().name + ' · ' + deleting.pollutant + ' · ' + format_value(deleting) + ' · ' + date_text(deleting.time);
    find('delete_message').textContent = '';
    find('delete_dialog').showModal();
}

async function delete_reading() {
    if (!deleting || saving) return;
    saving = true;
    find('confirm_delete').disabled = true;
    try {
        const data = await post('/api/delete', {station: deleting.station, pollutant: deleting.pollutant, old_time: deleting.time, old_value: deleting.value});
        find('delete_dialog').close();
        message(data.message);
        await load();
    } catch (error) {
        find('delete_message').textContent = error.message;
    } finally {
        saving = false;
        find('confirm_delete').disabled = false;
    }
}

function clear_history() {
    find('history_search').value = '';
    find('history_status').value = '';
    if (state) render_history();
}

function export_history() {
    if (!state) return;
    const rows = ['station,pollutant,value,min_value,max_value,time,type,severity,source'];
    for (const reading of history_rows()) {
        rows.push([
            settings.station,
            reading.pollutant,
            reading.value,
            reading.min ?? reading.value,
            reading.max ?? reading.value,
            reading.time,
            reading.is_annual ? 'ANNUAL' : 'SAMPLE',
            reading.severity,
            reading.source || ''
        ].join(','));
    }
    const url = URL.createObjectURL(new Blob([rows.join('\n')], {type: 'text/csv'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = settings.station + '_' + settings.pollutant + '_history.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.view) show_view(button.dataset.view);
    if (button.hasAttribute('data-add')) open_reading();
    if (button.dataset.close && !saving) find(button.dataset.close).close();
    if (button.dataset.focus && state) {
        message('');
        if (await load({station: button.dataset.focus}) && button.dataset.history) {
            clear_history();
            show_view('history');
        }
    }
    if (button.dataset.event !== undefined && state) {
        const selected = state.events[Number(button.dataset.event)];
        if (await load({station: selected.id, until: String(selected.reading.time)})) {
            clear_history();
            show_view('history');
            message('Inspecting ' + selected.station + ' at ' + date_text(selected.reading.time) + '. Use Return to latest when finished.');
        }
    }
    if (button.dataset.edit !== undefined && state) open_reading(Number(button.dataset.edit));
    if (button.dataset.delete !== undefined && state) open_delete(Number(button.dataset.delete));
});

find('station').addEventListener('change', () => load({station: find('station').value}));
find('pollutant').addEventListener('change', () => load({pollutant: find('pollutant').value}));
find('new_pollutant').addEventListener('change', update_unit_hint);
find('apply_time').addEventListener('click', () => { message(''); load({until: find('until').value}); });
find('latest').addEventListener('click', () => { message(''); load({until: ''}); });
find('refresh').addEventListener('click', () => { message(''); load(); });
for (const id of ['station_search', 'region', 'station_status', 'station_sort']) find(id).addEventListener('input', () => { if (state) render_stations(); });
for (const id of ['event_scope', 'event_severity', 'event_sort']) find(id).addEventListener('change', () => { if (state) render_events(); });
find('history_search').addEventListener('input', () => { if (state) render_history(); });
find('history_status').addEventListener('change', () => { if (state) render_history(); });
find('clear_history').addEventListener('click', clear_history);
find('open_trace').addEventListener('click', open_trace);
find('try_trace').addEventListener('click', async () => { if (await load({station: '1067'})) open_trace(); });
find('trace_direction').addEventListener('change', () => { trace_count = 0; if (state) render_trace(); });
find('algorithm').addEventListener('change', () => load({algorithm: find('algorithm').value}));
find('trace_next').addEventListener('click', () => { trace_count++; render_trace(); });
find('trace_all').addEventListener('click', () => { trace_count = state[find('trace_direction').value].length; render_trace(); });
find('trace_reset').addEventListener('click', () => { trace_count = 0; render_trace(); });
find('previous').addEventListener('click', () => step(-1));
find('next').addEventListener('click', () => step(1));
find('reading_form').addEventListener('submit', save_reading);
find('confirm_delete').addEventListener('click', delete_reading);
find('export').addEventListener('click', export_history);
for (const id of ['reading_dialog', 'delete_dialog']) find(id).addEventListener('cancel', event => { if (saving) event.preventDefault(); });
load();
