import * as React from 'react';
import {readChartPresets, refreshPresetKeys, writeChartPresets} from '../../comparison/chart-preferences.ts';
import {modelName, rowSourceLabel, type ComparisonRow} from '../../comparison/model.ts';
import {Checkbox, TextInput} from '../../primitives/primitives.tsx';
import {Button, Modal} from '../../ui.tsx';
import {PresetTag} from '../DataReadout.tsx';

interface Props {
  scope: string;
  rows: ComparisonRow[];
  selected: readonly string[];
  onApply(keys: string[]): void;
  onClose(): void;
}

const controlNames: Record<string, string> = {temperature: '温度', maxTokens: '最大 Token', reasoningEffort: '推理强度'};

function describe(row: ComparisonRow): string {
  const controls = Object.entries(row.target.controls).flatMap(([key, parameter]) => {
    if (parameter?.state !== 'known') return [];
    const value = typeof parameter.value === 'string' ? parameter.value : JSON.stringify(parameter.value);
    return [`${controlNames[key] ?? key} ${value}`];
  });
  return [rowSourceLabel(row), ...controls].join(' · ');
}

export function ChartSelectionDialog({scope, rows, selected, onApply, onClose}: Props) {
  const [draft, setDraft] = React.useState(() => new Set(selected));
  const [query, setQuery] = React.useState('');
  const [name, setName] = React.useState('');
  const [presets, setPresets] = React.useState(() => readChartPresets(scope));
  const [feedback, setFeedback] = React.useState('');
  const nameInput = React.useRef<HTMLInputElement>(null);
  const entries = React.useMemo(() => {
    const occurrences = new Map<string, number>();
    const entries = rows.map(row => {
      const title = modelName(row);
      const details = describe(row);
      const identity = JSON.stringify([title, details]);
      occurrences.set(identity, (occurrences.get(identity) ?? 0) + 1);
      return {row, title, details, identity};
    });
    const seen = new Map<string, number>();
    return entries.map(({identity, ...entry}) => {
      const index = (seen.get(identity) ?? 0) + 1;
      seen.set(identity, index);
      return {
        ...entry,
        details: (occurrences.get(identity) ?? 0) > 1 ? `${entry.details} · 配置 ${index}` : entry.details,
      };
    });
  }, [rows]);
  const search = query.trim().toLocaleLowerCase();
  const matches = entries.filter(({row, title, details}) =>
    [title, details, row.target.modelId, row.target.providerId].some(value => value.toLocaleLowerCase().includes(search)));
  const selectedCount = rows.reduce((total, row) => total + Number(draft.has(row.configKey)), 0);
  const matchedCount = matches.reduce((total, {row}) => total + Number(draft.has(row.configKey)), 0);
  const allSelected = selectedCount === rows.length && draft.size === rows.length;

  function setChecked(keys: string[], checked: boolean) {
    setDraft(previous => {
      const next = new Set(previous);
      for (const key of keys) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  function savePreset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = name.trim();
    if (!label) return;
    const latest = readChartPresets(scope);
    if (latest.some(preset => preset.name === label)) {
      setFeedback('已有同名方案，请换一个名称。');
      return;
    }
    const next = [...latest, {name: label, selected: [...draft]}];
    if (!writeChartPresets(scope, next)) {
      setFeedback('保存失败，请检查本机存储是否可用。');
      return;
    }
    setPresets(next);
    setName('');
    setFeedback(`已保存「${label}」。`);
    nameInput.current?.focus();
  }

  function removePreset(label: string) {
    const next = readChartPresets(scope).filter(preset => preset.name !== label);
    if (!writeChartPresets(scope, next)) {
      setFeedback('删除失败，请检查本机存储是否可用。');
      return;
    }
    setPresets(next);
    setFeedback(`已删除「${label}」。`);
    nameInput.current?.focus();
  }

  return <Modal title="选择图表配置" variant="chart-picker" onClose={onClose}>
    <div className="me-chart-picker">
      <div className="me-chart-picker-search">
        <TextInput type="search" aria-label="搜索图表配置" placeholder="搜索模型、来源或参数"
          value={query} onChange={event => setQuery(event.currentTarget.value)}/>
      </div>
      <div className="me-chart-picker-actions">
        <span role="status">已选 {selectedCount} / {rows.length}{search ? ` · 匹配 ${matches.length}` : ''}</span>
        <Button kind="text" aria-disabled={matchedCount === matches.length}
          onClick={() => {if(matchedCount !== matches.length)setChecked(matches.map(({row}) => row.configKey), true);}}>全选匹配</Button>
        <Button kind="text" aria-disabled={matchedCount === 0}
          onClick={() => {if(matchedCount !== 0)setChecked(matches.map(({row}) => row.configKey), false);}}>取消匹配</Button>
        <Button kind="text" aria-disabled={allSelected}
          onClick={() => {if(!allSelected)setDraft(new Set(rows.map(row => row.configKey)));}}>恢复全部</Button>
      </div>
      <ul className="me-chart-picker-list" aria-label="图表配置">
        {matches.map(({row, title, details}) => <li key={row.configKey}>
          <label className="me-chart-picker-row">
            <Checkbox checked={draft.has(row.configKey)}
              onChange={event => setChecked([row.configKey], event.currentTarget.checked)}/>
            <span className="me-chart-picker-identity">
              <span className="me-preset-name"><strong>{title}</strong>{row.reference&&<PresetTag/>}</span>
              <small>{details}</small>
            </span>
          </label>
        </li>)}
        {!matches.length && <li className="me-chart-picker-feedback">没有匹配的图表配置。</li>}
      </ul>
      <section className="me-chart-picker-presets" aria-label="图表配置方案">
        <form className="me-chart-picker-preset" onSubmit={savePreset}>
          <TextInput ref={nameInput} aria-label="方案名称" placeholder="方案名称" value={name} maxLength={64}
            onChange={event => setName(event.currentTarget.value)}/>
          <Button type="submit" disabled={!name.trim()}>保存方案</Button>
        </form>
        {presets.map(preset => <div className="me-chart-picker-preset" key={preset.name}>
          <span>{preset.name}</span>
          <Button kind="text" aria-label={`载入 ${preset.name}`} onClick={() => {
            setDraft(new Set(refreshPresetKeys(preset.selected, new Set(rows.map(row=>row.configKey)))));
            setFeedback(`已载入「${preset.name}」。`);
          }}>载入</Button>
          <Button kind="text" aria-label={`删除 ${preset.name}`} onClick={() => removePreset(preset.name)}>删除</Button>
        </div>)}
        {feedback && <p className="me-chart-picker-feedback" role="status">{feedback}</p>}
      </section>
    </div>
    <footer className="me-chart-picker-footer">
      <Button onClick={onClose}>取消</Button>
      <Button kind="primary" onClick={() => onApply([...draft])}>应用</Button>
    </footer>
  </Modal>;
}
