"use client";

import { useFormStatus } from "react-dom";

export default function ConfirmSubmitButton({
  confirmText,
  className,
  title,
  children,
}: {
  confirmText: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      title={title}
      disabled={pending}
      aria-busy={pending || undefined}
      className={`${className ?? ""} disabled:opacity-50 disabled:cursor-wait`}
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
