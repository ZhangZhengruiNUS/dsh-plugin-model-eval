import * as React from 'react';

const classes = (...values: (string | undefined | false)[]) => values.filter(Boolean).join(' ');

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  icon?: React.ReactNode;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {variant = 'secondary', icon, loading = false, disabled, className, children, type = 'button', ...props}, ref) {
  return <button {...props} ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
    className={classes('dsh-button', `dsh-button-${variant}`, loading && 'is-loading', className)}>
    <span className="dsh-button-content">{icon && <span className="dsh-button-icon" aria-hidden="true">{icon}</span>}{children}</span>
    {loading && <span className="dsh-button-spinner" aria-hidden="true"/>}
  </button>;
});

interface FieldContextValue {controlId: string; describedBy: string | undefined; error: boolean}
const FieldContext = React.createContext<FieldContextValue | undefined>(undefined);

/** An explicit Field id is the default control id; hint/error ids are `${id}-hint/error`. */
export interface FieldProps {
  id?: string;
  label: React.ReactNode;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({id, label, htmlFor, hint, error, children, className}: FieldProps) {
  const generated = React.useId();
  const base = id ?? `dsh-field-${generated}`;
  const context = {controlId: htmlFor ?? base,
    describedBy: [hint && `${base}-hint`, error && `${base}-error`].filter(Boolean).join(' ') || undefined,
    error: Boolean(error)};
  return <div className={classes('dsh-field', error && 'has-error', className)}>
    <label className="dsh-field-label" htmlFor={context.controlId}>{label}</label>
    <FieldContext.Provider value={context}>{children}</FieldContext.Provider>
    {hint && <div className="dsh-field-hint" id={`${base}-hint`}>{hint}</div>}
    {error && <div className="dsh-field-error" id={`${base}-error`} role="alert">{error}</div>}
  </div>;
}

function useFieldProps(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const field = React.useContext(FieldContext);
  const describedBy = [...new Set([props['aria-describedby'], field?.describedBy].filter(Boolean).join(' ').split(/\s+/).filter(Boolean))].join(' ') || undefined;
  return {id: props.id ?? field?.controlId, 'aria-describedby': describedBy,
    'aria-invalid': props['aria-invalid'] ?? (field?.error || undefined)};
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  {className, ...props}, ref) {
  const fieldProps = useFieldProps(props);
  return <input {...props} {...fieldProps} ref={ref} className={classes('dsh-input', className)}/>;
});

export const Checkbox = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>>(function Checkbox(
  {className, ...props}, ref) {
  const fieldProps = useFieldProps(props);
  return <input {...props} {...fieldProps} ref={ref} type="checkbox" className={classes('dsh-checkbox', className)}/>;
});

export const Radio = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>>(function Radio(
  {className, ...props}, ref) {
  const fieldProps = useFieldProps(props);
  return <input {...props} {...fieldProps} ref={ref} type="radio" className={classes('dsh-radio', className)}/>;
});
