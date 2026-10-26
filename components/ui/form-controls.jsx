import { useId } from "react";

function FieldFrame({ id, label, hint, error, required, children }) {
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? descriptionId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ui-field">
      <div className="ui-field__label-row">
        <label className="ui-field__label" htmlFor={id}>
          {label}
        </label>
        {required ? <span className="ui-field__required">Required</span> : null}
      </div>
      {children({ describedBy })}
      {hint ? (
        <p className="ui-field__hint" id={descriptionId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function useFieldId(id) {
  const generatedId = useId();
  return id ?? `rush-field-${generatedId.replaceAll(":", "")}`;
}

export function InputField({
  id: idProp,
  label,
  hint,
  error,
  required = false,
  className = "",
  ...props
}) {
  const id = useFieldId(idProp);

  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      {({ describedBy }) => (
        <input
          id={id}
          className={`ui-field__control ${className}`.trim()}
          required={required}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy || undefined}
          {...props}
        />
      )}
    </FieldFrame>
  );
}

export function SelectField({
  id: idProp,
  label,
  hint,
  error,
  required = false,
  className = "",
  children,
  ...props
}) {
  const id = useFieldId(idProp);

  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      {({ describedBy }) => (
        <select
          id={id}
          className={`ui-field__control ${className}`.trim()}
          required={required}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy || undefined}
          {...props}
        >
          {children}
        </select>
      )}
    </FieldFrame>
  );
}

export function TextAreaField({
  id: idProp,
  label,
  hint,
  error,
  required = false,
  className = "",
  ...props
}) {
  const id = useFieldId(idProp);

  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      {({ describedBy }) => (
        <textarea
          id={id}
          className={`ui-field__control ui-field__control--textarea ${className}`.trim()}
          required={required}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy || undefined}
          {...props}
        />
      )}
    </FieldFrame>
  );
}
