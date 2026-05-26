import { useState } from 'react';
import CrudPage from '../components/CrudPage';
import { leccionesApi } from '../api/endpoints';
import { fmtDate } from '../utils/format';

const PLATFORMS = ['SUNGROW', 'SOLIS', 'HUAWEI', 'SMA', 'ENNEXOS', 'FUSION', 'SKYCONTROL', 'OTRO'];
const CLASSIFICATIONS = ['INVERSOR', 'STRING', 'COMUNICACIÓN', 'MEDIDOR', 'BATERÍA', 'RED', 'OTRO'];
const SOURCES = ['incidencia', 'ticket', 'manual'];

export default function Lecciones() {
  return (
    <CrudPage
      title="Lecciones aprendidas"
      api={leccionesApi}
      writeRoles={['admin', 'operator', 'mantenimiento', 'tecnico']}
      deleteRoles={['admin']}
      helpText="Soluciones documentadas a partir de incidencias y tickets cerrados. Se generan automáticamente al cerrar con una solución, y puedes agregar lecciones manuales con causa raíz y recomendación."
      filters={[
        { key: 'platform', label: 'plataformas', options: PLATFORMS },
        { key: 'classification', label: 'clasificaciones', options: CLASSIFICATIONS },
      ]}
      columns={[
        { key: 'createdAt', label: 'Fecha', render: (r) => fmtDate(r.createdAt) },
        { key: 'project', label: 'Proyecto' },
        { key: 'platform', label: 'Plataforma' },
        { key: 'errCode', label: 'Cód. error' },
        { key: 'classification', label: 'Clasif.' },
        { key: 'problem', label: 'Problema' },
        {
          key: 'solution', label: 'Solución',
          render: (r) => (
            <div style={{ maxWidth: 320, fontSize: 12, lineHeight: 1.4 }}
              title={r.solution}>
              {(r.solution || '').slice(0, 140)}{r.solution?.length > 140 ? '…' : ''}
            </div>
          ),
        },
        {
          key: 'source', label: 'Origen',
          render: (r) => {
            const icons = { incidencia: '⚠️', ticket: '🎫', manual: '✍️' };
            return <span style={{ fontSize: 11 }}>{icons[r.source] || ''} {r.source}</span>;
          },
        },
        { key: 'autor', label: 'Autor' },
      ]}
      formFields={[
        { key: 'project', label: 'Proyecto' },
        { key: 'platform', label: 'Plataforma', type: 'select', options: PLATFORMS },
        { key: 'errCode', label: 'Código de error' },
        { key: 'classification', label: 'Clasificación', type: 'select', options: CLASSIFICATIONS },
        { key: 'equipment', label: 'Equipo' },
        { key: 'problem', label: 'Problema (síntoma)', full: true },
        { key: 'cause', label: 'Causa raíz', type: 'textarea', full: true },
        { key: 'solution', label: 'Solución aplicada *', type: 'textarea', full: true, required: true },
        { key: 'recommendation', label: 'Recomendación para casos similares', type: 'textarea', full: true },
        { key: 'tags', label: 'Tags (separados por coma)' },
      ]}
    />
  );
}
