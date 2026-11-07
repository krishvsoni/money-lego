// Wire shapes shared by the browser and the API.

export interface ApiErrorBody {
  error: { code: string; message: string; issues?: Array<{ path: string; message: string }>; requestId?: string };
}
