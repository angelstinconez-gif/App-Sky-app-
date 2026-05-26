import { useRef } from 'react';

/**
 * Modal con cierre seguro: sólo se cierra con la X o el botón Cancelar.
 *
 * Antes, hacer click+drag desde dentro hacia afuera (típico al seleccionar texto)
 * disparaba onClick del backdrop y cerraba el modal sin querer. Ahora el cierre
 * por click fuera está desactivado por defecto.
 *
 * Props:
 *   open, onClose, title, children, footer, wide
 *   closeOnBackdrop: si true, vuelve al comportamiento anterior (click fuera cierra).
 */
export default function Modal({ open, onClose, title, children, footer, wide, closeOnBackdrop = false }) {
  const downTarget = useRef(null);
  if (!open) return null;

  const onMouseDown = (e) => { downTarget.current = e.target; };
  const onMouseUp = (e) => {
    if (!closeOnBackdrop) return;
    // Sólo cerrar si mousedown Y mouseup ocurrieron en el backdrop (no en el modal)
    if (e.target === e.currentTarget && downTarget.current === e.currentTarget) {
      onClose && onClose();
    }
  };

  return (
    <div
      className="modal-bg open"
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
    >
      <div
        className="modal"
        style={wide ? { maxWidth: 900 } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
