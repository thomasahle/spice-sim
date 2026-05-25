// Numeric value input paired with a SPICE-unit dropdown.
//
// Visual: [ 1.5    ] [ kΩ ▾ ]
//
// The component is "uncontrolled" w.r.t. the magnitude field — local state
// holds what the user is typing so we can split a SPICE-style "10k" typed
// directly into the box into magnitude="10" + prefix="k" only on blur, not
// on every keystroke. Doc state remains the single source of truth via the
// `value` / `onChange` props.

import { useEffect, useRef, useState } from "react";
import {
  formatValueUnit,
  isComplexValue,
  parseValueUnit,
  type UnitFamily,
} from "./valueUnits.ts";

interface Props {
  value: string;
  onChange: (next: string) => void;
  family: UnitFamily;
  placeholder?: string;
  inputId?: string;
  ariaLabel?: string;
  /** Disable both controls (e.g. while a complex source spec is set). */
  disabled?: boolean;
}

export function ValueWithUnit({
  value,
  onChange,
  family,
  placeholder,
  inputId,
  ariaLabel,
  disabled,
}: Props) {
  const parsed = parseValueUnit(value, family);
  const [magnitude, setMagnitude] = useState(parsed.magnitude);
  const [prefix, setPrefix] = useState(parsed.prefix);
  // Track the doc value we last reflected so external updates win, but a
  // pending in-flight edit isn't clobbered by our own onChange round-trip.
  const lastEchoed = useRef(value);

  useEffect(() => {
    if (value === lastEchoed.current) return;
    const next = parseValueUnit(value, family);
    setMagnitude(next.magnitude);
    setPrefix(next.prefix);
    lastEchoed.current = value;
  }, [value, family]);

  function commit(nextMagnitude: string, nextPrefix: string) {
    const out = formatValueUnit(nextMagnitude, nextPrefix);
    lastEchoed.current = out;
    onChange(out);
  }

  function onMagnitudeChange(next: string) {
    setMagnitude(next);
    commit(next, prefix);
  }

  function onMagnitudeBlur() {
    // If the user typed a SPICE-style "10k" directly into the number box,
    // pull the prefix into the dropdown so the number field is a clean
    // magnitude again. Trigger whenever the reparsed magnitude differs
    // from what's in the box — the user typed something like "2.2k"
    // even when the dropdown was already on "k" used to leave the trailing
    // letter sitting in the number input.
    if (isComplexValue(magnitude)) return;
    const reparsed = parseValueUnit(magnitude, family);
    const needsSnap =
      reparsed.magnitude !== magnitude.trim() ||
      (reparsed.prefix && reparsed.prefix !== prefix);
    if (needsSnap) {
      setMagnitude(reparsed.magnitude);
      setPrefix(reparsed.prefix);
      commit(reparsed.magnitude, reparsed.prefix);
    }
  }

  function onPrefixChange(next: string) {
    setPrefix(next);
    commit(magnitude, next);
  }

  return (
    <div className="value-with-unit">
      <input
        id={inputId}
        className="value-input value-with-unit-magnitude"
        value={magnitude}
        onChange={(e) => onMagnitudeChange(e.target.value)}
        onBlur={onMagnitudeBlur}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
      />
      {family.options.length > 1 ? (
        <select
          className="value-input value-with-unit-select"
          value={prefix}
          onChange={(e) => onPrefixChange(e.target.value)}
          disabled={disabled}
          aria-label={ariaLabel ? `${ariaLabel} unit` : "Unit"}
        >
          {family.options.map((opt) => (
            <option key={opt.prefix} value={opt.prefix}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : family.base ? (
        <span className="value-with-unit-static" aria-hidden="true">
          {family.options[0]?.label ?? family.base}
        </span>
      ) : null}
    </div>
  );
}
