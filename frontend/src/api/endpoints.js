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
};

export const ticketsApi = {
  ...crud('/tickets'),
  close: (id, data) => api.post(`/tickets/${id}/close`, data).then((r) => r.data),
};

export const erroresApi = {
  ...crud('/errores'),
  lookup: (brand, code) => api.get('/errores/lookup', { params: { brand, code } }).then((r) => r.data),
};

export const garantiasApi = crud('/garantias');
export const polizasApi = crud('/polizas');
export const directorioApi = crud('/directorio');
export const cuadrillasApi = crud('/cuadrillas');
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
};
