import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gp_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// A 401 on an authenticated call means the token expired or was revoked: tell the app to log out.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error?.config?.url || ''
    if (error?.response?.status === 401 && !url.startsWith('/auth/login') && localStorage.getItem('gp_token')) {
      window.dispatchEvent(new Event('auth:expired'))
    }
    return Promise.reject(error)
  },
)

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  emailAvailable: (email) => api.get('/auth/email-available', { params: { email } }),
  me: () => api.get('/auth/me'),
  linkNgo: (ngoId) => api.post('/auth/me/ngo', { ngo_id: ngoId }),
}

export const ngosApi = {
  create: (data) => api.post('/ngos/', data),
  list: () => api.get('/ngos/'),
  get: (id) => api.get(`/ngos/${id}`),
  update: (id, data) => api.put(`/ngos/${id}`, data),
}

export const grantsApi = {
  list: (params) => api.get('/grants/', { params }),
  browse: (params) => api.get('/grants/browse', { params }),
  get: (id) => api.get(`/grants/${id}`),
  search: (params) => api.post('/grants/search', params),
  conversationalSearch: (prompt) => api.post('/grants/search/conversational', { prompt }),
  triggerIngestion: () => api.post('/grants/ingest/run'),
  ingestionStatus: () => api.get('/grants/ingest/status'),
  listSources: () => api.get('/grants/sources'),
  addSource: (data) => api.post('/grants/sources', data),
  deleteSource: (id) => api.delete(`/grants/sources/${id}`),
}

export const matchesApi = {
  getMatches: (ngoId, limit = 10) => api.post('/matches/', { ngo_id: ngoId, limit }),
  recordInteraction: (ngoId, grantId, action) =>
    api.post('/matches/interact', { ngo_id: ngoId, grant_id: grantId, action }),
}

export const pipelineApi = {
  add: (ngoId, grantId, stage = 'saved') =>
    api.post('/pipeline/', { ngo_id: ngoId, grant_id: grantId, stage }),
  get: (ngoId, stage) => api.get(`/pipeline/${ngoId}`, { params: stage ? { stage } : {} }),
  update: (entryId, data) => api.patch(`/pipeline/${entryId}`, data),
  remove: (entryId) => api.delete(`/pipeline/${entryId}`),
}

export const applicationsApi = {
  draftSection: (ngoId, grantId, section) =>
    api.post('/applications/draft-section', { ngo_id: ngoId, grant_id: grantId, section }),
  get: (ngoId, grantId) => api.get(`/applications/${ngoId}/${grantId}`),
  save: (ngoId, grantId, data) => api.put(`/applications/${ngoId}/${grantId}`, data),
}

export const dashboardApi = {
  get: (ngoId) => api.get(`/dashboard/${ngoId}`),
}

// FastAPI returns detail as a string, or as a list of validation errors (422).
export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length) {
    return detail.map(d => (d.msg || '').replace(/^Value error, /, '')).filter(Boolean).join(' ') || fallback
  }
  return fallback
}

export default api
