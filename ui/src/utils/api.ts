import axios from 'axios';
import { createGlobalState } from 'react-global-hooks';

export const isAuthorizedState = createGlobalState(false);

export const apiClient = axios.create();

// Add a request interceptor to add token from localStorage
apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('AI_TOOLKIT_AUTH');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Add a response interceptor to handle errors
apiClient.interceptors.response.use(
  response => response, // Return successful responses as-is
  error => {
    if (error.response) {
      // Check if the error is a 401 Unauthorized
      if (error.response.status === 401) {
        localStorage.removeItem('AI_TOOLKIT_AUTH');
        isAuthorizedState.set(false);
      }

      // Surface the server's error message so callers get a useful message
      // from err.message instead of the generic "Request failed with status code 500"
      const serverMsg = error.response.data?.error || error.response.data?.message;
      if (serverMsg) {
        error.message = serverMsg;
      }
    }

    return Promise.reject(error);
  },
);
