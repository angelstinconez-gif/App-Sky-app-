import api from './client';

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data.user),
  logout: () => api.post('/auth/logout'),
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password', { currentPassword, newPassword }).then((r) => r.data),
};

const crud = (path) => ({
  list: (params) => api.get(path, { params }).then((r) => r.data),
  get: (id) => api.get(`${path}/${id}`).then((r) => r.data),
  create: (data) => api.post(path, data).then((r) => r.data),
  update: (id, data) => api.put(`${path}/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`${path}/${id}`).then((r) => r.data),
});

export const incidenciasApi = {
  ...crud('/incidencias'),
  close: (id, data) => api.post(`/incidencias/${id}/close`, data).then((r) => r.data),
  related: (params) => api.get('/incidencias/related', { params }).then((r) => r.data),
};

export const ticketsApi = {
  ...crud('/tickets'),
  close: (id, data) => api.post(`/tickets/${id}/close`, data).then((r) => r.data),
  related: (params) => api.get('/tickets/related', { params }).then((r) => r.data),
};

export const erroresApi = {
  ...crud('/errores'),
  lookup: (brand, code) => api.get('/errores/lookup', { params: { brand, code } }).then((r) => r.data),
  diagnostico: () => api.get('/errores/diagnostico').then((r) => r.data),
  recargarCatalogo: () => api.post('/errores/recargar-catalogo').then((r) => r.data),
};

export const garantiasApi = crud('/garantias');
export const polizasApi = {
  ...crud('/polizas'),
  zonas: () => api.get('/polizas/zonas').then((r) => r.data),
  plataformas: () => api.get('/polizas/plataformas').then((r) => r.data),
};
export const directorioApi = crud('/directorio');
export const cuadrillasApi = crud('/cuadrillas');
export const tecnicosApi = crud('/tecnicos');
export const avisosApi = {
  ...crud('/avisos'),
  listAll: () => api.get('/avisos', { params: { all: 1 } }).then((r) => r.data),
};
export const viaticosApi = {
  ...crud('/viaticos'),
  tarifas: () => api.get('/viaticos/tarifas').then((r) => r.data),
  presupuesto: (year) => api.get('/viaticos/presupuesto', { params: year ? { year } : {} }).then((r) => r.data),
  setPresupuesto: (data) => api.post('/viaticos/presupuesto', data).then((r) => r.data),
  delPresupuesto: (id) => api.delete(`/viaticos/presupuesto/${id}`).then((r) => r.data),
};
export const checklistsApi = {
  ...crud('/checklists'),
  download: (id) => `/api/checklists/${id}/download`,  // URL para descargar
};
export const leccionesApi = crud('/lecciones');
export const analisisApi = {
  ...crud('/analisis'),
  kpis: (mes) => api.get('/analisis/kpis', { params: mes ? { mes } : {} }).then((r) => r.data),
};

export const searchApi = {
  global: (q, opts = {}) => api.get('/search', { params: { q, ...opts } }).then((r) => r.data),
};

export const revsemApi = {
  estados: () => api.get('/revisiones-semanales/estados').then((r) => r.data),
  plantas: (params) => api.get('/revisiones-semanales/plantas', { params }).then((r) => r.data),
  historial: (polizaId) => api.get(`/revisiones-semanales/historial/${polizaId}`).then((r) => r.data),
  upsert: (data) => api.post('/revisiones-semanales', data).then((r) => r.data),
  heatmap: (weeks = 8) => api.get('/revisiones-semanales/heatmap', { params: { weeks } }).then((r) => r.data),
  bulk: (data) => api.post('/revisiones-semanales/bulk', data).then((r) => r.data),
};
export const eventosApi = crud('/eventos');
export const mantenimientoApi = crud('/mantenimiento');
export const usersApi = crud('/users');

export const historialApi = {
  list: (params) => api.get('/historial', { params }).then((r) => r.data),
};

export const dashboardApi = {
  kpis: () => api.get('/dashboard/kpis').then((r) => r.data),
  charts: () => api.get('/dashboard/charts').then((r) => r.data),
};

function uploadFile(path) {
  return (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api
      .post(path, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  };
}

export const importarApi = {
  incidencias: uploadFile('/importar/incidencias'),
  polizas: uploadFile('/importar/polizas'),
  errores: uploadFile('/importar/errores'),
  directorio: uploadFile('/importar/directorio'),
  mantenimiento: uploadFile('/importar/mantenimiento'),
};

export const assigneesApi = {
  list: () => api.get('/assignees').then((r) => r.data),
};

export const notificationsApi = {
  vapidKey: () => api.get('/notifications/vapid-public-key').then((r) => r.data.publicKey),
  subscribePush: (subscription) =>
    api.post('/notifications/subscribe/push', subscription).then((r) => r.data),
  subscribeWhatsapp: (phone) =>
    api.post('/notifications/subscribe/whatsapp', { phone }).then((r) => r.data),
  list: () => api.get('/notifications/subscriptions').then((r) => r.data),
  unsubscribe: (id) => api.delete(`/notifications/subscriptions/${id}`).then((r) => r.data),
  test: () => api.post('/notifications/test').then((r) => r.data),
  // Buzón in-app (icono de campana)
  inbox: (params) => api.get('/notifications/inbox', { params }).then((r) => r.data),
  unreadCount: () => api.get('/notifications/inbox/unread-count').then((r) => r.data.count),
  markRead: (id) => api.post(`/notifications/inbox/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post('/notifications/inbox/read-all').then((r) => r.data),
};
