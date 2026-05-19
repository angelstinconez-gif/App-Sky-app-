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

export const importarApi = {
  incidencias: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/importar/incidencias', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
  polizas: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/importar/polizas', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
  errores: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/importar/errores', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
};
