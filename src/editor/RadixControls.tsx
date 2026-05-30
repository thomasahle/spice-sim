import * as Checkbox from "@radix-ui/react-checkbox";
import * as Select from "@radix-ui/react-select";
import * as Toggle from "@radix-ui/react-toggle";
import type { ReactNode } from "react";

export interface SelectFieldOption {
  value: string;
  label: string;
  title?: string;
}

const RADIX_SELECT_EMPTY_VALUE = "__spicesim_select_empty__";
const RADIX_SELECT_VALUE_PREFIX = "__spicesim_select_value__:";

function encodeRadixSelectValue(value: string): string {
  return value === "" ? RADIX_SELECT_EMPTY_VALUE : `${RADIX_SELECT_VALUE_PREFIX}${value}`;
}

function decodeRadixSelectValue(value: string): string {
  if (value === RADIX_SELECT_EMPTY_VALUE) return "";
  if (value.startsWith(RADIX_SELECT_VALUE_PREFIX)) {
    return value.slice(RADIX_SELECT_VALUE_PREFIX.length);
  }
  return value;
}

export function SelectField({
  value,
  onValueChange,
  options,
  ariaLabel,
  disabled = false,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectFieldOption[];
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select.Root
      value={encodeRadixSelectValue(value)}
      onValueChange={(nextValue) => onValueChange(decodeRadixSelectValue(nextValue))}
      disabled={disabled}
    >
      <Select.Trigger
        className={`value-input radix-select-trigger${className ? ` ${className}` : ""}`}
        aria-label={ariaLabel}
        value={value}
        data-value={value}
      >
        <Select.Value />
        <Select.Icon className="radix-select-icon" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 4.5 6 7.5 9 4.5" />
          </svg>
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="radix-select-content" position="popper" sideOffset={4}>
          <Select.Viewport className="radix-select-viewport">
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={encodeRadixSelectValue(option.value)}
                className="radix-select-item"
                title={option.title}
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="radix-select-indicator">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="m2.5 6.2 2.2 2.1 4.8-4.8" />
                  </svg>
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function CheckboxField({
  checked,
  onCheckedChange,
  children,
  ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <label className="checkbox-row">
      <Checkbox.Root
        className="radix-checkbox-root"
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-label={ariaLabel}
      >
        <Checkbox.Indicator className="radix-checkbox-indicator">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
            <path d="m2.4 6.1 2.3 2.2 4.9-4.8" />
          </svg>
        </Checkbox.Indicator>
      </Checkbox.Root>
      <span>{children}</span>
    </label>
  );
}

export function SegmentedControl({
  value,
  onValueChange,
  options,
  ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectFieldOption[];
  ariaLabel: string;
}) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <Toggle.Root
          key={option.value}
          className="seg-btn"
          pressed={value === option.value}
          onPressedChange={(pressed) => {
            if (pressed) onValueChange(option.value);
          }}
          aria-label={option.label}
          title={option.title}
        >
          {option.label}
        </Toggle.Root>
      ))}
    </div>
  );
}
