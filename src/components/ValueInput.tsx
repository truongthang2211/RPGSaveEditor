import React, { useEffect, useState } from 'react';
import { QuantityInput } from '../styles/ItemsContentStyles';

const NUMBER = /^-?\d+(\.\d+)?$/;

interface ValueInputProps {
  /** Shown value (numbers are shown as typed back by the user). */
  value: string | number;
  mode: 'number' | 'text';
  changed: boolean;
  label: string;
  onCommit: (value: number | string) => void;
  className?: string;
}

/**
 * Text input that keeps a value's type: in number mode only valid numbers are
 * committed (an empty or partial entry isn't written and is restored on blur);
 * in text mode the text is committed as-is, even when it looks like a number.
 */
const ValueInput: React.FC<ValueInputProps> = ({ value, mode, changed, label, onCommit, className }) => {
  const shown = String(value);
  const [draft, setDraft] = useState(shown);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(shown);
  }, [shown, editing]);

  const invalid = mode === 'number' && !NUMBER.test(draft.trim());

  return (
    <QuantityInput
      className={className}
      type="text"
      inputMode={mode === 'number' ? 'numeric' : 'text'}
      value={draft}
      $changed={changed}
      aria-label={label}
      aria-invalid={invalid}
      title={invalid ? 'Enter a number' : undefined}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false);
        setDraft(shown);
      }}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        if (mode === 'text') onCommit(text);
        else if (NUMBER.test(text.trim())) onCommit(Number(text));
      }}
    />
  );
};

export default ValueInput;
