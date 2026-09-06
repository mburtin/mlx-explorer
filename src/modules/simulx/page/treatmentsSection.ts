import { block, label, section } from "../../../common/mlxtran";
import { escapeHtml } from "../../../common/webview";
import { scanNamedEntries } from "../entries";

export interface Treatment {
  name: string;
  adm: string;
  schedule: string;
}

function numberList(raw: string): string[] {
  return raw.split(",").map((value) => value.trim()).filter((value) => value !== "");
}

/** Explicit dose-by-dose schedule: `times={...}, amounts={...}[, durations={...}]`. */
function explicitSchedule(body: string): string | undefined {
  const times = /times\s*=\s*\{([^{}]*)\}/.exec(body)?.[1];
  const amounts = /amounts\s*=\s*\{([^{}]*)\}/.exec(body)?.[1];
  if (times === undefined || amounts === undefined) {
    return undefined;
  }
  const durationsRaw = /durations\s*=\s*\{([^{}]*)\}/.exec(body)?.[1];

  const timeList = numberList(times);
  const amountList = numberList(amounts);
  const durationList = durationsRaw === undefined ? undefined : numberList(durationsRaw);
  if (
    timeList.length === 0 ||
    timeList.length !== amountList.length ||
    (durationList !== undefined && durationList.length !== timeList.length)
  ) {
    return undefined;
  }

  return timeList
    .map((t, i) => {
      const dose = `t=${t}: ${amountList[i]}`;
      return durationList ? `${dose} over ${durationList[i]}h` : dose;
    })
    .join("; ");
}

/** Repeated-dose schedule: `start=, interval=, nbDoses=, amount=[, duration=]`. */
function repeatedSchedule(body: string): string | undefined {
  const start = /start\s*=\s*([\d.eE+-]+)/.exec(body)?.[1];
  const interval = /interval\s*=\s*([\d.eE+-]+)/.exec(body)?.[1];
  const nbDoses = /nbDoses\s*=\s*(\d+)/.exec(body)?.[1];
  const amount = /amount\s*=\s*([\d.eE+-]+)/.exec(body)?.[1];
  if (start === undefined || interval === undefined || nbDoses === undefined || amount === undefined) {
    return undefined;
  }
  const duration = /duration\s*=\s*([\d.eE+-]+)/.exec(body)?.[1];
  const infusion = duration === undefined ? "" : `, infused over ${duration}h`;

  return `${nbDoses} doses of ${amount} every ${interval}h from t=${start}${infusion}`;
}

/**
 * `[DEFINITION] TREATMENT:` declares one `'name' = {{{...}}, adm=N}` entry per treatment, in
 * one of two shapes (explicit dose list, or repeated dosing). An entry matching neither, or
 * with mismatched array lengths, is dropped rather than shown wrong.
 */
export function readTreatments(content: string): Treatment[] {
  const simulx = section(content, "SIMULX");
  const definition = simulx === undefined ? undefined : block(simulx, "DEFINITION");
  const treatment = definition === undefined ? undefined : label(definition, "TREATMENT");
  if (treatment === undefined) {
    return [];
  }

  const treatments: Treatment[] = [];
  for (const entry of scanNamedEntries(treatment)) {
    const adm = /adm\s*=\s*(\d+)/.exec(entry.body)?.[1];
    const schedule = explicitSchedule(entry.body) ?? repeatedSchedule(entry.body);
    if (adm !== undefined && schedule !== undefined) {
      treatments.push({ name: entry.name, adm, schedule });
    }
  }

  return treatments;
}

export function renderTreatments(treatments: Treatment[]): string {
  if (treatments.length === 0) {
    return "";
  }

  const rows = treatments
    .map((t, i) => {
      const stripe = i % 2 === 1 ? ' class="alt"' : "";
      return `<tr${stripe}><td class="name">${escapeHtml(t.name)}</td>` +
        `<td class="num">${escapeHtml(t.adm)}</td><td>${escapeHtml(t.schedule)}</td></tr>`;
    })
    .join("");

  return `<section class="card">
    <details open>
      <summary class="card-head"><span class="chevron">▶</span><h2>Treatments</h2></summary>
      <table><thead><tr><th>Treatment</th><th class="num">Adm</th><th>Schedule</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </details>
  </section>`;
}
