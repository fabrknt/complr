export interface Instance {
  id: string;
  quicknode_id: string;
  plan: string;
  endpoint_id: string | null;
  chain: string | null;
  network: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
}
