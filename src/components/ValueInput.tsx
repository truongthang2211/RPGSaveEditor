import React, { useEffect, useState } from 'react';
import { QuantityInput } from '../styles/ItemsContentStyles';

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
const INTEGER = /^[-+]?\d+$/;

interface ValueInputProps {
  /** Shown value (numbers are shown as typed back by the user). */
  value: string | number;
  mode: 'number' | 'text';
  /** In number mode, accept whole numbers only (e.g. Ruby Integer fields). */
  integer?: boolean;
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
const ValueInput: React.FC<ValueInputProps> = ({ value, mode, integer, changed, label, onCommit, className }) => {
  const shown = String(value);
  const [draft, setDraft] = useState(shown);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(shown);
  }, [shown, editing]);

  const valid = (text: string) => (integer ? INTEGER : NUMBER).test(text.trim());
  const invalid = mode === 'number' && !valid(draft);

  return (
    <QuantityInput
      className={className}
      type="text"
      inputMode={mode === 'number' ? (integer ? 'numeric' : 'decimal') : 'text'}
      value={draft}
      $changed={changed}
      aria-label={label}
      aria-invalid={invalid}
      title={invalid ? (integer ? 'Enter a whole number' : 'Enter a number') : undefined}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false);
        setDraft(shown);
      }}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        if (mode === 'text') onCommit(text);
        else if (valid(text)) onCommit(Number(text));
      }}
    />
  );
};

export default ValueInput;
