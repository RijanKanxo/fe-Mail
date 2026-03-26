"use client"

import { useEffect, useMemo, useState } from "react"
import { useRef } from "react"

export default function AddItemAlert({
  open,
  title,
  description,
  label,
  placeholder,
  confirmText = "Add",
  suggestions = [],
  onClose,
  onConfirm,
}) {
  const [value, setValue] = useState("")
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) {
      setValue("")
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event) {
      if (event.key === "Escape") onClose()
      if (event.key === "Enter") {
        const target = event.target
        if (target instanceof HTMLElement && target.classList.contains("add-alert-chip")) {
          const next = target.getAttribute("data-value") || target.textContent || ""
          event.preventDefault()
          setValue(next)
          setTimeout(() => inputRef.current?.focus(), 0)
          return
        }
        event.preventDefault()
        const nextValue = value.trim()
        if (!nextValue) return
        onConfirm(nextValue)
        onClose()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose, onConfirm, value])

  const normalizedSuggestions = useMemo(
    () => suggestions.filter(Boolean).map((item) => String(item).trim()).filter(Boolean),
    [suggestions]
  )

  const filteredSuggestions = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return normalizedSuggestions.slice(0, 8)
    return normalizedSuggestions
      .filter((item) => item.toLowerCase().includes(q) && item.toLowerCase() !== q)
      .slice(0, 8)
  }, [normalizedSuggestions, value])

  function submit() {
    const nextValue = value.trim()
    if (!nextValue) return
    onConfirm(nextValue)
    onClose()
  }

  if (!open) return null

  return (
    <div className="add-alert-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="add-alert-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="add-alert-head">
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>

        <label className="add-alert-label">{label}</label>
        <input
          ref={inputRef}
          className="add-alert-input"
          placeholder={placeholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoFocus
        />

        {normalizedSuggestions.length > 0 ? (
          <div className="add-alert-suggestions">
            <div className="add-alert-suggestions-label">Suggestions</div>
            <div className="add-alert-chip-row">
              {filteredSuggestions.length === 0 && (
                <div className="add-alert-empty">No match yet</div>
              )}
              {filteredSuggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  data-value={item}
                  className="add-alert-chip"
                  onClick={() => setValue(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="add-alert-actions">
          <button type="button" className="add-alert-btn add-alert-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="add-alert-btn add-alert-btn-primary"
            disabled={!value.trim()}
            onClick={submit}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
