// API client. In development Vite proxies /api to the Flask server, so the
// default base URL is the same origin. Set VITE_API_URL to call another host.
const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const NETWORK_MESSAGE =
  "Can't reach the server. Start the backend with `python app.py` in the backend folder.";

export class ApiError extends Error {
  constructor(message, status = 0, code = "error") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function buildUrl(path, params) {
  const url = new URL(BASE + path, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function parseBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toError(status, data) {
  const message = data?.error?.message || `The server responded with an error (${status}).`;
  return new ApiError(message, status, data?.error?.code);
}

async function request(path, { method = "GET", params, json, signal } = {}) {
  let response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      signal,
      headers: json ? { "Content-Type": "application/json" } : undefined,
      body: json ? JSON.stringify(json) : undefined,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError(NETWORK_MESSAGE, 0, "network");
  }
  const data = parseBody(await response.text());
  if (!response.ok) throw toError(response.status, data);
  return data;
}

// fetch() can't report upload progress, so uploads use XMLHttpRequest.
function upload(file, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildUrl("/api/datasets"));
    xhr.responseType = "text";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      const data = parseBody(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(toError(xhr.status, data));
    };
    xhr.onerror = () => reject(new ApiError(NETWORK_MESSAGE, 0, "network"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

const ds = (id) => `/api/datasets/${encodeURIComponent(id)}`;

export const api = {
  health: (opts) => request("/api/health", opts),
  samples: (opts) => request("/api/samples", opts),
  openSample: (id) => request(`/api/samples/${encodeURIComponent(id)}`, { method: "POST" }),
  upload,
  dataset: (id, opts) => request(ds(id), opts),
  setSheet: (id, sheet) => request(`${ds(id)}/sheet`, { method: "POST", json: { sheet } }),
  rows: (id, params, opts) => request(`${ds(id)}/rows`, { ...opts, params }),
  analysis: (id, params, opts) => request(`${ds(id)}/analysis`, { ...opts, params }),
  aggregate: (id, params, opts) => request(`${ds(id)}/aggregate`, { ...opts, params }),
};
