import { ChangeEvent } from 'react';
import { ServiceField } from '../data/services';

interface FieldRendererProps {
  field: ServiceField;
  value: string | number | boolean;
  onChange: (key: string, value: string | number | boolean) => void;
}

export function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  const handleNumber = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(field.key, Number(event.target.value));
  };

  if (field.type === 'select') {
    return (
      <label className="form-field">
        <span>{field.label}</span>
        <select value={String(value)} onChange={(event) => onChange(field.key, event.target.value)}>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === 'boolean') {
    return (
      <label className="toggle-field">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(field.key, event.target.checked)} />
        <div>
          <span>{field.label}</span>
          {field.helper && <small>{field.helper}</small>}
        </div>
      </label>
    );
  }

  return (
    <label className="form-field">
      <span>{field.label}</span>
      <input
        type="number"
        value={Number(value)}
        min={field.min}
        step={field.step ?? 1}
        onChange={handleNumber}
      />
      {field.helper && <small>{field.helper}</small>}
    </label>
  );
}
