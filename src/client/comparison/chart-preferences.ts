interface ChartPreset {
  name: string;
  selected: string[];
}

const refreshedPreset = /^reference:openai-gpt-6-astra-max-(light-v1-1|deep-v1-2|writing-v1-1)$/;

export function refreshPresetKeys(keys: readonly string[], available: ReadonlySet<string>): string[] {
  return [...new Set(keys.map(key => {
    const replacement = key.replace(refreshedPreset, 'reference:openai-gpt-6.2-astra-max-$1');
    return !available.has(key) && available.has(replacement) ? replacement : key;
  }))];
}

function readStored(scope: string, preference: 'selection' | 'presets'): unknown {
  try {
    const value = localStorage.getItem(`dsh-model-coordinates:chart-${preference}:${scope}`);
    return value === null ? undefined : JSON.parse(value);
  } catch {
    return undefined;
  }
}

function writeStored(scope: string, preference: 'selection' | 'presets', value: unknown): boolean {
  try {
    localStorage.setItem(`dsh-model-coordinates:chart-${preference}:${scope}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function toKeys(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every(key => typeof key === 'string' && key.length > 0)) return undefined;
  return [...new Set<string>(value)];
}

export function readChartSelection(scope: string): string[] | undefined {
  return toKeys(readStored(scope, 'selection'));
}

export function writeChartSelection(scope: string, selected: readonly string[]): boolean {
  return writeStored(scope, 'selection', selected);
}

export function readChartPresets(scope: string): ChartPreset[] {
  const value = readStored(scope, 'presets');
  if (!Array.isArray(value)) return [];
  const presets = new Map<string, ChartPreset>();
  for (const entry of value) {
    if (typeof entry?.name !== 'string' || !entry.name.trim()) continue;
    const selected = toKeys(entry.selected);
    if (selected) presets.set(entry.name, {name: entry.name, selected});
  }
  return [...presets.values()];
}

export function writeChartPresets(scope: string, presets: readonly ChartPreset[]): boolean {
  return writeStored(scope, 'presets', presets);
}
