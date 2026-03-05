export interface QNProvisionRequest {
  "quicknode-id": string;
  "endpoint-id"?: string;
  chain?: string;
  network?: string;
  plan: string;
  referers?: string[];
  "contract-addresses"?: string[];
}

export interface QNUpdateRequest {
  "quicknode-id": string;
  "endpoint-id"?: string;
  chain?: string;
  network?: string;
  plan: string;
  referers?: string[];
  "contract-addresses"?: string[];
}

export interface QNDeprovisionRequest {
  "quicknode-id": string;
  "endpoint-id"?: string;
}

export interface QNDeactivateRequest {
  "quicknode-id": string;
  "endpoint-id"?: string;
}

export interface QNProvisionResponse {
  status: string;
  "dashboard-url"?: string;
  "access-url"?: string;
}

export interface QNRPCRequest {
  id: number;
  jsonrpc: string;
  method: string;
  params: unknown[];
}

export interface QNRPCResponse {
  id: number;
  jsonrpc: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}
